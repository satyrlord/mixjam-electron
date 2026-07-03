// Backend worker: owns the single opfs-sahpool SQLite connection (queries and
// indexing interleave on it) and services BackendCalls messages from the
// client facade. opfs-sahpool needs no COOP/COEP headers, at the cost of one
// connection in one tab — the client enforces the single tab with a Web Lock.

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type {
  SampleQueryRequest,
  ScanProgress
} from '../../../shared/backend-api'
import { normalizeSampleQueryRequest } from '../../../shared/backend-api'
import type { BackendCalls, WorkerMessage, WorkerRequest } from './protocol'
import { DB } from './sql'
import { initSchema } from './schema'
import * as library from './library'
import { runScan } from './indexer'
import { loadFolderHandle } from './handle-store'

const ctx = self as unknown as {
  postMessage(message: WorkerMessage): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

const IDLE: ScanProgress = { status: 'idle', phase: null, found: 0, processed: 0, total: 0 }

let progress: ScanProgress = { ...IDLE }
// Bumped on every startScan; an in-flight scan that observes a newer
// generation stops reporting so a restarted scan cannot clobber its state.
let scanGeneration = 0

function emitEvent(message: WorkerMessage): void {
  ctx.postMessage(message)
}

const dbReady: Promise<DB> = (async () => {
  const sqlite3 = await sqlite3InitModule()
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'mixjam' })
  const db = new DB(sqlite3, new poolUtil.OpfsSAHPoolDb('/library.db'))
  initSchema(db)
  library.ensureUnsortedCategory(db)
  return db
})()

function startScan(db: DB, rootKey: string): void {
  const generation = ++scanGeneration
  const isCurrent = (): boolean => generation === scanGeneration

  progress = { status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 }
  emitEvent({ type: 'scan-progress', progress })

  void (async () => {
    try {
      const handle = await loadFolderHandle(rootKey)
      if (!handle) throw new Error(`No stored folder handle for root ${rootKey}`)

      await runScan(db, rootKey, handle, (next) => {
        if (!isCurrent()) return
        progress = next
        emitEvent({ type: 'scan-progress', progress })
      })

      if (!isCurrent()) return
      progress = { ...IDLE }
      emitEvent({ type: 'scan-done' })
    } catch (error) {
      console.error('Indexer error:', error)
      if (!isCurrent()) return
      progress = { status: 'error', phase: null, found: 0, processed: 0, total: 0 }
      emitEvent({ type: 'scan-progress', progress })
    }
  })()
}

function buildCalls(db: DB): BackendCalls {
  return {
    querySamples: (req: SampleQueryRequest) =>
      library.querySamples(db, normalizeSampleQueryRequest(req)),
    hasSamples: (rootKey) => library.hasSamples(db, rootKey),
    startScan: (rootKey) => startScan(db, rootKey),
    getScanProgress: () => ({ ...progress }),
    listTags: () => library.listTags(db),
    createTag: (name, color) => library.createTag(db, name, color),
    renameTag: (id, name) => library.renameTag(db, id, name),
    deleteTag: (id) => library.deleteTag(db, id),
    assignTag: (sampleId, tagId) => library.assignTag(db, sampleId, tagId),
    unassignTag: (sampleId, tagId) => library.unassignTag(db, sampleId, tagId),
    listCategories: () => library.listCategories(db),
    createCategory: (name, parentId) => library.createCategory(db, name, parentId),
    deleteCategory: (id) => library.deleteCategory(db, id),
    listLibraries: () => library.listLibraries(db),
    saveLibrary: (name, ruleJson) => library.saveLibrary(db, name, ruleJson),
    deleteLibrary: (id) => library.deleteLibrary(db, id)
  }
}

ctx.onmessage = (event) => {
  const { seq, op, args } = event.data
  void dbReady
    .then((db) => {
      const calls = buildCalls(db)
      if (!Object.prototype.hasOwnProperty.call(calls, op)) {
        throw new Error(`Unknown backend op: ${String(op)}`)
      }
      const fn = calls[op] as ((...callArgs: unknown[]) => unknown) | undefined
      if (typeof fn !== 'function') throw new Error(`Unknown backend op: ${String(op)}`)
      return fn(...args)
    })
    .then((result) => {
      emitEvent({ type: 'response', seq, ok: true, result })
    })
    .catch((error: unknown) => {
      emitEvent({
        type: 'response',
        seq,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    })
}
