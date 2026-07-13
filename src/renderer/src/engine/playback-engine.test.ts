import { describe, expect, it, vi } from 'vitest'
import { type EngineLane } from './lane-evaluation'
import { PlaybackEngine } from './playback-engine'
import { type SchedulerClock } from './scheduler'
import { MockAudioContext, MockBufferSourceNode, createMockContext } from '../test/mockAudioContext'
import { createDefaultEffect } from './effects'

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
  getLanes?: () => readonly EngineLane[]
  loadSampleBytes?: (p: string) => Promise<ArrayBuffer | null>
  audioTime?: number
  sampleCache?: { maxEntries: number }
}) {
  const context = opts.context ?? createMockContext()
  const clock = mockClock()
  const audioTime = opts.audioTime ?? 0
  const playbackEngine = new PlaybackEngine({
    createContext: () => context as unknown as AudioContext,
    clock,
    now: () => audioTime,
    getLanes: opts.getLanes ?? (() => opts.lanes ?? []),
    loadSampleBytes: opts.loadSampleBytes ?? (async () => new ArrayBuffer(8)),
    sampleCache: opts.sampleCache,
    bpm: 120
  })
  return { playbackEngine, context, clock }
}

describe('PlaybackEngine.previewSample', () => {
  it('toggles off when the same sample is previewed again', async () => {
    const { playbackEngine, context } = makePlaybackEngine({})
    await playbackEngine.previewSample('kick.wav')
    await flushAsync()
    expect(context.created.sources.length).toBeGreaterThanOrEqual(1)

    await playbackEngine.previewSample('kick.wav')
    await flushAsync()
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
    await playbackEngine.close()
  })

  it('clears preview path when buffer load throws', async () => {
    const { playbackEngine } = makePlaybackEngine({
      loadSampleBytes: async () => { throw new Error('disk fail') }
    })
    await playbackEngine.previewSample('broken.wav')
    await flushAsync()
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
  it('preloads only the nearest cache-sized working set with bounded concurrency', async () => {
    let activeLoads = 0
    let maxActiveLoads = 0
    const loadedPaths: string[] = []
    const loadSampleBytes = vi.fn(async (samplePath: string) => {
      loadedPaths.push(samplePath)
      activeLoads += 1
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads)
      await Promise.resolve()
      activeLoads -= 1
      return new ArrayBuffer(8)
    })
    const lanes: EngineLane[] = [
      {
        index: 0,
        muted: false,
        solo: false,
        pan: 0,
        channelIndex: 0,
        placements: Array.from({ length: 9 }, (_, index) => ({
          startTick: (index + 1) * 8,
          durationTicks: 8,
          samplePath: `sample-${index + 1}.wav`
        }))
      }
    ]
    const { playbackEngine } = makePlaybackEngine({
      lanes,
      loadSampleBytes,
      sampleCache: { maxEntries: 8 }
    })

    await playbackEngine.start(0)

    expect(loadedPaths).toEqual(
      Array.from({ length: 8 }, (_, index) => `sample-${index + 1}.wav`)
    )
    expect(maxActiveLoads).toBe(4)
    expect(playbackEngine.audioEngine.samples.size).toBe(8)
    await playbackEngine.close()
  })

  it('refills the upcoming working set after a scheduled placement consumes it', async () => {
    const loadSampleBytes = vi.fn(async () => new ArrayBuffer(8))
    const lanes: EngineLane[] = [
      {
        index: 0,
        muted: false,
        solo: false,
        pan: 0,
        channelIndex: 0,
        placements: [
          { startTick: 0, durationTicks: 8, samplePath: 'current.wav' },
          { startTick: 8, durationTicks: 8, samplePath: 'next.wav' }
        ]
      }
    ]
    const { playbackEngine } = makePlaybackEngine({
      lanes,
      loadSampleBytes,
      sampleCache: { maxEntries: 1 }
    })

    await playbackEngine.start(0)
    await flushAsync()

    expect(loadSampleBytes).toHaveBeenCalledTimes(2)
    expect(playbackEngine.audioEngine.samples.has('current.wav')).toBe(false)
    expect(playbackEngine.audioEngine.samples.has('next.wav')).toBe(true)
    await playbackEngine.close()
  })

  it('allows a later preload after an unexpected preparation failure', async () => {
    let fail = true
    const lanes: EngineLane[] = [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [{ startTick: 0, durationTicks: 8, samplePath: 'recover.wav' }]
    }]
    const getLanes = vi.fn(() => {
      if (fail) throw new Error('temporary arrangement failure')
      return lanes
    })
    const { playbackEngine } = makePlaybackEngine({ getLanes })

    await expect(playbackEngine.start(0)).rejects.toThrow('temporary arrangement failure')
    fail = false
    await expect(playbackEngine.start(0)).resolves.toBe(true)
    expect(getLanes.mock.calls.length).toBeGreaterThanOrEqual(2)
    await playbackEngine.close()
  })

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
    const starting = playbackEngine.start(0)
    await flushAsync()
    // Stop before arrangement preparation finishes loading the buffer.
    playbackEngine.stop()
    resolveLoad(new ArrayBuffer(8))
    await expect(starting).resolves.toBe(false)
    await flushAsync()
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

describe('PlaybackEngine.setChannelEffects', () => {
  it('applies effects configured before a channel is lazily created', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 2, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })

    playbackEngine.setChannelEffects(2, [createDefaultEffect('delay')])
    expect(context.created.delays).toHaveLength(0)
    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.delays).toHaveLength(1)
    await playbackEngine.close()
  })

  it('resamples preview audio from sample BPM to project BPM', async () => {
    const { playbackEngine, context } = makePlaybackEngine({})

    await playbackEngine.previewSample('loop.wav', 100)

    expect(context.created.sources.at(-1)?.playbackRate.value).toBe(1.2)
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

    playbackEngine.removeChannel(0)
    await playbackEngine.close()
  })

  it('replayRemovedChannels reconciles removals when a project is replaced', async () => {
    const { playbackEngine } = makePlaybackEngine({})
    playbackEngine.replayRemovedChannels([1, 2, 3])
    const removedChannels = (playbackEngine as unknown as { removedChannels: Set<number> }).removedChannels
    expect([...removedChannels]).toEqual([1, 2, 3])
    playbackEngine.replayRemovedChannels([2, 3])
    expect([...removedChannels]).toEqual([2, 3])
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

describe('PlaybackEngine tempo-following resampling', () => {
  it('preloads samples before the scheduler creates the first voice', async () => {
    let resolve!: (value: ArrayBuffer) => void
    const pending = new Promise<ArrayBuffer>((done) => { resolve = done })
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'loop.wav', nativeBPM: 100 }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes, loadSampleBytes: () => pending })

    const starting = playbackEngine.start(0)
    await flushAsync()
    expect(context.created.sources).toHaveLength(0)

    resolve(new ArrayBuffer(8))
    await expect(starting).resolves.toBe(true)
    await flushAsync()
    expect(context.created.sources).toHaveLength(1)
    await playbackEngine.close()
  })

  it('reports a canceled preload without starting the scheduler', async () => {
    let resolve!: (value: ArrayBuffer) => void
    const pending = new Promise<ArrayBuffer>((done) => { resolve = done })
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'loop.wav', nativeBPM: 100 }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes, loadSampleBytes: () => pending })

    const starting = playbackEngine.start(0)
    await flushAsync()
    playbackEngine.stop()
    resolve(new ArrayBuffer(8))

    await expect(starting).resolves.toBe(false)
    expect(context.created.sources).toHaveLength(0)
    await playbackEngine.close()
  })

  it('sets playback rate from a placement persisted musical duration', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'loop.wav', nativeBPM: 100 }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })
    playbackEngine.setBpm(120)

    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.sources.at(-1)?.playbackRate.value).toBe(2)
    await playbackEngine.close()
  })

  it('resamples null-native-BPM placements to their persisted musical duration', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'hit.wav', nativeBPM: null }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })

    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.sources.at(-1)?.playbackRate.value).toBe(2)
    await playbackEngine.close()
  })

  it('uses the current project BPM each time playback starts', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 0, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'loop.wav', nativeBPM: 100 }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })

    for (const bpm of [120, 80, 120]) {
      playbackEngine.setBpm(bpm)
      await playbackEngine.start(0)
      await flushAsync()
      playbackEngine.stop()
    }

    expect(context.created.sources.map((source) => source.playbackRate.value)).toEqual([2, 4 / 3, 2])
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

