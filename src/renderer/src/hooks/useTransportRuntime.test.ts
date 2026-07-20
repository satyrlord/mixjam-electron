import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackendAPI } from '../test/backendApi'
import { useTransportRuntime } from './useTransportRuntime'
import { PlaybackEngine, type PlaybackProjectGraphSnapshot } from '../engine/playback-engine'
import { createDefaultEchoformDelayReturnModule } from '../engine/return-effects'

const EMPTY_GRAPH: PlaybackProjectGraphSnapshot = { channels: [], returns: [] }

describe('useTransportRuntime', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps inactive controls safe when no playback engine exists', async () => {
    const { result } = renderHook(() => useTransportRuntime({
      backendAPI: createBackendAPI(),
      sampleFolder: null,
      active: false,
      getLanes: () => [],
      getProjectGraphSnapshot: () => EMPTY_GRAPH,
      songEndTick: 0,
      initialBpm: 120,
      initialMasterGain: 0.8
    }))

    act(() => {
      result.current.transportPlay()
      result.current.transportSkipBack()
      result.current.transportSeek(32)
      result.current.setBpm(128)
      result.current.previewSample('kick.wav')
      result.current.setMasterGain(0.5)
    })

    await expect(result.current.getSampleBuffer('kick.wav')).resolves.toBeNull()
    expect(result.current.transportState).toBe('stopped')
    expect(result.current.currentTick).toBe(0)
    expect(result.current.bpm).toBe(128)
    expect(result.current.masterGain).toBe(0.5)
  })

  it('does not commit unchanged stopped meter snapshots every 100 ms', () => {
    vi.useFakeTimers()
    let renderCount = 0
    const getLanes = () => []
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => {
      renderCount += 1
      return useTransportRuntime({
        backendAPI,
        sampleFolder: null,
        active: true,
        getLanes,
        getProjectGraphSnapshot: () => EMPTY_GRAPH,
        songEndTick: 0,
        initialBpm: 120,
        initialMasterGain: 0.8
      })
    })
    const renderCountAfterMount = renderCount

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.transportState).toBe('stopped')
    expect(renderCount).toBe(renderCountAfterMount)
  })

  it('does not read or decode arrangement samples for a stopped BPM edit', () => {
    const backendAPI = createBackendAPI()
    const readSampleBytes = vi.mocked(backendAPI.readSampleBytes)
    const sampleFolder = { id: 'samples', name: 'Samples' }
    const getLanes = () => [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }]
    }]
    const { result } = renderHook(() => useTransportRuntime({
      backendAPI,
      sampleFolder,
      active: true,
      getLanes,
      getProjectGraphSnapshot: () => EMPTY_GRAPH,
      songEndTick: 8,
      initialBpm: 120,
      initialMasterGain: 0.8
    }))

    act(() => result.current.setBpm(128))

    expect(readSampleBytes).not.toHaveBeenCalled()
  })

  it('hydrates every replacement engine from the complete current project graph', () => {
    const graph: PlaybackProjectGraphSnapshot = {
      channels: [{
        laneId: 'lane-1',
        channelIndex: 0,
        gain: 0.37,
        pan: -0.6,
        muted: true,
        solo: false,
        sends: [0.1, 0.2, 0.3, 0.4]
      }],
      returns: [{
        index: 0,
        module: createDefaultEchoformDelayReturnModule('fx-1'),
        powered: false,
        returnLevel: 0.55,
        limiterEnabled: false
      }]
    }
    const apply = vi.spyOn(PlaybackEngine.prototype, 'applyProjectGraphSnapshot')
      .mockImplementation(() => undefined)
    const backendAPI = createBackendAPI()
    const getLanes = () => []
    const getProjectGraphSnapshot = () => graph
    const { rerender } = renderHook(
      ({ sampleFolder }) => useTransportRuntime({
        backendAPI,
        sampleFolder,
        active: true,
        getLanes,
        getProjectGraphSnapshot,
        songEndTick: 0,
        initialBpm: 120,
        initialMasterGain: 0.8
      }),
      { initialProps: { sampleFolder: { id: 'samples-a', name: 'Samples A' } } }
    )

    expect(apply).toHaveBeenLastCalledWith(graph)
    rerender({ sampleFolder: { id: 'samples-b', name: 'Samples B' } })
    expect(apply).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenLastCalledWith(graph)
  })

  it('keeps the engine while lane and graph getters receive new closures', () => {
    const backendAPI = createBackendAPI()
    const sampleFolder = { id: 'samples', name: 'Samples' }
    const apply = vi.spyOn(PlaybackEngine.prototype, 'applyProjectGraphSnapshot')
      .mockImplementation(() => undefined)
    const { result, rerender } = renderHook(
      ({ generation }) => useTransportRuntime({
        backendAPI,
        sampleFolder,
        active: true,
        getLanes: () => generation === 1 ? [] : [],
        getProjectGraphSnapshot: () => EMPTY_GRAPH,
        songEndTick: 0,
        initialBpm: 120,
        initialMasterGain: 0.8
      }),
      { initialProps: { generation: 1 } }
    )
    const engine = result.current.playbackEngineRef.current
    const applyCount = apply.mock.calls.length

    rerender({ generation: 2 })

    expect(result.current.playbackEngineRef.current).toBe(engine)
    expect(apply).toHaveBeenCalledTimes(applyCount)
  })
})
