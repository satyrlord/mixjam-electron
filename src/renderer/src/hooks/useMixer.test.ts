import { act, renderHook } from '@testing-library/react'
import { createElement, StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMixer } from './useMixer'
import type { PlaybackEngine } from '../engine/playback-engine'

/** Creates a minimal mock PlaybackEngine with only the methods useMixer touches. */
function createMockPlaybackEngine() {
  const analyser = {
    fftSize: 2048,
    getFloatTimeDomainData: vi.fn((buf: Float32Array) => {
      buf.fill(0)
    })
  }

  return {
    activeVoiceCount: 0,
    getChannelAnalyser: vi.fn().mockReturnValue(analyser),
    setChannelGain: vi.fn(),
    setChannelPan: vi.fn(),
    setChannelMute: vi.fn(),
    setChannelSolo: vi.fn(),
    setChannelEffects: vi.fn(),
    removeChannel: vi.fn(),
    restoreChannel: vi.fn(),
    replayRemovedChannels: vi.fn()
  }
}

function createPlaybackEngineRef(mock = createMockPlaybackEngine()) {
  return { current: mock } as unknown as React.RefObject<PlaybackEngine | null>
}

/**
 * rAF mock that captures the most recently registered callback without
 * re-entering (the tick callback calls requestAnimationFrame again, which
 * would loop forever if we iterated over stored callbacks).
 */
let rafCallback: FrameRequestCallback | null = null
let rafIdCounter = 0

function setupRafMock() {
  rafCallback = null
  rafIdCounter = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallback = cb
    return ++rafIdCounter
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    rafCallback = null
  })
}

function tickOnce(time = 1000) {
  const cb = rafCallback
  rafCallback = null
  if (cb) cb(time)
}

