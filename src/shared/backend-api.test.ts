import { describe, expect, it } from 'vitest'
import {
  isSafeAnalysisGroupKey,
  isTagEditable,
  isTagRenameable,
  normalizeSampleQueryRequest
} from './backend-api'

describe('backend API runtime guards', () => {
  it('derives tag edit and rename policy from the tag origin', () => {
    expect(['user', 'folder', 'shared'].map((origin) => ({
      editable: isTagEditable(origin as 'user' | 'folder' | 'shared'),
      renameable: isTagRenameable(origin as 'user' | 'folder' | 'shared')
    }))).toEqual([
      { editable: true, renameable: true },
      { editable: false, renameable: false },
      { editable: true, renameable: false }
    ])
  })

  it('keeps valid sample-query fields from an untyped worker payload', () => {
    expect(normalizeSampleQueryRequest({
      textSearch: 'kick',
      tagIds: [2, 5],
      rootId: 'samples',
      limit: 50,
      offset: 100,
      sortBy: 'duration',
      sortDir: 'desc'
    })).toEqual({
      textSearch: 'kick',
      tagIds: [2, 5],
      rootId: 'samples',
      limit: 50,
      offset: 100,
      sortBy: 'duration',
      sortDir: 'desc'
    })
  })

  it('drops invalid sample-query fields and defaults null payloads', () => {
    expect(normalizeSampleQueryRequest(null)).toEqual({
      textSearch: undefined,
      tagIds: undefined,
      rootId: undefined,
      limit: undefined,
      offset: undefined,
      sortBy: undefined,
      sortDir: undefined
    })
    expect(normalizeSampleQueryRequest({
      textSearch: 4,
      tagIds: '2,5',
      rootId: null,
      limit: '50',
      offset: null,
      sortBy: 'size',
      sortDir: 1
    })).toEqual({
      textSearch: undefined,
      tagIds: undefined,
      rootId: undefined,
      limit: undefined,
      offset: undefined,
      sortBy: undefined,
      sortDir: undefined
    })
    expect(normalizeSampleQueryRequest({ tagIds: [2, '5'], sortBy: 1, sortDir: 'sideways' }))
      .toMatchObject({ tagIds: undefined, sortBy: undefined, sortDir: undefined })
  })

  it('accepts only canonical analyzer group keys', () => {
    expect(isSafeAnalysisGroupKey('')).toBe(true)
    expect(isSafeAnalysisGroupKey('House/Drums/Kicks')).toBe(true)

    for (const unsafe of [
      '/House',
      'House/',
      'House\\Kicks',
      "House\u0000Kicks",
      'House//Kicks',
      'House/./Kicks',
      'House/../Kicks'
    ]) {
      expect(isSafeAnalysisGroupKey(unsafe)).toBe(false)
    }
  })
})
