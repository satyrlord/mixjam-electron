import { describe, expect, it, vi } from 'vitest'
import type { EngineLane } from './lane-evaluation'
import { createDefaultEffect } from './effects'
import { PlaybackEngine } from './playback-engine'
import type { SchedulerClock } from './scheduler'
import { createMockContext } from '../test/mockAudioContext'

function makePlaybackEngine(lanes: EngineLane[]) {
  const context = createMockContext()
  const clock: SchedulerClock = {
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn()
  }
  const playbackEngine = new PlaybackEngine({
    createContext: () => context as unknown as AudioContext,
    clock,
    getLanes: () => lanes,
    loadSampleBytes: async () => new ArrayBuffer(8),
    bpm: 120
  })
  return { playbackEngine, context }
}

function testLanes(): EngineLane[] {
  return [0, 1, 2].map((channelIndex) => ({
    index: channelIndex,
    muted: false,
    solo: false,
    pan: 0,
    channelIndex,
    placements: [{ startTick: 0, durationTicks: 8, samplePath: `channel-${channelIndex}.wav` }]
  }))
}

describe('PlaybackEngine channel reconciliation', () => {
  it('applies complete snapshots to channel graph state and routing', async () => {
    const { playbackEngine, context } = makePlaybackEngine(testLanes())
    await playbackEngine.start(0)

    const delay = createDefaultEffect('delay')
    playbackEngine.applyChannelSnapshot([
      { channelIndex: 0, gain: 0.4, pan: -0.25, muted: false, solo: true, effects: [delay] },
      { channelIndex: 1, gain: 0.6, pan: 0.25, muted: false, solo: false, effects: [] },
      { channelIndex: 2, gain: 0.7, pan: 0.5, muted: false, solo: false, effects: [] }
    ], 3)

    const channel0 = playbackEngine.audioEngine.getChannel(0)!
    const channel1 = playbackEngine.audioEngine.getChannel(1)!
    const channel2 = playbackEngine.audioEngine.getChannel(2)!
    expect(channel0.gain).toBe(0.4)
    expect(channel0.pan).toBe(-0.25)
    expect(channel0.effects).toEqual([delay])
    expect(channel1.gain).toBe(0)
    expect(channel2.gain).toBe(0)
    expect(context.created.delays.length).toBeGreaterThan(0)

    playbackEngine.applyChannelSnapshot([
      { channelIndex: 0, gain: 0.5, pan: 0, muted: true, solo: false, effects: [] },
      { channelIndex: 2, gain: 0.7, pan: 0.5, muted: false, solo: false, effects: [] }
    ], 3)

    expect(playbackEngine.audioEngine.getChannel(1)).toBeUndefined()
    expect(playbackEngine.audioEngine.getChannel(0)!.gain).toBe(0)
    expect(playbackEngine.audioEngine.getChannel(2)!.gain).toBe(0.7)
    expect(playbackEngine.audioEngine.getChannel(0)!.effects).toEqual([])
    const bypass = playbackEngine.audioEngine.masterBypass as unknown
    expect(context.created.panners.some((panner) =>
      panner.connectedTo.some((target) => (target as unknown) === bypass)
    )).toBe(true)

    playbackEngine.applyChannelSnapshot([
      { channelIndex: 0, gain: 0.5, pan: 0, muted: false, solo: false, effects: [] },
      { channelIndex: 1, gain: 0.6, pan: -0.5, muted: false, solo: false, effects: [] },
      { channelIndex: 2, gain: 0.7, pan: 0.5, muted: false, solo: false, effects: [] }
    ], 3)

    const restoredChannel = playbackEngine.audioEngine.getChannel(1)!
    expect(restoredChannel.gain).toBe(0.6)
    expect(restoredChannel.pan).toBe(-0.5)
    const restoredInput = restoredChannel.input as unknown
    expect(context.created.panners.some((panner) =>
      panner.connectedTo.some((target) => (target as unknown) === restoredInput)
    )).toBe(true)
    await playbackEngine.close()
  })

  it('replays removal and restoration through the channel graph', async () => {
    const { playbackEngine } = makePlaybackEngine(testLanes())
    await playbackEngine.start(0)
    playbackEngine.replayRemovedChannels([1])
    expect(playbackEngine.audioEngine.getChannel(1)).toBeUndefined()
    playbackEngine.replayRemovedChannels([])
    expect(playbackEngine.audioEngine.getChannel(1)).toBeDefined()
    await playbackEngine.close()
  })
})
