import { useCallback } from 'react'
import type { BackendAPI, LibraryItem } from '../../../shared/backend-api'
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
  selectedCategoryId: number | undefined,
  selectedTagIds: number[],
  setSearchQuery: (query: string) => void,
  setSelectedCategoryId: (id: number | undefined) => void,
  setSelectedTagIds: React.Dispatch<React.SetStateAction<number[]>>
): SampleLibraryActions {
  const saveLibrary = useCallback(async (name: string) => {
    const ruleJson = encodeLibraryRule({
      textSearch: searchQuery,
      categoryId: selectedCategoryId,
      tagIds: selectedTagIds
    })
    const lib = await backendAPI.saveLibrary(name, ruleJson)
    setLibraries((prev) => [...prev, lib].sort((a, b) => a.name.localeCompare(b.name)))
    return lib
  }, [backendAPI, setLibraries, searchQuery, selectedCategoryId, selectedTagIds])

  const deleteLibrary = useCallback(async (id: number) => {
    await backendAPI.deleteLibrary(id)
    setLibraries((prev) => prev.filter((l) => l.id !== id))
  }, [backendAPI, setLibraries])

  const applyLibrary = useCallback((library: LibraryItem) => {
    const rule = decodeLibraryRule(library.ruleJson)
    setSearchQuery(rule.textSearch)
    setSelectedCategoryId(rule.categoryId)
    setSelectedTagIds(rule.tagIds)
  }, [setSearchQuery, setSelectedCategoryId, setSelectedTagIds])

  return { saveLibrary, deleteLibrary, applyLibrary }
}
