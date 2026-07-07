import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMixer } from './useMixer'
import type { Player } from '../engine/player'

/** Creates a minimal mock Player with only the methods useMixer touches. */
function createMockPlayer() {
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
    removeChannel: vi.fn(),
    restoreChannel: vi.fn(),
    replayRemovedChannels: vi.fn()
  }
}

function createPlayerRef(mock = createMockPlayer()) {
  return { current: mock } as unknown as React.RefObject<Player | null>
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
    const playerRef = createPlayerRef()
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    expect(result.current.channels).toHaveLength(16)
    for (const ch of result.current.channels) {
      expect(ch.gain).toBe(0.8)
      expect(ch.pan).toBe(0)
      expect(ch.muted).toBe(false)
      expect(ch.solo).toBe(false)
    }
  })

  it('initializes channelLevels and channelPeaks as empty maps', () => {
    const playerRef = createPlayerRef()
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    expect(result.current.channelLevels.size).toBe(0)
    expect(result.current.channelPeaks.size).toBe(0)
  })

  it('setChannelGain updates channel state and calls player.setChannelGain', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { result.current.setChannelGain(0, 0.5) })

    expect(result.current.channels[0]!.gain).toBe(0.5)
    expect(mockPlayer.setChannelGain).toHaveBeenCalledWith(0, 0.5)
  })

  it('setChannelPan updates channel state and calls player.setChannelPan', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { result.current.setChannelPan(2, -0.3) })

    expect(result.current.channels[2]!.pan).toBe(-0.3)
    expect(mockPlayer.setChannelPan).toHaveBeenCalledWith(2, -0.3)
  })

  it('toggleChannelMute toggles mute state and calls player.setChannelMute', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { result.current.toggleChannelMute(1) })
    expect(result.current.channels[1]!.muted).toBe(true)
    expect(mockPlayer.setChannelMute).toHaveBeenCalledWith(1, true)

    act(() => { result.current.toggleChannelMute(1) })
    expect(result.current.channels[1]!.muted).toBe(false)
    expect(mockPlayer.setChannelMute).toHaveBeenCalledWith(1, false)
  })

  it('toggleChannelSolo toggles solo state and calls player.setChannelSolo', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { result.current.toggleChannelSolo(3) })
    expect(result.current.channels[3]!.solo).toBe(true)
    expect(mockPlayer.setChannelSolo).toHaveBeenCalledWith(3, true)

    act(() => { result.current.toggleChannelSolo(3) })
    expect(result.current.channels[3]!.solo).toBe(false)
    expect(mockPlayer.setChannelSolo).toHaveBeenCalledWith(3, false)
  })

  it('removeChannel removes channel from state and calls player.removeChannel', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { result.current.removeChannel(0) })
    expect(result.current.channels).toHaveLength(15)
    expect(result.current.channels.find((ch) => ch.channelIndex === 0)).toBeUndefined()
    expect(mockPlayer.removeChannel).toHaveBeenCalledWith(0)
  })

  it('persists channel state to localStorage on change', () => {
    const playerRef = createPlayerRef()
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { result.current.setChannelGain(0, 0.3) })

    const stored = JSON.parse(localStorage.getItem('mixjam-mixer-channels') ?? '[]')
    expect(stored).toHaveLength(16)
    expect(stored[0]!.gain).toBe(0.3)
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

    const playerRef = createPlayerRef()
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    expect(result.current.channels).toHaveLength(16)
    expect(result.current.channels[0]!.gain).toBe(0.5)
    expect(result.current.channels[0]!.pan).toBe(-0.5)
    expect(result.current.channels[0]!.muted).toBe(true)
  })

  it('falls back to defaults when localStorage has invalid data', () => {
    localStorage.setItem('mixjam-mixer-channels', 'not-json')
    const playerRef = createPlayerRef()
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    expect(result.current.channels).toHaveLength(16)
    expect(result.current.channels[0]!.gain).toBe(0.8)
  })

  it('applies channel state to player when view switches to tracker', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result, rerender } = renderHook(
      ({ view }: { view: string }) => useMixer(playerRef, view),
      { initialProps: { view: 'home' } }
    )

    act(() => {
      result.current.setChannelGain(0, 0.3)
      result.current.setChannelPan(1, -0.5)
      result.current.toggleChannelMute(2)
      result.current.toggleChannelSolo(3)
    })

    rerender({ view: 'tracker' })

    expect(mockPlayer.replayRemovedChannels).toHaveBeenCalledWith([])
    expect(mockPlayer.setChannelGain).toHaveBeenCalledWith(0, 0.3)
    expect(mockPlayer.setChannelPan).toHaveBeenCalledWith(1, -0.5)
    expect(mockPlayer.setChannelMute).toHaveBeenCalledWith(2, true)
    expect(mockPlayer.setChannelSolo).toHaveBeenCalledWith(3, true)
  })

  it('rAF loop does not call getChannelAnalyser when activeVoiceCount is 0', () => {
    setupRafMock()
    const mockPlayer = createMockPlayer()
    mockPlayer.activeVoiceCount = 0
    const playerRef = createPlayerRef(mockPlayer)

    renderHook(() => useMixer(playerRef, 'home'))

    act(() => { tickOnce() })

    expect(mockPlayer.getChannelAnalyser).not.toHaveBeenCalled()
  })

  it('rAF loop reads analyser data when player has active voices', () => {
    setupRafMock()
    const analyser = {
      fftSize: 2048,
      getFloatTimeDomainData: vi.fn((buf: Float32Array) => { buf.fill(0.1) })
    }
    const mockPlayer = {
      ...createMockPlayer(),
      activeVoiceCount: 5,
      getChannelAnalyser: vi.fn().mockReturnValue(analyser)
    }
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { tickOnce() })

    expect(mockPlayer.getChannelAnalyser).toHaveBeenCalled()
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
    const mockPlayer = {
      ...createMockPlayer(),
      activeVoiceCount: 5,
      getChannelAnalyser
    }
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

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
    const playerRef = createPlayerRef()
    const { unmount } = renderHook(() => useMixer(playerRef, 'home'))
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')

    unmount()

    expect(cancelSpy).toHaveBeenCalled()
  })

  it('setChannelGain does not crash when player is null', () => {
    const playerRef = { current: null } as unknown as React.RefObject<Player | null>
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    expect(() => {
      act(() => { result.current.setChannelGain(0, 0.5) })
    }).not.toThrow()
    expect(result.current.channels[0]!.gain).toBe(0.5)
  })

  it('toggleChannelMute does not crash when player is null', () => {
    const playerRef = { current: null } as unknown as React.RefObject<Player | null>
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    expect(() => {
      act(() => { result.current.toggleChannelMute(0) })
    }).not.toThrow()
    expect(result.current.channels[0]!.muted).toBe(true)
  })

  it('toggleChannelSolo does not crash when player is null', () => {
    const playerRef = { current: null } as unknown as React.RefObject<Player | null>
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    expect(() => {
      act(() => { result.current.toggleChannelSolo(0) })
    }).not.toThrow()
    expect(result.current.channels[0]!.solo).toBe(true)
  })

  it('removeChannel twice does not duplicate removed index', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    // Remove channel 0 twice
    act(() => { result.current.removeChannel(0) })
    act(() => { result.current.removeChannel(0) })

    expect(result.current.channels).toHaveLength(15)
    expect(mockPlayer.removeChannel).toHaveBeenCalledTimes(2)
  })

  it('toggleChannelSolo no-ops gracefully when channel already removed', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    // Remove channel 5, then toggle solo on it (it's gone from state)
    act(() => { result.current.removeChannel(5) })
    act(() => { result.current.toggleChannelSolo(5) })

    // Channel 5 is gone, no crash
    expect(result.current.channels.find((ch) => ch.channelIndex === 5)).toBeUndefined()
  })

  it('switching to tracker with null player does not crash', () => {
    const playerRef = { current: null } as unknown as React.RefObject<Player | null>
    const { rerender } = renderHook(
      ({ view }: { view: string }) => useMixer(playerRef, view),
      { initialProps: { view: 'home' } }
    )

    expect(() => {
      rerender({ view: 'tracker' })
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
    const mockPlayer = {
      ...createMockPlayer(),
      activeVoiceCount: 5,
      getChannelAnalyser: vi.fn().mockReturnValue(analyser)
    }
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

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
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

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
    const playerRef = createPlayerRef()
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    expect(result.current.canRestoreChannel).toBe(false)
    act(() => { result.current.removeChannel(3) })
    expect(result.current.canRestoreChannel).toBe(true)
  })

  it('restoreChannel re-adds the lowest removed channel at default state (AC-017)', () => {
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    // Tracker view so the apply-state effect pushes channel state to the player.
    const { result } = renderHook(() => useMixer(playerRef, 'tracker'))

    act(() => {
      result.current.removeChannel(5)
      result.current.removeChannel(2)
    })
    act(() => { result.current.restoreChannel() })

    const restored = result.current.channels.find((ch) => ch.channelIndex === 2)
    expect(restored).toEqual({ channelIndex: 2, gain: 0.8, pan: 0, muted: false, solo: false })
    expect(result.current.channels.find((ch) => ch.channelIndex === 5)).toBeUndefined()
    // Lane re-route happens synchronously; gain/mute are re-applied by the
    // apply-state effect on the resulting commit.
    expect(mockPlayer.restoreChannel).toHaveBeenCalledWith(2)
    expect(mockPlayer.setChannelGain).toHaveBeenCalledWith(2, 0.8)
    expect(mockPlayer.setChannelMute).toHaveBeenCalledWith(2, false)
    // Channels stay sorted by channelIndex after restore.
    const indices = result.current.channels.map((ch) => ch.channelIndex)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })

  it('restore encodes removal by channel absence, not a separate removed list', () => {
    const playerRef = createPlayerRef()
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

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
    const mockPlayer = createMockPlayer()
    const playerRef = createPlayerRef(mockPlayer)
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { result.current.restoreChannel() })

    expect(result.current.channels).toHaveLength(16)
    expect(mockPlayer.restoreChannel).not.toHaveBeenCalled()
  })

  it('restoreChannel does not crash when player is null', () => {
    const playerRef = { current: null } as unknown as React.RefObject<Player | null>
    const { result } = renderHook(() => useMixer(playerRef, 'home'))

    act(() => { result.current.removeChannel(0) })
    expect(() => {
      act(() => { result.current.restoreChannel() })
    }).not.toThrow()
    expect(result.current.channels).toHaveLength(16)
  })
})
