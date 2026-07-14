// Message protocol between the main-thread BackendAPI facade (client.ts) and
// the backend worker (worker.ts). Requests are promise-per-message; scan
// progress fans out as unsolicited events.

import type {
  AnalysisProgress,
  CategoryItem,
  LibraryItem,
  SampleQueryRequest,
  SampleQueryResponse,
  ScanProgress,
  SampleAnalysisPatch,
  TagItem
} from '../../../shared/backend-api'

/** The calls the worker services. Synchronous return types — the client facade
 *  adds the promise boundary. */
export interface BackendCalls {
  querySamples: (req: SampleQueryRequest) => SampleQueryResponse
  hasSamples: (rootKey: string) => boolean
  listMissingRelpaths: (rootKey: string) => string[]
  startScan: (rootKey: string) => void
  cancelScan: () => void
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
  reanalyzeSample: (rootKey: string, sampleId: number, relpath: string) => void
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
  | { type: 'scan-done' }
  | { type: 'analysis-progress'; progress: AnalysisProgress }
  | { type: 'analysis-done' }

export type WorkerMessage = WorkerResponse | WorkerEvent
