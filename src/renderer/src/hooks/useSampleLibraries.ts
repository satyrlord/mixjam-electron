import { useCallback, useEffect, useRef } from 'react'
import type { BackendAPI, CategoryItem, LibraryItem } from '../../../shared/backend-api'
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
  categories: readonly CategoryItem[],
  activeRootId: string | null,
  categoriesReady: boolean,
  categoriesFailed: boolean,
  setSearchQuery: (query: string) => void,
  setSelectedCategoryId: (id: number | undefined) => void,
  setSelectedTagIds: React.Dispatch<React.SetStateAction<number[]>>
): SampleLibraryActions {
  const pendingLibraryRef = useRef<{ rootId: string; library: LibraryItem } | null>(null)
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

  const applyResolvedLibrary = useCallback((library: LibraryItem) => {
    const rule = decodeLibraryRule(library.ruleJson)
    setSearchQuery(rule.textSearch)
    setSelectedCategoryId(
      rule.categoryId !== undefined && categories.some(({ id }) => id === rule.categoryId)
        ? rule.categoryId
        : undefined
    )
    setSelectedTagIds(rule.tagIds)
  }, [categories, setSearchQuery, setSelectedCategoryId, setSelectedTagIds])

  const applyLibrary = useCallback((library: LibraryItem) => {
    if (activeRootId !== null && categoriesFailed) {
      pendingLibraryRef.current = null
      return
    }
    if (activeRootId !== null && !categoriesReady) {
      pendingLibraryRef.current = { rootId: activeRootId, library }
      return
    }
    pendingLibraryRef.current = null
    applyResolvedLibrary(library)
  }, [activeRootId, applyResolvedLibrary, categoriesFailed, categoriesReady])

  useEffect(() => {
    const pending = pendingLibraryRef.current
    if (!pending) return
    if (pending.rootId !== activeRootId) {
      pendingLibraryRef.current = null
      return
    }
    if (categoriesFailed) {
      pendingLibraryRef.current = null
      return
    }
    if (!categoriesReady) return
    pendingLibraryRef.current = null
    applyResolvedLibrary(pending.library)
  }, [activeRootId, applyResolvedLibrary, categoriesFailed, categoriesReady])

  return { saveLibrary, deleteLibrary, applyLibrary }
}
