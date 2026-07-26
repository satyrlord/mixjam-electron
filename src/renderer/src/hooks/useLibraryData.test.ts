import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryScanDone, SampleItem, TagItem } from '../../../shared/backend-api'
import { createBackendAPI, TEST_SAMPLE_FOLDER, TEST_USER_FOLDER } from '../test/backendApi'
import { useLibraryData } from './useLibraryData'

const USER_TAG: TagItem = {
  id: 5, name: 'Punchy', color: null, origin: 'user', folderDerived: false
}
const FOLDER_TAG: TagItem = {
  id: 7, name: 'Drums', color: null, origin: 'folder', folderDerived: true
}

function row(overrides: Partial<SampleItem> = {}): SampleItem {
  return {
    id: 1,
    relpath: 'Drums/Kicks/kick.wav',
    filename: 'kick.wav',
    ext: '.wav',
    sizeBytes: 100,
    duration: 2.5,
    sampleRate: 44100,
    channels: 1,
    bpm: 120,
    bpmSource: 'analysis',
    musicalKey: 'C',
    musicalKeySource: 'analysis',
    sampleType: 'Kick',
    sampleTypeSource: 'analysis',
    dateAdded: 0,
    scanState: 1,
    tagIds: [5, 7],
    folderTagIds: [7],
    userTagIds: [5],
    tags: ['Drums', 'Punchy'],
    ...overrides
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useLibraryData tag-only browser state', () => {
  it('loads version, projects, active-root tags, and libraries', async () => {
    const api = createBackendAPI()
    vi.mocked(api.listTags).mockResolvedValue([FOLDER_TAG, USER_TAG])
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.version).toBe('v0.test.0'))
    await waitFor(() => expect(result.current.mixJamFiles).toHaveLength(2))
    await waitFor(() => expect(result.current.tags).toEqual([FOLDER_TAG, USER_TAG]))
    expect(api.listTags).toHaveBeenCalledWith(TEST_SAMPLE_FOLDER.id)
  })

  it('maps database rows to source groups and preserves folder assignment provenance', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))

    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    expect(result.current.samples[0]).toMatchObject({
      sourceGroup: 'Drums', tagIds: [5, 7], folderTagIds: [7]
    })
  })

  it('uses Unsorted as the source group for root-level files', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row({ relpath: 'flat.wav' })], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples[0]?.sourceGroup).toBe('Unsorted'))
  })

  it('passes all active tags to the windowed backend query', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(api.querySamples).toHaveBeenCalled())
    act(() => result.current.setSelectedTagIds([5, 7]))
    await waitFor(() => expect(api.querySamples).toHaveBeenLastCalledWith(expect.objectContaining({ tagIds: [5, 7] })))
  })

  it('clears active tag filters when the Sample Folder changes', async () => {
    const api = createBackendAPI()
    const otherFolder = { id: 'other-samples', name: 'Other Samples' }
    vi.mocked(api.listTags).mockImplementation((rootKey) =>
      rootKey === otherFolder.id ? new Promise(() => {}) : Promise.resolve([FOLDER_TAG])
    )
    const { result, rerender } = renderHook(
      ({ folder }) => useLibraryData(api, TEST_USER_FOLDER, folder),
      { initialProps: { folder: TEST_SAMPLE_FOLDER } }
    )
    await waitFor(() => expect(result.current.tags).toEqual([FOLDER_TAG]))
    act(() => result.current.setSelectedTagIds([7]))
    expect(result.current.selectedTagIds).toEqual([7])

    rerender({ folder: otherFolder })

    await waitFor(() => expect(result.current.selectedTagIds).toEqual([]))
    expect(result.current.tags).toEqual([])
    expect(vi.mocked(api.querySamples).mock.calls.some(([request]) =>
      request.rootId === otherFolder.id && request.tagIds !== undefined
    )).toBe(false)
  })

  it('ignores late tag and missing-path responses from the previous Sample Folder', async () => {
    const api = createBackendAPI()
    const otherFolder = { id: 'other-samples', name: 'Other Samples' }
    const oldTags = deferred<TagItem[]>()
    const oldMissing = deferred<string[]>()
    vi.mocked(api.getLibraryRootState).mockImplementation(async (folder) => ({
      rootKey: folder.id, lastCompletedAt: 1, hasUsableIndex: true
    }))
    vi.mocked(api.listTags).mockImplementation((rootKey) =>
      rootKey === TEST_SAMPLE_FOLDER.id ? oldTags.promise : Promise.resolve([USER_TAG])
    )
    vi.mocked(api.listMissingRelpaths).mockImplementation((folder) =>
      folder.id === TEST_SAMPLE_FOLDER.id ? oldMissing.promise : Promise.resolve(['new-missing.wav'])
    )
    const { result, rerender } = renderHook(
      ({ folder }) => useLibraryData(api, TEST_USER_FOLDER, folder),
      { initialProps: { folder: TEST_SAMPLE_FOLDER } }
    )
    await waitFor(() => expect(api.listTags).toHaveBeenCalledWith(TEST_SAMPLE_FOLDER.id))

    rerender({ folder: otherFolder })
    await waitFor(() => expect(result.current.tags).toEqual([USER_TAG]))
    await waitFor(() => expect([...result.current.missingSamplePaths]).toEqual(['new-missing.wav']))

    await act(async () => {
      oldTags.resolve([FOLDER_TAG])
      oldMissing.resolve(['old-missing.wav'])
      await Promise.all([oldTags.promise, oldMissing.promise])
    })

    expect(result.current.tags).toEqual([USER_TAG])
    expect([...result.current.missingSamplePaths]).toEqual(['new-missing.wav'])
  })

  it('prunes a removed folder tag before refreshing post-scan results', async () => {
    const api = createBackendAPI()
    let onScanDoneListener: ((done: LibraryScanDone) => void) | undefined
    const job = {
      rootKey: TEST_SAMPLE_FOLDER.id,
      jobId: 'active-scan',
      trigger: 'automatic' as const
    }
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: job, disposition: 'started' })
    vi.mocked(api.onScanDone).mockImplementation((listener) => {
      onScanDoneListener = listener
      return () => {}
    })
    vi.mocked(api.listTags)
      .mockResolvedValueOnce([FOLDER_TAG])
      .mockResolvedValue([])
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.tags).toEqual([FOLDER_TAG]))
    await waitFor(() => expect(result.current.librarySyncState.status).toBe('checking'))
    act(() => result.current.setSelectedTagIds([FOLDER_TAG.id]))

    act(() => onScanDoneListener?.({ identity: job, lastCompletedAt: 2 }))

    await waitFor(() => expect(result.current.tags).toEqual([]))
    await waitFor(() => expect(result.current.selectedTagIds).toEqual([]))
    await waitFor(() => expect(api.querySamples).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ tagIds: expect.anything() })
    ))
  })

  it('loads another window without replacing the first page', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples)
      .mockResolvedValueOnce({ rows: [row()], total: 2 })
      .mockResolvedValueOnce({ rows: [row({ id: 2, relpath: 'Bass/bass.wav', filename: 'bass.wav' })], total: 2 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.hasMoreSamples).toBe(true))
    act(() => result.current.loadMoreSamples())
    await waitFor(() => expect(result.current.samples).toHaveLength(2))
    expect(api.querySamples).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }))
  })

  it('keeps an old-root page completion from releasing the active-root paging guard', async () => {
    const api = createBackendAPI()
    const otherFolder = { id: 'other-samples', name: 'Other Samples' }
    const oldPage = deferred<{ rows: SampleItem[]; total: number }>()
    const newPage = deferred<{ rows: SampleItem[]; total: number }>()
    vi.mocked(api.getLibraryRootState).mockImplementation(async (folder) => ({
      rootKey: folder.id, lastCompletedAt: 1, hasUsableIndex: true
    }))
    vi.mocked(api.querySamples).mockImplementation(async (request) => {
      if ((request.offset ?? 0) === 0) {
        const isNewRoot = request.rootId === otherFolder.id
        return {
          rows: [row({ id: isNewRoot ? 3 : 1, relpath: isNewRoot ? 'new/one.wav' : 'old/one.wav' })],
          total: 3
        }
      }
      return request.rootId === otherFolder.id ? newPage.promise : oldPage.promise
    })
    const { result, rerender } = renderHook(
      ({ folder }) => useLibraryData(api, TEST_USER_FOLDER, folder),
      { initialProps: { folder: TEST_SAMPLE_FOLDER } }
    )
    await waitFor(() => expect(result.current.samples[0]?.relpath).toBe('old/one.wav'))
    act(() => result.current.loadMoreSamples())
    await waitFor(() => expect(vi.mocked(api.querySamples).mock.calls.some(([request]) =>
      request.rootId === TEST_SAMPLE_FOLDER.id && request.offset === 1
    )).toBe(true))

    rerender({ folder: otherFolder })
    await waitFor(() => expect(result.current.samples[0]?.relpath).toBe('new/one.wav'))
    act(() => result.current.loadMoreSamples())
    await waitFor(() => expect(vi.mocked(api.querySamples).mock.calls.some(([request]) =>
      request.rootId === otherFolder.id && request.offset === 1
    )).toBe(true))

    await act(async () => {
      oldPage.resolve({ rows: [row({ id: 2, relpath: 'old/two.wav' })], total: 3 })
      await oldPage.promise
    })
    act(() => result.current.loadMoreSamples())

    expect(vi.mocked(api.querySamples).mock.calls.filter(([request]) =>
      request.rootId === otherFolder.id && request.offset === 1
    )).toHaveLength(1)
    await act(async () => {
      newPage.resolve({ rows: [row({ id: 4, relpath: 'new/two.wav' })], total: 3 })
      await newPage.promise
    })
  })

  it('invalidates paging immediately when query criteria change', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row()], total: 2 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.hasMoreSamples).toBe(true))

    act(() => result.current.setSearchQuery('kick'))
    act(() => result.current.loadMoreSamples())

    expect(vi.mocked(api.querySamples).mock.calls.some(([request]) =>
      request.textSearch === 'kick' && request.offset === 1
    )).toBe(false)
    await waitFor(() => expect(api.querySamples).toHaveBeenLastCalledWith(
      expect.objectContaining({ textSearch: 'kick', offset: 0 })
    ))
  })

  it('surfaces query errors without stale results', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockRejectedValue(new Error('failed'))
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.error).toBe('Unable to query library.'))
    expect(result.current.samples).toEqual([])
  })

  it('does not query without a Sample Folder', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, null))
    await waitFor(() => expect(result.current.librarySyncState.status).toBe('unavailable'))
    expect(api.querySamples).not.toHaveBeenCalled()
    expect(result.current.samples).toEqual([])
  })

  it('creates, renames, colors, and deletes a user tag', async () => {
    const api = createBackendAPI()
    vi.mocked(api.listTags).mockResolvedValue([USER_TAG])
    vi.mocked(api.createTag).mockResolvedValue({ ...USER_TAG, id: 9, name: 'Warm' })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.tags).toEqual([USER_TAG]))
    await act(() => result.current.createTag('Warm'))
    expect(api.createTag).toHaveBeenCalledWith('Warm', undefined, TEST_SAMPLE_FOLDER.id)
    await act(() => result.current.renameTag(9, 'Ambient'))
    await act(() => result.current.setTagColor(9, '#123456'))
    expect(result.current.tags.find((tag) => tag.id === 9)).toMatchObject({ name: 'Ambient', color: '#123456' })
    await act(() => result.current.deleteTag(9))
    expect(result.current.tags.some((tag) => tag.id === 9)).toBe(false)
  })

  it('uses active-root provenance when creating a tag already visible from the old root', async () => {
    const api = createBackendAPI()
    const staleOldRootTag = { ...FOLDER_TAG, id: 8, name: 'Bass', origin: 'shared' as const }
    const activeRootTag = { ...staleOldRootTag, folderDerived: false }
    vi.mocked(api.listTags).mockResolvedValue([staleOldRootTag])
    vi.mocked(api.createTag).mockResolvedValue(activeRootTag)
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.tags).toEqual([staleOldRootTag]))

    await act(() => result.current.createTag('Bass'))

    expect(result.current.tags).toEqual([activeRootTag])
  })

  it('retains a dual-source identity when its user provenance is removed', async () => {
    const api = createBackendAPI()
    const dual = { ...FOLDER_TAG, origin: 'shared' as const, color: '#123456' }
    // The backend keeps the identity and demotes it to a folder tag, so the
    // post-delete re-read is what the hook adopts.
    const demoted = { ...dual, origin: 'folder' as const, color: null }
    vi.mocked(api.listTags)
      .mockResolvedValueOnce([dual])
      .mockResolvedValue([demoted])
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row({ tagIds: [7], folderTagIds: [7], userTagIds: [], tags: ['Drums'] })], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    await act(() => result.current.deleteTag(7))
    expect(result.current.tags).toEqual([demoted])
    expect(result.current.samples[0]?.tagIds).toEqual([7])
  })

  it('keeps sequential user-tag edits in the loaded row', async () => {
    const api = createBackendAPI()
    const secondTag = { ...USER_TAG, id: 6, name: 'Warm' }
    vi.mocked(api.listTags).mockResolvedValue([USER_TAG, secondTag])
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row({ tagIds: [], folderTagIds: [], userTagIds: [], tags: [] })], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    await act(() => result.current.assignTagToSample(result.current.samples[0]!, 5))
    await act(() => result.current.assignTagToSample(result.current.samples[0]!, 6))
    expect(result.current.samples[0]).toMatchObject({ tagIds: [5, 6], userTagIds: [5, 6] })
    await act(() => result.current.unassignTagFromSample(result.current.samples[0]!, 5))
    await act(() => result.current.unassignTagFromSample(result.current.samples[0]!, 6))
    expect(result.current.samples[0]).toMatchObject({ tagIds: [], userTagIds: [] })
  })

  it('requeries filtered membership after a tag is unassigned', async () => {
    const api = createBackendAPI()
    let assigned = true
    vi.mocked(api.listTags).mockResolvedValue([USER_TAG])
    vi.mocked(api.querySamples).mockImplementation(async (request) => {
      const matches = !request.tagIds || (assigned && request.tagIds.every((id) => id === USER_TAG.id))
      return matches ? { rows: [row({ tagIds: [5], folderTagIds: [], userTagIds: [5], tags: ['Punchy'] })], total: 1 }
        : { rows: [], total: 0 }
    })
    vi.mocked(api.unassignTag).mockImplementation(async () => { assigned = false })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    act(() => result.current.setSelectedTagIds([USER_TAG.id]))
    await waitFor(() => expect(api.querySamples).toHaveBeenLastCalledWith(
      expect.objectContaining({ tagIds: [USER_TAG.id] })
    ))

    await act(() => result.current.unassignTagFromSample(result.current.samples[0]!, USER_TAG.id))

    await waitFor(() => expect(result.current.samples).toEqual([]))
    expect(result.current.totalCount).toBe(0)
  })

  it('does not unassign a folder-derived assignment', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row({ tagIds: [7], folderTagIds: [7], userTagIds: [], tags: ['Drums'] })], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(1))
    await act(() => result.current.unassignTagFromSample(result.current.samples[0]!, 7))
    expect(api.unassignTag).not.toHaveBeenCalled()
  })

  it('saves match-all tag rules and restores valid tags immediately', async () => {
    const api = createBackendAPI()
    vi.mocked(api.listTags).mockResolvedValue([USER_TAG, FOLDER_TAG])
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.tags).toHaveLength(2))
    act(() => {
      result.current.setSearchQuery('kick')
      result.current.setSelectedTagIds([5, 7])
    })
    await act(() => result.current.saveLibrary('Hits'))
    const savedRule = JSON.parse(vi.mocked(api.saveLibrary).mock.calls[0]![1])
    expect(savedRule.root.children).toContainEqual({ kind: 'tag', quantifier: 'all', tagIds: [5, 7] })

    act(() => result.current.applyLibrary({
      id: 2, name: 'Restore', createdAt: 1,
      ruleJson: JSON.stringify({ root: { children: [
        { kind: 'text', query: 'bass' },
        { kind: 'tag', quantifier: 'all', tagIds: [7, 999] }
      ] } })
    }))
    expect(result.current.searchQuery).toBe('bass')
    expect(result.current.selectedTagIds).toEqual([7])
  })

  it('toggles sort direction and changes sort columns', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    act(() => result.current.handleSortChange('filename'))
    expect(result.current.sortDir).toBe('desc')
    act(() => result.current.handleSortChange('duration'))
    expect(result.current).toMatchObject({ sortBy: 'duration', sortDir: 'asc' })
  })

  it('updates sample analysis with a BPM patch in the local row', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(() => result.current.updateSampleAnalysis(result.current.samples[0]!, { bpm: 128 }))

    expect(api.updateSampleAnalysis).toHaveBeenCalledWith(1, { bpm: 128 })
    expect(result.current.samples[0]).toMatchObject({ bpm: 128, bpmSource: 'manual' })
  })

  it('updates sample analysis with multiple fields', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(() => result.current.updateSampleAnalysis(result.current.samples[0]!, {
      bpm: 140,
      musicalKey: 'Dm',
      sampleType: 'Snare'
    }))

    expect(result.current.samples[0]).toMatchObject({
      bpm: 140, bpmSource: 'manual',
      musicalKey: 'Dm', musicalKeySource: 'manual',
      sampleType: 'Snare', sampleTypeSource: 'manual'
    })
  })

  it('clearing a field triggers reanalyze for that field', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(() => result.current.updateSampleAnalysis(result.current.samples[0]!, { bpm: null }))

    expect(api.reanalyzeSample).toHaveBeenCalledWith(
      TEST_SAMPLE_FOLDER, 1, 'Drums/Kicks/kick.wav'
    )
  })

  it('reanalyzeSample delegates to the backend reanalyzer', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples).mockResolvedValue({ rows: [row()], total: 1 })
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.samples).toHaveLength(1))

    await act(() => result.current.reanalyzeSample(result.current.samples[0]!))

    expect(api.reanalyzeSample).toHaveBeenCalledWith(
      TEST_SAMPLE_FOLDER, 1, 'Drums/Kicks/kick.wav'
    )
  })

  it('reanalyzeSample is a no-op when no sample folder is set', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, null))
    await act(() => result.current.reanalyzeSample(result.current.samples[0]!))
    expect(api.reanalyzeSample).not.toHaveBeenCalled()
  })

  it('refreshMissingPaths catches errors and clears stale paths', async () => {
    const api = createBackendAPI()
    // First call succeeds, second fails
    vi.mocked(api.listMissingRelpaths)
      .mockResolvedValueOnce(['missing1.wav'])
      .mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.missingSamplePaths.size).toBe(1))

    // Trigger the error path by changing sample folder (causes re-render)
    const otherFolder = { id: 'other-folder', name: 'Other' }
    vi.mocked(api.getLibraryRootState).mockResolvedValue({
      rootKey: otherFolder.id, lastCompletedAt: 1, hasUsableIndex: true
    })
    vi.mocked(api.listMissingRelpaths).mockRejectedValue(new Error('boom-again'))
    const { result: result2 } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, otherFolder))
    await waitFor(() => expect(result2.current.missingSamplePaths.size).toBe(0))
  })

  it('loadMoreSamples handles query failure gracefully', async () => {
    const api = createBackendAPI()
    vi.mocked(api.querySamples)
      .mockResolvedValueOnce({ rows: [row()], total: 2 })
      .mockRejectedValueOnce(new Error('network error'))
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.hasMoreSamples).toBe(true))
    act(() => result.current.loadMoreSamples())
    // Should not crash; error is just logged
    await waitFor(() => expect(api.querySamples).toHaveBeenCalledTimes(2))
  })

  it('saves and deletes a library', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useLibraryData(api, TEST_USER_FOLDER, TEST_SAMPLE_FOLDER))
    // Wait for initial library list to resolve
    await waitFor(() => expect(result.current.libraries).toBeDefined())
    const lib = await act(() => result.current.saveLibrary('My Hits'))
    expect(api.saveLibrary).toHaveBeenCalledWith('My Hits', expect.any(String))
    expect(result.current.libraries.some((l) => l.name === 'My Hits')).toBe(true)
    await act(() => result.current.deleteLibrary(lib.id))
    expect(api.deleteLibrary).toHaveBeenCalledWith(lib.id)
    expect(result.current.libraries.some((l) => l.id === lib.id)).toBe(false)
  })
})
