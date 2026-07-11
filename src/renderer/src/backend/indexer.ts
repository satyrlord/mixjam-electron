// Two-phase library indexer over a FileSystemDirectoryHandle. Runs inside the
// backend worker on the same DB connection as queries (opfs-sahpool allows
// exactly one connection); scan work is batched in transactions and yields to
// the event loop between batches, so queries interleave with an in-flight scan.

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

/** Number of files per phase-1 upsert transaction. Larger batches reduce
 *  transaction overhead but increase the time queries are blocked waiting
 *  for the worker event loop to yield. */
const DEFAULT_BATCH_SIZE = 500

/** How many files phase 2 parses concurrently. Metadata extraction is I/O-bound
 *  (blob read + header parse), so a small pool cuts scan time severalfold. DB
 *  writes stay serialized — sqlite-wasm calls are synchronous on this thread. */
const DEFAULT_PHASE2_CONCURRENCY = 4

export type ScanEmit = (progress: ScanProgress) => void

/** Returns true while the scan should continue. The caller bumps a generation
 *  counter on cancel; when this returns false the scan aborts at the next
 *  batch boundary instead of walking to completion. */
export type ScanIsCurrent = () => boolean

export interface ScanResult {
  rootId: number
  files: ReadonlyMap<string, File>
}

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
  emit: ScanEmit,
  isCurrent: ScanIsCurrent,
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<void> {
  const { files, topLevelDirs } = walked
  const total = files.length
  let processed = 0

  db.exec('PRAGMA synchronous = NORMAL')

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize)

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
    if (!isCurrent()) return
  }

  if (!isCurrent()) return

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
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    const assignBatch = db.transaction((items: FoundFile[]) => {
      for (const { relpath } of items) {
        assignCategoryFromPath(db, rootId, relpath)
      }
    })
    assignBatch(batch)
    await yieldToEvents()
    if (!isCurrent()) return
  }

  emit({ status: 'scanning', phase: 1, found: total, processed: total, total })
}

async function phase2(
  db: DB,
  rootId: number,
  fileByRelpath: Map<string, File>,
  emit: ScanEmit,
  isCurrent: ScanIsCurrent,
  concurrency: number = DEFAULT_PHASE2_CONCURRENCY
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

  // Metadata updates are batched in transactions so a large library does not
  // pay one fsync per file. Concurrent parsers feed results into a shared
  // queue; the writer drains it in transaction-sized chunks.
  const BATCH_SIZE_PHASE2 = 200
  const pendingUpdates: Array<{
    relpath: string
    duration: number | null
    sampleRate: number | null
    channels: number | null
  }> = []

  const flushPending = db.transaction((updates: typeof pendingUpdates) => {
    for (const { relpath, duration, sampleRate, channels } of updates) {
      updateMetadata(db, rootId, relpath, duration, sampleRate, channels)
    }
  })

  const drain = async (): Promise<void> => {
    while (cursor < stubs.length) {
      if (!isCurrent()) return
      const { relpath } = stubs[cursor++]
      try {
        const file = fileByRelpath.get(relpath)
        if (file) {
          const meta = await parseBlob(file, { duration: true })
          pendingUpdates.push({
            relpath,
            duration: meta.format.duration ?? null,
            sampleRate: meta.format.sampleRate ?? null,
            channels: meta.format.numberOfChannels ?? null
          })
        }
      } catch {
        // Leave as stub if metadata extraction fails — not a fatal error
      }
      processed++

      // Flush accumulated metadata updates in batches to avoid per-row commits.
      if (pendingUpdates.length >= BATCH_SIZE_PHASE2) {
        flushPending(pendingUpdates.splice(0))
      }

      if (processed % 50 === 0 || processed === total) {
        emit({ status: 'scanning', phase: 2, found: total, processed, total })
      }
    }
    // Final flush for the remaining tail.
    if (pendingUpdates.length > 0) {
      flushPending(pendingUpdates.splice(0))
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, stubs.length) }, drain))
}

/** Options to tune scan throughput vs. UI responsiveness. */
export interface ScanOptions {
  /** Files per phase-1 upsert transaction (default 500). */
  batchSize?: number
  /** Concurrent metadata parsers in phase 2 (default 4). */
  phase2Concurrency?: number
}

/**
 * Runs a full two-phase scan of the given root handle. Progress is reported
 * through `emit`; the caller owns terminal-state reporting ('done'/'error').
 * `isCurrent` returns false when the scan has been cancelled, allowing the
 * scan to abort at the next batch boundary instead of walking to completion.
 */
export async function runScan(
  db: DB,
  rootKey: string,
  root: FileSystemDirectoryHandle,
  emit: ScanEmit,
  isCurrent: ScanIsCurrent,
  opts: ScanOptions = {}
): Promise<ScanResult> {
  const rootId = ensureScanRoot(db, rootKey)
  const walked = await walkAudio(root)
  const fileByRelpath = new Map<string, File>()
  await phase1(db, rootId, walked, fileByRelpath, emit, isCurrent, opts.batchSize)
  if (isCurrent()) await phase2(db, rootId, fileByRelpath, emit, isCurrent, opts.phase2Concurrency)
  return { rootId, files: fileByRelpath }
}
