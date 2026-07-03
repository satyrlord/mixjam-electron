import { useCallback } from 'react'
import type { BackendAPI, CategoryItem } from '../../../shared/backend-api'

export interface SampleCategoryActions {
  createCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  deleteCategory: (id: number) => Promise<void>
}

export function useSampleCategories(
  backendAPI: BackendAPI,
  setCategories: React.Dispatch<React.SetStateAction<CategoryItem[]>>,
  selectedCategoryId: number | undefined,
  setSelectedCategoryId: (id: number | undefined) => void
): SampleCategoryActions {
  const createCategory = useCallback(async (name: string, parentId?: number) => {
    const cat = await backendAPI.createCategory(name, parentId)
    setCategories((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat]))
    return cat
  }, [backendAPI, setCategories])

  const deleteCategory = useCallback(async (id: number) => {
    await backendAPI.deleteCategory(id)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    if (selectedCategoryId === id) setSelectedCategoryId(undefined)
  }, [backendAPI, setCategories, selectedCategoryId, setSelectedCategoryId])

  return { createCategory, deleteCategory }
}
