import { useCallback } from 'react'
import type { BackendAPI, LibraryItem, TagItem } from '../../../shared/backend-api'
import { decodeLibraryRule, encodeLibraryRule } from '../lib/library-rule'

export interface SampleLibraryActions {
  saveLibrary: (name: string) => Promise<LibraryItem>
  deleteLibrary: (id: number) => Promise<void>
  applyLibrary: (library: LibraryItem) => void
}

export function useSampleLibraries(
  backendAPI: BackendAPI,
  setLibraries: React.Dispatch<React.SetStateAction<LibraryItem[]>>,
  searchQuery: string,
  selectedTagIds: number[],
  tags: readonly TagItem[],
  setSearchQuery: (query: string) => void,
  setSelectedTagIds: React.Dispatch<React.SetStateAction<number[]>>
): SampleLibraryActions {
  const saveLibrary = useCallback(async (name: string) => {
    const ruleJson = encodeLibraryRule({ textSearch: searchQuery, tagIds: selectedTagIds })
    const library = await backendAPI.saveLibrary(name, ruleJson)
    setLibraries((current) => [...current, library].sort((left, right) => left.name.localeCompare(right.name)))
    return library
  }, [backendAPI, searchQuery, selectedTagIds, setLibraries])

  const deleteLibrary = useCallback(async (id: number) => {
    await backendAPI.deleteLibrary(id)
    setLibraries((current) => current.filter((library) => library.id !== id))
  }, [backendAPI, setLibraries])

  const applyLibrary = useCallback((library: LibraryItem) => {
    const rule = decodeLibraryRule(library.ruleJson)
    const availableIds = new Set(tags.map((tag) => tag.id))
    setSearchQuery(rule.textSearch)
    setSelectedTagIds(rule.tagIds.filter((id) => availableIds.has(id)))
  }, [setSearchQuery, setSelectedTagIds, tags])

  return { saveLibrary, deleteLibrary, applyLibrary }
}
