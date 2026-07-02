import type {
  ElectronAPI,
  SessionPaths,
  RecentProjectItem,
  SampleListItem,
  SampleQueryRequest,
  SampleQueryResponse,
  TagItem,
  CategoryItem,
  LibraryItem,
  ScanProgress
} from '../../../shared/ipc'
import { generateMockSamples, generateMockTags, generateMockCategories } from './mockLibraryData'

const STORAGE_KEY_SESSION = 'mixjam:session'
const STORAGE_KEY_RECENT_PROJECTS = 'mixjam:recent-projects'
const STORAGE_KEY_TAGS = 'mixjam:tags'
const STORAGE_KEY_CATEGORIES = 'mixjam:categories'
const STORAGE_KEY_LIBRARIES = 'mixjam:libraries'
const STORAGE_KEY_SAMPLE_TAGS = 'mixjam:sample-tags'

// In-memory library state for this session
let currentScanProgress: ScanProgress = {
  status: 'idle',
  phase: null,
  found: 0,
  processed: 0,
  total: 0
}

let isScanning = false
let scanProgressListeners: Set<(progress: ScanProgress) => void> = new Set()
let scanDoneListeners: Set<() => void> = new Set()

// Mock library state
let mockSamples: SampleListItem[] = []
let mockTags: TagItem[] = []
let mockCategories: CategoryItem[] = []
let mockLibraries: LibraryItem[] = []
let tagNextId = 1
let categoryNextId = 1
let libraryNextId = 1

function initializeLibraryState() {
  // Load from storage or initialize
  const storedTags = localStorage.getItem(STORAGE_KEY_TAGS)
  if (storedTags) {
    mockTags = JSON.parse(storedTags)
    tagNextId = Math.max(...mockTags.map((t) => t.id), 0) + 1
  } else {
    mockTags = generateMockTags()
    tagNextId = Math.max(...mockTags.map((t) => t.id), 0) + 1
    localStorage.setItem(STORAGE_KEY_TAGS, JSON.stringify(mockTags))
  }

  const storedCategories = localStorage.getItem(STORAGE_KEY_CATEGORIES)
  if (storedCategories) {
    mockCategories = JSON.parse(storedCategories)
    categoryNextId = Math.max(...mockCategories.map((c) => c.id), 0) + 1
  } else {
    mockCategories = generateMockCategories()
    categoryNextId = Math.max(...mockCategories.map((c) => c.id), 0) + 1
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(mockCategories))
  }

  const storedLibraries = localStorage.getItem(STORAGE_KEY_LIBRARIES)
  if (storedLibraries) {
    mockLibraries = JSON.parse(storedLibraries)
    libraryNextId = Math.max(...mockLibraries.map((l) => l.id), 0) + 1
  } else {
    mockLibraries = []
    localStorage.setItem(STORAGE_KEY_LIBRARIES, JSON.stringify(mockLibraries))
  }

  mockSamples = generateMockSamples(mockTags, mockCategories)
}

function notifyScanProgress(progress: ScanProgress) {
  currentScanProgress = progress
  scanProgressListeners.forEach((cb) => cb(progress))
}

function notifyScanDone() {
  scanDoneListeners.forEach((cb) => cb())
}

async function simulateScan(sampleFolder: string) {
  mockSamples = generateMockSamples(mockTags, mockCategories)
  const total = mockSamples.length

  notifyScanProgress({
    status: 'scanning',
    phase: 1,
    found: 0,
    processed: 0,
    total: total
  })

  // Simulate phase 1: discovery
  for (let i = 0; i < total; i++) {
    if (i % 10 === 0) {
      await new Promise((r) => setTimeout(r, 50))
    }
    notifyScanProgress({
      status: 'scanning',
      phase: 1,
      found: i,
      processed: 0,
      total: total
    })
  }

  // Simulate phase 2: processing
  for (let i = 0; i < total; i++) {
    if (i % 10 === 0) {
      await new Promise((r) => setTimeout(r, 50))
    }
    notifyScanProgress({
      status: 'scanning',
      phase: 2,
      found: total,
      processed: i,
      total: total
    })
  }

  isScanning = false
  currentScanProgress = {
    status: 'idle',
    phase: null,
    found: total,
    processed: total,
    total: total
  }
  notifyScanDone()
  notifyScanProgress(currentScanProgress)
}

