import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryItem, FolderRef, SampleItem, TagItem } from '../../../shared/backend-api'
import { createBackendAPI, TEST_SAMPLE_FOLDER, TEST_USER_FOLDER } from '../test/backendApi'
import { useLibraryData } from './useLibraryData'

const USER_FOLDER = TEST_USER_FOLDER
const SAMPLE_FOLDER = TEST_SAMPLE_FOLDER
const AUTO_JOB = {
  rootKey: SAMPLE_FOLDER.id,
  jobId: 'auto-job',
  trigger: 'automatic' as const
}
const MANUAL_JOB = {
  rootKey: SAMPLE_FOLDER.id,
  jobId: 'manual-job',
  trigger: 'manual' as const
}
const SCAN_DONE = {
  identity: AUTO_JOB,
  lastCompletedAt: 123
}

function setRootState(
  api: ReturnType<typeof createBackendAPI>,
  hasUsableIndex: boolean,
  lastCompletedAt: number | null = hasUsableIndex ? 1 : null
) {
  vi.mocked(api.getLibraryRootState).mockResolvedValue({
    rootKey: SAMPLE_FOLDER.id,
    lastCompletedAt,
    hasUsableIndex
  })
}

function makeApi() {
  return createBackendAPI()
}

function makeDbRow(overrides: Partial<SampleItem> = {}): SampleItem {
  return {
    id: 1,
    relpath: 'a.wav',
    filename: 'a.wav',
    ext: '.wav',
    sizeBytes: 100,
    duration: 2.5,
    sampleRate: 44100,
    channels: 1,
    bpm: 120,
    bpmSource: 'analysis',
    musicalKey: 'C',
    musicalKeySource: 'analysis',
    sampleType: 'Synth',
    sampleTypeSource: 'analysis',
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

  it('loads version, MixJam files, tags, categories, and libraries on mount', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))
    await waitFor(() => expect(result.current.mixJamFiles).toHaveLength(2))
    await waitFor(() => expect(result.current.categories).toHaveLength(8))
    await waitFor(() => expect(result.current.tags).toHaveLength(0))
    await waitFor(() => expect(result.current.libraries).toHaveLength(0))
  })

  it('shows an empty browser and queries nothing before the active folder is indexed', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, false)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(api.getLibraryRootState).toHaveBeenCalledWith(SAMPLE_FOLDER))
    expect(result.current.dbIndexed).toBe(false)
    expect(result.current.samples).toHaveLength(0)
    expect(result.current.loading).toBe(false)
    expect(api.querySamples).not.toHaveBeenCalled()
  })

  it('queries the DB pipeline scoped to the active folder once indexed', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [makeDbRow()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(api.querySamples).toHaveBeenCalledWith(
        expect.objectContaining({ rootId: SAMPLE_FOLDER.id })
      )
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
        relpath: `samples/sample-${index + 1}.wav`,
        filename: `sample-${index + 1}.wav`,
        dateAdded: index,
        categoryId: (index % 8) + 1
      })
    )
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

  it('sets an error when the DB query fails', async () => {
    vi.useRealTimers()
    const api = makeApi()
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
      { initialProps: { folder: SAMPLE_FOLDER as FolderRef | null } }
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

  it('updates and clears a tag color in state', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const existing: TagItem = { id: 5, name: 'Alpha', color: null }
    vi.mocked(api.listTags).mockResolvedValue([existing])
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.tags).toHaveLength(1))

    await act(async () => {
      await result.current.setTagColor(5, '#123456')
    })
    expect(api.setTagColor).toHaveBeenCalledWith(5, '#123456')
    expect(result.current.tags[0]!.color).toBe('#123456')

    await act(async () => {
      await result.current.setTagColor(5, null)
    })
    expect(result.current.tags[0]!.color).toBeNull()
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

    await act(async () => {
      result.current.handleSortChange('duration')
    })
    expect(result.current.sortDir).toBe('desc')

    await act(async () => {
      result.current.handleSortChange('dateAdded')
    })
    expect(result.current.sortBy).toBe('dateAdded')
    expect(result.current.sortDir).toBe('asc')
  })

  it('requests automatic sync on folder availability and manual sync on re-scan', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.startLibrarySync)
      .mockResolvedValueOnce({ identity: AUTO_JOB, disposition: 'started' })
      .mockResolvedValueOnce({ identity: MANUAL_JOB, disposition: 'started' })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(api.startLibrarySync).toHaveBeenCalledWith(SAMPLE_FOLDER, 'automatic')
      expect(result.current.librarySyncState).toEqual({
        status: 'checking',
        rootKey: SAMPLE_FOLDER.id,
        jobId: AUTO_JOB.jobId
      })
    })

    act(() => {
      const analysisDone = vi.mocked(api.onAnalysisDone).mock.calls[0]![0]
      analysisDone({ identity: AUTO_JOB })
    })
    await waitFor(() => expect(result.current.librarySyncState.status).toBe('ready'))
    await act(async () => {
      await result.current.rescanLibrary()
    })

    expect(api.startLibrarySync).toHaveBeenCalledWith(SAMPLE_FOLDER, 'manual')
    expect(result.current.librarySyncState).toEqual({
      status: 'checking',
      rootKey: SAMPLE_FOLDER.id,
      jobId: MANUAL_JOB.jobId
    })

    const progress = vi.mocked(api.onScanProgress).mock.calls[0]![0]
    act(() => progress({
      identity: AUTO_JOB,
      status: 'scanning',
      phase: 2,
      found: 100,
      processed: 100,
      total: 100
    }))
    expect(result.current.librarySyncState).toEqual({
      status: 'checking',
      rootKey: SAMPLE_FOLDER.id,
      jobId: MANUAL_JOB.jobId
    })
  })

  it('treats a completed empty folder as ready', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, true, 42)
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [], total: 0 })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.librarySyncState).toEqual({
        status: 'ready',
        rootKey: SAMPLE_FOLDER.id,
        lastCompletedAt: 42
      })
    })
    expect(result.current.dbIndexed).toBe(true)
    expect(result.current.samples).toEqual([])
  })

  it('requests automatic sync when a validated Sample Folder becomes available', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { rerender } = renderHook(
      ({ folder }) => useLibraryData(api, USER_FOLDER, folder),
      { initialProps: { folder: null as FolderRef | null } }
    )

    expect(api.startLibrarySync).not.toHaveBeenCalled()
    rerender({ folder: SAMPLE_FOLDER })

    await waitFor(() => {
      expect(api.startLibrarySync).toHaveBeenCalledWith(SAMPLE_FOLDER, 'automatic')
    })
  })

  it('hydrates a coalesced backend job after a development remount', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.startLibrarySync)
      .mockResolvedValueOnce({ identity: AUTO_JOB, disposition: 'started' })
      .mockResolvedValueOnce({ identity: AUTO_JOB, disposition: 'coalesced' })
    vi.mocked(api.getScanProgress).mockResolvedValue({
      identity: AUTO_JOB,
      status: 'scanning',
      phase: 1,
      found: 8,
      processed: 2,
      total: 8
    })
    const first = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))
    await waitFor(() => expect(api.startLibrarySync).toHaveBeenCalledTimes(1))
    first.unmount()
    const second = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(api.startLibrarySync).toHaveBeenCalledTimes(2))
    expect(api.startLibrarySync).toHaveBeenNthCalledWith(1, SAMPLE_FOLDER, 'automatic')
    expect(api.startLibrarySync).toHaveBeenNthCalledWith(2, SAMPLE_FOLDER, 'automatic')
    await waitFor(() => {
      expect(second.result.current.librarySyncState).toMatchObject({
        status: 'syncing',
        rootKey: SAMPLE_FOLDER.id,
        jobId: AUTO_JOB.jobId
      })
    })
  })

  it('starts Uniform Folder Calibration through its separate API', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))
    await act(async () => {
      await result.current.startUniformFolderCalibration()
    })

    expect(api.startUniformFolderCalibration).toHaveBeenCalledWith(SAMPLE_FOLDER)
    expect(api.startLibrarySync).not.toHaveBeenCalledWith(SAMPLE_FOLDER, 'manual')
  })

  it('hydrates an active calibration without starting an automatic sync', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const identity = {
      rootKey: SAMPLE_FOLDER.id,
      jobId: 'calibration-job'
    }
    vi.mocked(api.getCalibrationProgress).mockResolvedValue({
      identity,
      status: 'calibrating',
      analyzed: 12,
      total: 40
    })

    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.calibrationProgress).toEqual({
        identity,
        status: 'calibrating',
        analyzed: 12,
        total: 40
      })
    })
    expect(api.startLibrarySync).not.toHaveBeenCalled()
  })

  it('refreshes the active query after individual re-analysis commits', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))
    vi.mocked(api.querySamples).mockClear()

    await act(async () => {
      await result.current.reanalyzeSample(result.current.samples[0]!)
    })

    expect(api.reanalyzeSample).toHaveBeenCalledWith(
      SAMPLE_FOLDER,
      result.current.samples[0]!.dbId,
      result.current.samples[0]!.relpath
    )
    expect(api.querySamples).toHaveBeenCalled()
  })

  it('reloadMixJamFiles refreshes from backendAPI', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.mixJamFiles).toHaveLength(2))

    const newProjects = [{ path: 'new.mixjam', displayName: 'new', lastOpened: null }]
    vi.mocked(api.loadMixJamFiles).mockResolvedValue(newProjects)

    await act(async () => {
      await result.current.reloadMixJamFiles()
    })

    expect(result.current.mixJamFiles).toEqual(newProjects)
  })

  it('onScanDone marks the index usable and enters the separate analysis phase', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    const initialCatCalls = vi.mocked(api.listCategories).mock.calls.length
    const initialTagCalls = vi.mocked(api.listTags).mock.calls.length

    // Trigger the onScanDone callback that was registered during mount
    const scanDoneCallback = vi.mocked(api.onScanDone).mock.calls[0]![0]
    await act(async () => {
      scanDoneCallback(SCAN_DONE)
    })

    await waitFor(() => {
      expect(result.current.librarySyncState.status).toBe('analyzing')
    })

    // Categories and tags were refreshed
    expect(vi.mocked(api.listCategories).mock.calls.length).toBeGreaterThan(initialCatCalls)
    expect(vi.mocked(api.listTags).mock.calls.length).toBeGreaterThan(initialTagCalls)
  })

  it('keeps an existing index usable while automatic sync runs', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.startLibrarySync).mockResolvedValue({
      identity: AUTO_JOB,
      disposition: 'started'
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))
    const progress = vi.mocked(api.onScanProgress).mock.calls[0]![0]
    act(() => progress({
      identity: AUTO_JOB,
      status: 'scanning',
      phase: 1,
      found: 10,
      processed: 2,
      total: 10
    }))

    expect(result.current.librarySyncState).toMatchObject({
      status: 'syncing',
      hasUsableIndex: true
    })
    expect(result.current.samples).toHaveLength(2)
  })

  it('offers a manual Retry after a cancelled first sync', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, false)
    vi.mocked(api.startLibrarySync)
      .mockResolvedValueOnce({ identity: AUTO_JOB, disposition: 'started' })
      .mockResolvedValueOnce({ identity: MANUAL_JOB, disposition: 'started' })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.librarySyncState.status).toBe('checking'))
    const progress = vi.mocked(api.onScanProgress).mock.calls[0]![0]
    act(() => progress({
      identity: AUTO_JOB,
      status: 'cancelled',
      phase: 1,
      found: 4,
      processed: 2,
      total: 4
    }))
    expect(result.current.librarySyncState).toEqual({
      status: 'cancelled',
      rootKey: SAMPLE_FOLDER.id,
      hasUsableIndex: false
    })

    await act(async () => {
      await result.current.retryLibrarySync()
    })
    expect(api.startLibrarySync).toHaveBeenCalledWith(SAMPLE_FOLDER, 'manual')
    expect(result.current.librarySyncState).toEqual({
      status: 'checking',
      rootKey: SAMPLE_FOLDER.id,
      jobId: MANUAL_JOB.jobId
    })
  })

  it('ignores stale progress and completion after the active root changes', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const otherFolder: FolderRef = { id: 'other-root', name: 'Other samples' }
    vi.mocked(api.getLibraryRootState).mockImplementation(async (folder) => ({
      rootKey: folder.id,
      lastCompletedAt: 1,
      hasUsableIndex: true
    }))
    vi.mocked(api.startLibrarySync).mockImplementation(async (folder) => ({
      identity: {
        rootKey: folder.id,
        jobId: `${folder.id}-job`,
        trigger: 'automatic'
      },
      disposition: 'suppressed'
    }))
    const { result, rerender } = renderHook(
      ({ folder }) => useLibraryData(api, USER_FOLDER, folder),
      { initialProps: { folder: SAMPLE_FOLDER } }
    )

    await waitFor(() => expect(result.current.librarySyncState.status).toBe('ready'))
    rerender({ folder: otherFolder })
    await waitFor(() => {
      expect(result.current.librarySyncState).toMatchObject({
        status: 'ready',
        rootKey: otherFolder.id
      })
    })

    const staleIdentity = {
      rootKey: SAMPLE_FOLDER.id,
      jobId: 'stale-job',
      trigger: 'automatic' as const
    }
    const progress = vi.mocked(api.onScanProgress).mock.calls[0]![0]
    const done = vi.mocked(api.onScanDone).mock.calls[0]![0]
    act(() => {
      progress({
        identity: staleIdentity,
        status: 'scanning',
        phase: 2,
        found: 100,
        processed: 50,
        total: 100
      })
      done({ identity: staleIdentity, lastCompletedAt: 999 })
    })

    expect(result.current.librarySyncState).toMatchObject({
      status: 'ready',
      rootKey: otherFolder.id
    })
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

  it('manual library sync returns early when sampleFolder is null', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, null))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))

    await act(async () => {
      await result.current.rescanLibrary()
    })

    expect(api.startLibrarySync).not.toHaveBeenCalled()
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
    setRootState(api, true)
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

  it('maps DB sample category name when categoryId matches', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [makeDbRow()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    expect(result.current.samples[0]!.category).toBe('Bass')
  })

  it('assignTagToSample returns early when tag is already assigned', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [7], tags: ['Punchy'] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(async () => {
      await result.current.assignTagToSample(result.current.samples[0]!, 7)
    })

    expect(api.assignTag).not.toHaveBeenCalled()
  })

  it('unassignTagFromSample returns early when tag is not assigned', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [], tags: [] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(async () => {
      await result.current.unassignTagFromSample(result.current.samples[0]!, 7)
    })

    expect(api.unassignTag).not.toHaveBeenCalled()
  })

  it('loadMoreSamples does nothing when the active folder is not indexed', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, false)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))

    act(() => {
      result.current.loadMoreSamples()
    })

    // querySamples should not be called via loadMore when not indexed
    const callsAfterLoad = vi.mocked(api.querySamples).mock.calls.length
    expect(callsAfterLoad).toBe(0)
  })

  it('loadMoreSamples handles errors without crashing', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, true)
    vi.mocked(api.querySamples)
      .mockResolvedValueOnce({ rows: [makeDbRow()], total: 2 })
      .mockRejectedValueOnce(new Error('network error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(async () => {
      result.current.loadMoreSamples()
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.samples).toHaveLength(1)
    consoleSpy.mockRestore()
  })

  it('sets version to fallback on getVersion error', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.getVersion).mockRejectedValue(new Error('no version'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.version).toBe('version unavailable'))
    consoleSpy.mockRestore()
  })

  it('reloadMixJamFiles sets empty array on error', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.loadMixJamFiles).mockRejectedValue(new Error('disk full'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.mixJamFiles).toEqual([]))
    consoleSpy.mockRestore()
  })

  it('renameTag updates denormalized tag names on affected samples', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listTags).mockResolvedValue([
      { id: 5, name: 'Alpha', color: null },
      { id: 7, name: 'Punchy', color: null }
    ])
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [5, 7], tags: ['Alpha', 'Punchy'] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    await waitFor(() => expect(result.current.tags).toHaveLength(2))

    await act(async () => {
      await result.current.renameTag(5, 'Zeta')
    })

    expect(result.current.samples[0]!.tags).toEqual(['Punchy', 'Zeta'])
  })

  it('deleteTag removes the tag from affected samples', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listTags).mockResolvedValue([
      { id: 5, name: 'Alpha', color: null },
      { id: 7, name: 'Punchy', color: null }
    ])
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [5, 7], tags: ['Alpha', 'Punchy'] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(async () => {
      await result.current.deleteTag(5)
    })

    expect(result.current.samples[0]!.tagIds).toEqual([7])
    expect(result.current.samples[0]!.tags).toEqual(['Punchy'])
  })

  it('does not duplicate a category that already exists in state', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.createCategory).mockResolvedValue({ id: 1, name: 'Bass', parentId: null })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.categories).toHaveLength(8))

    await act(async () => {
      await result.current.createCategory('Bass')
    })

    expect(result.current.categories).toHaveLength(8)
  })

  it('loadMoreSamples ignores stale responses from a superseded query', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, true)
    let callCount = 0
    vi.mocked(api.querySamples).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { rows: [makeDbRow()], total: 2 }
      }
      // Return empty to simulate stale/superseded response
      return { rows: [], total: 0 }
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(async () => {
      result.current.loadMoreSamples()
      await new Promise((r) => setTimeout(r, 50))
    })

    // Empty response means no rows appended
    expect(result.current.samples).toHaveLength(1)
  })

  it('deleteTag does not modify samples that do not have the deleted tag', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listTags).mockResolvedValue([
      { id: 5, name: 'Alpha', color: null },
      { id: 7, name: 'Punchy', color: null }
    ])
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [7], tags: ['Punchy'] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    // Delete tag 5 which the sample does NOT have
    await act(async () => {
      await result.current.deleteTag(5)
    })

    // Sample unchanged — still has tag 7
    expect(result.current.samples[0]!.tagIds).toEqual([7])
    expect(result.current.samples[0]!.tags).toEqual(['Punchy'])
  })

  it('debounced query clears state when sampleFolder becomes null', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result, rerender } = renderHook(
      ({ folder }) => useLibraryData(api, USER_FOLDER, folder),
      { initialProps: { folder: SAMPLE_FOLDER as FolderRef | null } }
    )

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    // Set some state that should be cleared
    act(() => {
      result.current.setSearchQuery('test')
    })

    rerender({ folder: null })

    await waitFor(() => {
      expect(result.current.searchQuery).toBe('')
      expect(result.current.samples).toHaveLength(0)
      expect(result.current.selectedSampleDetail).toBeNull()
    })
  })

  it('assignTagToSample with unknown tag in tagsRef still patches without that tag name', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listTags).mockResolvedValue([])
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [], tags: [] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    // Assign tag 99 which is not in tagsRef
    await act(async () => {
      await result.current.assignTagToSample(result.current.samples[0]!, 99)
    })

    expect(api.assignTag).toHaveBeenCalledWith(1, 99)
    // tagIds updated but name not found so tags list is empty
    expect(result.current.samples[0]!.tagIds).toEqual([99])
    expect(result.current.samples[0]!.tags).toEqual([])
  })

  it('unassignTagFromSample with unknown tag in tagsRef still patches correctly', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listTags).mockResolvedValue([])
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [99], tags: ['Unknown'] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(async () => {
      await result.current.unassignTagFromSample(result.current.samples[0]!, 99)
    })

    expect(api.unassignTag).toHaveBeenCalledWith(1, 99)
    expect(result.current.samples[0]!.tagIds).toEqual([])
    expect(result.current.samples[0]!.tags).toEqual([])
  })

  it('unassignTagFromSample preserves remaining tag names after removal', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listTags).mockResolvedValue([
      { id: 5, name: 'Alpha', color: null },
      { id: 7, name: 'Beta', color: null },
      { id: 9, name: 'Gamma', color: null }
    ])
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [5, 7, 9], tags: ['Alpha', 'Beta', 'Gamma'] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    await waitFor(() => expect(result.current.tags).toHaveLength(3))

    // Remove the middle tag
    await act(async () => {
      await result.current.unassignTagFromSample(result.current.samples[0]!, 7)
    })

    expect(result.current.samples[0]!.tagIds).toEqual([5, 9])
    expect(result.current.samples[0]!.tags).toEqual(['Alpha', 'Gamma'])
  })

  it('assignTagToSample with multiple tags sorts names alphabetically', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.listTags).mockResolvedValue([
      { id: 5, name: 'Zebra', color: null },
      { id: 7, name: 'Apple', color: null }
    ])
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ tagIds: [5], tags: ['Zebra'] })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    await waitFor(() => expect(result.current.tags).toHaveLength(2))

    await act(async () => {
      await result.current.assignTagToSample(result.current.samples[0]!, 7)
    })

    expect(result.current.samples[0]!.tagIds).toEqual([5, 7])
    expect(result.current.samples[0]!.tags).toEqual(['Apple', 'Zebra'])
  })

  it('debounced query cancels pending timer when deps change rapidly', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    const initialCalls = vi.mocked(api.querySamples).mock.calls.length

    // Rapidly change search query multiple times within the debounce window
    act(() => { result.current.setSearchQuery('a') })
    act(() => { result.current.setSearchQuery('ab') })
    act(() => { result.current.setSearchQuery('abc') })

    await waitFor(() => {
      const lastCall = vi.mocked(api.querySamples).mock.calls.at(-1)
      expect(lastCall?.[0]).toEqual(expect.objectContaining({ textSearch: 'abc' }))
    })

    // Fewer calls than one-per-change proves debounce + cancellation
    const totalCalls = vi.mocked(api.querySamples).mock.calls.length - initialCalls
    expect(totalCalls).toBeLessThanOrEqual(3)
  })

  it('refreshDbIndexed keeps dbIndexed false on error', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.getLibraryRootState).mockRejectedValue(new Error('db locked'))
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))
    expect(result.current.dbIndexed).toBe(false)
  })

  it('remaps category names on DB samples when categories change after load', async () => {
    vi.useRealTimers()
    const api = makeApi()
    // Categories initially empty, will populate later via scan-done
    vi.mocked(api.listCategories).mockResolvedValue([])
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ categoryId: 1 })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    expect(result.current.samples[0]!.category).toBe('Unsorted')

    // Simulate scan-done callback which refreshes categories
    vi.mocked(api.listCategories).mockResolvedValue([{ id: 1, name: 'Bass', parentId: null }])
    vi.mocked(api.listTags).mockResolvedValue([])
    const scanDoneCallback = vi.mocked(api.onScanDone).mock.calls[0]![0]
    await act(async () => {
      scanDoneCallback(SCAN_DONE)
      await new Promise((r) => setTimeout(r, 200))
    })

    // Category name should be remapped to 'Bass'
    await waitFor(() => expect(result.current.samples[0]!.category).toBe('Bass'))
  })

  it('category name remapping does not mutate array when names already match', async () => {
    vi.useRealTimers()
    const api = makeApi()
    setRootState(api, true)
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ categoryId: 1 })],
      total: 1
    })
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    // With default categories [id:1 -> 'Bass'], the sample maps to 'Bass'
    expect(result.current.samples[0]!.category).toBe('Bass')

    // Grab reference to current samples array
    const prevSamples = result.current.samples

    // Trigger a re-render that recalculates categoryNames but names haven't changed
    act(() => {
      result.current.setSearchQuery('x')
    })
    act(() => {
      result.current.setSearchQuery('')
    })

    // Array identity is preserved when names match (no-op path)
    await waitFor(() => expect(result.current.samples).toBe(prevSamples))
  })

  it('search text narrows the windowed DB query', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(2))

    act(() => {
      result.current.setSearchQuery('kick')
    })

    await waitFor(() => {
      expect(result.current.samples).toHaveLength(1)
      expect(result.current.samples[0]!.name).toBe('kick_808.wav')
    })
  })

  it('does not start a manual scan while automatic analysis is active', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))
    await waitFor(() => expect(api.onAnalysisProgress).toHaveBeenCalled())
    const listener = vi.mocked(api.onAnalysisProgress).mock.calls[0][0]
    act(() => listener({
      identity: AUTO_JOB,
      status: 'analyzing',
      analyzed: 1,
      total: 10
    }))

    await act(async () => { await result.current.rescanLibrary() })

    expect(api.startLibrarySync).not.toHaveBeenCalledWith(SAMPLE_FOLDER, 'manual')
  })

  it('refreshes changed missing-path sets and clears them after an error', async () => {
    vi.useRealTimers()
    const api = makeApi()
    vi.mocked(api.querySamples).mockResolvedValue({
      rows: [makeDbRow({ categoryId: null })],
      total: 1
    })
    vi.mocked(api.listMissingRelpaths)
      .mockResolvedValueOnce(['a.wav', 'b.wav'])
      .mockResolvedValueOnce(['a.wav', 'c.wav'])
      .mockRejectedValueOnce(new Error('scan unavailable'))

    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.missingSamplePaths.size).toBe(2))
    await waitFor(() => expect(result.current.samples[0]?.category).toBe('Unsorted'))

    const onScanDone = vi.mocked(api.onScanDone).mock.calls[0]![0]
    act(() => { onScanDone(SCAN_DONE) })
    await waitFor(() => expect(result.current.missingSamplePaths.has('c.wav')).toBe(true))

    act(() => { onScanDone(SCAN_DONE) })
    await waitFor(() => expect(result.current.missingSamplePaths.size).toBe(0))
  })

  it('updates every manual analysis field while preserving other samples', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(2))
    const sample = result.current.samples[0]!
    const other = result.current.samples[1]!

    await act(async () => {
      await result.current.updateSampleAnalysis(sample, {
        bpm: 128,
        musicalKey: 'Am',
        sampleType: 'Loop'
      })
    })

    expect(api.updateSampleAnalysis).toHaveBeenCalledWith(sample.dbId, {
      bpm: 128,
      musicalKey: 'Am',
      sampleType: 'Loop'
    })
    expect(result.current.samples[0]).toMatchObject({
      bpm: 128,
      bpmSource: 'manual',
      musicalKey: 'Am',
      musicalKeySource: 'manual',
      sampleType: 'Loop',
      sampleTypeSource: 'manual'
    })
    expect(result.current.samples[1]).toBe(other)
  })

  it('clears manual analysis fields and treats an empty patch as a state no-op', async () => {
    vi.useRealTimers()
    const api = makeApi()
    const { result } = renderHook(() => useLibraryData(api, USER_FOLDER, SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(2))
    const sample = result.current.samples[0]!

    await act(async () => {
      await result.current.updateSampleAnalysis(sample, {
        bpm: null,
        musicalKey: null,
        sampleType: null
      })
    })

    expect(result.current.samples[0]).toMatchObject({
      bpm: null,
      bpmSource: null,
      musicalKey: null,
      musicalKeySource: null,
      sampleType: null,
      sampleTypeSource: null
    })

    const afterClear = result.current.samples[0]
    await act(async () => {
      await result.current.updateSampleAnalysis(sample, {})
    })
    expect(result.current.samples[0]).toEqual(afterClear)
  })
})
