import { describe, expect, it, vi } from 'vitest'
import type { EngineLane } from './lane-evaluation'
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
  it('replays saved Sends when first playback lazily creates the channel', async () => {
    const { playbackEngine } = makePlaybackEngine(testLanes())
    playbackEngine.applyChannelSnapshot([
      {
        laneId: 'lane-0',
        channelIndex: 0,
        gain: 0.4,
        pan: -0.25,
        muted: false,
        solo: false,
        sends: [0.2, 0.4, 0.6, 0.8]
      }
    ])

    expect(playbackEngine.audioEngine.getChannel(0)).toBeUndefined()
    await playbackEngine.start(0)

    const channel = playbackEngine.audioEngine.getChannel(0)!
    expect(channel.sendOutputs.map((send) => send.gain.value)).toEqual([0.2, 0.4, 0.6, 0.8])
    expect(channel.sendOutputs.every((send) => (send as unknown as { connectedTo: AudioNode[] }).connectedTo.length === 1)).toBe(true)
    await playbackEngine.close()
  })

  it('applies complete snapshots to channel graph state and routing', async () => {
    const { playbackEngine } = makePlaybackEngine(testLanes())
    await playbackEngine.start(0)

    playbackEngine.applyChannelSnapshot([
      { laneId: 'lane-0', channelIndex: 0, gain: 0.4, pan: -0.25, muted: false, solo: true, sends: [0, 0, 0, 0] },
      { laneId: 'lane-1', channelIndex: 1, gain: 0.6, pan: 0.25, muted: false, solo: false, sends: [0, 0, 0, 0] },
      { laneId: 'lane-2', channelIndex: 2, gain: 0.7, pan: 0.5, muted: false, solo: false, sends: [0, 0, 0, 0] }
    ])

    const channel0 = playbackEngine.audioEngine.getChannel(0)!
    const channel1 = playbackEngine.audioEngine.getChannel(1)!
    const channel2 = playbackEngine.audioEngine.getChannel(2)!
    expect(channel0.gain).toBe(0.4)
    expect(channel0.pan).toBe(-0.25)
    expect(channel1.gain).toBe(0)
    expect(channel2.gain).toBe(0)
    playbackEngine.applyChannelSnapshot([
      { laneId: 'lane-0', channelIndex: 0, gain: 0.5, pan: 0, muted: true, solo: false, sends: [0, 0, 0, 0] },
      { laneId: 'lane-2', channelIndex: 2, gain: 0.7, pan: 0.5, muted: false, solo: false, sends: [0, 0, 0, 0] }
    ])

    expect(playbackEngine.audioEngine.getChannel(1)).toBeUndefined()
    expect(playbackEngine.audioEngine.getChannel(0)!.gain).toBe(0)
    expect(playbackEngine.audioEngine.getChannel(2)!.gain).toBe(0.7)

    playbackEngine.applyChannelSnapshot([
      { laneId: 'lane-0', channelIndex: 0, gain: 0.5, pan: 0, muted: false, solo: false, sends: [0, 0, 0, 0] },
      { laneId: 'lane-1', channelIndex: 1, gain: 0.6, pan: -0.5, muted: false, solo: false, sends: [0, 0, 0, 0] },
      { laneId: 'lane-2', channelIndex: 2, gain: 0.7, pan: 0.5, muted: false, solo: false, sends: [0, 0, 0, 0] }
    ])

    playbackEngine.stop()
    await playbackEngine.start(0)
    const restoredChannel = playbackEngine.audioEngine.getChannel(1)!
    expect(restoredChannel).not.toBe(channel1)
    expect(restoredChannel.gain).toBe(0.6)
    expect(restoredChannel.pan).toBe(-0.5)
    await playbackEngine.close()
  })

  it('removes channels beyond a shortened snapshot and clears stale solo gating', async () => {
    const { playbackEngine } = makePlaybackEngine(testLanes())
    await playbackEngine.start(0)
    playbackEngine.applyChannelSnapshot([
      { laneId: 'lane-0', channelIndex: 0, gain: 0.4, pan: 0, muted: false, solo: false, sends: [0, 0, 0, 0] },
      { laneId: 'lane-1', channelIndex: 1, gain: 0.6, pan: 0, muted: false, solo: true, sends: [0, 0, 0, 0] }
    ])

    playbackEngine.applyChannelSnapshot([
      { laneId: 'lane-0', channelIndex: 0, gain: 0.4, pan: 0, muted: false, solo: false, sends: [0, 0, 0, 0] }
    ])

    expect(playbackEngine.audioEngine.getChannel(1)).toBeUndefined()
    expect(playbackEngine.audioEngine.getChannel(0)!.gain).toBe(0.4)
    await playbackEngine.close()
  })

  it('disposes a middle lane graph when a different stable lane is reindexed into its channel', async () => {
    const lanes = testLanes()
    const { playbackEngine } = makePlaybackEngine(lanes)
    playbackEngine.applyChannelSnapshot([
      { laneId: 'lane-0', channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, sends: [0, 0, 0, 0] },
      { laneId: 'lane-1', channelIndex: 1, gain: 0.8, pan: 0, muted: false, solo: false, sends: [0, 0, 0, 0] },
      { laneId: 'lane-2', channelIndex: 2, gain: 0.8, pan: 0, muted: false, solo: false, sends: [0, 0, 0, 0] }
    ])
    await playbackEngine.start(0)
    const oldChannel = playbackEngine.audioEngine.getChannel(1)!
    playbackEngine.applyChannelSnapshot([
      { laneId: 'lane-0', channelIndex: 0, gain: 0.8, pan: 0, muted: false, solo: false, sends: [0, 0, 0, 0] },
      { laneId: 'lane-2', channelIndex: 1, gain: 0.7, pan: 0.25, muted: false, solo: false, sends: [0.1, 0.2, 0.3, 0.4] }
    ])

    expect(playbackEngine.audioEngine.getChannel(1)).toBeUndefined()
    expect(playbackEngine.audioEngine.getChannel(2)).toBeUndefined()

    lanes.splice(1, 2, { ...lanes[2]!, index: 1, channelIndex: 1 })
    playbackEngine.stop()
    await playbackEngine.start(0)
    const replacement = playbackEngine.audioEngine.getChannel(1)!
    expect(replacement).not.toBe(oldChannel)
    expect(replacement.gain).toBe(0.7)
    expect(replacement.pan).toBe(0.25)
    expect(replacement.sendOutputs.map((send) => send.gain.value)).toEqual([0.1, 0.2, 0.3, 0.4])
    await playbackEngine.close()
  })
})