export function createMockElectronAPI(): ElectronAPI {
  initializeLibraryState()
  
  // Ensure samples are available immediately (trigger fake scan completion)
  currentScanProgress = {
    status: 'idle',
    phase: null,
    found: mockSamples.length,
    processed: mockSamples.length,
    total: mockSamples.length
  }

  return {
    getVersion: async () => '0.5.0-web',

    resizeToTracker: async () => {
      // No-op in browser
    },

    resizeToHome: async () => {
      // No-op in browser
    },

    openFilePicker: async () => {
      // Return null — user can use Load MixJam or Recent Projects
      return null
    },

    openExternal: async (url) => {
      window.open(url, '_blank')
    },

    loadSession: async () => {
      const stored = localStorage.getItem(STORAGE_KEY_SESSION)
      if (stored) {
        return JSON.parse(stored) as SessionPaths
      }
      return { userFolder: null, sampleFolder: null }
    },

    saveSession: async (paths) => {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(paths))
    },

    loadRecentProjects: async () => {
      const stored = localStorage.getItem(STORAGE_KEY_RECENT_PROJECTS)
      if (stored) {
        return JSON.parse(stored) as RecentProjectItem[]
      }
      return []
    },

    recordRecentProject: async (projectPath) => {
      const stored = localStorage.getItem(STORAGE_KEY_RECENT_PROJECTS)
      const projects: RecentProjectItem[] = stored ? JSON.parse(stored) : []

      const displayName = projectPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? projectPath
      const existing = projects.findIndex((p) => p.path === projectPath)

      if (existing >= 0) {
        projects.splice(existing, 1)
      }

      projects.unshift({
        path: projectPath,
        displayName,
        lastOpened: new Date().toISOString()
      })

      // Keep only last 10
      projects.splice(10)

      localStorage.setItem(STORAGE_KEY_RECENT_PROJECTS, JSON.stringify(projects))
    },

    querySampleBrowser: async (sampleFolder, searchQuery) => {
      if (!searchQuery) return mockSamples

      const q = searchQuery.toLowerCase()
      return mockSamples.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      )
    },

    pickFolder: async () => {
      // In browser, use a mock folder path
      return 'local-samples'
    },

    validateFolder: async () => {
      // Always valid in browser mode
      return true
    },

    startScan: async (sampleFolder) => {
      if (isScanning) return
      isScanning = true
      void simulateScan(sampleFolder)
    },

    getScanProgress: async () => {
      return currentScanProgress
    },

    querySamples: async (req) => {
      // Ensure we have samples
      if (mockSamples.length === 0) {
        mockSamples = generateMockSamples(mockTags, mockCategories)
      }
      let results = [...mockSamples]

      // Apply text search
      if (req.textSearch) {
        const q = req.textSearch.toLowerCase()
        results = results.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q) ||
            s.tags.some((t) => t.toLowerCase().includes(q))
        )
      }

      // Apply category filter
      if (req.categoryId !== undefined) {
        results = results.filter((s) => s.categoryId === req.categoryId)
      }

      // Apply tag filters (AND logic)
      if (req.tagIds && req.tagIds.length > 0) {
        results = results.filter((s) => req.tagIds!.every((tid) => s.tagIds.includes(tid)))
      }

      const total = results.length

      // Apply sorting
      const sortBy = req.sortBy ?? 'filename'
      const sortDir = req.sortDir ?? 'asc'

      if (sortBy === 'filename') {
        results.sort((a, b) =>
          sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
        )
      } else if (sortBy === 'duration') {
        results.sort((a, b) => {
          const aDur = a.durationSeconds ?? 0
          const bDur = b.durationSeconds ?? 0
          return sortDir === 'asc' ? aDur - bDur : bDur - aDur
        })
      } else if (sortBy === 'dateAdded') {
        results.sort((a, b) => {
          const aDate = new Date(a.filepath).getTime()
          const bDate = new Date(b.filepath).getTime()
          return sortDir === 'asc' ? aDate - bDate : bDate - aDate
        })
      }

      // Apply pagination
      const offset = req.offset ?? 0
      const limit = req.limit ?? 50
      const rows = results.slice(offset, offset + limit)

      return { rows, total }
    },

    listTags: async () => {
      return mockTags
    },

    createTag: async (name, color) => {
      const tag: TagItem = {
        id: tagNextId++,
        name,
        color: color ?? null
      }
      mockTags.push(tag)
      localStorage.setItem(STORAGE_KEY_TAGS, JSON.stringify(mockTags))
      return tag
    },

    renameTag: async (id, name) => {
      const tag = mockTags.find((t) => t.id === id)
      if (tag) {
        tag.name = name
        localStorage.setItem(STORAGE_KEY_TAGS, JSON.stringify(mockTags))
      }
    },

    deleteTag: async (id) => {
      mockTags = mockTags.filter((t) => t.id !== id)
      localStorage.setItem(STORAGE_KEY_TAGS, JSON.stringify(mockTags))
    },

    assignTag: async (sampleId, tagId) => {
      const sample = mockSamples.find((s) => s.id === `${sampleId}`)
      const tag = mockTags.find((t) => t.id === tagId)
      if (sample && tag && !sample.tagIds.includes(tagId)) {
        sample.tagIds.push(tagId)
        sample.tags.push(tag.name)
        sample.tags.sort()
      }
    },

    unassignTag: async (sampleId, tagId) => {
      const sample = mockSamples.find((s) => s.id === `${sampleId}`)
      if (sample) {
        const idx = sample.tagIds.indexOf(tagId)
        if (idx >= 0) {
          sample.tagIds.splice(idx, 1)
          const tag = mockTags.find((t) => t.id === tagId)
          if (tag) {
            sample.tags = sample.tags.filter((t) => t !== tag.name)
          }
        }
      }
    },

    listCategories: async () => {
      return mockCategories
    },

    createCategory: async (name, parentId) => {
      const category: CategoryItem = {
        id: categoryNextId++,
        name,
        parentId: parentId ?? null
      }
      mockCategories.push(category)
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(mockCategories))
      return category
    },

    deleteCategory: async (id) => {
      mockCategories = mockCategories.filter((c) => c.id !== id)
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(mockCategories))
    },

    listLibraries: async () => {
      return mockLibraries
    },

    saveLibrary: async (name, ruleJson) => {
      const library: LibraryItem = {
        id: libraryNextId++,
        name,
        ruleJson,
        createdAt: Date.now()
      }
      mockLibraries.push(library)
      localStorage.setItem(STORAGE_KEY_LIBRARIES, JSON.stringify(mockLibraries))
      return library
    },

    deleteLibrary: async (id) => {
      mockLibraries = mockLibraries.filter((l) => l.id !== id)
      localStorage.setItem(STORAGE_KEY_LIBRARIES, JSON.stringify(mockLibraries))
    },

    hasSamples: async () => {
      return mockSamples.length > 0
    },

    readSampleBytes: async () => {
      // Return null — audio playback uses offline Web Audio API buffers
      return null
    },

    onScanProgress: (cb) => {
      scanProgressListeners.add(cb)
      return () => scanProgressListeners.delete(cb)
    },

    onScanDone: (cb) => {
      scanDoneListeners.add(cb)
      return () => scanDoneListeners.delete(cb)
    }
  }
}
