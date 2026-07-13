import { vi } from 'vitest'
import type {
  BackendAPI,
  CategoryItem,
  FolderRef,
  LibraryItem,
  MixJamFileItem,
  SampleItem,
  SampleQueryRequest,
  SampleQueryResponse,
  ScanProgress,
  TagItem
} from '../../../shared/backend-api'

export const TEST_USER_FOLDER: FolderRef = { id: 'test-user-folder', name: 'MixJam' }
export const TEST_SAMPLE_FOLDER: FolderRef = { id: 'test-sample-folder', name: 'Samples' }

const DEFAULT_FOLDER_SELECTIONS = { userFolder: TEST_USER_FOLDER, sampleFolder: TEST_SAMPLE_FOLDER }
const DEFAULT_MIXJAM_FILES: MixJamFileItem[] = [
  {
    path: 'club-night.mixjam',
    displayName: 'club-night',
    lastOpened: '2026-06-28T12:00:00.000Z'
  },
  {
    path: 'archive/sunrise.mixjam',
    displayName: 'sunrise',
    lastOpened: null
  }
]

export const DEFAULT_SAMPLE_ROWS: SampleItem[] = [
  {
    id: 1,
    relpath: 'Drums/Kicks/kick_808.wav',
    filename: 'kick_808.wav',
    ext: 'wav',
    sizeBytes: 1024,
    duration: null,
    sampleRate: null,
    channels: null,
    bpm: null,
    bpmSource: null,
    musicalKey: null,
    musicalKeySource: null,
    sampleType: null,
    sampleTypeSource: null,
    dateAdded: 0,
    scanState: 1,
    categoryId: 2,
    tagIds: [],
    tags: []
  },
  {
    id: 2,
    relpath: 'Drums/Snares/snare_clap.wav',
    filename: 'snare_clap.wav',
    ext: 'wav',
    sizeBytes: 2048,
    duration: null,
    sampleRate: null,
    channels: null,
    bpm: null,
    bpmSource: null,
    musicalKey: null,
    musicalKeySource: null,
    sampleType: null,
    sampleTypeSource: null,
    dateAdded: 1,
    scanState: 1,
    categoryId: 2,
    tagIds: [],
    tags: []
  }
]

const IDLE_PROGRESS: ScanProgress = {
  status: 'idle',
  phase: null,
  found: 0,
  processed: 0,
  total: 0
}

const DEFAULT_TAGS: TagItem[] = []
const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 1, name: 'Bass', parentId: null },
  { id: 2, name: 'Drums', parentId: null },
  { id: 3, name: 'FX', parentId: null },
  { id: 4, name: 'Synth', parentId: null },
  { id: 5, name: 'Vocal', parentId: null },
  { id: 6, name: 'Loop', parentId: null },
  { id: 7, name: 'Percussion', parentId: null },
  { id: 8, name: 'Atmosphere', parentId: null }
]
const DEFAULT_LIBRARIES: LibraryItem[] = []

/** In-memory stand-in for the backend worker's windowed SQL query: text filter,
 *  category/tag filters, and limit/offset paging over the default rows. */
function queryDefaultRows(request: SampleQueryRequest): SampleQueryResponse {
  let rows = DEFAULT_SAMPLE_ROWS
  if (request.textSearch) {
    const query = request.textSearch.trim().toLowerCase()
    rows = rows.filter((row) =>
      `${row.filename} ${row.relpath}`.toLowerCase().includes(query)
    )
  }
  if (request.categoryId !== undefined) {
    rows = rows.filter((row) => row.categoryId === request.categoryId)
  }
  if (request.tagIds && request.tagIds.length > 0) {
    rows = rows.filter((row) => request.tagIds!.some((id) => row.tagIds.includes(id)))
  }
  const total = rows.length
  const offset = request.offset ?? 0
  const limit = request.limit ?? 200
  return { rows: rows.slice(offset, offset + limit), total }
}

export function createBackendAPI(): BackendAPI {
  return {
    getVersion: vi.fn().mockResolvedValue('v0.test.0'),
    resizeToPlayer: vi.fn().mockResolvedValue(undefined),
    resizeToHome: vi.fn().mockResolvedValue(undefined),
    openExternal: vi.fn().mockResolvedValue(undefined),
    loadFolderSelections: vi.fn().mockResolvedValue(DEFAULT_FOLDER_SELECTIONS),
    saveFolderSelections: vi.fn().mockResolvedValue(undefined),
    loadMixJamFiles: vi.fn().mockResolvedValue(DEFAULT_MIXJAM_FILES),
    recordRecentProject: vi.fn().mockResolvedValue(undefined),
    openMixJamFile: vi.fn().mockResolvedValue(null),
    readMixJamFile: vi.fn().mockRejectedValue(new Error('Project fixture not configured')),
    saveMixJamFileAs: vi.fn().mockResolvedValue(null),
    writeMixJamFile: vi.fn().mockResolvedValue(undefined),
    findMissingSampleFiles: vi.fn().mockResolvedValue([]),
    pickFolder: vi.fn().mockResolvedValue(null),
    validateFolder: vi.fn().mockResolvedValue('ok'),
    requestFolderAccess: vi.fn().mockResolvedValue(true),
    hasSamples: vi.fn().mockResolvedValue(true),
    listMissingRelpaths: vi.fn().mockResolvedValue([]),
    startScan: vi.fn().mockResolvedValue(undefined),
    cancelScan: vi.fn().mockResolvedValue(undefined),
    getScanProgress: vi.fn().mockResolvedValue(IDLE_PROGRESS),
    getAnalysisProgress: vi.fn().mockResolvedValue({ status: 'idle', analyzed: 0, total: 0 }),
    querySamples: vi
      .fn()
      .mockImplementation(async (request: SampleQueryRequest) => queryDefaultRows(request)),
    listTags: vi.fn().mockResolvedValue(DEFAULT_TAGS),
    createTag: vi.fn().mockImplementation(async (name: string, color?: string) => ({
      id: Date.now(),
      name,
      color: color ?? null
    })),
    renameTag: vi.fn().mockResolvedValue(undefined),
    deleteTag: vi.fn().mockResolvedValue(undefined),
    assignTag: vi.fn().mockResolvedValue(undefined),
    unassignTag: vi.fn().mockResolvedValue(undefined),
    updateSampleAnalysis: vi.fn().mockResolvedValue(undefined),
    reanalyzeSample: vi.fn().mockResolvedValue(undefined),
    listCategories: vi.fn().mockResolvedValue(DEFAULT_CATEGORIES),
    createCategory: vi.fn().mockImplementation(async (name: string, parentId?: number) => ({
      id: Date.now(),
      name,
      parentId: parentId ?? null
    })),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
    listLibraries: vi.fn().mockResolvedValue(DEFAULT_LIBRARIES),
    saveLibrary: vi.fn().mockImplementation(async (name: string, ruleJson: string) => ({
      id: Date.now(),
      name,
      createdAt: Date.now(),
      ruleJson
    })),
    deleteLibrary: vi.fn().mockResolvedValue(undefined),
    readSampleBytes: vi.fn().mockResolvedValue(null),
    onScanProgress: vi.fn().mockReturnValue(() => {}),
    onScanDone: vi.fn().mockReturnValue(() => {}),
    onAnalysisProgress: vi.fn().mockReturnValue(() => {}),
    onAnalysisDone: vi.fn().mockReturnValue(() => {})
  }
}
