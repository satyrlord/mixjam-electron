// Two-phase library indexer over a FileSystemDirectoryHandle, ported from the
// former worker_threads indexer. Runs inside the backend worker on the same DB
// connection as queries (opfs-sahpool allows exactly one connection); scan
// work is batched in transactions and yields to the event loop between
// batches, so queries interleave with an in-flight scan.

import type { ScanProgress } from '../../../shared/backend-api'
import type { DB } from './sql'
import {
  assignCategoryFromPath,
  ensureScanRoot,
  markMissing,
  syncCategoriesFromNames,
  updateMetadata,
  upsertStub
} from './library'

// The audio file extensions the library recognises.
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.aiff'])

const BATCH_SIZE = 500

// How many files phase 2 parses concurrently. Metadata extraction is I/O-bound
// (blob read + header parse), so a small pool cuts scan time severalfold. DB
// writes stay serialized — sqlite-wasm calls are synchronous on this thread.
const PHASE2_CONCURRENCY = 4

export type ScanEmit = (progress: ScanProgress) => void

interface FoundFile {
  relpath: string
  handle: FileSystemFileHandle
}

interface WalkResult {
  files: FoundFile[]
  /** Names of the sample folder's top-level subdirectories (category roots). */
  topLevelDirs: string[]
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

async function walkAudio(root: FileSystemDirectoryHandle): Promise<WalkResult> {
  const files: FoundFile[] = []
  const topLevelDirs: string[] = []

  async function walk(dir: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> {
    try {
      for await (const [name, entry] of dir.entries()) {
        if (entry.kind === 'directory') {
          if (depth === 0) topLevelDirs.push(name)
          await walk(entry, `${prefix}${name}/`, depth + 1)
          continue
        }
        if (AUDIO_EXTENSIONS.has(extOf(name))) {
          files.push({ relpath: `${prefix}${name}`, handle: entry })
        }
      }
    } catch {
      // Unreadable directory — skip its subtree, same as the fs walk did.
    }
  }

  await walk(root, '', 0)
  return { files, topLevelDirs }
}

/** Lets queued worker messages (queries) run between scan batches. */
function yieldToEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function phase1(
  db: DB,
  rootId: number,
  walked: WalkResult,
  fileByRelpath: Map<string, File>,
  emit: ScanEmit
): Promise<void> {
  const { files, topLevelDirs } = walked
  const total = files.length
  let processed = 0

  db.exec('PRAGMA synchronous = NORMAL')

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)

    // File snapshots (size, lastModified) are async FSA calls, so gather them
    // outside the synchronous DB transaction.
    const snapshots: Array<{ relpath: string; file: File }> = []
    for (const { relpath, handle } of batch) {
      try {
        const file = await handle.getFile()
        snapshots.push({ relpath, file })
        fileByRelpath.set(relpath, file)
      } catch {
        continue
      }
    }

    const upsertBatch = db.transaction((items: Array<{ relpath: string; file: File }>) => {
      for (const { relpath, file } of items) {
        const filename = relpath.slice(relpath.lastIndexOf('/') + 1)
        const ext = extOf(filename).slice(1)
        upsertStub(db, rootId, relpath, filename, ext, file.size, Math.round(file.lastModified))
        processed++
      }
    })
    upsertBatch(snapshots)
    emit({ status: 'scanning', phase: 1, found: total, processed, total })
    await yieldToEvents()
  }

  // Mark files no longer on disk as missing, in one transaction so a large
  // prune does not pay one commit per file. Scoped to this scan's root so
  // rescanning one Sample Folder never soft-deletes another folder's rows.
  const known = db
    .prepare('SELECT relpath FROM samples WHERE scan_state != 2 AND root_id = ?')
    .all<{ relpath: string }>(rootId)

  const fileSet = new Set(files.map((f) => f.relpath))
  const markAllMissing = db.transaction((relpaths: string[]) => {
    for (const relpath of relpaths) markMissing(db, rootId, relpath)
  })
  markAllMissing(known.map((k) => k.relpath).filter((relpath) => !fileSet.has(relpath)))

  // Synchronise root categories with the sample-folder structure: a category
  // for each top-level subdirectory plus the hardcoded "Unsorted" fallback.
  syncCategoriesFromNames(db, topLevelDirs)

  // Auto-assign every sample to a category based on its folder path, batched in
  // transactions so a large library does not pay one fsync per file.
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    const assignBatch = db.transaction((items: FoundFile[]) => {
      for (const { relpath } of items) {
        assignCategoryFromPath(db, rootId, relpath)
      }
    })
    assignBatch(batch)
    await yieldToEvents()
  }

  emit({ status: 'scanning', phase: 1, found: total, processed: total, total })
}

async function phase2(
  db: DB,
  rootId: number,
  fileByRelpath: Map<string, File>,
  emit: ScanEmit
): Promise<void> {
  const stubs = db
    .prepare('SELECT relpath FROM samples WHERE scan_state = 0 AND root_id = ?')
    .all<{ relpath: string }>(rootId)

  const total = stubs.length
  let processed = 0
  let cursor = 0

  // Lazy-load music-metadata: its browser bundle is chunky, and it is only
  // needed while a scan runs.
  const { parseBlob } = await import('music-metadata')

  const drain = async (): Promise<void> => {
    while (cursor < stubs.length) {
      const { relpath } = stubs[cursor++]
      try {
        const file = fileByRelpath.get(relpath)
        if (file) {
          const meta = await parseBlob(file, { duration: true })
          updateMetadata(
            db,
            rootId,
            relpath,
            meta.format.duration ?? null,
            meta.format.sampleRate ?? null,
            meta.format.numberOfChannels ?? null
          )
        }
      } catch {
        // Leave as stub if metadata extraction fails — not a fatal error
      }
      processed++
      if (processed % 50 === 0 || processed === total) {
        emit({ status: 'scanning', phase: 2, found: total, processed, total })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PHASE2_CONCURRENCY, stubs.length) }, drain))
}

/**
 * Runs a full two-phase scan of the given root handle. Progress is reported
 * through `emit`; the caller owns terminal-state reporting ('done'/'error').
 */
export async function runScan(
  db: DB,
  rootKey: string,
  root: FileSystemDirectoryHandle,
  emit: ScanEmit
): Promise<void> {
  const rootId = ensureScanRoot(db, rootKey)
  const walked = await walkAudio(root)
  const fileByRelpath = new Map<string, File>()
  await phase1(db, rootId, walked, fileByRelpath, emit)
  await phase2(db, rootId, fileByRelpath, emit)
}
