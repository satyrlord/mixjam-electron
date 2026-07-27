import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '../hooks/useAppState'
import { usePlayerViewModel } from './usePlayerViewModel'

function createApp(setSelectedTagIds: ReturnType<typeof vi.fn>): AppState {
  return {
    library: {
      samples: [],
      selectedSampleDetail: null,
      selectedTagIds: [],
      missingSamplePaths: new Set(),
      setSelectedTagIds
    },
    transport: { lanes: [] },
    mixer: { returnBuses: [] },
    project: {
      projectName: 'Untitled',
      projectDirty: false,
      projectBusy: false,
      projectGenerator: null,
      projectMissingSamplePaths: new Set(),
      mixJamFiles: []
    },
    navigation: {}
  } as unknown as AppState
}

describe('usePlayerViewModel', () => {
  it('adapts optional project data and owns tag-filter toggling', () => {
    const setSelectedTagIds = vi.fn()
    let app = createApp(setSelectedTagIds)
    const commands = {
      onRegenerateExact: vi.fn(),
      onRegenerateCurrent: vi.fn()
    }
    const { result, rerender } = renderHook(() => usePlayerViewModel(app, commands))

    expect(result.current.browser.selectedSamplePath).toBeNull()
    expect(result.current.project.canRegenerate).toBe(false)
    act(() => result.current.browser.onToggleTagFilter(2))
    const update = setSelectedTagIds.mock.calls[0]![0] as (ids: number[]) => number[]
    expect(update([1])).toEqual([1, 2])
    expect(update([1, 2])).toEqual([1])

    app = {
      ...app,
      library: {
        ...app.library,
        selectedSampleDetail: { relpath: 'drums/kick.wav' } as never
      },
      project: {
        ...app.project,
        projectGenerator: {
          generatorVersion: -1,
          profileId: 'techno',
          profileVersion: -1
        } as never
      }
    }
    rerender()

    expect(result.current.browser.selectedSamplePath).toBe('drums/kick.wav')
    expect(result.current.project.canRegenerate).toBe(false)
  })
})
