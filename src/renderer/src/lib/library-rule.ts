import { safeJsonParse } from './safeJsonParse'

export interface LibraryRuleFilters {
  textSearch: string
  tagIds: number[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed)
  return Object.keys(record).every((key) => allowedKeys.has(key))
}

export function encodeLibraryRule(filters: LibraryRuleFilters): string {
  return JSON.stringify({
    version: 1,
    root: {
      kind: 'group',
      op: 'and',
      children: [
        ...(filters.textSearch ? [{ kind: 'text', query: filters.textSearch }] : []),
        ...(filters.tagIds.length > 0
          ? [{ kind: 'tag', quantifier: 'all', tagIds: filters.tagIds }]
          : [])
      ]
    }
  })
}

export function decodeLibraryRule(ruleJson: string): LibraryRuleFilters {
  const empty: LibraryRuleFilters = { textSearch: '', tagIds: [] }
  const parsed = safeJsonParse(ruleJson, null, isRecord)
  if (!parsed || !hasOnlyKeys(parsed, ['version', 'root'])) return empty

  const versionOmitted = !Object.prototype.hasOwnProperty.call(parsed, 'version')
  if (!versionOmitted && parsed.version !== 1) return empty
  if (!isRecord(parsed.root) ||
      !hasOnlyKeys(parsed.root, ['kind', 'op', 'children']) ||
      !Array.isArray(parsed.root.children)) return empty

  // Earlier saved rules omitted only the version and group descriptors. Keep
  // those otherwise-canonical rules readable, but never reinterpret an
  // explicitly unsupported group kind or operator.
  if (versionOmitted) {
    if (parsed.root.kind !== undefined && parsed.root.kind !== 'group') return empty
    if (parsed.root.op !== undefined && parsed.root.op !== 'and') return empty
  } else if (parsed.root.kind !== 'group' || parsed.root.op !== 'and') {
    return empty
  }

  let textSearch = ''
  let tagIds: number[] = []
  let hasText = false
  let hasTags = false
  for (const node of parsed.root.children) {
    if (!isRecord(node)) return empty
    if (node.kind === 'text') {
      if (hasText || !hasOnlyKeys(node, ['kind', 'query']) || typeof node.query !== 'string') {
        return empty
      }
      hasText = true
      textSearch = node.query
      continue
    }
    if (node.kind === 'tag') {
      if (hasTags ||
          !hasOnlyKeys(node, ['kind', 'quantifier', 'tagIds']) ||
          node.quantifier !== 'all' ||
          !Array.isArray(node.tagIds) ||
          !node.tagIds.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
        return empty
      }
      hasTags = true
      tagIds = node.tagIds
      continue
    }
    return empty
  }
  return { textSearch, tagIds }
}
