import { useCallback, useRef } from 'react'
import type { BackendAPI, CategoryItem, FolderRef } from '../../../shared/backend-api'

export interface SampleCategoryActions {
  createCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  deleteCategory: (id: number) => Promise<void>
}

export function useSampleCategories(
  backendAPI: BackendAPI,
  sampleFolder: FolderRef | null,
  setCategories: React.Dispatch<React.SetStateAction<CategoryItem[]>>,
  selectedCategoryId: number | undefined,
  setSelectedCategoryId: (id: number | undefined) => void
): SampleCategoryActions {
  const activeRootIdRef = useRef<string | null>(sampleFolder?.id ?? null)
  activeRootIdRef.current = sampleFolder?.id ?? null
  const selectedCategoryIdRef = useRef(selectedCategoryId)
  selectedCategoryIdRef.current = selectedCategoryId

  const createCategory = useCallback(async (name: string, parentId?: number) => {
    if (!sampleFolder) throw new Error('Select a Sample Folder before creating categories.')
    const rootId = sampleFolder.id
    const cat = await backendAPI.createCategory(sampleFolder, name, parentId)
    if (activeRootIdRef.current === rootId) {
      setCategories((prev) => {
        const existingIndex = prev.findIndex((category) => category.id === cat.id)
        if (existingIndex < 0) return [...prev, cat]
        const next = [...prev]
        next[existingIndex] = cat
        return next
      })
    }
    return cat
  }, [backendAPI, sampleFolder, setCategories])

  const deleteCategory = useCallback(async (id: number) => {
    if (!sampleFolder) return
    const rootId = sampleFolder.id
    const projection = await backendAPI.deleteCategory(sampleFolder, id)
    if (activeRootIdRef.current !== rootId) return
    setCategories(projection)
    const selectedId = selectedCategoryIdRef.current
    if (selectedId !== undefined && !projection.some((category) => category.id === selectedId)) {
      setSelectedCategoryId(undefined)
    }
  }, [backendAPI, sampleFolder, setCategories, setSelectedCategoryId])

  return { createCategory, deleteCategory }
}
