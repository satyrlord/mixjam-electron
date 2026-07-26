import { describe, expect, it } from 'vitest'
import { decodeLibraryRule, encodeLibraryRule } from './library-rule'

describe('library rule codec', () => {
  it('round-trips the browser filters', () => {
    const filters = { textSearch: 'kick', tagIds: [2, 7] }
    expect(decodeLibraryRule(encodeLibraryRule(filters))).toEqual(filters)
  })

  it('omits inactive filters from the durable rule', () => {
    const encoded = JSON.parse(encodeLibraryRule({
      textSearch: '', tagIds: []
    }))
    expect(encoded.root.children).toEqual([])
  })

  it('returns empty filters for invalid JSON or shape', () => {
    const empty = { textSearch: '', tagIds: [] }
    expect(decodeLibraryRule('{')).toEqual(empty)
    expect(decodeLibraryRule('{"root":{"children":"bad"}}')).toEqual(empty)
  })

  it('accepts an otherwise-canonical rule whose version and group descriptors are omitted', () => {
    const rule = JSON.stringify({ root: { children: [
      { kind: 'text', query: 'kick' },
      { kind: 'tag', quantifier: 'all', tagIds: [1, 5] }
    ] } })
    expect(decodeLibraryRule(rule)).toEqual({ textSearch: 'kick', tagIds: [1, 5] })
  })

  it.each([
    ['unsupported version', { version: 2, root: { kind: 'group', op: 'and', children: [] } }],
    ['missing versioned root kind', { version: 1, root: { op: 'and', children: [] } }],
    ['unsupported root kind', { version: 1, root: { kind: 'leaf', op: 'and', children: [] } }],
    ['unsupported root operator', { version: 1, root: { kind: 'group', op: 'or', children: [] } }],
    ['nested group', { root: { children: [{ kind: 'group', op: 'and', children: [] }] } }],
    ['unknown leaf', { root: { children: [{ kind: 'future', value: true }] } }],
    ['malformed text leaf', { root: { children: [{ kind: 'text', query: 42 }] } }],
    ['unsupported tag quantifier', { root: { children: [{ kind: 'tag', quantifier: 'any', tagIds: [1] }] } }],
    ['missing tag quantifier', { root: { children: [{ kind: 'tag', tagIds: [1] }] } }],
    ['malformed tag ids', { root: { children: [{ kind: 'tag', quantifier: 'all', tagIds: [1, 'bad', 5] }] } }],
    ['duplicate text leaves', { root: { children: [
      { kind: 'text', query: 'kick' },
      { kind: 'text', query: 'snare' }
    ] } }]
  ])('rejects the entire rule for %s', (_label, rule) => {
    expect(decodeLibraryRule(JSON.stringify(rule))).toEqual({ textSearch: '', tagIds: [] })
  })

  it('does not preserve a valid sibling when another leaf is unsupported', () => {
    const rule = JSON.stringify({ root: { children: [
      { kind: 'text', query: 'kick' },
      { kind: 'bpm', min: 120 }
    ] } })
    expect(decodeLibraryRule(rule)).toEqual({ textSearch: '', tagIds: [] })
  })

  it('persists multiple tags with match-all semantics', () => {
    const encoded = JSON.parse(encodeLibraryRule({ textSearch: '', tagIds: [2, 7] }))
    expect(encoded.root.children).toEqual([
      { kind: 'tag', quantifier: 'all', tagIds: [2, 7] }
    ])
  })
})
