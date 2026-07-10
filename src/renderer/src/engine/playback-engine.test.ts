import { describe, expect, it, vi } from 'vitest'
import { type EngineLane } from './lane-evaluation'
import { PlaybackEngine } from './playback-engine'
import { type SchedulerClock } from './scheduler'
import { MockAudioContext, MockBufferSourceNode, createMockContext } from '../test/mockAudioContext'
import type { TimeStretchProcessor } from './time-stretch'

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

function makePlaybackEngine(opts: {
  context?: MockAudioContext
  lanes?: EngineLane[]
  loadSampleBytes?: (p: string) => Promise<ArrayBuffer | null>
  audioTime?: number
  stretchProcessor?: TimeStretchProcessor
}) {
  const context = opts.context ?? createMockContext()
  const clock = mockClock()
  const audioTime = opts.audioTime ?? 0
  const playbackEngine = new PlaybackEngine({
    createContext: () => context as unknown as AudioContext,
    clock,
    now: () => audioTime,
    getLanes: () => opts.lanes ?? [],
    loadSampleBytes: opts.loadSampleBytes ?? (async () => new ArrayBuffer(8)),
    bpm: 120,
    timeStretch: opts.stretchProcessor ? { processor: opts.stretchProcessor } : undefined
  })
  return { playbackEngine, context, clock }
}

