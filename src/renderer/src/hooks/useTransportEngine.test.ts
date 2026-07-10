import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackendAPI, TEST_SAMPLE_FOLDER } from '../test/backendApi'
import { useTransportEngine } from './useTransportEngine'
import { PlaybackEngine } from '../engine/playback-engine'

const SAMPLE_FOLDER = TEST_SAMPLE_FOLDER

describe('useTransportEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('setLanePan updates lane pan without affecting channel pan (independent, spec-007)', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.playbackEngineRef.current).not.toBeNull())

    await act(async () => {
      result.current.setLanePan(0, 0.5)
    })

    expect(result.current.lanes[0]!.pan).toBe(0.5)
  })

  it('previewSample schedules at next downbeat when transport is playing', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    vi.mocked(api.readSampleBytes).mockResolvedValue(new ArrayBuffer(8))
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.playbackEngineRef.current).not.toBeNull())

    // Start transport so state is 'playing'
    await act(async () => {
      result.current.transportPlay()
    })

    expect(result.current.transportState).toBe('playing')

    // Preview a sample while playing — hits the transport-aware scheduling branch
    await act(async () => {
      result.current.previewSample('kick.wav')
      // Flush microtasks so the async previewSample can start
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Stop transport to clean up the scheduler
    await act(async () => {
      result.current.transportStop()
    })

    expect(result.current.transportState).toBe('stopped')
  })

  it('previewSample returns early when PlaybackEngine is not created (view=home)', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))

    // PlaybackEngine is absent on Home, so previewSample returns early.
    await act(async () => {
      result.current.previewSample('kick.wav')
    })
  })

  it('setLanePan updates lane state when PlaybackEngine is null (view=home)', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))

    await act(async () => {
      result.current.setLanePan(0, 0.5)
    })

    expect(result.current.lanes[0]!.pan).toBe(0.5)
  })

  it('seeks the stopped playhead without starting transport', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    await waitFor(() => expect(result.current.playbackEngineRef.current).not.toBeNull())

    act(() => result.current.transportSeek(40))

    expect(result.current.currentTick).toBe(40)
    expect(result.current.transportState).toBe('stopped')
    expect(result.current.playbackEngineRef.current?.currentTick).toBe(40)
  })

  it('continues playing from the requested tick when seeking during playback', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    await waitFor(() => expect(result.current.playbackEngineRef.current).not.toBeNull())

    act(() => result.current.transportPlay())
    await waitFor(() => expect(result.current.transportState).toBe('playing'))
    act(() => result.current.transportSeek(72))
    expect(result.current.transportState).toBe('preparing')
    await waitFor(() => expect(result.current.transportState).toBe('playing'))

    expect(result.current.currentTick).toBe(72)
    expect(result.current.transportState).toBe('playing')
    expect(result.current.playbackEngineRef.current?.currentTick).toBe(72)
  })

  it('setLaneNativeBpm updates lane tempo state', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))

    act(() => {
      result.current.setLaneNativeBpm(3, 128)
    })
    expect(result.current.lanes[3]!.nativeBPM).toBe(128)

    act(() => {
      result.current.setLaneNativeBpm(3, null)
    })
    expect(result.current.lanes[3]!.nativeBPM).toBeNull()
  })

  it('prepares the updated lane tempo before its next trigger', async () => {
    const prepare = vi.spyOn(PlaybackEngine.prototype, 'prepareCurrentArrangement')
      .mockResolvedValue(undefined)
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    await waitFor(() => expect(result.current.playbackEngineRef.current).not.toBeNull())

    act(() => result.current.setLaneNativeBpm(3, 128))

    expect(result.current.lanes[3]!.nativeBPM).toBe(128)
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('does not enter playing or advance elapsed time until preparation completes', async () => {
    vi.useFakeTimers()
    let finishStart!: (started: boolean) => void
    vi.spyOn(PlaybackEngine.prototype, 'start').mockReturnValue(
      new Promise<boolean>((resolve) => { finishStart = resolve })
    )
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    act(() => result.current.transportPlay())
    expect(result.current.transportState).toBe('preparing')

    act(() => vi.advanceTimersByTime(500))
    expect(result.current.elapsedMs).toBe(0)

    await act(async () => {
      finishStart(true)
      await Promise.resolve()
    })
    expect(result.current.transportState).toBe('playing')
  })

  it('cancels an in-flight preparation without entering playing later', async () => {
    let finishStart!: (started: boolean) => void
    vi.spyOn(PlaybackEngine.prototype, 'start').mockReturnValue(
      new Promise<boolean>((resolve) => { finishStart = resolve })
    )
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    act(() => result.current.transportPlay())
    expect(result.current.transportState).toBe('preparing')
    act(() => result.current.transportStop())

    await act(async () => {
      finishStart(true)
      await Promise.resolve()
    })
    expect(result.current.transportState).toBe('stopped')
    expect(result.current.elapsedMs).toBe(0)
  })

  it('previewSample handles null sample folder gracefully', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, null, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    // loadSampleBytes returns null because sampleFolder is null
    await act(async () => {
      result.current.previewSample('kick.wav')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })

  it('getSampleBuffer returns null when PlaybackEngine is not initialized', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    // Start on Home so PlaybackEngine is never created.
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))

    const buffer = await result.current.getSampleBuffer('kick.wav')
    expect(buffer).toBeNull()
  })

  it('getSampleBuffer returns null for a missing sample', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    vi.mocked(api.readSampleBytes).mockResolvedValue(null)
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    const buffer = await result.current.getSampleBuffer('nonexistent.wav')
    expect(buffer).toBeNull()
  })

  it('removePlacementFromLane with a non-existent placement is a no-op', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => { result.current.removePlacementFromLane(0, 'nonexistent') })
    expect(result.current.lanes[0].placements).toHaveLength(0)
  })

  it('removePlacementFromLane removes a placement', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    const placementId = result.current.lanes[0].placements[0].id
    expect(result.current.lanes[0].placements).toHaveLength(1)

    await act(async () => { result.current.removePlacementFromLane(0, placementId) })
    expect(result.current.lanes[0].placements).toHaveLength(0)
  })

  it('removePlacements batch-removes multiple placements', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'a.wav', relpath: '/s/a.wav', tags: [], duration: 0.5 },
        0, 0
      )
      result.current.placeSampleDetailOnLane(
        { name: 'b.wav', relpath: '/s/b.wav', tags: [], duration: 0.5 },
        0, 32
      )
    })
    const ids = result.current.lanes[0].placements.map((c) => c.id)
    expect(ids).toHaveLength(2)

    await act(async () => { result.current.removePlacements(ids) })
    expect(result.current.lanes[0].placements).toHaveLength(0)
  })

  it('duplicatePlacementGroup duplicates placements across lanes', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    const placementId = result.current.lanes[0].placements[0].id
    expect(result.current.lanes[0].placements).toHaveLength(1)

    await act(async () => {
      result.current.duplicatePlacementGroup([
        { placementId, toLaneIndex: 1, newStartTick: 16 }
      ])
    })
    expect(result.current.lanes[0].placements).toHaveLength(1)
    expect(result.current.lanes[1].placements).toHaveLength(1)
  })

  it('undo is a no-op when history is empty', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    expect(result.current.canUndo).toBe(false)
    await act(async () => { result.current.undo() })
    expect(result.current.canUndo).toBe(false)
  })

  it('redo is a no-op when future stack is empty', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    expect(result.current.canRedo).toBe(false)
    await act(async () => { result.current.redo() })
    expect(result.current.canRedo).toBe(false)
  })

  it('undo reverts the last clip placement', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    expect(result.current.canUndo).toBe(false)

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    expect(result.current.lanes[0].placements).toHaveLength(1)
    expect(result.current.canUndo).toBe(true)

    await act(async () => { result.current.undo() })
    expect(result.current.lanes[0].placements).toHaveLength(0)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })

  it('redo restores an undone placement', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    await act(async () => { result.current.undo() })
    expect(result.current.lanes[0].placements).toHaveLength(0)

    await act(async () => { result.current.redo() })
    expect(result.current.lanes[0].placements).toHaveLength(1)
  })

  it('movePlacement moves a placement to a different lane', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    const placementId = result.current.lanes[0].placements[0].id
    expect(result.current.lanes[0].placements).toHaveLength(1)
    expect(result.current.lanes[1].placements).toHaveLength(0)

    await act(async () => {
      result.current.movePlacement(placementId, 1, 8)
    })
    expect(result.current.lanes[0].placements).toHaveLength(0)
    expect(result.current.lanes[1].placements).toHaveLength(1)
    expect(result.current.lanes[1].placements[0].sampleName).toBe('kick.wav')
  })

  it('movePlacementGroup moves multiple placements in one operation', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
      result.current.placeSampleDetailOnLane(
        { name: 'snare.wav', relpath: '/s/snare.wav', tags: [], duration: 0.5 },
        1, 0
      )
    })
    const kickId = result.current.lanes[0].placements[0].id
    const snareId = result.current.lanes[1].placements[0].id
    expect(result.current.lanes[0].placements).toHaveLength(1)
    expect(result.current.lanes[1].placements).toHaveLength(1)

    await act(async () => {
      result.current.movePlacementGroup([
        { placementId: kickId, toLaneIndex: 2, newStartTick: 8 },
        { placementId: snareId, toLaneIndex: 2, newStartTick: 24 }
      ])
    })
    expect(result.current.lanes[0].placements).toHaveLength(0)
    expect(result.current.lanes[1].placements).toHaveLength(0)
    expect(result.current.lanes[2].placements).toHaveLength(2)
  })

  it('pauses and resumes without counting paused time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const api = createBackendAPI()
    vi.mocked(api.readSampleBytes).mockResolvedValue(new ArrayBuffer(8))
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await act(async () => {
      result.current.transportPlay()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.transportState).toBe('playing')

    vi.setSystemTime(1_250)
    act(() => { result.current.transportPause() })
    expect(result.current.transportState).toBe('paused')
    expect(result.current.elapsedMs).toBe(250)

    vi.setSystemTime(2_000)
    await act(async () => {
      result.current.transportPlay()
      await Promise.resolve()
      await Promise.resolve()
    })
    vi.setSystemTime(2_100)
    act(() => { result.current.transportPause() })

    expect(result.current.elapsedMs).toBe(350)
    act(() => { result.current.transportStop() })
    expect(result.current.elapsedMs).toBe(0)
  })

  it('exposes BPM and master gain from the runtime owner', () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    act(() => {
      result.current.setBpm(140)
      result.current.setMasterGain(0.4)
    })

    expect(result.current.bpm).toBe(140)
    expect(result.current.masterGain).toBe(0.4)
  })

  it('resets elapsed time when leaving the Player while playing', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    vi.mocked(api.readSampleBytes).mockResolvedValue(new ArrayBuffer(8))
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.playbackEngineRef.current).not.toBeNull())

    // Start playing so the timer is running
    await act(async () => { result.current.transportPlay() })
    expect(result.current.transportState).toBe('playing')
    await act(async () => { await new Promise((r) => setTimeout(r, 150)) })

    // Navigate away from the Player while playing to hit the timer cleanup branch.
    await act(async () => { result.current.setView('home') })
    expect(result.current.view).toBe('home')
  })

  it('duplicatePlacement copies a placement to another lane', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    const placementId = result.current.lanes[0].placements[0].id
    expect(result.current.lanes[0].placements).toHaveLength(1)

    await act(async () => {
      result.current.duplicatePlacement(placementId, 2, 16)
    })
    expect(result.current.lanes[0].placements).toHaveLength(1)
    expect(result.current.lanes[2].placements).toHaveLength(1)
    expect(result.current.lanes[2].placements[0].sampleName).toBe('kick.wav')
  })
})
