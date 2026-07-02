import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryItem, SampleItem, TagItem } from '../../../shared/ipc'
import { createElectronAPI } from '../test/electronApi'
import { useLibraryData } from './useLibraryData'

const USER_FOLDER = 'C:/Users/test/MixJam'
const SAMPLE_FOLDER = 'C:/Samples'

function makeApi() {
  return createElectronAPI()
}

function makeDbRow(overrides: Partial<SampleItem> = {}): SampleItem {
  return {
    id: 1,
    filepath: 'C:/a.wav',
    filename: 'a.wav',
    ext: '.wav',
    sizeBytes: 100,
    duration: 2.5,
    sampleRate: 44100,
    channels: 1,
    bpm: 120,
    musicalKey: 'C',
    dateAdded: 0,
    scanState: 1,
    categoryId: 1,
    tagIds: [],
    tags: [],
    ...overrides
  }
}

describe('useLibraryData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads version, recent projects, tags, categories, and libraries on mount', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))
    await waitFor(() => expect(result.current.recentProjects).toHaveLength(2))
    await waitFor(() => expect(result.current.categories).toHaveLength(8))
    await waitFor(() => expect(result.current.tags).toHaveLength(0))
    await waitFor(() => expect(result.current.libraries).toHaveLength(0))
  })

  it('queries the legacy folder browser when DB is not indexed', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.hasSamples).mockResolvedValue(false)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(api.querySampleBrowser).toHaveBeenCalledWith(SAMPLE_FOLDER, '', false)
    })
    await waitFor(() => {
      expect(result.current.samples).toHaveLength(2)
      expect(result.current.totalCount).toBe(2)
    })
  })

  it('queries the DB pipeline when DB is indexed', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.hasSamples).mockResolvedValue(true)
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [makeDbRow()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(api.querySamples).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(result.current.samples).toHaveLength(1)
      expect(result.current.samples[0]!.name).toBe('a.wav')
    })
  })

  it('loads one windowed page up front and fetches the next via loadMoreSamples', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const dbRows: SampleItem[] = Array.from({ length: 501 }, (_, index) =>
      makeDbRow({
        id: index + 1,
        filepath: `C:/samples/sample-${index + 1}.wav`,
        filename: `sample-${index + 1}.wav`,
        dateAdded: index,
        categoryId: (index % 8) + 1
      })
    )
    vi.mocked(api.hasSamples).mockResolvedValue(true)
    vi.mocked(api.querySamples).mockImplementation(async (request) => {
      const offset = request.offset ?? 0
      const limit = request.limit ?? 500
      return { rows: dbRows.slice(offset, offset + limit), total: dbRows.length }
    })

    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    // Only the first windowed page is loaded eagerly — never the full set
    // (AGENTS.md hard rule).
    await waitFor(() => expect(result.current.samples).toHaveLength(500))
    expect(result.current.totalCount).toBe(501)
    expect(result.current.hasMoreSamples).toBe(true)
    expect(api.querySamples).toHaveBeenCalledWith(expect.objectContaining({ limit: 500, offset: 0 }))
    expect(api.querySamples).not.toHaveBeenCalledWith(expect.objectContaining({ offset: 500 }))

    // The grid requests the next page as the user scrolls near the end.
    act(() => {
      result.current.loadMoreSamples()
    })

    await waitFor(() => expect(result.current.samples).toHaveLength(501))
    expect(result.current.hasMoreSamples).toBe(false)
    expect(api.querySamples).toHaveBeenCalledWith(expect.objectContaining({ limit: 500, offset: 500 }))
  })

  it('sets an error when the legacy query fails', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.hasSamples).mockResolvedValue(false)
    vi.mocked(api.querySampleBrowser).mockRejectedValue(new Error('disk fail'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.error).toBe('Unable to load sample library.')
    })
    consoleSpy.mockRestore()
  })

  it('sets an error when the DB query fails', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.hasSamples).mockResolvedValue(true)
    vi.mocked(api.querySamples).mockRejectedValue(new Error('db locked'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.error).toBe('Unable to query library.')
    })
    consoleSpy.mockRestore()
  })

  it('clears state when sample folder is null', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result, rerender } = renderHook(
      ({ folder }) => useLibraryData(api, USER_FOLDER, folder),
      { initialProps: { folder: SAMPLE_FOLDER as string | null } }
    )

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    rerender({ folder: null })

    await waitFor(() => {
      expect(result.current.samples).toHaveLength(0)
      expect(result.current.totalCount).toBe(0)
      expect(result.current.loading).toBe(false)
    })
  })

  it('creates a tag and adds it to state', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.createTag).mockResolvedValue({ id: 10, name: 'Funky', color: '#abc' })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.tags).toHaveLength(0))

    let created: TagItem | undefined
    await act(async () => {
      created = await result.current.createTag('Funky', '#abc')
    })

    expect(created!.id).toBe(10)
    expect(result.current.tags).toHaveLength(1)
    expect(result.current.tags[0]!.name).toBe('Funky')
  })

  it('does not duplicate a tag that already exists in state', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const existing: TagItem = { id: 5, name: 'Alpha', color: null }
    vi.mocked(api.listTags).mockResolvedValue([existing])
    vi.mocked(api.createTag).mockResolvedValue(existing)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.tags).toHaveLength(1))

    await act(async () => {
      await result.current.createTag('Alpha')
    })

    expect(result.current.tags).toHaveLength(1)
  })

  it('renames a tag in state', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const existing: TagItem = { id: 5, name: 'Alpha', color: null }
    vi.mocked(api.listTags).mockResolvedValue([existing])
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.tags).toHaveLength(1))

    await act(async () => {
      await result.current.renameTag(5, 'Beta')
    })

    expect(result.current.tags[0]!.name).toBe('Beta')
  })

  it('deletes a tag from state and selected tag ids', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const existing: TagItem = { id: 5, name: 'Alpha', color: null }
    vi.mocked(api.listTags).mockResolvedValue([existing])
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.tags).toHaveLength(1))

    await act(async () => {
      result.current.setSelectedTagIds([5, 9])
    })
    await act(async () => {
      await result.current.deleteTag(5)
    })

    expect(result.current.tags).toHaveLength(0)
    expect(result.current.selectedTagIds).toEqual([9])
  })

  it('creates a category and adds it to state', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.createCategory).mockResolvedValue({ id: 20, name: 'SubBass', parentId: 2 })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.categories).toHaveLength(8))

    let created: CategoryItem | undefined
    await act(async () => {
      created = await result.current.createCategory('SubBass', 2)
    })

    expect(created!.id).toBe(20)
    expect(result.current.categories).toHaveLength(9)
  })

  it('deletes a category and clears selection if it was selected', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.categories).toHaveLength(8))

    await act(async () => {
      result.current.setSelectedCategoryId(2)
    })
    await act(async () => {
      await result.current.deleteCategory(2)
    })

    expect(result.current.categories.find((c) => c.id === 2)).toBeUndefined()
    expect(result.current.selectedCategoryId).toBeUndefined()
  })

  it('saves a library with current filters encoded as ruleJson', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.hasSamples).mockResolvedValue(false)
    vi.mocked(api.saveLibrary).mockResolvedValue({ id: 1, name: 'MyLib', createdAt: 100, ruleJson: '{}' })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    await act(async () => {
      result.current.setSearchQuery('kick')
    })
    await act(async () => {
      result.current.setSelectedCategoryId(3)
    })
    await act(async () => {
      result.current.setSelectedTagIds([7])
    })

    await act(async () => {
      await result.current.saveLibrary('MyLib')
    })

    expect(api.saveLibrary).toHaveBeenCalledWith('MyLib', expect.stringContaining('"version":1'))
    const ruleArg = vi.mocked(api.saveLibrary).mock.calls[0]![1]
    const parsed = JSON.parse(ruleArg)
    expect(parsed.root.children).toHaveLength(3)
    expect(result.current.libraries).toHaveLength(1)
    expect(result.current.libraries[0]!.name).toBe('MyLib')
  })

  it('deletes a library from state', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listLibraries).mockResolvedValue([{ id: 1, name: 'OldLib', createdAt: 50, ruleJson: '{}' }])
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.libraries).toHaveLength(1))

    await act(async () => {
      await result.current.deleteLibrary(1)
    })

    expect(result.current.libraries).toHaveLength(0)
  })

  it('handleSortChange toggles direction when clicking the same column', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    expect(result.current.sortBy).toBe('filename')
    expect(result.current.sortDir).toBe('asc')

    await act(async () => {
      result.current.handleSortChange('filename')
    })

    expect(result.current.sortBy).toBe('filename')
    expect(result.current.sortDir).toBe('desc')

    await act(async () => {
      result.current.handleSortChange('filename')
    })

    expect(result.current.sortDir).toBe('asc')
  })

  it('handleSortChange resets to asc when switching columns', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    await act(async () => {
      result.current.handleSortChange('duration')
    })

    expect(result.current.sortBy).toBe('duration')
    expect(result.current.sortDir).toBe('asc')

    // Toggle direction on the new column
    await act(async () => {
      result.current.handleSortChange('duration')
    })
    expect(result.current.sortDir).toBe('desc')

    // Switch to another column — should reset to asc
    await act(async () => {
      result.current.handleSortChange('dateAdded')
    })
    expect(result.current.sortBy).toBe('dateAdded')
    expect(result.current.sortDir).toBe('asc')
  })

  it('startLibraryScan calls electronAPI.startScan and sets progress', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    await act(async () => {
      await result.current.startLibraryScan()
    })

    expect(api.startScan).toHaveBeenCalledWith(SAMPLE_FOLDER)
    expect(result.current.scanProgress.status).toBe('scanning')
  })

  it('reloadRecentProjects refreshes from electronAPI', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.recentProjects).toHaveLength(2))

    const newProjects = [{ path: 'c:/new.mixjam', displayName: 'new', lastOpened: null }]
    vi.mocked(api.loadRecentProjects).mockResolvedValue(newProjects)

    await act(async () => {
      await result.current.reloadRecentProjects()
    })

    expect(result.current.recentProjects).toEqual(newProjects)
  })

  it('onScanDone callback resets progress, marks indexed, and refreshes data', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    const initialCatCalls = vi.mocked(api.listCategories).mock.calls.length
    const initialTagCalls = vi.mocked(api.listTags).mock.calls.length

    // Trigger the onScanDone callback that was registered during mount
    const scanDoneCallback = vi.mocked(api.onScanDone).mock.calls[0]![0]
    await act(async () => {
      scanDoneCallback()
    })

    await waitFor(() => {
      expect(result.current.scanProgress.status).toBe('idle')
    })

    // Categories and tags were refreshed
    expect(vi.mocked(api.listCategories).mock.calls.length).toBeGreaterThan(initialCatCalls)
    expect(vi.mocked(api.listTags).mock.calls.length).toBeGreaterThan(initialTagCalls)
  })

  it('sorts tags alphabetically when creating a tag with multiple existing tags', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const existingTags: TagItem[] = [
      { id: 5, name: 'Zebra', color: null },
      { id: 3, name: 'Apple', color: null }
    ]
    vi.mocked(api.listTags).mockResolvedValue(existingTags)
    vi.mocked(api.createTag).mockResolvedValue({ id: 10, name: 'Mango', color: null })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.tags).toHaveLength(2))

    await act(async () => {
      await result.current.createTag('Mango')
    })

    expect(result.current.tags).toHaveLength(3)
    expect(result.current.tags.map((t) => t.name)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('renames a tag and sorts alphabetically when multiple tags exist', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const existingTags: TagItem[] = [
      { id: 5, name: 'Zebra', color: null },
      { id: 3, name: 'Apple', color: null }
    ]
    vi.mocked(api.listTags).mockResolvedValue(existingTags)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.tags).toHaveLength(2))

    await act(async () => {
      await result.current.renameTag(5, 'Mango')
    })

    expect(result.current.tags.map((t) => t.name)).toEqual(['Apple', 'Mango'])
  })

  it('deletes a category without clearing selection when it is not selected', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.categories).toHaveLength(8))

    await act(async () => {
      result.current.setSelectedCategoryId(2)
    })
    await act(async () => {
      await result.current.deleteCategory(3)
    })

    expect(result.current.selectedCategoryId).toBe(2)
  })

  it('saves a library with no active filters', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.hasSamples).mockResolvedValue(false)
    vi.mocked(api.saveLibrary).mockResolvedValue({ id: 1, name: 'Empty', createdAt: 100, ruleJson: '{}' })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    await act(async () => {
      await result.current.saveLibrary('Empty')
    })

    const ruleArg = vi.mocked(api.saveLibrary).mock.calls[0]![1]
    const parsed = JSON.parse(ruleArg)
    expect(parsed.root.children).toHaveLength(0)
  })

  it('startLibraryScan returns early when sampleFolder is null', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, null))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))

    await act(async () => {
      await result.current.startLibraryScan()
    })

    expect(api.startScan).not.toHaveBeenCalled()
  })

  it('applyLibrary restores the saved filter state (AC-013)', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))

    const ruleJson = JSON.stringify({
      version: 1,
      root: {
        kind: 'group',
        op: 'and',
        children: [
          { kind: 'text', query: 'kick' },
          { kind: 'category', quantifier: 'any', categoryIds: [3], includeDescendants: true },
          { kind: 'tag', quantifier: 'any', tagIds: [7, 9] }
        ]
      }
    })

    act(() => {
      result.current.applyLibrary({ id: 1, name: 'Kicks', createdAt: 0, ruleJson })
    })

    expect(result.current.searchQuery).toBe('kick')
    expect(result.current.selectedCategoryId).toBe(3)
    expect(result.current.selectedTagIds).toEqual([7, 9])
  })

  it('applyLibrary with malformed ruleJson clears filters instead of crashing', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))

    act(() => {
      result.current.setSearchQuery('before')
      result.current.setSelectedCategoryId(2)
    })
    act(() => {
      result.current.applyLibrary({ id: 1, name: 'Broken', createdAt: 0, ruleJson: 'not-json' })
    })

    expect(result.current.searchQuery).toBe('')
    expect(result.current.selectedCategoryId).toBeUndefined()
    expect(result.current.selectedTagIds).toEqual([])
  })

  it('assigns and unassigns a tag on a DB-backed sample', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listTags).mockResolvedValue([{ id: 7, name: 'Punchy', color: null }])
    vi.mocked(api.hasSamples).mockResolvedValue(true)
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [makeDbRow()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(async () => {
      await result.current.assignTagToSample(result.current.samples[0]!, 7)
    })

    expect(api.assignTag).toHaveBeenCalledWith(1, 7)
    expect(result.current.samples[0]!.tagIds).toEqual([7])
    expect(result.current.samples[0]!.tags).toEqual(['Punchy'])

    await act(async () => {
      await result.current.unassignTagFromSample(result.current.samples[0]!, 7)
    })

    expect(api.unassignTag).toHaveBeenCalledWith(1, 7)
    expect(result.current.samples[0]!.tagIds).toEqual([])
    expect(result.current.samples[0]!.tags).toEqual([])
  })

  it('does not call assignTag for legacy (pre-index) samples', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.hasSamples).mockResolvedValue(false)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    await act(async () => {
      await result.current.assignTagToSample(result.current.samples[0]!, 7)
    })

    expect(api.assignTag).not.toHaveBeenCalled()
  })

  it('maps DB sample category name when categoryId matches', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.hasSamples).mockResolvedValue(true)
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [makeDbRow()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    expect(result.current.samples[0]!.category).toBe('Bass')
  })
})
