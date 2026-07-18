// Message protocol between the main-thread BackendAPI facade (client.ts) and
// the backend worker (worker.ts). Requests are promise-per-message; scan
// progress fans out as unsolicited events.

import type {
  AnalysisDone,
  AnalysisProgress,
  CategoryItem,
  LibraryItem,
  LibraryRootState,
  LibraryScanDone,
  LibrarySyncStartResult,
  LibrarySyncTrigger,
  MixJamGeneratorParameters,
  MixJamGeneratorPlan,
  MixJamGeneratorProgress,
  MixJamGeneratorReadiness,
  SampleQueryRequest,
  SampleQueryResponse,
  ScanProgress,
  SampleAnalysisPatch,
  SampleAnalysisDone,
  TagItem
} from '../../../shared/backend-api'

/** Calls serviced by the worker. Most are synchronous; long-running operations
 * may return a promise. The client facade always exposes a promise boundary. */
export interface BackendCalls {
  querySamples: (req: SampleQueryRequest) => SampleQueryResponse
  getGeneratorReadiness: (rootKey: string) => MixJamGeneratorReadiness
  planMixJam: (
    rootKey: string,
    jobId: string,
    parameters: MixJamGeneratorParameters,
    expectedFingerprint?: string
  ) => Promise<MixJamGeneratorPlan>
  cancelMixJamPlanning: (jobId: string) => void
  getGeneratorProgress: () => MixJamGeneratorProgress
  getLibraryRootState: (rootKey: string) => LibraryRootState
  listMissingRelpaths: (rootKey: string) => string[]
  startLibrarySync: (rootKey: string, trigger: LibrarySyncTrigger) => LibrarySyncStartResult
  cancelLibrarySync: (jobId: string) => void
  getScanProgress: () => ScanProgress
  getAnalysisProgress: () => AnalysisProgress
  listTags: () => TagItem[]
  createTag: (name: string, color?: string) => TagItem
  renameTag: (id: number, name: string) => void
  setTagColor: (id: number, color: string | null) => void
  deleteTag: (id: number) => void
  assignTag: (sampleId: number, tagId: number) => void
  unassignTag: (sampleId: number, tagId: number) => void
  updateSampleAnalysis: (sampleId: number, patch: SampleAnalysisPatch) => void
  reanalyzeSample: (
    rootKey: string,
    sampleId: number,
    relpath: string
  ) => Promise<SampleAnalysisDone>
  listCategories: () => CategoryItem[]
  createCategory: (name: string, parentId?: number) => CategoryItem
  deleteCategory: (id: number) => void
  listLibraries: () => LibraryItem[]
  saveLibrary: (name: string, ruleJson: string) => LibraryItem
  deleteLibrary: (id: number) => void
}

export type BackendOp = keyof BackendCalls

export interface WorkerRequest {
  seq: number
  op: BackendOp
  args: unknown[]
}

export type WorkerResponse =
  | { type: 'response'; seq: number; ok: true; result: unknown }
  | { type: 'response'; seq: number; ok: false; error: string }

export type WorkerEvent =
  | { type: 'scan-progress'; progress: ScanProgress }
  | { type: 'scan-done'; done: LibraryScanDone }
  | { type: 'analysis-progress'; progress: AnalysisProgress }
  | { type: 'analysis-done'; done: AnalysisDone }
  | { type: 'generator-progress'; progress: MixJamGeneratorProgress }

export type WorkerMessage = WorkerResponse | WorkerEvent
