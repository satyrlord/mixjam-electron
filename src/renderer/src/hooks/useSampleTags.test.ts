import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SampleListItem, TagItem } from '../../../shared/backend-api'
import { createBackendAPI, TEST_SAMPLE_FOLDER } from '../test/backendApi'
import { useSampleTags } from './useSampleTags'

const USER_TAG: TagItem = {
  id: 5, name: 'Punchy', color: null, origin: 'user', folderDerived: false
}
const FOLDER_TAG: TagItem = {
  id: 7, name: 'Drums', color: null, origin: 'folder', folderDerived: true
}

/** Default `refreshTags` for tests that don't assert on the re-read: reports the
 *  tag list the hook was rendered with, minus nothing. Tests that care about the
 *  post-mutation projection pass their own. */
function stubRefreshTags(tags: TagItem[] = []) {
  return vi.fn().mockResolvedValue({ status: 'applied' as const, tags })
}

function sampleRow(overrides: Partial<SampleListItem> = {}): SampleListItem {
  return {
    id: 'kick.wav',
    dbId: 1,
    name: 'kick.wav',
    relpath: 'kick.wav',
    sourceGroup: 'Unsorted',
    durationSeconds: 1,
    bpm: null,
    bpmSource: null,
    musicalKey: null,
    musicalKeySource: null,
    sampleType: null,
    sampleTypeSource: null,
    tags: ['Punchy'],
    tagIds: [5],
    folderTagIds: [],
    userTagIds: [5],
    ...overrides
  }
}