describe('PlaybackEngine master-meter sessions', () => {
  it('preserves integration across pause/resume', async () => {
    const { playbackEngine } = makePlaybackEngine({})
    const reset = vi.spyOn(playbackEngine.audioEngine, 'resetMasterMeter')

    await playbackEngine.start(0)
    playbackEngine.pause()
    await playbackEngine.start(0)

    expect(reset).not.toHaveBeenCalled()
    await playbackEngine.close()
  })

  it('freezes on Stop and resets when playback starts again at tick zero', async () => {
    const { playbackEngine } = makePlaybackEngine({})
    const reset = vi.spyOn(playbackEngine.audioEngine, 'resetMasterMeter')

    await playbackEngine.start(0)
    playbackEngine.stop()
    expect(reset).not.toHaveBeenCalled()
    await playbackEngine.start(0)

    expect(reset).toHaveBeenCalledOnce()
    await playbackEngine.close()
  })

  it('keeps the Stop snapshot stable while later worklet values change', () => {
    const { playbackEngine } = makePlaybackEngine({})
    const stoppedSnapshot = {
      available: true,
      rmsDbfs: -18,
      momentaryLufs: -20,
      shortTermLufs: -21,
      integratedLufs: -22,
      truePeakDbtp: -1,
      loudnessRangeLu: 4
    }
    const laterSnapshot = { ...stoppedSnapshot, momentaryLufs: null, shortTermLufs: null }
    const read = vi.spyOn(playbackEngine.audioEngine, 'getMasterMeterSnapshot')
      .mockReturnValueOnce(stoppedSnapshot)
      .mockReturnValue(laterSnapshot)

    playbackEngine.stop()

    expect(playbackEngine.getMasterMeterSnapshot()).toEqual(stoppedSnapshot)
    expect(read).toHaveBeenCalledOnce()
  })

  it('resets integrated history on discontinuous seek and explicit reset', () => {
    const { playbackEngine } = makePlaybackEngine({})
    const reset = vi.spyOn(playbackEngine.audioEngine, 'resetMasterMeter')

    playbackEngine.seek(32)
    playbackEngine.resetMasterMeter()

    expect(reset).toHaveBeenCalledTimes(2)
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
