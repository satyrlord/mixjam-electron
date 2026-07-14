// Backend worker: owns the single opfs-sahpool SQLite connection (queries and
// indexing interleave on it) and services BackendCalls messages from the
// client facade. opfs-sahpool needs no COOP/COEP headers, at the cost of one
// connection in one tab — the client enforces the single tab with a Web Lock.

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type {
  AnalysisProgress,
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
import { resolveFileHandle } from './folder-access'
import { runPendingAnalysis, runSingleAnalysis } from './analysis-runner'

const ctx = self as unknown as {
  postMessage(message: WorkerMessage): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

const IDLE: ScanProgress = { status: 'idle', phase: null, found: 0, processed: 0, total: 0 }
const ANALYSIS_IDLE: AnalysisProgress = { status: 'idle', analyzed: 0, total: 0 }

let progress: ScanProgress = { ...IDLE }
let analysisProgress: AnalysisProgress = { ...ANALYSIS_IDLE }
// Bumped on every startScan; an in-flight scan that observes a newer
// generation stops reporting so a restarted scan cannot clobber its state.
let scanGeneration = 0

function emitEvent(message: WorkerMessage): void {
  ctx.postMessage(message)
}

interface ReadyState {
  db: DB
  calls: BackendCalls
}

const ready: Promise<ReadyState> = (async () => {
  const sqlite3 = await sqlite3InitModule()
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'mixjam' })
  const db = new DB(sqlite3, new poolUtil.OpfsSAHPoolDb('/library.db'))
  initSchema(db)
  library.ensureUnsortedCategory(db)
  return { db, calls: buildCalls(db) }
})()

function startScan(db: DB, rootKey: string): void {
  const generation = ++scanGeneration
  const isCurrent = (): boolean => generation === scanGeneration

  progress = { status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 }
  analysisProgress = { ...ANALYSIS_IDLE }
  emitEvent({ type: 'scan-progress', progress })
  emitEvent({ type: 'analysis-progress', progress: analysisProgress })

  void (async () => {
    let result: Awaited<ReturnType<typeof runScan>>
    try {
      const handle = await loadFolderHandle(rootKey)
      if (!handle) throw new Error(`No stored folder handle for root ${rootKey}`)

      result = await runScan(db, rootKey, handle, (next) => {
        if (!isCurrent()) return
        progress = next
        emitEvent({ type: 'scan-progress', progress })
      }, isCurrent)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Indexer error:', message, error)
      if (!isCurrent()) return
      progress = {
        status: 'error',
        phase: progress.phase,
        found: progress.found,
        processed: progress.processed,
        total: progress.total,
        error: message
      }
      emitEvent({ type: 'scan-progress', progress })
      return
    }

    if (!isCurrent()) return
    progress = { ...IDLE }
    emitEvent({ type: 'scan-done' })

    try {
      await runPendingAnalysis(db, result.rootId, result.files, (next) => {
        if (!isCurrent()) return
        analysisProgress = next
        emitEvent({ type: 'analysis-progress', progress: analysisProgress })
      }, isCurrent)
      if (!isCurrent()) return
      analysisProgress = { ...ANALYSIS_IDLE }
      emitEvent({ type: 'analysis-done' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Analysis error:', message, error)
      if (!isCurrent()) return
      analysisProgress = { status: 'error', analyzed: 0, total: 0, error: message }
      emitEvent({ type: 'analysis-progress', progress: analysisProgress })
    }
  })()
}

function reanalyzeSample(db: DB, rootKey: string, sampleId: number, relpath: string): void {
  if (progress.status === 'scanning' || analysisProgress.status === 'analyzing') {
    throw new Error('Wait for the current scan or analysis to finish')
  }
  const generation = ++scanGeneration
  const isCurrent = (): boolean => generation === scanGeneration
  void (async () => {
    try {
      const root = await loadFolderHandle(rootKey)
      if (!root) throw new Error(`No stored folder handle for root ${rootKey}`)
      const handle = await resolveFileHandle(root, relpath)
      if (!handle) throw new Error(`Sample is not readable: ${relpath}`)
      const file = await handle.getFile()
      await runSingleAnalysis(db, sampleId, file, (next) => {
        if (!isCurrent()) return
        analysisProgress = next
        emitEvent({ type: 'analysis-progress', progress: analysisProgress })
      })
      if (!isCurrent()) return
      analysisProgress = { ...ANALYSIS_IDLE }
      emitEvent({ type: 'analysis-done' })
    } catch (error) {
      console.error('Analysis error:', error)
      if (!isCurrent()) return
      analysisProgress = { status: 'error', analyzed: 0, total: 1 }
      emitEvent({ type: 'analysis-progress', progress: analysisProgress })
    }
  })()
}

function cancelScan(): void {
  scanGeneration++
  progress = { ...IDLE }
  analysisProgress = { ...ANALYSIS_IDLE }
  emitEvent({ type: 'scan-progress', progress })
  emitEvent({ type: 'analysis-progress', progress: analysisProgress })
}

// Built once after the DB is ready so each incoming message does not
// reconstruct the dispatch table.
function buildCalls(db: DB): BackendCalls {
  return {
    querySamples: (req: SampleQueryRequest) =>
      library.querySamples(db, normalizeSampleQueryRequest(req)),
    hasSamples: (rootKey) => library.hasSamples(db, rootKey),
    listMissingRelpaths: (rootKey) => library.listMissingRelpaths(db, rootKey),
    startScan: (rootKey) => startScan(db, rootKey),
    cancelScan: () => cancelScan(),
    getScanProgress: () => ({ ...progress }),
    getAnalysisProgress: () => ({ ...analysisProgress }),
    listTags: () => library.listTags(db),
    createTag: (name, color) => library.createTag(db, name, color),
    renameTag: (id, name) => library.renameTag(db, id, name),
    setTagColor: (id, color) => library.setTagColor(db, id, color),
    deleteTag: (id) => library.deleteTag(db, id),
    assignTag: (sampleId, tagId) => library.assignTag(db, sampleId, tagId),
    unassignTag: (sampleId, tagId) => library.unassignTag(db, sampleId, tagId),
    updateSampleAnalysis: (sampleId, patch) => library.updateSampleAnalysis(db, sampleId, patch),
    reanalyzeSample: (rootKey, sampleId, relpath) => reanalyzeSample(db, rootKey, sampleId, relpath),
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
  void ready
    .then(({ calls }) => {
      if (!Object.prototype.hasOwnProperty.call(calls, op)) {
        throw new Error(`Unknown backend op: ${String(op)}`)
      }
      const fn = calls[op] as (...callArgs: unknown[]) => unknown
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