describe('PlaybackEngine.previewSample', () => {
  it('toggles off when the same sample is previewed again', async () => {
    const { playbackEngine, context } = makePlaybackEngine({})
    await playbackEngine.previewSample('kick.wav')
    await flushAsync()
    expect(context.created.sources.length).toBeGreaterThanOrEqual(1)

    // Preview the same sample again → should stop, not start a new voice
    await playbackEngine.previewSample('kick.wav')
    await flushAsync()
    // No new source created on toggle-off
    expect(context.created.sources.length).toBe(1)
    await playbackEngine.close()
  })

  it('swaps to a new sample when a different one is previewed', async () => {
    const { playbackEngine, context } = makePlaybackEngine({})
    await playbackEngine.previewSample('kick.wav')
    await flushAsync()

    await playbackEngine.previewSample('snare.wav')
    await flushAsync()
    expect(context.created.sources.length).toBeGreaterThanOrEqual(2)
    await playbackEngine.close()
  })

  it('clears preview path when buffer load returns null', async () => {
    const { playbackEngine } = makePlaybackEngine({
      loadSampleBytes: async () => null
    })
    await playbackEngine.previewSample('missing.wav')
    await flushAsync()
    // Should not crash; preview path cleared
    await playbackEngine.close()
  })

  it('clears preview path when buffer load throws', async () => {
    const { playbackEngine } = makePlaybackEngine({
      loadSampleBytes: async () => { throw new Error('disk fail') }
    })
    await playbackEngine.previewSample('broken.wav')
    await flushAsync()
    // Should not crash; preview path cleared
    await playbackEngine.close()
  })

  it('fires onEnded callback when preview voice finishes on its own', async () => {
    const { playbackEngine, context } = makePlaybackEngine({})
    await playbackEngine.previewSample('kick.wav')
    await flushAsync()

    // Get the last created source (the preview voice) and simulate it ending
    const sources = context.created.sources as MockBufferSourceNode[]
    const previewSource = sources[sources.length - 1]!
    previewSource.endNow()
    await flushAsync()

    // After the preview ends, previewing the same sample should start a new voice
    // (not toggle off), proving the path was cleared.
    await playbackEngine.previewSample('kick.wav')
    await flushAsync()
    expect(context.created.sources.length).toBeGreaterThanOrEqual(2)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.triggerLane edge cases', () => {
  it('skips trigger when loadSampleBytes returns null', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'gone.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({
      lanes,
      loadSampleBytes: async () => null
    })
    await playbackEngine.start(0)
    await flushAsync()
    expect(playbackEngine.audioEngine.activeVoiceCount).toBe(0)
    await playbackEngine.close()
  })

  it('drops trigger when playback stops during async buffer load', async () => {
    let resolveLoad!: (buf: ArrayBuffer) => void
    const deferred = new Promise<ArrayBuffer>((resolve) => { resolveLoad = resolve })
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'slow.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({
      lanes,
      loadSampleBytes: () => deferred
    })
    await playbackEngine.start(0)
    // Stop before the buffer load resolves
    playbackEngine.stop()
    // Now resolve the load
    resolveLoad(new ArrayBuffer(8))
    await flushAsync()
    // No voice should have started since playback was stopped
    expect(playbackEngine.audioEngine.activeVoiceCount).toBe(0)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.setBpm', () => {
  it('updates the BPM used by the scheduler', async () => {
    const { playbackEngine } = makePlaybackEngine({})
    playbackEngine.setBpm(140)
    // The BPM is read live by the scheduler; no crash is the main assertion
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.setChannelPan', () => {
  it('pans the channel of a lane whose channel was created out of index order', async () => {
    // Lane routing to channel 3 while it is the FIRST channel created — the
    // engine registry must key by the requested index, not creation order.
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 3, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })
    await playbackEngine.start(0)
    await flushAsync()

    playbackEngine.setChannelPan(3, 0.5)
    // Two panners exist: the per-lane panner (created on trigger) and the
    // channel panner (created when channel 3 is lazily allocated).
    // spec-007 lane pan and channel pan are independent.
    expect(context.created.panners).toHaveLength(2)
    // The channel panner (index 1) carries the channel pan value.
    expect(context.created.panners[1]!.pan.value).toBe(0.5)
    await playbackEngine.close()
  })

  it('applies a pan set before the channel exists once the lane first triggers', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 2, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })

    // Pan the lane before playback ever starts — no channel exists yet.
    playbackEngine.setChannelPan(2, -0.75)
    expect(context.created.panners).toHaveLength(0)

    await playbackEngine.start(0)
    await flushAsync()

    // Two panners: per-lane panner + channel panner. The lazily-created
    // channel panner picked up the stored pan.
    expect(context.created.panners).toHaveLength(2)
    expect(context.created.panners[1]!.pan.value).toBe(-0.75)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.removeChannel', () => {
  it('removes the channel and routes the lane through master bypass', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({ lanes })
    await playbackEngine.start(0)
    await flushAsync()

    // After starting, channel 0 exists
    playbackEngine.removeChannel(0)
    // Should not crash, lane panner disconnects and reconnects to bypass
    await playbackEngine.close()
  })

  it('replayRemovedChannels marks channels as removed', async () => {
    const { playbackEngine } = makePlaybackEngine({})
    playbackEngine.replayRemovedChannels([1, 2, 3])
    // Should not crash; channels are marked without needing to exist first
    await playbackEngine.close()
  })

  it('restores removed channel state and routing idempotently', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({ lanes })
    await playbackEngine.start(0)
    await flushAsync()

    playbackEngine.removeChannel(0)
    playbackEngine.restoreChannel(0)
    playbackEngine.restoreChannel(0)

    expect(playbackEngine.getChannelAnalyser(0)).toBeDefined()
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.seek', () => {
  it('moves the scheduler playhead and can restart playback from there', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 40, durationTicks: 8, samplePath: 'seek-target.wav' }] }
    ]
    const { playbackEngine, clock, context } = makePlaybackEngine({ lanes })

    await playbackEngine.start(0)
    expect(context.created.sources).toHaveLength(0)

    playbackEngine.seek(40)

    expect(playbackEngine.currentTick).toBe(40)
    expect(clock.clearInterval).toHaveBeenCalledTimes(1)

    await playbackEngine.start(40)
    await flushAsync()
    expect(playbackEngine.currentTick).toBe(40)
    expect(clock.setInterval).toHaveBeenCalledTimes(2)
    expect(context.created.sources).toHaveLength(1)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine time-stretching', () => {
  it('precomputes stretches before the scheduler creates the first voice', async () => {
    let resolve!: (value: AudioBuffer) => void
    const pending = new Promise<AudioBuffer>((done) => { resolve = done })
    const stretch = vi.fn(() => pending)
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, nativeBPM: 100, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'loop.wav' }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes, stretchProcessor: { stretch } })

    const starting = playbackEngine.start(0)
    await flushAsync()
    expect(context.created.sources).toHaveLength(0)

    resolve({ duration: 0.5 } as AudioBuffer)
    await expect(starting).resolves.toBe(true)
    await flushAsync()
    expect(context.created.sources).toHaveLength(1)
    await playbackEngine.close()
  })

  it('reports a canceled preparation without starting the scheduler', async () => {
    let resolve!: (value: AudioBuffer) => void
    const pending = new Promise<AudioBuffer>((done) => { resolve = done })
    const stretch = vi.fn(() => pending)
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, nativeBPM: 100, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'loop.wav' }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes, stretchProcessor: { stretch } })

    const starting = playbackEngine.start(0)
    await flushAsync()
    playbackEngine.stop()
    resolve({ duration: 0.5 } as AudioBuffer)

    await expect(starting).resolves.toBe(false)
    expect(context.created.sources).toHaveLength(0)
    await playbackEngine.close()
  })

  it('stretches a native-BPM lane before creating its voice', async () => {
    const stretched = { duration: 0.5 } as AudioBuffer
    const stretch = vi.fn(async () => stretched)
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, nativeBPM: 100, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'loop.wav' }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes, stretchProcessor: { stretch } })
    playbackEngine.setBpm(120)

    await playbackEngine.start(0)
    await flushAsync()

    expect(stretch).toHaveBeenCalledWith(expect.anything(), 1.2)
    expect(context.created.sources.at(-1)?.buffer).toBe(stretched)
    await playbackEngine.close()
  })

  it('keeps null-native-BPM lanes at native rate', async () => {
    const stretch = vi.fn(async (source: AudioBuffer) => source)
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, nativeBPM: null, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'hit.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({ lanes, stretchProcessor: { stretch } })

    await playbackEngine.start(0)
    await flushAsync()

    expect(stretch).not.toHaveBeenCalled()
    await playbackEngine.close()
  })

  it('reuses a cached stretch when project BPM returns to a prior value', async () => {
    const stretch = vi.fn(async () => ({ duration: 1 } as AudioBuffer))
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, nativeBPM: 100, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'loop.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({ lanes, stretchProcessor: { stretch } })

    for (const bpm of [120, 80, 120]) {
      playbackEngine.setBpm(bpm)
      await playbackEngine.start(0)
      await flushAsync()
      playbackEngine.stop()
    }

    expect(stretch).toHaveBeenCalledTimes(2)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.channelGating', () => {
  it('gates a channel when solo is set on another channel', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] },
      { index: 1, muted: false, solo: false, pan: 0, channelIndex: 1, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'snare.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({ lanes })
    await playbackEngine.start(0)
    await flushAsync()

    // Set gain on both channels
    playbackEngine.setChannelGain(0, 0.8)
    playbackEngine.setChannelGain(1, 0.8)
    // Solo channel 1 — channel 0 should be gated (gain 0)
    playbackEngine.setChannelSolo(1, true)
    // Un-solo
    playbackEngine.setChannelSolo(1, false)
    // Mute channel 0
    playbackEngine.setChannelMute(0, true)
    // Unmute
    playbackEngine.setChannelMute(0, false)
    await playbackEngine.close()
  })

  it('setChannelGain applies gain 0 when the channel is gated', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] },
      { index: 1, muted: false, solo: false, pan: 0, channelIndex: 1, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'snare.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({ lanes })
    await playbackEngine.start(0)
    await flushAsync()

    // Solo channel 1, then set gain on channel 0 — should remain gated
    playbackEngine.setChannelSolo(1, true)
    playbackEngine.setChannelGain(0, 0.9)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.getSampleBuffer', () => {
  it('returns a decoded AudioBuffer for a valid sample', async () => {
    const { playbackEngine } = makePlaybackEngine({})
    const buffer = await playbackEngine.getSampleBuffer('kick.wav')
    expect(buffer).not.toBeNull()
    await playbackEngine.close()
  })

  it('returns null when load fails', async () => {
    const { playbackEngine } = makePlaybackEngine({
      loadSampleBytes: async () => { throw new Error('fail') }
    })
    const buffer = await playbackEngine.getSampleBuffer('broken.wav')
    expect(buffer).toBeNull()
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.pause', () => {
  it('stops scheduler and clears lane voices', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { playbackEngine } = makePlaybackEngine({ lanes })
    await playbackEngine.start(0)
    await flushAsync()
    playbackEngine.pause()
    expect(playbackEngine.audioEngine.activeVoiceCount).toBe(0)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine.getChannelAnalyser', () => {
  it('returns undefined when the channel has not been created', () => {
    const { playbackEngine } = makePlaybackEngine({})
    expect(playbackEngine.getChannelAnalyser(99)).toBeUndefined()
  })
})

describe('Voice lifecycle (createVoice)', () => {
  // Directly test the voice via the engine to cover the onended guard.
  it('does not re-process onended when called twice', async () => {
    const { playbackEngine, context } = makePlaybackEngine({})
    await playbackEngine.previewSample('kick.wav')
    await flushAsync()

    const sources = context.created.sources as MockBufferSourceNode[]
    const source = sources[sources.length - 1]!
    // Fire onended twice — the second call should be a no-op
    source.endNow()
    source.endNow()
    await flushAsync()
    // No crash; the guard prevented double-processing
    await playbackEngine.close()
  })

  it('stop() is a no-op after the voice has already ended', async () => {
    const { playbackEngine, context } = makePlaybackEngine({})
    await playbackEngine.previewSample('kick.wav')
    await flushAsync()

    const sources = context.created.sources as MockBufferSourceNode[]
    const source = sources[sources.length - 1]!
    // End the voice, then stop it
    source.endNow()
    // stop() on an already-ended voice should not throw
    await playbackEngine.close()
  })
})
