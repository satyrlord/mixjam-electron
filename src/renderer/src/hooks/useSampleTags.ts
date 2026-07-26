import { useCallback } from 'react'
import type { BackendAPI, SampleListItem, TagItem } from '../../../shared/backend-api'
import { useSyncedRef } from './useSyncedRef'

export interface SampleTagActions {
  createTag: (name: string, color?: string) => Promise<TagItem>
  renameTag: (id: number, name: string) => Promise<void>
  setTagColor: (id: number, color: string | null) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  assignTagToSample: (sample: SampleListItem, tagId: number) => Promise<void>
  unassignTagFromSample: (sample: SampleListItem, tagId: number) => Promise<void>
}

export type TagRefreshResult =
  | { status: 'applied'; tags: TagItem[] }
  | { status: 'superseded' }
  | { status: 'failed' }

/** Manages tag CRUD and per-sample tag assignments. Receives callbacks for
 *  cross-cutting state updates (patching denormalized tag names on loaded
 *  sample rows after rename/delete). */
export function useSampleTags(
  backendAPI: BackendAPI,
  tags: TagItem[],
  setTags: React.Dispatch<React.SetStateAction<TagItem[]>>,
  setSelectedTagIds: React.Dispatch<React.SetStateAction<number[]>>,
  /** Called to patch one loaded row's tags after assign/unassign. */
  patchSampleTags: (
    relpath: string,
    tagIds: number[],
    userTagIds: number[],
    tagNames: string[]
  ) => void,
  /** Receives the full sample-list setter from the owning hook. */
  setSamples: (updater: (prev: SampleListItem[]) => SampleListItem[]) => void,
  activeRootKey: string | null,
  /** Invalidates the current windowed query after membership changes. */
  refreshSamples: () => void,
  /** Re-reads the current root's tag projection through the owning hook's
   *  request-generation guard, which is also what applies the result to
   *  `tags`. Required: it is the single source of post-mutation tag state, so
   *  this hook never has to predict or reconstruct what the backend decided. */
  refreshTags: () => Promise<TagRefreshResult>
): SampleTagActions {
  const tagsRef = useSyncedRef(tags)
  const activeRootRef = useSyncedRef(activeRootKey)
  const refreshTagsRef = useSyncedRef(refreshTags)

  const createTag = useCallback(async (name: string, color?: string) => {
    const mutationRoot = activeRootKey
    const tag = await backendAPI.createTag(name, color, activeRootKey ?? undefined)
    await refreshTagsRef.current()
    if (activeRootRef.current !== mutationRoot) return tag
    setTags((prev) => {
      const existing = prev.find((item) => item.id === tag.id)
      const next = existing
        ? prev.map((item) => item.id === tag.id ? tag : item)
        : [...prev, tag]
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
    return tag
  }, [activeRootKey, activeRootRef, backendAPI, refreshTagsRef, setTags])

  const renameTag = useCallback(async (id: number, name: string) => {
    await backendAPI.renameTag(id, name)
    setTags((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name } : t)).sort((a, b) => a.name.localeCompare(b.name))
    )
    // Patch denormalized tag names across all loaded sample rows.
    const renamed = new Map(tagsRef.current.map((t) => [t.id, t.id === id ? name : t.name]))
    setSamples((prev) =>
      prev.map((s) =>
        s.tagIds.includes(id)
          ? {
              ...s,
              tags: s.tagIds
                .map((tid) => renamed.get(tid))
                .filter((n): n is string => n !== undefined)
                .sort((a, b) => a.localeCompare(b))
            }
          : s
      )
    )
  }, [backendAPI, setTags, tagsRef, setSamples])

  const setTagColor = useCallback(async (id: number, color: string | null) => {
    await backendAPI.setTagColor(id, color)
    setTags((prev) => prev.map((tag) => (tag.id === id ? { ...tag, color } : tag)))
  }, [backendAPI, setTags])

  const deleteTag = useCallback(async (id: number) => {
    // Deleting a `shared` tag does not remove it: the backend withdraws the
    // user's ownership and assignments, and the tag survives as `folder`. Which
    // of the two happened is the backend's call, so the refreshed projection —
    // not a prediction made here — decides whether the filter selection drops
    // the id. Hand-patching that across both outcomes is what previously let the
    // tag list and the filter selection disagree.
    const mutationRoot = activeRootKey
    const deletedName = tagsRef.current.find((tag) => tag.id === id)?.name
    await backendAPI.deleteTag(id)
    const refreshResult = await refreshTagsRef.current()
    if (activeRootRef.current !== mutationRoot) return
    // `superseded` means a newer refresh already owns `tags`; `failed` means the
    // re-read errored and the previous list stands. Neither leaves this hook a
    // better answer than the owner already has, so only the applied projection
    // drives the filter reconciliation below.
    if (refreshResult.status !== 'applied') return

    if (!refreshResult.tags.some((tag) => tag.id === id)) {
      setSelectedTagIds((prev) => prev.filter((tagId) => tagId !== id))
    }
    setSamples((prev) =>
      prev.map((s) => {
        if (!s.tagIds.includes(id)) return s
        // The user assignment is gone either way; a folder assignment survives.
        const userTagIds = s.userTagIds.filter((tagId) => tagId !== id)
        if (s.folderTagIds.includes(id)) return { ...s, userTagIds }
        return {
          ...s,
          tagIds: s.tagIds.filter((tid) => tid !== id),
          userTagIds,
          tags: deletedName ? s.tags.filter((name) => name !== deletedName) : s.tags
        }
      })
    )
    refreshSamples()
  }, [activeRootKey, activeRootRef, backendAPI, refreshSamples, refreshTagsRef, setSelectedTagIds, tagsRef, setSamples])

  const assignTagToSample = useCallback(async (sample: SampleListItem, tagId: number) => {
    if (sample.userTagIds.includes(tagId)) return
    const mutationRoot = activeRootKey
    await backendAPI.assignTag(sample.dbId, tagId)
    if (activeRootRef.current !== mutationRoot) return
    const nextIds = [...new Set([...sample.tagIds, tagId])].sort((a, b) => a - b)
    const nextUserIds = [...sample.userTagIds, tagId].sort((a, b) => a - b)
    const nextNames = nextIds
      .map((id) => tagsRef.current.find((t) => t.id === id)?.name)
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.localeCompare(b))
    patchSampleTags(sample.relpath, nextIds, nextUserIds, nextNames)
    refreshSamples()
  }, [activeRootKey, activeRootRef, backendAPI, tagsRef, patchSampleTags, refreshSamples])

  const unassignTagFromSample = useCallback(async (sample: SampleListItem, tagId: number) => {
    if (!sample.userTagIds.includes(tagId)) return
    const mutationRoot = activeRootKey
    await backendAPI.unassignTag(sample.dbId, tagId)
    if (activeRootRef.current !== mutationRoot) return
    const nextUserIds = sample.userTagIds.filter((id) => id !== tagId)
    const nextIds = sample.folderTagIds.includes(tagId)
      ? sample.tagIds
      : sample.tagIds.filter((id) => id !== tagId)
    const nextNames = nextIds
      .map((id) => tagsRef.current.find((t) => t.id === id)?.name)
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.localeCompare(b))
    patchSampleTags(sample.relpath, nextIds, nextUserIds, nextNames)
    refreshSamples()
  }, [activeRootKey, activeRootRef, backendAPI, tagsRef, patchSampleTags, refreshSamples])

  return {
    createTag,
    renameTag,
    setTagColor,
    deleteTag,
    assignTagToSample,
    unassignTagFromSample
  }
}
