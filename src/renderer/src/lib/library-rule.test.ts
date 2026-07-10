import { describe, expect, it } from 'vitest'
import { decodeLibraryRule, encodeLibraryRule } from './library-rule'

describe('library rule codec', () => {
  it('round-trips the browser filters', () => {
    const filters = { textSearch: 'kick', categoryId: 4, tagIds: [2, 7] }
    expect(decodeLibraryRule(encodeLibraryRule(filters))).toEqual(filters)
  })

  it('omits inactive filters from the durable rule', () => {
    const encoded = JSON.parse(encodeLibraryRule({
      textSearch: '', categoryId: undefined, tagIds: []
    }))
    expect(encoded.root.children).toEqual([])
  })

  it('returns empty filters for invalid JSON or shape', () => {
    const empty = { textSearch: '', categoryId: undefined, tagIds: [] }
    expect(decodeLibraryRule('{')).toEqual(empty)
    expect(decodeLibraryRule('{"root":{"children":"bad"}}')).toEqual(empty)
  })

  it('ignores malformed and unknown nodes while preserving valid ones', () => {
    const rule = JSON.stringify({ root: { children: [
      null,
      { kind: 'future', value: true },
      { kind: 'category', categoryIds: ['bad', 3] },
      { kind: 'tag', tagIds: [1, 'bad', 5] }
    ] } })
    expect(decodeLibraryRule(rule)).toEqual({ textSearch: '', categoryId: 3, tagIds: [1, 5] })
  })
})
