import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackEngine, PlaybackReturnSnapshot } from '../engine/playback-engine'
import { createDefaultLanes, type LaneState } from '../project/project-state'
import { createEmptyReturnModule } from '../engine/return-effects'
import { createDefaultFxBuses } from '../project/project-state'
import { useMixer } from './useMixer'

function engineStub() {
  return {
    activeVoiceCount: 0,
    applyProjectGraphSnapshot: vi.fn(),
    applyReturnSnapshot: vi.fn(),
    getChannelAnalyser: vi.fn()
  }
}

function returnBus(index: number, returnLevel = 1): PlaybackReturnSnapshot {
  return {
    index,
    module: createEmptyReturnModule(`fx-${index + 1}`),
    powered: true,
    returnLevel,
    limiterEnabled: true
  }
}

describe('useMixer', () => {
  let callbacks: FrameRequestCallback[]

  beforeEach(() => {
    callbacks = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('applies lane-derived channels and four default Returns only in Player view', () => {
    const engine = engineStub()
    const playbackEngineRef = { current: engine as unknown as PlaybackEngine }
    const lanes = createDefaultLanes().slice(0, 2)
    const { rerender } = renderHook(
      ({ view, snapshot }: { view: string; snapshot: LaneState[] }) =>
        useMixer(playbackEngineRef, view, snapshot, createDefaultFxBuses()),
      { initialProps: { view: 'home', snapshot: lanes } }
    )
    expect(engine.applyProjectGraphSnapshot).not.toHaveBeenCalled()

    rerender({ view: 'player', snapshot: lanes })
    expect(engine.applyProjectGraphSnapshot).toHaveBeenLastCalledWith({
      channels: expect.arrayContaining([expect.objectContaining({ channelIndex: 0 })]),
      returns: expect.arrayContaining([
        expect.objectContaining({ index: 0 }),
        expect.objectContaining({ index: 3 })
      ])
    })
  })

  it('derives and previews Return snapshots without aliasing modules', () => {
    const engine = engineStub()
    const playbackEngineRef = { current: engine as unknown as PlaybackEngine }
    const fxBuses = createDefaultFxBuses()
    fxBuses.forEach((bus) => { bus.returnLevel = 0.5 })
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'player', [], fxBuses))
    expect(result.current.returnBuses.every((bus) => bus.returnLevel === 0.5)).toBe(true)
    expect(result.current.returnBuses[0].module).not.toBe(fxBuses[0].module)

    const updated = { ...returnBus(2, 0.7) }

    act(() => result.current.previewReturnBus(updated))
    expect(engine.applyReturnSnapshot).toHaveBeenLastCalledWith([
      expect.objectContaining({ index: 2, returnLevel: 0.7 })
    ])
  })

  it('runs telemetry only while active and publishes analyser levels and peaks', () => {
    const engine = engineStub()
    engine.activeVoiceCount = 1
    const analyser = {
      fftSize: 4,
      getFloatTimeDomainData: vi.fn((buffer: Float32Array) => buffer.fill(0.5))
    }
    engine.getChannelAnalyser.mockReturnValue(analyser)
    const playbackEngineRef = { current: engine as unknown as PlaybackEngine }
    const { result, unmount } = renderHook(() => useMixer(
      playbackEngineRef,
      'player',
      createDefaultLanes().slice(0, 1),
      createDefaultFxBuses()
    ))

    expect(callbacks).toHaveLength(0)
    act(() => result.current.setVisualTelemetryActive(true))
    expect(callbacks).toHaveLength(1)
    act(() => callbacks.shift()!(100))
    expect(result.current.channelLevels.get(0)).toBeCloseTo(-6.0206, 3)
    expect(result.current.channelPeaks.get(0)).toBeCloseTo(-6.0206, 3)

    act(() => callbacks.shift()!(200))
    expect(analyser.getFloatTimeDomainData).toHaveBeenCalledTimes(2)
    unmount()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('handles missing engines, missing analysers, silence decay, and storage failure', () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    const playbackEngineRef = { current: null as PlaybackEngine | null }
    const lanes = createDefaultLanes().slice(0, 1)
    const { result } = renderHook(() => useMixer(
      playbackEngineRef,
      'player',
      lanes,
      createDefaultFxBuses()
    ))
    act(() => result.current.setVisualTelemetryActive(true))
    act(() => callbacks.shift()!(0))

    const engine = engineStub()
    engine.activeVoiceCount = 1
    playbackEngineRef.current = engine as unknown as PlaybackEngine
    act(() => callbacks.shift()!(100))
    expect(result.current.channelLevels.get(0)).toBe(-100)

    const analyser = {
      fftSize: 2,
      getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(1)
    }
    engine.getChannelAnalyser.mockReturnValue(analyser)
    act(() => callbacks.shift()!(200))
    expect(result.current.channelLevels.get(0)).toBe(0)

    engine.activeVoiceCount = 0
    act(() => callbacks.shift()!(300))
    expect(result.current.channelLevels.get(0)).toBe(-100)
    expect(result.current.channelPeaks.get(0)).toBe(-100)
    expect(remove).toHaveBeenCalledWith('mixjam-mixer-channels')
  })
})
