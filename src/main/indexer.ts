/**
 * Indexer worker — runs in a worker_thread, owns its own DB connection.
 * Receives a { dbPath, sampleFolder } message, emits progress events back.
 */
import { workerData, parentPort } from 'worker_threads'
import { promises as fs, statSync, type Dirent } from 'node:fs'
import { basename, extname, join } from 'node:path'
import Database from 'better-sqlite3'
import type { DB } from './db'
import { AUDIO_EXTENSIONS } from './path-utils'
import { ensureScanRoot, upsertStub, markMissing, updateMetadata, syncCategoriesFromFolder, assignCategoryFromPath } from './library'

const BATCH_SIZE = 500

export type IndexerMessage =
  | { type: 'progress'; phase: 1 | 2; found: number; processed: number; total: number }
  | { type: 'done' }
  | { type: 'error'; message: string }

interface WorkerInput {
  dbPath: string
  sampleFolder: string
}

function send(msg: IndexerMessage): void {
  parentPort?.postMessage(msg)
}

async function walkAudio(rootPath: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const child = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(child)
        continue
      }
      if (!entry.isFile()) continue
      const ext = extname(entry.name).toLowerCase()
      if (AUDIO_EXTENSIONS.has(ext)) results.push(child)
    }
  }

  await walk(rootPath)
  return results
}

async function phase1(db: DB, sampleFolder: string): Promise<string[]> {
  const files = await walkAudio(sampleFolder)
  const total = files.length
  let processed = 0

  db.pragma('synchronous = NORMAL')

  // Resolve this folder's scan root (creating it on first scan) and adopt any
  // pre-v4 rows under it, so the prune below and root-scoped queries see them.
  const rootId = ensureScanRoot(db, sampleFolder)

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    const upsertBatch = db.transaction((items: string[]) => {
      for (const filepath of items) {
        let stat: { size: number; mtimeMs: number }
        try {
          stat = statSync(filepath)
        } catch {
          continue
        }
        const ext = extname(filepath).slice(1).toLowerCase()
        upsertStub(db, rootId, filepath, basename(filepath), ext, stat.size, Math.round(stat.mtimeMs))
        processed++
      }
    })
    upsertBatch(batch)
    send({ type: 'progress', phase: 1, found: total, processed, total })
  }

  // Mark files no longer on disk as missing, in one transaction so a large
  // prune does not pay one WAL commit per file. Scoped to this scan's root so
  // rescanning one Sample Folder never soft-deletes another folder's rows.
  const known = db
    .prepare('SELECT filepath FROM samples WHERE scan_state != 2 AND root_id = ?')
    .all(rootId) as Array<{ filepath: string }>

  const fileSet = new Set(files)
  const markAllMissing = db.transaction((paths: string[]) => {
    for (const path of paths) markMissing(db, path)
  })
  markAllMissing(known.map((k) => k.filepath).filter((path) => !fileSet.has(path)))

  // Synchronise root categories with the sample-folder structure.
  // Creates a category for each top-level subdirectory plus the
  // hardcoded "Unsorted" fallback.
  syncCategoriesFromFolder(db, sampleFolder)

  // Auto-assign every sample to a category based on its folder path, batched in
  // transactions so a large library does not pay one WAL fsync per file.
  // Samples inside a recognised subfolder get that folder's category;
  // everything else (flat files, unrecognised paths) goes to Unsorted.
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    const assignBatch = db.transaction((items: string[]) => {
      for (const filepath of items) {
        assignCategoryFromPath(db, filepath, sampleFolder)
      }
    })
    assignBatch(batch)
  }

  return files
}

// How many files phase 2 parses concurrently. Metadata extraction is I/O-bound
// (read + header parse), so a small pool cuts scan time severalfold without
// saturating the disk. DB writes stay serialized — better-sqlite3 is
// synchronous, so each updateMetadata call runs to completion on this thread.
const PHASE2_CONCURRENCY = 4

async function phase2(db: DB): Promise<void> {
  const stubs = db
    .prepare('SELECT filepath FROM samples WHERE scan_state = 0')
    .all() as Array<{ filepath: string }>

  const total = stubs.length
  let processed = 0
  let cursor = 0

  // Dynamically import music-metadata (ESM package, works in Node worker)
  const { parseFile } = await import('music-metadata')

  async function drain(): Promise<void> {
    while (cursor < stubs.length) {
      const { filepath } = stubs[cursor++]
      try {
        const meta = await parseFile(filepath, { duration: true })
        updateMetadata(
          db,
          filepath,
          meta.format.duration ?? null,
          meta.format.sampleRate ?? null,
          meta.format.numberOfChannels ?? null
        )
      } catch {
        // Leave as stub if metadata extraction fails — not a fatal error
      }
      processed++
      if (processed % 50 === 0 || processed === total) {
        send({ type: 'progress', phase: 2, found: total, processed, total })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PHASE2_CONCURRENCY, stubs.length) }, () => drain())
  )
}

async function run(): Promise<void> {
  const { dbPath, sampleFolder } = workerData as WorkerInput

  let db: DB
  try {
    db = new Database(dbPath)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
  } catch (err) {
    send({ type: 'error', message: String(err) })
    return
  }

  try {
    const files = await phase1(db, sampleFolder)
    send({ type: 'progress', phase: 1, found: files.length, processed: files.length, total: files.length })

    await phase2(db)
    send({ type: 'done' })
  } catch (err) {
    send({ type: 'error', message: String(err) })
  } finally {
    db.close()
  }
}

void run()
