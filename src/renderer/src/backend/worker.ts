// Backend worker: owns the single opfs-sahpool SQLite connection and dispatches
// typed requests. Long-running job policy lives in the job coordinator.

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { SampleQueryRequest } from '../../../shared/backend-api'
import { normalizeSampleQueryRequest } from '../../../shared/backend-api'
import * as analysisPersistence from './analysis-persistence'
import * as browserLibrary from './browser-library-persistence'
import { createBackendJobCoordinator } from './job-coordinator'
import * as indexedSamples from './indexed-sample-persistence'
import type { BackendCalls, WorkerMessage, WorkerRequest } from './protocol'
import { initSchema } from './schema'
import { DB } from './sql'

const ctx = self as unknown as {
  postMessage(message: WorkerMessage): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

function emitEvent(message: WorkerMessage): void {
  ctx.postMessage(message)
}

type JobCoordinator = ReturnType<typeof createBackendJobCoordinator>

interface ReadyState {
  db: DB
  calls: BackendCalls
}

const ready: Promise<ReadyState> = (async () => {
  const sqlite3 = await sqlite3InitModule()
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'mixjam' })
  const db = new DB(sqlite3, new poolUtil.OpfsSAHPoolDb('/library.db'))
  initSchema(db)
  indexedSamples.ensureUnsortedCategory(db)
  const jobs = createBackendJobCoordinator(db, emitEvent)
  return { db, calls: buildCalls(db, jobs) }
})()

function buildCalls(db: DB, jobs: JobCoordinator): BackendCalls {
  return {
    querySamples: (req: SampleQueryRequest) =>
      browserLibrary.querySamples(db, normalizeSampleQueryRequest(req)),
    getGeneratorReadiness: jobs.getGeneratorReadiness,
    planMixJam: jobs.planMixJam,
    cancelMixJamPlanning: jobs.cancelMixJamPlanning,
    getGeneratorProgress: jobs.getGeneratorProgress,
    getLibraryRootState: (rootKey) => indexedSamples.getLibraryRootState(db, rootKey),
    listMissingRelpaths: (rootKey) => browserLibrary.listMissingRelpaths(db, rootKey),
    startLibrarySync: jobs.startLibrarySync,
    cancelLibrarySync: jobs.cancelLibrarySync,
    getScanProgress: jobs.getScanProgress,
    getAnalysisProgress: jobs.getAnalysisProgress,
    startUniformFolderCalibration: jobs.startUniformFolderCalibration,
    cancelUniformFolderCalibration: jobs.cancelUniformFolderCalibration,
    getCalibrationProgress: jobs.getCalibrationProgress,
    listTags: () => browserLibrary.listTags(db),
    createTag: (name, color) => browserLibrary.createTag(db, name, color),
    renameTag: (id, name) => browserLibrary.renameTag(db, id, name),
    setTagColor: (id, color) => browserLibrary.setTagColor(db, id, color),
    deleteTag: (id) => browserLibrary.deleteTag(db, id),
    assignTag: (sampleId, tagId) => browserLibrary.assignTag(db, sampleId, tagId),
    unassignTag: (sampleId, tagId) => browserLibrary.unassignTag(db, sampleId, tagId),
    updateSampleAnalysis: (sampleId, patch) =>
      analysisPersistence.updateSampleAnalysis(db, sampleId, patch),
    reanalyzeSample: jobs.reanalyzeSample,
    listCategories: () => browserLibrary.listCategories(db),
    createCategory: (name, parentId) => browserLibrary.createCategory(db, name, parentId),
    deleteCategory: (id) => browserLibrary.deleteCategory(db, id),
    listLibraries: () => browserLibrary.listLibraries(db),
    saveLibrary: (name, ruleJson) => browserLibrary.saveLibrary(db, name, ruleJson),
    deleteLibrary: (id) => browserLibrary.deleteLibrary(db, id)
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
    .then((result) => emitEvent({ type: 'response', seq, ok: true, result }))
    .catch((error: unknown) => {
      emitEvent({
        type: 'response',
        seq,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    })
}
