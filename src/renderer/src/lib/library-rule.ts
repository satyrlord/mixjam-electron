import { safeJsonParse } from './safeJsonParse'

export interface LibraryRuleFilters {
  textSearch: string
  categoryId: number | undefined
  tagIds: number[]
}

interface LibraryRuleDocument {
  root: {
    children: unknown[]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLibraryRuleDocument(value: unknown): value is LibraryRuleDocument {
  return isRecord(value) &&
    isRecord(value.root) &&
    Array.isArray(value.root.children)
}

const EMPTY_FILTERS: LibraryRuleFilters = {
  textSearch: '',
  categoryId: undefined,
  tagIds: []
}

export function encodeLibraryRule(filters: LibraryRuleFilters): string {
  return JSON.stringify({
    version: 1,
    root: {
      kind: 'group',
      op: 'and',
      children: [
        ...(filters.textSearch ? [{ kind: 'text', query: filters.textSearch }] : []),
        ...(filters.categoryId !== undefined
          ? [{ kind: 'category', quantifier: 'any', categoryIds: [filters.categoryId], includeDescendants: true }]
          : []),
        ...(filters.tagIds.length > 0
          ? [{ kind: 'tag', quantifier: 'any', tagIds: filters.tagIds }]
          : [])
      ]
    }
  })
}

export function decodeLibraryRule(ruleJson: string): LibraryRuleFilters {
  const filters: LibraryRuleFilters = { ...EMPTY_FILTERS, tagIds: [] }
  const parsed = safeJsonParse(ruleJson, null, isLibraryRuleDocument)
  if (!parsed) return filters
  for (const node of parsed.root.children) {
    if (!isRecord(node)) continue
    if (node.kind === 'text' && typeof node.query === 'string') {
      filters.textSearch = node.query
    } else if (node.kind === 'category' && Array.isArray(node.categoryIds)) {
      const first = node.categoryIds.find(
        (id): id is number => typeof id === 'number' && Number.isInteger(id)
      )
      if (first !== undefined) filters.categoryId = first
    } else if (node.kind === 'tag' && Array.isArray(node.tagIds)) {
      filters.tagIds = node.tagIds.filter(
        (id): id is number => typeof id === 'number' && Number.isInteger(id)
      )
    }
  }
  return filters
}
