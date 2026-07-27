import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackendAPI } from '../test/backendApi'
import { useTransportRuntime } from './useTransportRuntime'
import { PlaybackEngine } from '../engine/playback-engine'

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
    expect(result.current.tickStore.get()).toBe(0)
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

  it('advances the tick store on the poll interval without re-rendering the consumer', () => {
    vi.useFakeTimers()
    let engineTick = 0
    vi.spyOn(PlaybackEngine.prototype, 'currentTick', 'get').mockImplementation(() => engineTick)
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
        songEndTick: 160,
        initialBpm: 120,
        initialMasterGain: 0.8
      })
    })
    const renderCountAfterMount = renderCount

    act(() => {
      engineTick = 24
      vi.advanceTimersByTime(500)
    })

    expect(result.current.tickStore.get()).toBe(24)
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
      songEndTick: 8,
      initialBpm: 120,
      initialMasterGain: 0.8
    }))

    act(() => result.current.setBpm(128))

    expect(readSampleBytes).not.toHaveBeenCalled()
  })

  it('announces every replacement engine to the graph owner', () => {
    const backendAPI = createBackendAPI()
    const getLanes = () => []
    const { result, rerender } = renderHook(
      ({ sampleFolder }) => useTransportRuntime({
        backendAPI,
        sampleFolder,
        active: true,
        getLanes,
        songEndTick: 0,
        initialBpm: 120,
        initialMasterGain: 0.8
      }),
      { initialProps: { sampleFolder: { id: 'samples-a', name: 'Samples A' } } }
    )

    const firstRevision = result.current.playbackEngineRevision
    expect(firstRevision).toBeGreaterThan(0)
    rerender({ sampleFolder: { id: 'samples-b', name: 'Samples B' } })
    expect(result.current.playbackEngineRevision).toBeGreaterThan(firstRevision)
  })

  it('keeps the engine while the lane getter receives a new closure', () => {
    const backendAPI = createBackendAPI()
    const sampleFolder = { id: 'samples', name: 'Samples' }
    const { result, rerender } = renderHook(
      ({ generation }) => useTransportRuntime({
        backendAPI,
        sampleFolder,
        active: true,
        getLanes: () => generation === 1 ? [] : [],
        songEndTick: 0,
        initialBpm: 120,
        initialMasterGain: 0.8
      }),
      { initialProps: { generation: 1 } }
    )
    const engine = result.current.playbackEngineRef.current
    const revision = result.current.playbackEngineRevision

    rerender({ generation: 2 })

    expect(result.current.playbackEngineRef.current).toBe(engine)
    expect(result.current.playbackEngineRevision).toBe(revision)
  })
})
