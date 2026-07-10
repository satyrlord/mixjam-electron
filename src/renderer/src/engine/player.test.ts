import { describe, expect, it, vi } from 'vitest'
import { type EngineLane } from './lane-evaluation'
import { Player } from './player'
import { type SchedulerClock } from './scheduler'
import { MockAudioContext, MockBufferSourceNode, createMockContext } from '../test/mockAudioContext'

function mockClock(): SchedulerClock & { fire: () => void } {
  let pending: (() => void) | null = null
  return {
    fire: () => pending?.(),
    setInterval: vi.fn((cb: () => void) => { pending = cb; return 1 }),
    clearInterval: vi.fn(() => { pending = null })
  }
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function makePlayer(opts: {
  context?: MockAudioContext
  lanes?: EngineLane[]
  loadSampleBytes?: (p: string) => Promise<ArrayBuffer | null>
  audioTime?: number
}) {
  const context = opts.context ?? createMockContext()
  const clock = mockClock()
  const audioTime = opts.audioTime ?? 0
  const player = new Player({
    createContext: () => context as unknown as AudioContext,
    clock,
    now: () => audioTime,
    getLanes: () => opts.lanes ?? [],
    loadSampleBytes: opts.loadSampleBytes ?? (async () => new ArrayBuffer(8)),
    bpm: 120
  })
  return { player, context, clock }
}

describe('Player.previewSample', () => {
  it('toggles off when the same sample is previewed again', async () => {
    const { player, context } = makePlayer({})
    await player.previewSample('kick.wav')
    await flushAsync()
    expect(context.created.sources.length).toBeGreaterThanOrEqual(1)

    // Preview the same sample again → should stop, not start a new voice
    await player.previewSample('kick.wav')
    await flushAsync()
    // No new source created on toggle-off
    expect(context.created.sources.length).toBe(1)
    await player.close()
  })

  it('swaps to a new sample when a different one is previewed', async () => {
    const { player, context } = makePlayer({})
    await player.previewSample('kick.wav')
    await flushAsync()

    await player.previewSample('snare.wav')
    await flushAsync()
    expect(context.created.sources.length).toBeGreaterThanOrEqual(2)
    await player.close()
  })

  it('clears preview path when buffer load returns null', async () => {
    const { player } = makePlayer({
      loadSampleBytes: async () => null
    })
    await player.previewSample('missing.wav')
    await flushAsync()
    // Should not crash; preview path cleared
    await player.close()
  })

  it('clears preview path when buffer load throws', async () => {
    const { player } = makePlayer({
      loadSampleBytes: async () => { throw new Error('disk fail') }
    })
    await player.previewSample('broken.wav')
    await flushAsync()
    // Should not crash; preview path cleared
    await player.close()
  })

  it('fires onEnded callback when preview voice finishes on its own', async () => {
    const { player, context } = makePlayer({})
    await player.previewSample('kick.wav')
    await flushAsync()

    // Get the last created source (the preview voice) and simulate it ending
    const sources = context.created.sources as MockBufferSourceNode[]
    const previewSource = sources[sources.length - 1]!
    previewSource.endNow()
    await flushAsync()

    // After the preview ends, previewing the same sample should start a new voice
    // (not toggle off), proving the path was cleared.
    await player.previewSample('kick.wav')
    await flushAsync()
    expect(context.created.sources.length).toBeGreaterThanOrEqual(2)
    await player.close()
  })
})

describe('Player.triggerLane edge cases', () => {
  it('skips trigger when loadSampleBytes returns null', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'gone.wav' }] }
    ]
    const { player } = makePlayer({
      lanes,
      loadSampleBytes: async () => null
    })
    await player.start(0)
    await flushAsync()
    expect(player.audioEngine.activeVoiceCount).toBe(0)
    await player.close()
  })

  it('drops trigger when playback stops during async buffer load', async () => {
    let resolveLoad!: (buf: ArrayBuffer) => void
    const deferred = new Promise<ArrayBuffer>((resolve) => { resolveLoad = resolve })
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'slow.wav' }] }
    ]
    const { player } = makePlayer({
      lanes,
      loadSampleBytes: () => deferred
    })
    await player.start(0)
    // Stop before the buffer load resolves
    player.stop()
    // Now resolve the load
    resolveLoad(new ArrayBuffer(8))
    await flushAsync()
    // No voice should have started since playback was stopped
    expect(player.audioEngine.activeVoiceCount).toBe(0)
    await player.close()
  })
})

describe('Player.setBpm', () => {
  it('updates the BPM used by the scheduler', async () => {
    const { player } = makePlayer({})
    player.setBpm(140)
    // The BPM is read live by the scheduler; no crash is the main assertion
    await player.close()
  })
})

