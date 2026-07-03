import { useCallback } from 'react'
import type { BackendAPI, LibraryItem } from '../../../shared/backend-api'

/** Shape of the rule_json written by saveLibrary. Parsed defensively. */
interface RuleNode {
  kind?: unknown
  query?: unknown
  categoryIds?: unknown
  tagIds?: unknown
}

function parseLibraryRule(ruleJson: string): {
  textSearch: string
  categoryId: number | undefined
  tagIds: number[]
} {
  const result = { textSearch: '', categoryId: undefined as number | undefined, tagIds: [] as number[] }
  try {
    const parsed = JSON.parse(ruleJson) as { root?: { children?: RuleNode[] } }
    for (const child of parsed.root?.children ?? []) {
      if (child.kind === 'text' && typeof child.query === 'string') {
        result.textSearch = child.query
      } else if (child.kind === 'category' && Array.isArray(child.categoryIds)) {
        const first = child.categoryIds[0]
        if (typeof first === 'number') result.categoryId = first
      } else if (child.kind === 'tag' && Array.isArray(child.tagIds)) {
        result.tagIds = child.tagIds.filter((id): id is number => typeof id === 'number')
      }
    }
  } catch {
    return result
  }
  return result
}

export interface SampleLibraryActions {
  saveLibrary: (name: string) => Promise<LibraryItem>
  deleteLibrary: (id: number) => Promise<void>
  /** Restores the filter state a saved library encodes. */
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
    const ruleJson = JSON.stringify({
      version: 1,
      root: {
        kind: 'group',
        op: 'and',
        children: [
          ...(searchQuery ? [{ kind: 'text', query: searchQuery }] : []),
          ...(selectedCategoryId !== undefined
            ? [{ kind: 'category', quantifier: 'any' as const, categoryIds: [selectedCategoryId], includeDescendants: true }]
            : []),
          ...(selectedTagIds.length > 0
            ? [{ kind: 'tag', quantifier: 'any' as const, tagIds: selectedTagIds }]
            : [])
        ]
      }
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
    const rule = parseLibraryRule(library.ruleJson)
    setSearchQuery(rule.textSearch)
    setSelectedCategoryId(rule.categoryId)
    setSelectedTagIds(rule.tagIds)
  }, [setSearchQuery, setSelectedCategoryId, setSelectedTagIds])

  return { saveLibrary, deleteLibrary, applyLibrary }
}
