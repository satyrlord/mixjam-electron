import { vi } from 'vitest'
import type {
  CategoryItem,
  ElectronAPI,
  LibraryItem,
  RecentProjectItem,
  SampleItem,
  SampleQueryRequest,
  SampleQueryResponse,
  ScanProgress,
  TagItem
} from '../../../shared/ipc'

const DEFAULT_SESSION = { userFolder: 'C:/Users/test/MixJam', sampleFolder: 'C:/Samples' }
const DEFAULT_RECENT_PROJECTS: RecentProjectItem[] = [
  {
    path: 'c:/users/test/mixjam/club-night.mixjam',
    displayName: 'club-night',
    lastOpened: '2026-06-28T12:00:00.000Z'
  },
  {
    path: 'c:/users/test/mixjam/archive/sunrise.mixjam',
    displayName: 'sunrise',
    lastOpened: null
  }
]

export const DEFAULT_SAMPLE_ROWS: SampleItem[] = [
  {
    id: 1,
    filepath: 'C:\\Samples\\Drums\\Kicks\\kick_808.wav',
    filename: 'kick_808.wav',
    ext: 'wav',
    sizeBytes: 1024,
    duration: null,
    sampleRate: null,
    channels: null,
    bpm: null,
    musicalKey: null,
    dateAdded: 0,
    scanState: 1,
    categoryId: 2,
    tagIds: [],
    tags: []
  },
  {
    id: 2,
    filepath: 'C:\\Samples\\Drums\\Snares\\snare_clap.wav',
    filename: 'snare_clap.wav',
    ext: 'wav',
    sizeBytes: 2048,
    duration: null,
    sampleRate: null,
    channels: null,
    bpm: null,
    musicalKey: null,
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

/** In-memory stand-in for the main process's windowed SQL query: text filter,
 *  category/tag filters, and limit/offset paging over the default rows. */
function queryDefaultRows(request: SampleQueryRequest): SampleQueryResponse {
  let rows = DEFAULT_SAMPLE_ROWS
  if (request.textSearch) {
    const query = request.textSearch.trim().toLowerCase()
    rows = rows.filter((row) =>
      `${row.filename} ${row.filepath}`.toLowerCase().includes(query)
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

export function createElectronAPI(): ElectronAPI {
  return {
    getVersion: vi.fn().mockResolvedValue('v0.test.0'),
    resizeToTracker: vi.fn().mockResolvedValue(undefined),
    resizeToHome: vi.fn().mockResolvedValue(undefined),
    openFilePicker: vi.fn().mockResolvedValue(null),
    openExternal: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(DEFAULT_SESSION),
    saveSession: vi.fn().mockResolvedValue(undefined),
    loadRecentProjects: vi.fn().mockResolvedValue(DEFAULT_RECENT_PROJECTS),
    recordRecentProject: vi.fn().mockResolvedValue(undefined),
    pickFolder: vi.fn().mockResolvedValue(null),
    validateFolder: vi.fn().mockResolvedValue(true),
    hasSamples: vi.fn().mockResolvedValue(true),
    startScan: vi.fn().mockResolvedValue(undefined),
    getScanProgress: vi.fn().mockResolvedValue(IDLE_PROGRESS),
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
    onScanDone: vi.fn().mockReturnValue(() => {})
  }
}
