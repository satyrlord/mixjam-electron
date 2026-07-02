import { vi } from 'vitest'
import type {
  CategoryItem,
  ElectronAPI,
  LibraryItem,
  RecentProjectItem,
  SampleListItem,
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

const DEFAULT_SAMPLE_LIST_ITEMS: SampleListItem[] = [
  {
    id: 'C:\\Samples\\Drums\\Kicks\\kick_808.wav',
    dbId: null,
    name: 'kick_808.wav',
    filepath: 'C:\\Samples\\Drums\\Kicks\\kick_808.wav',
    category: 'Drums',
    durationSeconds: null,
    tags: ['Drums', 'WAV'],
    categoryId: null,
    tagIds: []
  },
  {
    id: 'C:\\Samples\\Drums\\Snares\\snare_clap.wav',
    dbId: null,
    name: 'snare_clap.wav',
    filepath: 'C:\\Samples\\Drums\\Snares\\snare_clap.wav',
    category: 'Drums',
    durationSeconds: null,
    tags: ['Drums', 'WAV'],
    categoryId: null,
    tagIds: []
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
    querySampleBrowser: vi.fn().mockImplementation(async (_sampleFolder, searchQuery: string) => {
      const query = searchQuery.trim().toLowerCase()
      if (!query) return DEFAULT_SAMPLE_LIST_ITEMS
      return DEFAULT_SAMPLE_LIST_ITEMS.filter((item) =>
        `${item.name} ${item.filepath}`.toLowerCase().includes(query)
      )
    }),
    pickFolder: vi.fn().mockResolvedValue(null),
    validateFolder: vi.fn().mockResolvedValue(true),
    hasSamples: vi.fn().mockResolvedValue(false),
    startScan: vi.fn().mockResolvedValue(undefined),
    getScanProgress: vi.fn().mockResolvedValue(IDLE_PROGRESS),
    querySamples: vi.fn().mockResolvedValue({ rows: [], total: 0 } as SampleQueryResponse),
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
