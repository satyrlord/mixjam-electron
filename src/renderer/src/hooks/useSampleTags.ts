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

/** Manages tag CRUD and per-sample tag assignments. Receives callbacks for
 *  cross-cutting state updates (patching denormalized tag names on loaded
 *  sample rows after rename/delete). */
export function useSampleTags(
  backendAPI: BackendAPI,
  tags: TagItem[],
  setTags: React.Dispatch<React.SetStateAction<TagItem[]>>,
  setSelectedTagIds: React.Dispatch<React.SetStateAction<number[]>>,
  /** Called to patch one loaded row's tags after assign/unassign. */
  patchSampleTags: (relpath: string, tagIds: number[], tagNames: string[]) => void,
  /** Called to bulk-patch all loaded rows after a tag rename or delete. */
  patchAllSamples: (updater: (prev: SampleListItem[]) => SampleListItem[]) => void
): SampleTagActions {
  const tagsRef = useSyncedRef(tags)

  const createTag = useCallback(async (name: string, color?: string) => {
    const tag = await backendAPI.createTag(name, color)
    setTags((prev) =>
      (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]).sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    )
    return tag
  }, [backendAPI, setTags])

  const renameTag = useCallback(async (id: number, name: string) => {
    await backendAPI.renameTag(id, name)
    setTags((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name } : t)).sort((a, b) => a.name.localeCompare(b.name))
    )
    // Patch denormalized tag names across all loaded sample rows.
    const renamed = new Map(tagsRef.current.map((t) => [t.id, t.id === id ? name : t.name]))
    patchAllSamples((prev) =>
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
  }, [backendAPI, setTags, tagsRef, patchAllSamples])

  const setTagColor = useCallback(async (id: number, color: string | null) => {
    await backendAPI.setTagColor(id, color)
    setTags((prev) => prev.map((tag) => (tag.id === id ? { ...tag, color } : tag)))
  }, [backendAPI, setTags])

  const deleteTag = useCallback(async (id: number) => {
    // Resolve the tag's display name before removing it from state, so we can
    // remove the correct entry from the alphabetically-sorted `tags` array
    // (which does NOT share indices with the numerically-sorted `tagIds` array).
    const deletedName = tagsRef.current.find((t) => t.id === id)?.name
    await backendAPI.deleteTag(id)
    setTags((prev) => prev.filter((t) => t.id !== id))
    setSelectedTagIds((prev) => prev.filter((tid) => tid !== id))
    patchAllSamples((prev) =>
      prev.map((s) => {
        if (!s.tagIds.includes(id)) return s
        return {
          ...s,
          tagIds: s.tagIds.filter((tid) => tid !== id),
          tags: deletedName ? s.tags.filter((name) => name !== deletedName) : s.tags
        }
      })
    )
  }, [backendAPI, setTags, setSelectedTagIds, tagsRef, patchAllSamples])

  const assignTagToSample = useCallback(async (sample: SampleListItem, tagId: number) => {
    if (sample.tagIds.includes(tagId)) return
    await backendAPI.assignTag(sample.dbId, tagId)
    const nextIds = [...sample.tagIds, tagId].sort((a, b) => a - b)
    const nextNames = nextIds
      .map((id) => tagsRef.current.find((t) => t.id === id)?.name)
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.localeCompare(b))
    patchSampleTags(sample.relpath, nextIds, nextNames)
  }, [backendAPI, tagsRef, patchSampleTags])

  const unassignTagFromSample = useCallback(async (sample: SampleListItem, tagId: number) => {
    if (!sample.tagIds.includes(tagId)) return
    await backendAPI.unassignTag(sample.dbId, tagId)
    const nextIds = sample.tagIds.filter((id) => id !== tagId)
    const nextNames = nextIds
      .map((id) => tagsRef.current.find((t) => t.id === id)?.name)
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.localeCompare(b))
    patchSampleTags(sample.relpath, nextIds, nextNames)
  }, [backendAPI, tagsRef, patchSampleTags])

  return {
    createTag,
    renameTag,
    setTagColor,
    deleteTag,
    assignTagToSample,
    unassignTagFromSample
  }
}