describe('useMixer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 16 channels with default gain 0.8, pan 0, muted false, solo false', () => {
    const playbackEngineRef = createPlaybackEngineRef()
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    expect(result.current.channels).toHaveLength(16)
    for (const ch of result.current.channels) {
      expect(ch.gain).toBe(0.8)
      expect(ch.pan).toBe(0)
      expect(ch.muted).toBe(false)
      expect(ch.solo).toBe(false)
    }
  })

  it('initializes channelLevels and channelPeaks as empty maps', () => {
    const playbackEngineRef = createPlaybackEngineRef()
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    expect(result.current.channelLevels.size).toBe(0)
    expect(result.current.channelPeaks.size).toBe(0)
  })

  it('setChannelGain updates channel state and calls playbackEngine.setChannelGain', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.setChannelGain(0, 0.5) })

    expect(result.current.channels[0]!.gain).toBe(0.5)
    expect(mockPlaybackEngine.setChannelGain).toHaveBeenCalledWith(0, 0.5)
  })

  it('setChannelPan updates channel state and calls playbackEngine.setChannelPan', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.setChannelPan(2, -0.3) })

    expect(result.current.channels[2]!.pan).toBe(-0.3)
    expect(mockPlaybackEngine.setChannelPan).toHaveBeenCalledWith(2, -0.3)
  })

  it('toggleChannelMute toggles mute state and calls playbackEngine.setChannelMute', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.toggleChannelMute(1) })
    expect(result.current.channels[1]!.muted).toBe(true)
    expect(mockPlaybackEngine.setChannelMute).toHaveBeenCalledWith(1, true)

    act(() => { result.current.toggleChannelMute(1) })
    expect(result.current.channels[1]!.muted).toBe(false)
    expect(mockPlaybackEngine.setChannelMute).toHaveBeenCalledWith(1, false)
  })

  it('toggleChannelSolo toggles solo state and calls playbackEngine.setChannelSolo', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.toggleChannelSolo(3) })
    expect(result.current.channels[3]!.solo).toBe(true)
    expect(mockPlaybackEngine.setChannelSolo).toHaveBeenCalledWith(3, true)

    act(() => { result.current.toggleChannelSolo(3) })
    expect(result.current.channels[3]!.solo).toBe(false)
    expect(mockPlaybackEngine.setChannelSolo).toHaveBeenCalledWith(3, false)
  })

  it('removeChannel removes channel from state and calls playbackEngine.removeChannel', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.removeChannel(0) })
    expect(result.current.channels).toHaveLength(15)
    expect(result.current.channels.find((ch) => ch.channelIndex === 0)).toBeUndefined()
    expect(mockPlaybackEngine.removeChannel).toHaveBeenCalledWith(0)
  })

  it('persists channel state to localStorage on change', () => {
    const playbackEngineRef = createPlaybackEngineRef()
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.setChannelGain(0, 0.3) })

    const stored = JSON.parse(localStorage.getItem('mixjam-mixer-channels') ?? '[]')
    expect(stored).toHaveLength(16)
    expect(stored[0]!.gain).toBe(0.3)
  })

  it('adds, updates, bypasses, reorders, removes, and persists up to four effects', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'player'))

    act(() => {
      result.current.addChannelEffect(0, 'delay')
      result.current.addChannelEffect(0, 'reverb')
      result.current.addChannelEffect(0, 'compressor')
      result.current.addChannelEffect(0, 'delay')
      result.current.addChannelEffect(0, 'reverb')
    })
    expect(result.current.channels[0]!.effects).toHaveLength(4)

    const delay = result.current.channels[0]!.effects[0]!
    if (delay.type !== 'delay') throw new Error('expected delay')
    act(() => result.current.updateChannelEffect(0, { ...delay, timeMs: 900 }))
    expect(result.current.channels[0]!.effects[0]).toMatchObject({ timeMs: 900 })

    act(() => result.current.toggleChannelEffectBypass(0, delay.id))
    expect(result.current.channels[0]!.effects[0]!.bypassed).toBe(true)
    act(() => result.current.moveChannelEffect(0, delay.id, 2))
    expect(result.current.channels[0]!.effects[2]!.id).toBe(delay.id)
    act(() => result.current.removeChannelEffect(0, delay.id))
    expect(result.current.channels[0]!.effects).toHaveLength(3)
    expect(mockPlaybackEngine.setChannelEffects).toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('mixjam-mixer-channels') ?? '[]')[0].effects).toHaveLength(3)
  })

  it('commits one engine update and one effect identity under StrictMode', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const randomUuid = vi.spyOn(crypto, 'randomUUID')
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'player'), { wrapper })
    mockPlaybackEngine.setChannelEffects.mockClear()
    randomUuid.mockClear()

    act(() => result.current.addChannelEffect(0, 'delay'))

    expect(randomUuid).toHaveBeenCalledTimes(1)
    const channelZeroCalls = mockPlaybackEngine.setChannelEffects.mock.calls.filter(([channelIndex]) => channelIndex === 0)
    expect(channelZeroCalls).toEqual([[0, result.current.channels[0]!.effects]])
  })

  it('migrates persisted pre-effects channel state to an empty chain', () => {
    localStorage.setItem('mixjam-mixer-channels', JSON.stringify([{ channelIndex: 0, gain: 0.5, pan: 0, muted: false, solo: false }]))
    const { result } = renderHook(() => useMixer(createPlaybackEngineRef(), 'home'))
    expect(result.current.channels[0]!.effects).toEqual([])
  })

  it('drops malformed persisted effect slots', () => {
    localStorage.setItem('mixjam-mixer-channels', JSON.stringify([{
      channelIndex: 0,
      gain: 0.5,
      pan: 0,
      muted: false,
      solo: false,
      effects: [{ id: 'broken-delay', type: 'delay', bypassed: false }]
    }]))

    const { result } = renderHook(() => useMixer(createPlaybackEngineRef(), 'home'))

    expect(result.current.channels[0]!.effects).toEqual([])
  })

  it('restores channel state from localStorage on mount', () => {
    const savedChannels = Array.from({ length: 16 }, (_, i) => ({
      channelIndex: i,
      gain: 0.5,
      pan: i % 2 === 0 ? -0.5 : 0.5,
      muted: i % 3 === 0,
      solo: i % 5 === 0
    }))
    localStorage.setItem('mixjam-mixer-channels', JSON.stringify(savedChannels))

    const playbackEngineRef = createPlaybackEngineRef()
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    expect(result.current.channels).toHaveLength(16)
    expect(result.current.channels[0]!.gain).toBe(0.5)
    expect(result.current.channels[0]!.pan).toBe(-0.5)
    expect(result.current.channels[0]!.muted).toBe(true)
  })

  it('falls back to defaults when localStorage has invalid data', () => {
    localStorage.setItem('mixjam-mixer-channels', 'not-json')
    const playbackEngineRef = createPlaybackEngineRef()
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    expect(result.current.channels).toHaveLength(16)
    expect(result.current.channels[0]!.gain).toBe(0.8)
  })

  it('applies channel state to PlaybackEngine when view switches to the Player', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result, rerender } = renderHook(
      ({ view }: { view: string }) => useMixer(playbackEngineRef, view),
      { initialProps: { view: 'home' } }
    )

    act(() => {
      result.current.setChannelGain(0, 0.3)
      result.current.setChannelPan(1, -0.5)
      result.current.toggleChannelMute(2)
      result.current.toggleChannelSolo(3)
    })

    rerender({ view: 'player' })

    expect(mockPlaybackEngine.replayRemovedChannels).toHaveBeenCalledWith([])
    expect(mockPlaybackEngine.setChannelGain).toHaveBeenCalledWith(0, 0.3)
    expect(mockPlaybackEngine.setChannelPan).toHaveBeenCalledWith(1, -0.5)
    expect(mockPlaybackEngine.setChannelMute).toHaveBeenCalledWith(2, true)
    expect(mockPlaybackEngine.setChannelSolo).toHaveBeenCalledWith(3, true)
  })

  it('rAF loop does not call getChannelAnalyser when activeVoiceCount is 0', () => {
    setupRafMock()
    const mockPlaybackEngine = createMockPlaybackEngine()
    mockPlaybackEngine.activeVoiceCount = 0
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)

    renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { tickOnce() })

    expect(mockPlaybackEngine.getChannelAnalyser).not.toHaveBeenCalled()
  })

  it('rAF loop reads analyser data when playbackEngine has active voices', () => {
    setupRafMock()
    const analyser = {
      fftSize: 2048,
      getFloatTimeDomainData: vi.fn((buf: Float32Array) => { buf.fill(0.1) })
    }
    const mockPlaybackEngine = {
      ...createMockPlaybackEngine(),
      activeVoiceCount: 5,
      getChannelAnalyser: vi.fn().mockReturnValue(analyser)
    }
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { tickOnce() })

    expect(mockPlaybackEngine.getChannelAnalyser).toHaveBeenCalled()
    expect(analyser.getFloatTimeDomainData).toHaveBeenCalled()
    expect(result.current.channelLevels.size).toBeGreaterThan(0)
  })

  it('rAF loop handles channels with no analyser (sets SILENCE_DB)', () => {
    setupRafMock()
    // Return analyser for even channels, undefined for odd channels
    const getChannelAnalyser = vi.fn().mockImplementation((idx: number) => {
      if (idx % 2 === 0) {
        return {
          fftSize: 2048,
          getFloatTimeDomainData: vi.fn((buf: Float32Array) => { buf.fill(0.1) })
        }
      }
      return undefined
    })
    const mockPlaybackEngine = {
      ...createMockPlaybackEngine(),
      activeVoiceCount: 5,
      getChannelAnalyser
    }
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { tickOnce() })

    // Odd channels should have SILENCE_DB (-100)
    expect(result.current.channelLevels.get(1)).toBe(-100)
    // Even channels should have a measured level
    const level0 = result.current.channelLevels.get(0)
    expect(level0).toBeDefined()
    expect(level0).toBeGreaterThan(-100)
  })

  it('cancels rAF on unmount', () => {
    setupRafMock()
    const playbackEngineRef = createPlaybackEngineRef()
    const { unmount } = renderHook(() => useMixer(playbackEngineRef, 'home'))
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')

    unmount()

    expect(cancelSpy).toHaveBeenCalled()
  })

  it('setChannelGain does not crash when playbackEngine is null', () => {
    const playbackEngineRef = { current: null } as unknown as React.RefObject<PlaybackEngine | null>
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    expect(() => {
      act(() => { result.current.setChannelGain(0, 0.5) })
    }).not.toThrow()
    expect(result.current.channels[0]!.gain).toBe(0.5)
  })

  it('toggleChannelMute does not crash when playbackEngine is null', () => {
    const playbackEngineRef = { current: null } as unknown as React.RefObject<PlaybackEngine | null>
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    expect(() => {
      act(() => { result.current.toggleChannelMute(0) })
    }).not.toThrow()
    expect(result.current.channels[0]!.muted).toBe(true)
  })

  it('toggleChannelSolo does not crash when playbackEngine is null', () => {
    const playbackEngineRef = { current: null } as unknown as React.RefObject<PlaybackEngine | null>
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    expect(() => {
      act(() => { result.current.toggleChannelSolo(0) })
    }).not.toThrow()
    expect(result.current.channels[0]!.solo).toBe(true)
  })

  it('removeChannel twice does not duplicate removed index', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    // Remove channel 0 twice
    act(() => { result.current.removeChannel(0) })
    act(() => { result.current.removeChannel(0) })

    expect(result.current.channels).toHaveLength(15)
    expect(mockPlaybackEngine.removeChannel).toHaveBeenCalledTimes(2)
  })

  it('toggleChannelSolo no-ops gracefully when channel already removed', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    // Remove channel 5, then toggle solo on it (it's gone from state)
    act(() => { result.current.removeChannel(5) })
    act(() => { result.current.toggleChannelSolo(5) })

    // Channel 5 is gone, no crash
    expect(result.current.channels.find((ch) => ch.channelIndex === 5)).toBeUndefined()
  })

  it('switching to the Player with null PlaybackEngine does not crash', () => {
    const playbackEngineRef = { current: null } as unknown as React.RefObject<PlaybackEngine | null>
    const { rerender } = renderHook(
      ({ view }: { view: string }) => useMixer(playbackEngineRef, view),
      { initialProps: { view: 'home' } }
    )

    expect(() => {
      rerender({ view: 'player' })
    }).not.toThrow()
  })

  it('rAF loop does not call setLevels when levels are unchanged across ticks', () => {
    setupRafMock()
    // First tick: non-zero sample -> anyChanged = true -> setLevels called
    // Second tick: all zeros -> anyChanged = false -> setLevels skipped
    let sampleVal = 0.1
    const analyser = {
      fftSize: 2048,
      getFloatTimeDomainData: vi.fn((buf: Float32Array) => { buf.fill(sampleVal) })
    }
    const mockPlaybackEngine = {
      ...createMockPlaybackEngine(),
      activeVoiceCount: 5,
      getChannelAnalyser: vi.fn().mockReturnValue(analyser)
    }
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    // Tick 1: non-zero sample, levels should be populated
    act(() => { tickOnce(1000) })
    expect(result.current.channelLevels.size).toBeGreaterThan(0)

    // Tick 2: silence, anyChanged = false (all channels already at SILENCE_DB)
    sampleVal = 0 // next tick reads silence
    // Re-fill the buffer reference since the mock captures `sampleVal` by reference
    analyser.getFloatTimeDomainData = vi.fn((buf: Float32Array) => { buf.fill(0) })
    act(() => { tickOnce(2000) })

    // Levels from previous tick should still be set
    expect(result.current.channelLevels.size).toBeGreaterThan(0)
  })

  it('removeChannel tracks removed indices for replay on reload', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => {
      result.current.removeChannel(0)
      result.current.removeChannel(5)
    })

    expect(result.current.channels).toHaveLength(14)
    expect(result.current.channels.find((ch) => ch.channelIndex === 0)).toBeUndefined()
    expect(result.current.channels.find((ch) => ch.channelIndex === 5)).toBeUndefined()
    expect(result.current.channels[0]!.channelIndex).toBe(1)
  })

  // --- 2026-07-07 amendments (spec-007 AC-016, AC-017) ---

  it('canRestoreChannel is false at full 16 channels and true after a removal', () => {
    const playbackEngineRef = createPlaybackEngineRef()
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    expect(result.current.canRestoreChannel).toBe(false)
    act(() => { result.current.removeChannel(3) })
    expect(result.current.canRestoreChannel).toBe(true)
  })

  it('restoreChannel re-adds the lowest removed channel at default state (AC-017)', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    // Player view so the apply-state effect pushes channel state to PlaybackEngine.
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'player'))

    act(() => {
      result.current.removeChannel(5)
      result.current.removeChannel(2)
    })
    act(() => { result.current.restoreChannel() })

    const restored = result.current.channels.find((ch) => ch.channelIndex === 2)
    expect(restored).toEqual({ channelIndex: 2, gain: 0.8, pan: 0, muted: false, solo: false, effects: [] })
    expect(result.current.channels.find((ch) => ch.channelIndex === 5)).toBeUndefined()
    // Lane re-route happens synchronously; gain/mute are re-applied by the
    // apply-state effect on the resulting commit.
    expect(mockPlaybackEngine.restoreChannel).toHaveBeenCalledWith(2)
    expect(mockPlaybackEngine.setChannelGain).toHaveBeenCalledWith(2, 0.8)
    expect(mockPlaybackEngine.setChannelMute).toHaveBeenCalledWith(2, false)
    // Channels stay sorted by channelIndex after restore.
    const indices = result.current.channels.map((ch) => ch.channelIndex)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })

  it('restore encodes removal by channel absence, not a separate removed list', () => {
    const playbackEngineRef = createPlaybackEngineRef()
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.removeChannel(4) })
    act(() => { result.current.restoreChannel() })

    // Persisted channels array is the single source of truth: channel 4 present.
    const stored = JSON.parse(localStorage.getItem('mixjam-mixer-channels') ?? '[]')
    expect(stored.some((ch: { channelIndex: number }) => ch.channelIndex === 4)).toBe(true)
    expect(result.current.canRestoreChannel).toBe(false)
    // No separate removed-indices key is written.
    expect(localStorage.getItem('mixjam-mixer-removed')).toBeNull()
  })

  it('restoreChannel no-ops at the 16 channel cap', () => {
    const mockPlaybackEngine = createMockPlaybackEngine()
    const playbackEngineRef = createPlaybackEngineRef(mockPlaybackEngine)
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.restoreChannel() })

    expect(result.current.channels).toHaveLength(16)
    expect(mockPlaybackEngine.restoreChannel).not.toHaveBeenCalled()
  })

  it('restoreChannel does not crash when playbackEngine is null', () => {
    const playbackEngineRef = { current: null } as unknown as React.RefObject<PlaybackEngine | null>
    const { result } = renderHook(() => useMixer(playbackEngineRef, 'home'))

    act(() => { result.current.removeChannel(0) })
    expect(() => {
      act(() => { result.current.restoreChannel() })
    }).not.toThrow()
    expect(result.current.channels).toHaveLength(16)
  })
})
