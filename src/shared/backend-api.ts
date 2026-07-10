// The renderer-facing backend contract. One real implementation exists — the
// browser backend (sqlite-wasm over OPFS + File System Access API) in
// src/renderer/src/backend — and it runs identically in any Chromium browser
// and inside the Electron shell. Host-specific capabilities (window sizing,
// openExternal) live in the separate ShellAPI (src/shared/ipc.ts).

export type FolderRole = 'user' | 'sample'

/**
 * A user-granted folder. Browsers have no absolute paths: `id` keys a
 * FileSystemDirectoryHandle persisted in IndexedDB, `name` is the handle's
 * display name (the folder's basename).
 */
export interface FolderRef {
  id: string
  name: string
}

/** Result of validating a stored folder grant. `needs-permission` means the
 *  handle exists but re-using it requires a user-gesture permission request
 *  (browser host only — the Electron shell auto-grants). */
export type FolderValidation = 'ok' | 'needs-permission' | 'invalid'

export interface SessionPaths {
  userFolder: FolderRef | null
  sampleFolder: FolderRef | null
}

export interface RecentProjectItem {
  /** Path of the .mixjam file relative to the User Folder ('/'-separated). */
  path: string
  displayName: string
  lastOpened: string | null
}

export interface TagItem {
  id: number
  name: string
  color: string | null
}

export interface CategoryItem {
  id: number
  name: string
  parentId: number | null
}

export interface LibraryItem {
  id: number
  name: string
  createdAt: number
  ruleJson: string
}

export type AnalysisSource = 'analysis' | 'manual' | null

export const SAMPLE_TYPE_VALUES = [
  'Kick', 'Snare', 'Hi-hat', 'Percussion', 'Bass', 'Synth',
  'FX', 'Vocal', 'Loop', 'Atmosphere', 'Other'
] as const

export type SampleType = (typeof SAMPLE_TYPE_VALUES)[number]

export interface SampleAnalysisPatch {
  bpm?: number | null
  musicalKey?: string | null
  sampleType?: SampleType | null
}

export interface SampleItem {
  id: number
  /** Path relative to the sample's scan root ('/'-separated). */
  relpath: string
  filename: string
  ext: string | null
  sizeBytes: number | null
  duration: number | null
  sampleRate: number | null
  channels: number | null
  bpm: number | null
  bpmSource: AnalysisSource
  musicalKey: string | null
  musicalKeySource: AnalysisSource
  sampleType: SampleType | null
  sampleTypeSource: AnalysisSource
  dateAdded: number
  scanState: number
  categoryId: number | null
  /** Ids of the tags assigned to this sample, ascending. */
  tagIds: number[]
  /** Names of the tags assigned to this sample, alphabetical. */
  tags: string[]
}

export interface SampleQueryRequest {
  textSearch?: string
  categoryId?: number
  tagIds?: number[]
  /** Sample Folder ref id; scopes results to that folder's scan root.
   *  A folder that has never been scanned returns an empty result. */
  rootId?: string
  limit?: number
  offset?: number
  sortBy?: 'filename' | 'duration' | 'dateAdded'
  sortDir?: 'asc' | 'desc'
}

const VALID_SORT_COLS = new Set(['filename', 'duration', 'dateAdded'])
const VALID_SORT_DIRS = new Set(['asc', 'desc'])

function isSortCol(value: unknown): value is SampleQueryRequest['sortBy'] {
  return typeof value === 'string' && VALID_SORT_COLS.has(value)
}

function isSortDir(value: unknown): value is SampleQueryRequest['sortDir'] {
  return typeof value === 'string' && VALID_SORT_DIRS.has(value)
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === 'number')
}

/** Coerces a worker-message payload into a well-typed SampleQueryRequest with
 *  safe defaults. */
export function normalizeSampleQueryRequest(raw: unknown): SampleQueryRequest {
  const record = (raw ?? {}) as Record<string, unknown>
  return {
    textSearch: typeof record.textSearch === 'string' ? record.textSearch : undefined,
    categoryId: typeof record.categoryId === 'number' ? record.categoryId : undefined,
    tagIds: isNumberArray(record.tagIds) ? record.tagIds : undefined,
    rootId: typeof record.rootId === 'string' ? record.rootId : undefined,
    limit: typeof record.limit === 'number' ? record.limit : undefined,
    offset: typeof record.offset === 'number' ? record.offset : undefined,
    sortBy: isSortCol(record.sortBy) ? record.sortBy : undefined,
    sortDir: isSortDir(record.sortDir) ? record.sortDir : undefined
  }
}