describe('useSampleTags', () => {
  it('creates a tag and adds it to sorted state', async () => {
    const api = createBackendAPI()
    const newTag: TagItem = { id: 9, name: 'Warm', color: null, origin: 'user', folderDerived: false }
    vi.mocked(api.createTag).mockResolvedValue(newTag)
    const setTags = vi.fn()

    const { result } = renderHook(() =>
      useSampleTags(api, [USER_TAG], setTags, vi.fn(), vi.fn(), vi.fn(), TEST_SAMPLE_FOLDER.id, vi.fn(), stubRefreshTags([USER_TAG]))
    )

    const tag = await act(() => result.current.createTag('Warm'))

    expect(api.createTag).toHaveBeenCalledWith('Warm', undefined, TEST_SAMPLE_FOLDER.id)
    expect(tag).toEqual(newTag)
  })

  it('reconciles through the current root without applying a late create locally', async () => {
    const api = createBackendAPI()
    const newTag: TagItem = { id: 9, name: 'Warm', color: null, origin: 'user', folderDerived: false }
    let resolveCreate!: (tag: TagItem) => void
    vi.mocked(api.createTag).mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))
    const setTags = vi.fn()
    const refreshTags = vi.fn().mockResolvedValue({ status: 'applied' as const, tags: [newTag] })

    const { result, rerender } = renderHook(
      ({ rootKey }) => useSampleTags(
        api, [USER_TAG], setTags, vi.fn(), vi.fn(), vi.fn(), rootKey, vi.fn(), refreshTags
      ),
      { initialProps: { rootKey: TEST_SAMPLE_FOLDER.id as string | null } }
    )

    let pending!: Promise<TagItem>
    act(() => { pending = result.current.createTag('Warm') })
    rerender({ rootKey: 'other-root' })
    await act(async () => {
      resolveCreate(newTag)
      await pending
    })

    expect(refreshTags).toHaveBeenCalledOnce()
    expect(setTags).not.toHaveBeenCalled()
  })

  it('renames a tag and patches denormalized names on loaded samples', async () => {
    const api = createBackendAPI()
    const setTags = vi.fn()
    const setSamples = vi.fn()
    const samples: SampleListItem[] = [sampleRow({ tags: ['Punchy'], tagIds: [5], userTagIds: [5] })]

    const { result } = renderHook(() =>
      useSampleTags(api, [USER_TAG], setTags, vi.fn(), vi.fn(), setSamples, TEST_SAMPLE_FOLDER.id, vi.fn(), stubRefreshTags())
    )

    await act(() => result.current.renameTag(5, 'Ambient'))

    expect(api.renameTag).toHaveBeenCalledWith(5, 'Ambient')
    expect(setSamples).toHaveBeenCalled()
    // Verify the updater transforms tag names
    const updater = setSamples.mock.calls[0]![0] as (prev: SampleListItem[]) => SampleListItem[]
    expect(updater(samples)[0]?.tags).toEqual(['Ambient'])
  })

  it('sets tag color', async () => {
    const api = createBackendAPI()
    const setTags = vi.fn()

    const { result } = renderHook(() =>
      useSampleTags(api, [USER_TAG], setTags, vi.fn(), vi.fn(), vi.fn(), TEST_SAMPLE_FOLDER.id, vi.fn(), stubRefreshTags([USER_TAG]))
    )

    await act(() => result.current.setTagColor(5, '#ff0000'))

    expect(api.setTagColor).toHaveBeenCalledWith(5, '#ff0000')
  })

  it('deletes a user-created tag and removes it from loaded samples', async () => {
    const api = createBackendAPI()
    const setTags = vi.fn()
    const setSelectedTagIds = vi.fn()
    const setSamples = vi.fn()
    const samples: SampleListItem[] = [sampleRow({
      tags: ['Punchy'], tagIds: [5], folderTagIds: [], userTagIds: [5]
    })]

    const { result } = renderHook(() =>
      useSampleTags(api, [USER_TAG], setTags, setSelectedTagIds, vi.fn(), setSamples, TEST_SAMPLE_FOLDER.id, vi.fn(), stubRefreshTags())
    )

    await act(() => result.current.deleteTag(5))

    expect(api.deleteTag).toHaveBeenCalledWith(5)
    // Verify sample updater removes the deleted tag
    const setSamplesUpdater = setSamples.mock.calls[0]![0] as (prev: SampleListItem[]) => SampleListItem[]
    expect(setSamplesUpdater(samples)[0]?.tagIds).toEqual([])
    expect(setSamplesUpdater(samples)[0]?.userTagIds).toEqual([])
  })

  it('does not apply a late delete projection after the active root changes', async () => {
    const api = createBackendAPI()
    let resolveDelete!: () => void
    vi.mocked(api.deleteTag).mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve }))
    const setTags = vi.fn()
    const setSelectedTagIds = vi.fn()
    const setSamples = vi.fn()
    const refreshTags = vi.fn().mockResolvedValue({ status: 'applied' as const, tags: [] })

    const { result, rerender } = renderHook(
      ({ rootKey }) => useSampleTags(
        api, [USER_TAG], setTags, setSelectedTagIds, vi.fn(), setSamples,
        rootKey, vi.fn(), refreshTags
      ),
      { initialProps: { rootKey: TEST_SAMPLE_FOLDER.id as string | null } }
    )

    let pending!: Promise<void>
    act(() => { pending = result.current.deleteTag(USER_TAG.id) })
    rerender({ rootKey: 'other-root' })
    await act(async () => {
      resolveDelete()
      await pending
    })

    expect(refreshTags).toHaveBeenCalledOnce()
    expect(setTags).not.toHaveBeenCalled()
    expect(setSelectedTagIds).not.toHaveBeenCalled()
    expect(setSamples).not.toHaveBeenCalled()
  })

  it('does not replace a newer same-root projection when delete refresh is superseded', async () => {
    const api = createBackendAPI()
    const setTags = vi.fn()
    const setSelectedTagIds = vi.fn()
    const setSamples = vi.fn()
    const refreshTags = vi.fn().mockResolvedValue({ status: 'superseded' as const })

    const { result } = renderHook(() => useSampleTags(
      api, [USER_TAG], setTags, setSelectedTagIds, vi.fn(), setSamples,
      TEST_SAMPLE_FOLDER.id, vi.fn(), refreshTags
    ))

    await act(() => result.current.deleteTag(USER_TAG.id))

    expect(refreshTags).toHaveBeenCalledOnce()
    expect(setTags).not.toHaveBeenCalled()
    expect(setSelectedTagIds).not.toHaveBeenCalled()
    expect(setSamples).not.toHaveBeenCalled()
  })

  it('keeps the filter selection when a deleted shared tag survives as folder-owned', async () => {
    const api = createBackendAPI()
    const shared: TagItem = { ...FOLDER_TAG, origin: 'shared', color: '#123456' }
    // The backend keeps a shared tag's identity, demoting it to folder-owned.
    const demoted: TagItem = { ...shared, origin: 'folder', color: null }
    const setSelectedTagIds = vi.fn()
    const refreshTags = stubRefreshTags([demoted])

    const { result } = renderHook(() =>
      useSampleTags(
        api, [shared], vi.fn(), setSelectedTagIds, vi.fn(), vi.fn(),
        TEST_SAMPLE_FOLDER.id, vi.fn(), refreshTags
      )
    )

    await act(() => result.current.deleteTag(7))

    expect(api.deleteTag).toHaveBeenCalledWith(7)
    // The owner's refresh is the only thing that writes `tags`, so this hook
    // must not re-read or re-apply the projection itself.
    expect(refreshTags).toHaveBeenCalledOnce()
    expect(api.listTags).not.toHaveBeenCalled()
    // The tag still exists, so the active filter must survive: dropping it here
    // is what previously desynced the filter chips from the tag list.
    expect(setSelectedTagIds).not.toHaveBeenCalled()
  })

  it('leaves state untouched when the post-delete refresh fails', async () => {
    const api = createBackendAPI()
    const shared: TagItem = { ...FOLDER_TAG, origin: 'shared', color: '#123456' }
    const setTags = vi.fn()
    const setSelectedTagIds = vi.fn()
    const setSamples = vi.fn()
    const refreshTags = vi.fn().mockResolvedValue({ status: 'failed' as const })

    const { result } = renderHook(() =>
      useSampleTags(
        api, [shared], setTags, setSelectedTagIds, vi.fn(), setSamples,
        TEST_SAMPLE_FOLDER.id, vi.fn(), refreshTags
      )
    )

    await act(() => result.current.deleteTag(shared.id))

    // A failed re-read leaves the previous list standing rather than guessing
    // which of delete-or-demote the backend chose.
    expect(setTags).not.toHaveBeenCalled()
    expect(setSelectedTagIds).not.toHaveBeenCalled()
    expect(setSamples).not.toHaveBeenCalled()
  })

  it('clears the filter selection when a deleted tag does not survive', async () => {
    const api = createBackendAPI()
    const setSelectedTagIds = vi.fn()

    const { result } = renderHook(() =>
      useSampleTags(
        api, [USER_TAG], vi.fn(), setSelectedTagIds, vi.fn(), vi.fn(),
        TEST_SAMPLE_FOLDER.id, vi.fn(), stubRefreshTags([])
      )
    )

    await act(() => result.current.deleteTag(5))

    const updater = setSelectedTagIds.mock.calls[0]![0] as (prev: number[]) => number[]
    expect(updater([5, 9])).toEqual([9])
  })

  it('assigns a tag to a sample', async () => {
    const api = createBackendAPI()
    const patchSampleTags = vi.fn()
    const refreshSamples = vi.fn()
    const sample = sampleRow({ tags: [], tagIds: [], userTagIds: [] })

    const { result } = renderHook(() =>
      useSampleTags(
        api, [USER_TAG], vi.fn(), vi.fn(), patchSampleTags, vi.fn(),
        TEST_SAMPLE_FOLDER.id, refreshSamples, stubRefreshTags([USER_TAG])
      )
    )

    await act(() => result.current.assignTagToSample(sample, 5))

    expect(api.assignTag).toHaveBeenCalledWith(1, 5)
    expect(patchSampleTags).toHaveBeenCalledWith(
      'kick.wav', [5], [5], ['Punchy']
    )
    expect(refreshSamples).toHaveBeenCalledOnce()
  })

  it('unassigns a user-created tag from a sample (non-folder path)', async () => {
    const api = createBackendAPI()
    const patchSampleTags = vi.fn()
    const sample = sampleRow({ tags: ['Punchy'], tagIds: [5], folderTagIds: [], userTagIds: [5] })

    const { result } = renderHook(() =>
      useSampleTags(api, [USER_TAG], vi.fn(), vi.fn(), patchSampleTags, vi.fn(), TEST_SAMPLE_FOLDER.id, vi.fn(), stubRefreshTags([USER_TAG]))
    )

    await act(() => result.current.unassignTagFromSample(sample, 5))

    expect(api.unassignTag).toHaveBeenCalledWith(1, 5)
    expect(patchSampleTags).toHaveBeenCalledWith(
      'kick.wav', [], [], []
    )
  })

  it('does not assign a tag already present', async () => {
    const api = createBackendAPI()
    const patchSampleTags = vi.fn()
    const sample = sampleRow({ tags: ['Punchy'], tagIds: [5], userTagIds: [5] })

    const { result } = renderHook(() =>
      useSampleTags(api, [USER_TAG], vi.fn(), vi.fn(), patchSampleTags, vi.fn(), TEST_SAMPLE_FOLDER.id, vi.fn(), stubRefreshTags([USER_TAG]))
    )

    await act(() => result.current.assignTagToSample(sample, 5))

    expect(api.assignTag).not.toHaveBeenCalled()
    expect(patchSampleTags).not.toHaveBeenCalled()
  })

  it('does not unassign a tag not present', async () => {
    const api = createBackendAPI()
    const patchSampleTags = vi.fn()
    const sample = sampleRow({ tags: [], tagIds: [], userTagIds: [] })

    const { result } = renderHook(() =>
      useSampleTags(api, [USER_TAG], vi.fn(), vi.fn(), patchSampleTags, vi.fn(), TEST_SAMPLE_FOLDER.id, vi.fn(), stubRefreshTags([USER_TAG]))
    )

    await act(() => result.current.unassignTagFromSample(sample, 5))

    expect(api.unassignTag).not.toHaveBeenCalled()
    expect(patchSampleTags).not.toHaveBeenCalled()
  })
})
