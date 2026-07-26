import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryItem, TagItem } from '../../../shared/backend-api'
import { createBackendAPI } from '../test/backendApi'
import { useSampleLibraries } from './useSampleLibraries'

const TAG: TagItem = {
  id: 5, name: 'Punchy', color: null, origin: 'user', folderDerived: false
}

describe('useSampleLibraries', () => {
  it('saves a library with the current filter state', async () => {
    const api = createBackendAPI()
    vi.mocked(api.saveLibrary).mockResolvedValue({
      id: 1, name: 'Hits', createdAt: 1,
      ruleJson: JSON.stringify({ root: { children: [{ kind: 'text', query: 'kick' }] } })
    })
    const setLibraries = vi.fn()
    const setSearchQuery = vi.fn()
    const setSelectedTagIds = vi.fn()

    const { result } = renderHook(() =>
      useSampleLibraries(api, setLibraries, 'kick', [5], [TAG], setSearchQuery, setSelectedTagIds)
    )

    const library = await act(() => result.current.saveLibrary('Hits'))

    expect(api.saveLibrary).toHaveBeenCalledWith('Hits', expect.stringContaining('kick'))
    expect(library).toMatchObject({ id: 1, name: 'Hits' })
  })

  it('deletes a library and removes it from state', async () => {
    const api = createBackendAPI()
    const setLibraries = vi.fn()

    const { result } = renderHook(() =>
      useSampleLibraries(api, setLibraries, '', [], [], vi.fn(), vi.fn())
    )

    await act(() => result.current.deleteLibrary(1))

    expect(api.deleteLibrary).toHaveBeenCalledWith(1)
    expect(setLibraries).toHaveBeenCalled()
    // The updater function should filter out id 1
    const updater = setLibraries.mock.calls[0]![0]
    const existing: LibraryItem[] = [{ id: 1, name: 'Old', createdAt: 0, ruleJson: '{}' }]
    expect(updater(existing)).toEqual([])
  })

  it('applies a library by restoring search query and tag filters', () => {
    const api = createBackendAPI()
    const setSearchQuery = vi.fn()
    const setSelectedTagIds = vi.fn()

    const { result } = renderHook(() =>
      useSampleLibraries(api, vi.fn(), '', [], [TAG], setSearchQuery, setSelectedTagIds)
    )

    act(() => result.current.applyLibrary({
      id: 2, name: 'Bass Hits', createdAt: 1,
      ruleJson: JSON.stringify({
        root: { children: [
          { kind: 'text', query: 'bass' },
          { kind: 'tag', quantifier: 'all', tagIds: [5] }
        ] }
      })
    }))

    expect(setSearchQuery).toHaveBeenCalledWith('bass')
    expect(setSelectedTagIds).toHaveBeenCalledWith([5])
  })

  it('filters out unavailable tag IDs when applying a library', () => {
    const api = createBackendAPI()
    const setSearchQuery = vi.fn()
    const setSelectedTagIds = vi.fn()

    const { result } = renderHook(() =>
      useSampleLibraries(api, vi.fn(), '', [], [TAG], setSearchQuery, setSelectedTagIds)
    )

    act(() => result.current.applyLibrary({
      id: 3, name: 'Unknown Tags', createdAt: 1,
      ruleJson: JSON.stringify({
        root: { children: [
          { kind: 'tag', quantifier: 'all', tagIds: [999, 5] }
        ] }
      })
    }))

    // Only tag 5 is available in the tags list
    expect(setSelectedTagIds).toHaveBeenCalledWith([5])
  })
})
