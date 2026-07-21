import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackendAPI, TEST_SAMPLE_FOLDER } from '../test/backendApi'
import { useTransportEngine, type TransportEngine } from './useTransportEngine'
import { PlaybackEngine } from '../engine/playback-engine'
import {
  addLane as addProjectLane,
  createDefaultFxBuses,
  createDefaultLanes,
  createDefaultMasterBusState,
  createDefaultProjectSongState,
  MAX_LANE_COUNT
} from '../project/project-state'
import { createDefaultEchoformDelayReturnModule } from '../engine/return-effects'

const SAMPLE_FOLDER = TEST_SAMPLE_FOLDER
const PLAYABLE_SAMPLE = {
  name: 'test.wav',
  relpath: 'test.wav',
  tags: [],
  bpm: 120,
  duration: 10,
  slot: 0
}

function placePlayableSample(result: { current: TransportEngine }): void {
  act(() => result.current.placeSampleDetailOnLane(PLAYABLE_SAMPLE, 0, 0))
}

describe('useTransportEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('replaces lanes and canonical Song settings through one project-state boundary', () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))
    const lanes = createDefaultLanes()
    lanes[0] = { ...lanes[0]!, name: 'Replacement lane' }
    const song = {
      bpm: 137,
      masterGain: 0.63,
      clipEdgeMicroFades: { enabled: false, fadeInMs: 1.5, fadeOutMs: 7 }
    }

    act(() => result.current.replaceProjectState({
      lanes,
      song,
      fxBuses: createDefaultFxBuses(),
      masterBus: createDefaultMasterBusState()
    }))

    expect(result.current.song).toEqual(song)
    expect(result.current.lanes[0]!.name).toBe('Replacement lane')
    expect(result.current.lanes).not.toBe(lanes)
  })

  it('restores the minimum lane when replacement is empty and will not delete it', () => {
    const { result } = renderHook(() => useTransportEngine(createBackendAPI(), SAMPLE_FOLDER, 'home'))
    act(() => result.current.replaceProjectState({
      lanes: [],
      fxBuses: createDefaultFxBuses(),
      masterBus: createDefaultMasterBusState(),
      song: {
        bpm: 120,
        masterGain: 0.8,
        clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
      }
    }))
    expect(result.current.lanes).toHaveLength(1)
    act(() => result.current.deleteLane(0))
    expect(result.current.lanes).toHaveLength(1)
  })

  it('undoes and redoes a committed Return FX edit in the project command history', () => {
    const { result } = renderHook(() => useTransportEngine(createBackendAPI(), SAMPLE_FOLDER, 'home'))
    act(() => result.current.setReturnBus({
      index: 0,
      module: createDefaultEchoformDelayReturnModule('fx-1'),
      powered: true,
      returnLevel: 0.65,
      limiterEnabled: false
    }))
    expect(result.current.fxBuses[0]).toMatchObject({
      module: { type: 'echoform-delay' },
      returnLevel: 0.65,
      limiterEnabled: false
    })
    act(() => result.current.undo())
    expect(result.current.fxBuses[0]).toMatchObject({ module: { type: 'empty' }, returnLevel: 1 })
    act(() => result.current.redo())
    expect(result.current.fxBuses[0]).toMatchObject({ module: { type: 'echoform-delay' }, returnLevel: 0.65 })
  })

  it('collapses live lane Mixer updates into one committed gesture', () => {
    const { result } = renderHook(() => useTransportEngine(createBackendAPI(), SAMPLE_FOLDER, 'home'))

    act(() => {
      result.current.beginMixerGesture()
      result.current.setLaneGain(0, 0.75)
      result.current.setLaneGain(0, 0.6)
      result.current.setLaneSend(0, 2, 0.25)
      result.current.setLaneSend(0, 2, 0.5)
      result.current.commitMixerGesture()
    })

    expect(result.current.lanes[0]).toMatchObject({ gain: 0.6, sends: [0, 0, 0.5, 0] })
    expect(result.current.canUndo).toBe(true)
    act(() => result.current.undo())
    expect(result.current.lanes[0]).toMatchObject({ gain: 0.8, sends: [0, 0, 0, 0] })
    expect(result.current.canUndo).toBe(false)
  })

  it('collapses live Return-level updates into one committed gesture', () => {
    const { result } = renderHook(() => useTransportEngine(createBackendAPI(), SAMPLE_FOLDER, 'home'))
    const original = result.current.fxBuses[0]

    act(() => {
      result.current.beginMixerGesture()
      result.current.setReturnBus({ ...original, returnLevel: 0.8 })
      result.current.setReturnBus({ ...original, returnLevel: 0.45 })
      result.current.commitMixerGesture()
    })

    expect(result.current.fxBuses[0].returnLevel).toBe(0.45)
    act(() => result.current.undo())
    expect(result.current.fxBuses[0].returnLevel).toBe(1)
    expect(result.current.canUndo).toBe(false)
  })

  it('does not create a Mixer history entry for an invalid send edit', () => {
    const { result } = renderHook(() => useTransportEngine(createBackendAPI(), SAMPLE_FOLDER, 'home'))

    act(() => {
      result.current.beginMixerGesture()
      result.current.setLaneSend(0, 4, 0.5)
      result.current.commitMixerGesture()
    })

    expect(result.current.canUndo).toBe(false)
  })

  it('leaves project state unchanged for invalid placement, BPM, and Return edits', () => {
    const { result } = renderHook(() => useTransportEngine(createBackendAPI(), SAMPLE_FOLDER, 'home'))
    const initialLanes = result.current.lanes
    const initialReturns = result.current.fxBuses

    act(() => {
      result.current.placeSampleDetailOnLane(PLAYABLE_SAMPLE, 0, Number.NaN)
      result.current.resolvePendingPlacementBpms(new Map())
      result.current.setReturnBus({
        index: 4,
        module: createDefaultEchoformDelayReturnModule('invalid-return'),
        powered: true,
        returnLevel: 0.5,
        limiterEnabled: false
      })
    })

    expect(result.current.lanes).toBe(initialLanes)
    expect(result.current.fxBuses).toBe(initialReturns)
    expect(result.current.canUndo).toBe(false)
  })

  it('adds and deletes lanes while enforcing the maximum lane count', () => {
    const { result } = renderHook(() => useTransportEngine(createBackendAPI(), SAMPLE_FOLDER, 'home'))

    act(() => result.current.addLane())
    expect(result.current.lanes).toHaveLength(9)
    act(() => result.current.deleteLane(8))
    expect(result.current.lanes).toHaveLength(8)

    let maxLanes = createDefaultLanes()
    while (maxLanes.length < MAX_LANE_COUNT) maxLanes = addProjectLane(maxLanes)
    act(() => result.current.replaceProjectState({
      lanes: maxLanes,
      fxBuses: createDefaultFxBuses(),
      masterBus: createDefaultMasterBusState(),
      song: createDefaultProjectSongState()
    }))
    act(() => result.current.addLane())

    expect(result.current.lanes).toHaveLength(MAX_LANE_COUNT)
    expect(result.current.canUndo).toBe(false)
  })

  it('setLanePan updates the project-owned pan used by the lane channel', async () => {
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
    placePlayableSample(result)

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

  it('renameLane updates the target lane name', () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))

    act(() => result.current.renameLane(3, '  Bass Groove  '))

    expect(result.current.lanes[3]!.name).toBe('Bass Groove')
    expect(result.current.lanes[2]!.name).toBe('Lane 3')
  })

  it('seeks the stopped playhead without starting transport', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    await waitFor(() => expect(result.current.playbackEngineRef.current).not.toBeNull())
    placePlayableSample(result)

    act(() => result.current.transportSeek(40))

    expect(result.current.currentTick).toBe(40)
    expect(result.current.transportState).toBe('stopped')
    expect(result.current.playbackEngineRef.current?.currentTick).toBe(40)
  })

  it('keeps Play and Jump to End stopped at tick zero for an empty song', () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    act(() => {
      result.current.transportPlay()
      result.current.transportJumpToEnd()
    })

    expect(result.current.songEndTick).toBe(0)
    expect(result.current.currentTick).toBe(0)
    expect(result.current.transportState).toBe('stopped')
  })

  it('Jump to End stops playback and parks at the exact latest placement end', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    placePlayableSample(result)

    act(() => result.current.transportPlay())
    await waitFor(() => expect(result.current.transportState).toBe('playing'))
    act(() => result.current.transportJumpToEnd())

    expect(result.current.songEndTick).toBe(160)
    expect(result.current.currentTick).toBe(160)
    expect(result.current.transportState).toBe('stopped')
    expect(result.current.playbackEngineRef.current?.currentTick).toBe(160)
  })

  it('restarts from tick zero when Play follows Jump to End during slow preparation', async () => {
    vi.useFakeTimers()
    let finishStart!: (started: boolean) => void
    vi.spyOn(PlaybackEngine.prototype, 'start').mockReturnValue(
      new Promise<boolean>((resolve) => { finishStart = resolve })
    )
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    placePlayableSample(result)

    act(() => result.current.transportJumpToEnd())
    expect(result.current.currentTick).toBe(160)
    expect(result.current.playbackEngineRef.current?.currentTick).toBe(160)

    act(() => result.current.transportPlay())
    expect(result.current.transportState).toBe('preparing')
    expect(result.current.currentTick).toBe(0)
    expect(result.current.playbackEngineRef.current?.currentTick).toBe(0)

    act(() => vi.advanceTimersByTime(200))
    expect(result.current.transportState).toBe('preparing')

    await act(async () => {
      finishStart(true)
      await Promise.resolve()
    })
    expect(result.current.transportState).toBe('playing')
    act(() => result.current.transportStop())
  })

  it('clamps a stopped playhead when an edit shortens the song behind it', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    placePlayableSample(result)
    const placementId = result.current.lanes[0]!.placements[0]!.id

    act(() => result.current.transportSeek(120))
    act(() => result.current.removePlacementFromLane(0, placementId))

    await waitFor(() => expect(result.current.currentTick).toBe(0))
    expect(result.current.songEndTick).toBe(0)
    expect(result.current.transportState).toBe('stopped')
  })

  it('continues playing from the requested tick when seeking during playback', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    placePlayableSample(result)
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

  it('automatically stops and resets after the exact placement end', async () => {
    vi.useRealTimers()
    let engineTick = 0
    vi.spyOn(PlaybackEngine.prototype, 'currentTick', 'get').mockImplementation(() => engineTick)
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    act(() => result.current.placeSampleDetailOnLane({
      ...PLAYABLE_SAMPLE,
      duration: 0.0625
    }, 0, 0))

    act(() => result.current.transportPlay())
    await waitFor(() => expect(result.current.transportState).toBe('playing'))
    engineTick = 1
    await waitFor(() => {
      expect(result.current.transportState).toBe('stopped')
      expect(result.current.currentTick).toBe(0)
    }, { timeout: 1_000 })
  })

  it('does not enter playing or advance elapsed time until preparation completes', async () => {
    vi.useFakeTimers()
    let finishStart!: (started: boolean) => void
    vi.spyOn(PlaybackEngine.prototype, 'start').mockReturnValue(
      new Promise<boolean>((resolve) => { finishStart = resolve })
    )
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    placePlayableSample(result)

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
    placePlayableSample(result)

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

  it('uses detected sample BPM to establish a stable placement musical span', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'slow-loop.wav', relpath: '/s/slow-loop.wav', tags: [], bpm: 60, duration: 4 },
        0, 0
      )
      result.current.placeSampleDetailOnLane(
        { name: 'unknown-loop.wav', relpath: '/s/unknown-loop.wav', tags: [], bpm: null, duration: 4 },
        1, 0
      )
    })

    expect(result.current.lanes[0].placements[0].durationTicks).toBe(32)
    expect(result.current.lanes[1].placements[0].durationTicks).toBe(64)
  })

  it('reuses the first project-owned span when the same unanalysed sample is placed after a BPM change', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'loop.wav', relpath: '/s/loop.wav', tags: [], bpm: null, duration: 4 },
        0, 0
      )
    })
    await act(async () => { result.current.setBpm(60) })
    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'loop.wav', relpath: '/s/loop.wav', tags: [], bpm: null, duration: 4 },
        1, 64
      )
    })

    expect(result.current.lanes[0].placements[0].durationTicks).toBe(64)
    expect(result.current.lanes[1].placements[0].durationTicks).toBe(64)
  })

  it('recomputes from sample metadata instead of choosing between conflicting spans', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))
    const lanes = createDefaultLanes()
    const sharedPlacement = {
      samplePath: '/s/loop.wav',
      sampleName: 'loop.wav',
      durationSeconds: 4,
      nativeBPM: null
    }
    lanes[0] = {
      ...lanes[0]!,
      placements: [{ ...sharedPlacement, id: 'first', startTick: 0, durationTicks: 32 }]
    }
    lanes[1] = {
      ...lanes[1]!,
      placements: [{ ...sharedPlacement, id: 'second', startTick: 64, durationTicks: 48 }]
    }

    await act(async () => {
      result.current.replaceProjectState({
        lanes,
        fxBuses: createDefaultFxBuses(),
        masterBus: createDefaultMasterBusState(),
        song: {
          bpm: 120,
          masterGain: 0.8,
          clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
        }
      })
      result.current.placeSampleDetailOnLane(
        { name: 'loop.wav', relpath: '/s/loop.wav', tags: [], bpm: null, duration: 4 },
        2,
        128
      )
    })

    expect(result.current.lanes[2].placements[0].durationTicks).toBe(64)
  })

  it('removePlacementFromLane removes a placement', async () => {
    vi.useRealTimers()
    const api = createBackendAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'player'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], bpm: null, duration: 0.5 },
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
        { name: 'a.wav', relpath: '/s/a.wav', tags: [], bpm: null, duration: 0.5 },
        0, 0
      )
      result.current.placeSampleDetailOnLane(
        { name: 'b.wav', relpath: '/s/b.wav', tags: [], bpm: null, duration: 0.5 },
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
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], bpm: null, duration: 0.5 },
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
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], bpm: null, duration: 0.5 },
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
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], bpm: null, duration: 0.5 },
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
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], bpm: null, duration: 0.5 },
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
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], bpm: null, duration: 0.5 },
        0, 0
      )
      result.current.placeSampleDetailOnLane(
        { name: 'snare.wav', relpath: '/s/snare.wav', tags: [], bpm: null, duration: 0.5 },
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
    placePlayableSample(result)

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
    placePlayableSample(result)

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
        { name: 'kick.wav', relpath: '/s/kick.wav', tags: [], bpm: null, duration: 0.5 },
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
