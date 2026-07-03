export const IPC_SCAN_PROGRESS = 'scan:progress'
export const IPC_SCAN_DONE = 'scan:done'

export const IPC_CHANNELS = {
  appGetVersion: 'app:get-version',
  windowResizeTracker: 'window:resize-tracker',
  windowResizeHome: 'window:resize-home',
  dialogOpenFile: 'dialog:open-file',
  shellOpenUrl: 'shell:open-url',
  sessionLoad: 'session:load',
  sessionSave: 'session:save',
  recentProjectsList: 'recent-projects:list',
  recentProjectsRecord: 'recent-projects:record',
  folderPick: 'folder:pick',
  folderValidate: 'folder:validate',
  libraryStartScan: 'library:start-scan',
  libraryGetProgress: 'library:get-progress',
  libraryQuerySamples: 'library:query-samples',
  libraryListTags: 'library:list-tags',
  libraryCreateTag: 'library:create-tag',
  libraryRenameTag: 'library:rename-tag',
  libraryDeleteTag: 'library:delete-tag',
  libraryAssignTag: 'library:assign-tag',
  libraryUnassignTag: 'library:unassign-tag',
  libraryListCategories: 'library:list-categories',
  libraryCreateCategory: 'library:create-category',
  libraryDeleteCategory: 'library:delete-category',
  libraryListLibraries: 'library:list-libraries',
  librarySaveLibrary: 'library:save-library',
  libraryDeleteLibrary: 'library:delete-library',
  libraryHasSamples: 'library:has-samples',
  sampleReadBytes: 'sample:read-bytes'
} as const

export type FolderRole = 'user' | 'sample'

export interface SessionPaths {
  userFolder: string | null
  sampleFolder: string | null
}

export interface RecentProjectItem {
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

export interface SampleItem {
  id: number
  filepath: string
  filename: string
  ext: string | null
  sizeBytes: number | null
  duration: number | null
  sampleRate: number | null
  channels: number | null
  bpm: number | null
  musicalKey: string | null
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
  /** Absolute Sample Folder path; scopes results to that folder's scan root.
   *  A folder that has never been scanned returns an empty result. */
  rootPath?: string
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

/** Coerces an IPC payload into a well-typed SampleQueryRequest with safe defaults. */
export function normalizeSampleQueryRequest(raw: unknown): SampleQueryRequest {
  const record = (raw ?? {}) as Record<string, unknown>
  return {
    textSearch: typeof record.textSearch === 'string' ? record.textSearch : undefined,
    categoryId: typeof record.categoryId === 'number' ? record.categoryId : undefined,
    tagIds: isNumberArray(record.tagIds) ? record.tagIds : undefined,
    rootPath: typeof record.rootPath === 'string' ? record.rootPath : undefined,
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
  filepath: string
  category: string
  durationSeconds: number | null
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
}

export interface ElectronAPI {
  getVersion: () => Promise<string>
  resizeToTracker: () => Promise<void>
  resizeToHome: () => Promise<void>
  openFilePicker: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  loadSession: () => Promise<SessionPaths>
  saveSession: (paths: SessionPaths) => Promise<void>
  loadRecentProjects: (userFolder: string | null) => Promise<RecentProjectItem[]>
  recordRecentProject: (projectPath: string) => Promise<void>
  pickFolder: (role: FolderRole) => Promise<string | null>
  validateFolder: (path: string, role: FolderRole) => Promise<boolean>
  startScan: (sampleFolder: string) => Promise<void>
  getScanProgress: () => Promise<ScanProgress>
  querySamples: (req: SampleQueryRequest) => Promise<SampleQueryResponse>
  listTags: () => Promise<TagItem[]>
  createTag: (name: string, color?: string) => Promise<TagItem>
  renameTag: (id: number, name: string) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  assignTag: (sampleId: number, tagId: number) => Promise<void>
  unassignTag: (sampleId: number, tagId: number) => Promise<void>
  listCategories: () => Promise<CategoryItem[]>
  createCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  deleteCategory: (id: number) => Promise<void>
  listLibraries: () => Promise<LibraryItem[]>
  saveLibrary: (name: string, ruleJson: string) => Promise<LibraryItem>
  deleteLibrary: (id: number) => Promise<void>
  // Returns true when the given Sample Folder has at least one indexed sample
  // row (i.e. a scan of that folder has completed at least once). Gates the
  // browser's empty pre-index state and the first-entry auto-scan.
  hasSamples: (sampleFolder: string) => Promise<boolean>
  // Reads the raw bytes of a sample file from disk (main-mediated, so the audio
  // engine never touches the filesystem). Returns null if the file is
  // unreadable. The path must resolve inside the active Sample Folder.
  readSampleBytes: (sampleFolder: string, filePath: string) => Promise<ArrayBuffer | null>
  onScanProgress: (cb: (progress: ScanProgress) => void) => () => void
  onScanDone: (cb: () => void) => () => void
}
