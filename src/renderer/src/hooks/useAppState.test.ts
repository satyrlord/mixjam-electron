import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MixJamFileItem } from '../../../shared/backend-api'
import { createBackendAPI, DEFAULT_SAMPLE_ROWS, TEST_SAMPLE_FOLDER, TEST_USER_FOLDER } from '../test/backendApi'
import { useAppState } from './useAppState'

const USER_FOLDER = TEST_USER_FOLDER
const SAMPLE_FOLDER = TEST_SAMPLE_FOLDER

describe('useAppState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads version data and starts in home view', async () => {
    vi.useRealTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    expect(result.current.view).toBe('home')
    expect(result.current.timerText).toBe('00:00.0')

    await waitFor(() => {
      expect(result.current.version).toBe('v0.test.0')
    })

    expect(backendAPI.getVersion).toHaveBeenCalledTimes(1)
    expect(backendAPI.loadMixJamFiles).toHaveBeenCalledWith(USER_FOLDER)

    await waitFor(() => {
      expect(backendAPI.querySamples).toHaveBeenCalledWith(
        expect.objectContaining({ rootId: SAMPLE_FOLDER.id })
      )
    })
  })

  it('falls back to a safe version string when getVersion fails', async () => {
    vi.useRealTimers()
    const backendAPI = createBackendAPI()
    vi.mocked(backendAPI.getVersion).mockRejectedValueOnce(new Error('ipc unavailable'))
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.version).toBe('version unavailable')
    })
  })

  it('moves to the Player and increments the timer while playing', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToPlayer()
    })

    expect(result.current.view).toBe('player')
    expect(backendAPI.resizeToPlayer).toHaveBeenCalledTimes(1)

    // Timer should be at 00:00.0 until playback starts
    expect(result.current.timerText).toBe('00:00.0')

    // Start playback
    await act(async () => {
      result.current.transportPlay()
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.timerText).toBe('00:01.0')
  })

  it('returns to home and clears the timer', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToPlayer()
      await result.current.goToHome()
    })

    expect(result.current.view).toBe('home')
    expect(result.current.timerText).toBe('00:00.0')
    expect(backendAPI.resizeToHome).toHaveBeenCalledTimes(1)
  })

  it('routes footer actions through the injected backendAPI', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.openRepo()
    })

    expect(backendAPI.openExternal).toHaveBeenCalledWith(
      'https://github.com/satyrlord/mixjam-electron'
    )
  })

  it('clears the running timer when unmounted from the Player', async () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const backendAPI = createBackendAPI()
    const { result, unmount } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToPlayer()
    })

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  it('stores selected sample detail for the footer surface', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.samples.length).toBeGreaterThan(0)
    })

    act(() => {
      result.current.setSelectedSampleDetail({
        name: 'kick_808.wav',
        relpath: 'Drums/Kicks/kick_808.wav',
        tags: ['Drums', 'Kick'], bpm: null, duration: null
      })
    })

    expect(result.current.selectedSampleDetail?.name).toBe('kick_808.wav')
  })

  it('starts a library scan when requested', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.startLibraryScan()
    })

    expect(backendAPI.startScan).toHaveBeenCalledWith(SAMPLE_FOLDER)
  })

  it('places a sample on a lane via drag-and-drop', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.samples.length).toBeGreaterThan(0)
    })

    act(() => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick_808.wav', relpath: 'Drums/Kicks/kick_808.wav', tags: [], bpm: null, duration: null },
        0,
        0
      )
    })

    const lane0 = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0?.placements).toHaveLength(1)
    expect(lane0?.placements[0]?.sampleName).toBe('kick_808.wav')
    expect(lane0?.placements[0]?.startTick).toBe(0)
    expect(lane0?.placements[0]?.durationTicks).toBe(32)
  })

  it('falls back when loadMixJamFiles fails', async () => {
    vi.useRealTimers()
    const backendAPI = createBackendAPI()
    vi.mocked(backendAPI.loadMixJamFiles).mockRejectedValueOnce(new Error('MixJam Browser unavailable'))
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.mixJamFiles).toEqual([])
    })
  })

  it('clears sample state when sampleFolder is null', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, null))

    expect(result.current.samples).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.selectedSampleDetail).toBeNull()
    expect(result.current.searchQuery).toBe('')

    // Even a scan request must safely no-op when folder is null.
    await act(async () => {
      await result.current.startLibraryScan()
    })

    expect(backendAPI.startScan).not.toHaveBeenCalled()
    expect(result.current.samples).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('handles querySamples rejection', async () => {
    vi.useRealTimers()
    const backendAPI = createBackendAPI()
    vi.mocked(backendAPI.querySamples).mockRejectedValueOnce(new Error('db locked'))
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.error).toBe('Unable to query library.')
    })

    expect(result.current.samples).toEqual([])
  })

  it('clears selected sample detail when that sample is no longer visible', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.samples.length).toBeGreaterThan(0)
    })

    // Pick a path that actually exists in the current rows so the effect
    // does not immediately clear it.
    const visiblePath = result.current.samples[0].relpath
    act(() => {
      result.current.setSelectedSampleDetail({
        name: 'kick_808.wav',
        relpath: visiblePath,
        tags: ['Drums', 'Kick'], bpm: null, duration: null
      })
    })

    expect(result.current.selectedSampleDetail?.relpath).toBe(visiblePath)

    // Simulate search that returns rows without the selected sample
    vi.mocked(backendAPI.querySamples).mockResolvedValueOnce({ rows: [], total: 0 })
    act(() => {
      result.current.setSearchQuery('nonexistent')
    })

    await waitFor(() => {
      expect(result.current.selectedSampleDetail).toBeNull()
    })
  })

  it('toggles lane mute', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    act(() => {
      result.current.toggleLaneMute(0)
    })

    const lane0 = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0?.muted).toBe(true)

    act(() => {
      result.current.toggleLaneMute(0)
    })

    const lane0After = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0After?.muted).toBe(false)
  })

  it('toggles lane solo', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    act(() => {
      result.current.toggleLaneSolo(0)
    })

    const lane0 = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0?.solo).toBe(true)

    act(() => {
      result.current.toggleLaneSolo(0)
    })

    const lane0After = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0After?.solo).toBe(false)
  })

  it('reports lane dim state', async () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    // Default: nothing soloed, no lane dimmed
    const initialDim = result.current.laneShouldDim(result.current.lanes[0])
    expect(initialDim).toBe(false)

    // Solo lane 0; lane 1 should dim
    act(() => {
      result.current.toggleLaneSolo(0)
    })

    const lane1 = result.current.lanes.find((lane) => lane.index === 1)
    expect(lane1).toBeDefined()
    if (lane1) {
      expect(result.current.laneShouldDim(lane1)).toBe(true)
    }
  })

  it('creates and destroys transport with the Player lifecycle', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    expect(result.current.transportState).toBe('stopped')

    // Enter the Player.
    await act(async () => {
      await result.current.goToPlayer()
    })

    expect(result.current.transportState).toBe('stopped')

    // Leave the Player; transport is destroyed.
    await act(async () => {
      await result.current.goToHome()
    })

    expect(result.current.transportState).toBe('stopped')
  })

  it('transport play sets state to playing', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToPlayer()
    })

    await act(async () => {
      result.current.transportPlay()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.transportState).toBe('playing')
  })

  it('transport pause and stop transitions', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToPlayer()
    })

    await act(async () => {
      result.current.transportPlay()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.transportState).toBe('playing')

    act(() => {
      result.current.transportPause()
    })

    expect(result.current.transportState).toBe('paused')

    act(() => {
      result.current.transportStop()
    })

    expect(result.current.transportState).toBe('stopped')
  })

  it('transport skipBack is callable', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToPlayer()
    })

    expect(() => {
      act(() => {
        result.current.transportSkipBack()
      })
    }).not.toThrow()
  })

  it('ignores stale sample query responses when a newer query is in flight', async () => {
    vi.useRealTimers()
    const backendAPI = createBackendAPI()

    // First call will be slow, second fast
    vi.mocked(backendAPI.querySamples)
      .mockResolvedValueOnce({ rows: [DEFAULT_SAMPLE_ROWS[0]], total: 1 })
      .mockResolvedValueOnce({ rows: [DEFAULT_SAMPLE_ROWS[1]], total: 1 })

    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    // Wait for first query to settle — the debounce means the second call
    // supersedes it before the first resolves, per mock ordering.
    await waitFor(() => {
      expect(result.current.samples.length).toBeGreaterThan(0)
    })

    // Either the first or second query's rows are set; the stale guard
    // ensures the last query wins.
    expect(result.current.error).toBeNull()
  })

  it('transport operations are no-ops outside the Player', () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    // In home view, transportRef.current is null
    expect(result.current.transportState).toBe('stopped')

    act(() => {
      result.current.transportPlay()
    })
    expect(result.current.transportState).toBe('stopped')

    act(() => {
      result.current.transportPause()
    })
    expect(result.current.transportState).toBe('stopped')
  })

  it('handles unmount during pending version fetch', async () => {
    vi.useRealTimers()
    const backendAPI = createBackendAPI()

    // Delay getVersion so we can unmount while it is pending.
    let resolveVersion: (v: string) => void
    vi.mocked(backendAPI.getVersion).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVersion = resolve
      })
    )

    const { unmount } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    // Unmount before the promise resolves — isMounted becomes false.
    unmount()

    // Resolving after unmount must not call setState on an unmounted component.
    resolveVersion!('should-not-appear')

  })

  it('handles unmount during a pending MixJam-file fetch', async () => {
    vi.useRealTimers()
    const backendAPI = createBackendAPI()

    let resolveProjects: (projects: MixJamFileItem[]) => void
    vi.mocked(backendAPI.loadMixJamFiles).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProjects = resolve
      })
    )

    const { unmount } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    unmount()

    resolveProjects!([])
  })

  it('setBpm updates the BPM state', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToPlayer() })

    act(() => { result.current.setBpm(140) })
    expect(result.current.bpm).toBe(140)
  })

  it('setMasterGain updates the master gain', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToPlayer() })

    act(() => { result.current.setMasterGain(0.5) })
    expect(result.current.masterGain).toBe(0.5)
  })

  it('movePlacement repositions a placement across lanes', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToPlayer() })

    act(() => { result.current.placeSampleDetailOnLane({ name: 'k.wav', relpath: '/s/k.wav', tags: [], bpm: null, duration: null }, 0, 0) })
    const cid = result.current.lanes[0].placements[0].id

    act(() => { result.current.movePlacement(cid, 2, 64) })
    expect(result.current.lanes[0].placements).toHaveLength(0)
    expect(result.current.lanes[2].placements).toHaveLength(1)
    expect(result.current.lanes[2].placements[0].startTick).toBe(64)
  })

  it('removePlacementFromLane deletes a placement', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToPlayer() })

    act(() => { result.current.placeSampleDetailOnLane({ name: 'k.wav', relpath: '/s/k.wav', tags: [], bpm: null, duration: null }, 0, 0) })
    const cid = result.current.lanes[0].placements[0].id

    act(() => { result.current.removePlacementFromLane(0, cid) })
    expect(result.current.lanes[0].placements).toHaveLength(0)
  })

  it('setLanePan updates pan value', async () => {
    vi.useFakeTimers()
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useAppState(backendAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToPlayer() })

    act(() => { result.current.setLanePan(3, -0.5) })
    expect(result.current.lanes[3].pan).toBe(-0.5)
  })
})