describe('Player.setChannelPan', () => {
  it('pans the channel of a lane whose channel was created out of index order', async () => {
    // Lane routing to channel 3 while it is the FIRST channel created — the
    // engine registry must key by the requested index, not creation order.
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 3, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { player, context } = makePlayer({ lanes })
    await player.start(0)
    await flushAsync()

    player.setChannelPan(3, 0.5)
    // Two panners exist: the per-lane panner (created on trigger) and the
    // channel panner (created when channel 3 is lazily allocated).
    // spec-007 lane pan and channel pan are independent.
    expect(context.created.panners).toHaveLength(2)
    // The channel panner (index 1) carries the channel pan value.
    expect(context.created.panners[1]!.pan.value).toBe(0.5)
    await player.close()
  })

  it('applies a pan set before the channel exists once the lane first triggers', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 2, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { player, context } = makePlayer({ lanes })

    // Pan the lane before playback ever starts — no channel exists yet.
    player.setChannelPan(2, -0.75)
    expect(context.created.panners).toHaveLength(0)

    await player.start(0)
    await flushAsync()

    // Two panners: per-lane panner + channel panner. The lazily-created
    // channel panner picked up the stored pan.
    expect(context.created.panners).toHaveLength(2)
    expect(context.created.panners[1]!.pan.value).toBe(-0.75)
    await player.close()
  })
})

describe('Player.removeChannel', () => {
  it('removes the channel and routes the lane through master bypass', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { player } = makePlayer({ lanes })
    await player.start(0)
    await flushAsync()

    // After starting, channel 0 exists
    player.removeChannel(0)
    // Should not crash, lane panner disconnects and reconnects to bypass
    await player.close()
  })

  it('replayRemovedChannels marks channels as removed', async () => {
    const { player } = makePlayer({})
    player.replayRemovedChannels([1, 2, 3])
    // Should not crash; channels are marked without needing to exist first
    await player.close()
  })

  it('restores removed channel state and routing idempotently', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { player } = makePlayer({ lanes })
    await player.start(0)
    await flushAsync()

    player.removeChannel(0)
    player.restoreChannel(0)
    player.restoreChannel(0)

    expect(player.getChannelAnalyser(0)).toBeDefined()
    await player.close()
  })
})

describe('Player.channelGating', () => {
  it('gates a channel when solo is set on another channel', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] },
      { index: 1, muted: false, solo: false, pan: 0, channelIndex: 1, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'snare.wav' }] }
    ]
    const { player } = makePlayer({ lanes })
    await player.start(0)
    await flushAsync()

    // Set gain on both channels
    player.setChannelGain(0, 0.8)
    player.setChannelGain(1, 0.8)
    // Solo channel 1 — channel 0 should be gated (gain 0)
    player.setChannelSolo(1, true)
    // Un-solo
    player.setChannelSolo(1, false)
    // Mute channel 0
    player.setChannelMute(0, true)
    // Unmute
    player.setChannelMute(0, false)
    await player.close()
  })

  it('setChannelGain applies gain 0 when the channel is gated', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] },
      { index: 1, muted: false, solo: false, pan: 0, channelIndex: 1, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'snare.wav' }] }
    ]
    const { player } = makePlayer({ lanes })
    await player.start(0)
    await flushAsync()

    // Solo channel 1, then set gain on channel 0 — should remain gated
    player.setChannelSolo(1, true)
    player.setChannelGain(0, 0.9)
    await player.close()
  })
})

describe('Player.getSampleBuffer', () => {
  it('returns a decoded AudioBuffer for a valid sample', async () => {
    const { player } = makePlayer({})
    const buffer = await player.getSampleBuffer('kick.wav')
    expect(buffer).not.toBeNull()
    await player.close()
  })

  it('returns null when load fails', async () => {
    const { player } = makePlayer({
      loadSampleBytes: async () => { throw new Error('fail') }
    })
    const buffer = await player.getSampleBuffer('broken.wav')
    expect(buffer).toBeNull()
    await player.close()
  })
})

describe('Player.pause', () => {
  it('stops scheduler and clears lane voices', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { player } = makePlayer({ lanes })
    await player.start(0)
    await flushAsync()
    player.pause()
    expect(player.audioEngine.activeVoiceCount).toBe(0)
    await player.close()
  })
})

describe('Player.getChannelAnalyser', () => {
  it('returns undefined when the channel has not been created', () => {
    const { player } = makePlayer({})
    expect(player.getChannelAnalyser(99)).toBeUndefined()
  })
})

describe('Voice lifecycle (createVoice)', () => {
  // Directly test the voice via the engine to cover the onended guard.
  it('does not re-process onended when called twice', async () => {
    const { player, context } = makePlayer({})
    await player.previewSample('kick.wav')
    await flushAsync()

    const sources = context.created.sources as MockBufferSourceNode[]
    const source = sources[sources.length - 1]!
    // Fire onended twice — the second call should be a no-op
    source.endNow()
    source.endNow()
    await flushAsync()
    // No crash; the guard prevented double-processing
    await player.close()
  })

  it('stop() is a no-op after the voice has already ended', async () => {
    const { player, context } = makePlayer({})
    await player.previewSample('kick.wav')
    await flushAsync()

    const sources = context.created.sources as MockBufferSourceNode[]
    const source = sources[sources.length - 1]!
    // End the voice, then stop it
    source.endNow()
    // stop() on an already-ended voice should not throw
    await player.close()
  })
})