export interface SampleQueryResponse {
  rows: SampleItem[]
  total: number
}

/** Browser list item -- the renderer-facing projection of a DB sample row. */
export interface SampleListItem {
  id: string
  dbId: number
  name: string
  relpath: string
  category: string
  durationSeconds: number | null
  bpm: number | null
  bpmSource: AnalysisSource
  musicalKey: string | null
  musicalKeySource: AnalysisSource
  sampleType: SampleType | null
  sampleTypeSource: AnalysisSource
  tags: string[]
  categoryId: number | null
  tagIds: number[]
}

export interface ScanProgress {
  status: 'idle' | 'scanning' | 'error'
  phase: 1 | 2 | null
  found: number
  processed: number
  total: number
  /** Present for a fatal scan failure; safe to show in renderer diagnostics. */
  error?: string
}

export interface AnalysisProgress {
  status: 'idle' | 'analyzing' | 'error'
  analyzed: number
  total: number
  /** Present for a fatal analysis failure; safe to show in renderer diagnostics. */
  error?: string
}

export interface BackendAPI {
  // Host capabilities — delegated to the ShellAPI in Electron, browser
  // fallbacks (no-op resize, window.open) otherwise.
  getVersion: () => Promise<string>
  resizeToTracker: () => Promise<void>
  resizeToHome: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  loadSession: () => Promise<SessionPaths>
  saveSession: (paths: SessionPaths) => Promise<void>
  loadRecentProjects: (userFolder: FolderRef | null) => Promise<RecentProjectItem[]>
  recordRecentProject: (projectRelpath: string) => Promise<void>
  /** Shows the directory picker. Resolves null when the user cancels. Picking
   *  a folder that is already stored reuses its existing ref (and scan root). */
  pickFolder: (role: FolderRole) => Promise<FolderRef | null>
  validateFolder: (ref: FolderRef, role: FolderRole) => Promise<FolderValidation>
  /** Re-requests permission for a stored handle (must run in a user gesture).
   *  Returns true when access was (re-)granted. */
  requestFolderAccess: (ref: FolderRef, role: FolderRole) => Promise<boolean>
  startScan: (sampleFolder: FolderRef) => Promise<void>
  cancelScan: () => Promise<void>
  getScanProgress: () => Promise<ScanProgress>
  getAnalysisProgress: () => Promise<AnalysisProgress>
  querySamples: (req: SampleQueryRequest) => Promise<SampleQueryResponse>
  listTags: () => Promise<TagItem[]>
  createTag: (name: string, color?: string) => Promise<TagItem>
  renameTag: (id: number, name: string) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  assignTag: (sampleId: number, tagId: number) => Promise<void>
  unassignTag: (sampleId: number, tagId: number) => Promise<void>
  updateSampleAnalysis: (sampleId: number, patch: SampleAnalysisPatch) => Promise<void>
  reanalyzeSample: (sampleFolder: FolderRef, sampleId: number, relpath: string) => Promise<void>
  listCategories: () => Promise<CategoryItem[]>
  createCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  deleteCategory: (id: number) => Promise<void>
  listLibraries: () => Promise<LibraryItem[]>
  saveLibrary: (name: string, ruleJson: string) => Promise<LibraryItem>
  deleteLibrary: (id: number) => Promise<void>
  // Returns true when the given Sample Folder has at least one indexed sample
  // row (i.e. a scan of that folder has completed at least once). Gates the
  // browser's empty pre-index state and the first-entry auto-scan.
  hasSamples: (sampleFolder: FolderRef) => Promise<boolean>
  // Relpaths of samples marked missing (scan_state = 2) under the folder's
  // scan root. The tracker stripes clips whose sample vanished between scans.
  listMissingRelpaths: (sampleFolder: FolderRef) => Promise<string[]>
  // Reads the raw bytes of a sample file through the root's directory handle
  // (a handle can only reach its own subtree, so containment is structural).
  // Returns null if the file is unreadable.
  readSampleBytes: (rootId: string, relpath: string) => Promise<ArrayBuffer | null>
  onScanProgress: (cb: (progress: ScanProgress) => void) => () => void
  onScanDone: (cb: () => void) => () => void
  onAnalysisProgress: (cb: (progress: AnalysisProgress) => void) => () => void
  onAnalysisDone: (cb: () => void) => () => void
}
