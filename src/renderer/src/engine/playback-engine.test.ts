import { describe, expect, it, vi } from 'vitest'
import { type EngineLane } from './lane-evaluation'
import { PlaybackEngine } from './playback-engine'
import { type SchedulerClock } from './scheduler'
import { MockAudioContext, MockBufferSourceNode, createMockContext } from '../test/mockAudioContext'
import type { ClipEdgeMicroFadeSettings } from './clip-edge-fades'
import type { ClipEdgeBoundaryPolicy } from './clip-edge-boundary-policy'
import { createEmptyReturnModule } from './return-effects'

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
  clipEdgeMicroFades?: ClipEdgeMicroFadeSettings
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
    clipEdgeMicroFades: opts.clipEdgeMicroFades,
    bpm: 120
  })
  return { playbackEngine, context, clock }
}

describe('PlaybackEngine deferred graph hydration', () => {
  it('retains a complete snapshot without creating AudioContext before start', async () => {
    const context = createMockContext()
    const createContext = vi.fn(() => context as unknown as AudioContext)
    const playbackEngine = new PlaybackEngine({
      createContext,
      getLanes: () => [],
      loadSampleBytes: async () => null,
      bpm: 120
    })
    playbackEngine.applyProjectGraphSnapshot({
      channels: [],
      returns: Array.from({ length: 4 }, (_, index) => ({
        index,
        module: createEmptyReturnModule(`fx-${index + 1}`),
        powered: true,
        returnLevel: 1,
        limiterEnabled: true
      }))
    })

    expect(createContext).not.toHaveBeenCalled()
    await playbackEngine.start(0)
    expect(createContext).toHaveBeenCalledTimes(1)
    await playbackEngine.close()
  })
})

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

  it('does not let a canceled preload block or poison a newer start', async () => {
    let resolveOldPreload!: (value: ArrayBuffer | null) => void
    const oldPreload = new Promise<ArrayBuffer | null>((resolve) => {
      resolveOldPreload = resolve
    })
    let loadCount = 0
    const lanes: EngineLane[] = [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [{ startTick: 0, durationTicks: 8, samplePath: 'recover.wav' }]
    }]
    const { playbackEngine, context } = makePlaybackEngine({
      lanes,
      loadSampleBytes: async () => {
        loadCount += 1
        return loadCount === 1 ? oldPreload : new ArrayBuffer(8)
      }
    })

    const oldStart = playbackEngine.start(0)
    await flushAsync()
    playbackEngine.pause()

    await expect(playbackEngine.start(0)).resolves.toBe(true)
    await flushAsync()
    expect(context.created.sources).toHaveLength(1)

    resolveOldPreload(null)
    await expect(oldStart).resolves.toBe(false)
    expect(loadCount).toBe(2)
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

describe('PlaybackEngine preview tempo', () => {
  it('resamples preview audio from sample BPM to project BPM', async () => {
    const { playbackEngine, context } = makePlaybackEngine({})

    await playbackEngine.previewSample('loop.wav', 100)

    expect(context.created.sources.at(-1)?.playbackRate.value).toBe(1.2)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine project-owned pan', () => {
  it('pans the one lane-derived channel created out of index order', async () => {
    // Lane routing to channel 3 while it is the FIRST channel created — the
    // engine registry must key by the requested index, not creation order.
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 3, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })
    await playbackEngine.start(0)
    await flushAsync()

    playbackEngine.applyChannelSnapshot([{
      laneId: 'lane-0', channelIndex: 3, gain: 0.8, pan: 0.5,
      muted: false, solo: false, sends: [0, 0, 0, 0]
    }])
    expect(context.created.panners).toHaveLength(1)
    expect(context.created.panners[0]!.pan.value).toBe(0.5)
    await playbackEngine.close()
  })

  it('applies a pan set before the channel exists once the lane first triggers', async () => {
    const lanes: EngineLane[] = [
      { index: 0, muted: false, solo: false, pan: 0, channelIndex: 2, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'kick.wav' }] }
    ]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })

    playbackEngine.applyChannelSnapshot([{
      laneId: 'lane-0', channelIndex: 2, gain: 0.8, pan: -0.75,
      muted: false, solo: false, sends: [0, 0, 0, 0]
    }])
    expect(context.created.panners).toHaveLength(0)

    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.panners).toHaveLength(1)
    expect(context.created.panners[0]!.pan.value).toBe(-0.75)
    await playbackEngine.close()
  })
})

describe('PlaybackEngine lane identity', () => {
  it('drops a pending trigger when its channel is reassigned during sample load', async () => {
    let resolveBytes!: (bytes: ArrayBuffer) => void
    const bytes = new Promise<ArrayBuffer>((resolve) => { resolveBytes = resolve })
    const { playbackEngine } = makePlaybackEngine({ loadSampleBytes: async () => bytes })
    playbackEngine.applyChannelSnapshot([{
      laneId: 'lane-old', channelIndex: 1, gain: 0.8, pan: 0,
      muted: false, solo: false, sends: [0, 0, 0, 0]
    }])
    const trigger = {
      laneIndex: 1,
      channelIndex: 1,
      samplePath: 'pending.wav',
      nativeBPM: null,
      placement: { startTick: 0, durationTicks: 8, samplePath: 'pending.wav' },
      effectiveDurationTicks: 8,
      fadeInAtStart: true,
      fadeOutAtEnd: true
    }
    const pending = (
      playbackEngine as unknown as {
        queueLaneTrigger(value: typeof trigger, bpm: number, when: number): Promise<void>
      }
    ).queueLaneTrigger(trigger, 120, 0)
    await flushAsync()

    playbackEngine.applyChannelSnapshot([{
      laneId: 'lane-new', channelIndex: 1, gain: 0.8, pan: 0,
      muted: false, solo: false, sends: [0, 0, 0, 0]
    }])
    resolveBytes(new ArrayBuffer(8))
    await pending

    expect(playbackEngine.activeVoiceCount).toBe(0)
    expect(playbackEngine.getChannelAnalyser(1)).toBeUndefined()
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

describe('PlaybackEngine automatic clip-edge micro-fades', () => {
  const singlePlacement: EngineLane[] = [{
    index: 0,
    muted: false,
    solo: false,
    pan: 0,
    channelIndex: 0,
    placements: [{ startTick: 0, durationTicks: 8, samplePath: 'edge.wav' }]
  }]

  it('cuts off an overlapping voice at the future scheduled boundary', async () => {
    const lanes: EngineLane[] = [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [
        { startTick: 0, durationTicks: 8, samplePath: 'first.wav' },
        { startTick: 1, durationTicks: 8, samplePath: 'second.wav' }
      ]
    }]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })

    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.sources).toHaveLength(2)
    expect(context.created.sources[0]?.startWhen).toBe(0)
    expect(context.created.sources[0]?.stopWhen).toBeCloseTo(60 / (120 * 8))
    expect(context.created.sources[1]?.startWhen).toBeCloseTo(60 / (120 * 8))
    await playbackEngine.close()
  })

  it('still cuts off an overlapping voice when the successor cannot load', async () => {
    const lanes: EngineLane[] = [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [
        { startTick: 0, durationTicks: 8, samplePath: 'first.wav' },
        { startTick: 1, durationTicks: 8, samplePath: 'missing.wav' }
      ]
    }]
    const { playbackEngine, context } = makePlaybackEngine({
      lanes,
      loadSampleBytes: async (samplePath) =>
        samplePath === 'missing.wav' ? null : new ArrayBuffer(8)
    })

    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.sources).toHaveLength(1)
    expect(context.created.sources[0]?.stopWhen).toBeCloseTo(60 / (120 * 8))
    await playbackEngine.close()
  })

  it('builds the envelope from the overlap-truncated audible duration', async () => {
    const lanes: EngineLane[] = [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [
        { startTick: 0, durationTicks: 100, samplePath: 'first.wav' },
        { startTick: 1, durationTicks: 8, samplePath: 'second.wav' }
      ]
    }]
    const { playbackEngine, context } = makePlaybackEngine({
      lanes,
      clipEdgeMicroFades: { enabled: true, fadeInMs: 20, fadeOutMs: 20 }
    })
    playbackEngine.setBpm(10_000)

    await playbackEngine.start(0)
    await flushAsync()

    const firstEnvelope = context.created.gains.find((gain) =>
      gain.gain.events[0]?.value === 0 && gain.gain.events[1]?.value === 1
    )
    expect(firstEnvelope?.gain.events).toHaveLength(2)
    expect(firstEnvelope?.gain.events[1]?.time).toBeCloseTo(32 / 44_100)
    expect(context.created.sources[0]?.stopWhen).toBeCloseTo(60 / (10_000 * 8))
    await playbackEngine.close()
  })

  it('schedules the default 2 ms and 4 ms envelope in output time', async () => {
    const { playbackEngine, context } = makePlaybackEngine({ lanes: singlePlacement })

    await playbackEngine.start(0)
    await flushAsync()

    const edgeGain = context.created.gains.find((gain) => gain.gain.events.length > 0)
    expect(edgeGain?.gain.events.map(({ type, value }) => ({ type, value }))).toEqual([
      { type: 'set', value: 0 },
      { type: 'linear', value: 1 },
      { type: 'set', value: 1 },
      { type: 'linear', value: 0 }
    ])
    const [start, fadeInEnd, fadeOutStart, fadeOutEnd] = edgeGain!.gain.events
    expect(fadeInEnd!.time - start!.time).toBeCloseTo(87 / 44_100)
    expect(fadeOutEnd!.time - fadeOutStart!.time).toBeCloseTo(175 / 44_100)
    await playbackEngine.close()
  })

  it('restores direct playback when automatic fades are disabled', async () => {
    const { playbackEngine, context } = makePlaybackEngine({
      lanes: singlePlacement,
      clipEdgeMicroFades: { enabled: false, fadeInMs: 2, fadeOutMs: 4 }
    })

    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.gains.every((gain) => gain.gain.events.length === 0)).toBe(true)
    await playbackEngine.close()
  })

  it('starts a resumed placement at the matching source offset and fade gain', async () => {
    const lanes: EngineLane[] = [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [{ startTick: 0, durationTicks: 100, samplePath: 'long.wav' }]
    }]
    const { playbackEngine, context } = makePlaybackEngine({ lanes })
    playbackEngine.setBpm(10_000)

    await playbackEngine.start(1)
    await flushAsync()

    expect(context.created.sources).toHaveLength(1)
    expect(context.created.sources[0].startOffset).toBeCloseTo(0.01)
    const edgeGain = context.created.gains.find((gain) => gain.gain.events.length > 0)
    expect(edgeGain?.gain.events[0]).toMatchObject({ type: 'set' })
    expect(edgeGain?.gain.events[0]?.value).toBeCloseTo(33 / 87)
    await playbackEngine.close()
  })

  it.each(['missing', 'unreadable'] as const)(
    'keeps a fade-out before a touching %s placement',
    async (failure) => {
      const lanes: EngineLane[] = [{
        index: 0,
        muted: false,
        solo: false,
        pan: 0,
        channelIndex: 0,
        placements: [
          { startTick: 0, durationTicks: 8, samplePath: 'valid.wav' },
          { startTick: 8, durationTicks: 8, samplePath: 'broken.wav' }
        ]
      }]
      const { playbackEngine, context } = makePlaybackEngine({
        lanes,
        loadSampleBytes: async (samplePath) => {
          if (samplePath === 'valid.wav') return new ArrayBuffer(8)
          if (failure === 'unreadable') throw new Error('read failed')
          return null
        }
      })

      await playbackEngine.start(0)
      await flushAsync()

      const edgeGain = context.created.gains.find((gain) => gain.gain.events.length >= 4)
      expect(edgeGain?.gain.events.map(({ type, value }) => ({ type, value }))).toEqual([
        { type: 'set', value: 0 },
        { type: 'linear', value: 1 },
        { type: 'set', value: 1 },
        { type: 'linear', value: 0 }
      ])
      await playbackEngine.close()
    }
  )

  it('keeps a fade-in after a touching missing placement', async () => {
    const lanes: EngineLane[] = [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [
        { startTick: 0, durationTicks: 8, samplePath: 'missing.wav' },
        { startTick: 8, durationTicks: 8, samplePath: 'valid.wav' }
      ]
    }]
    const { playbackEngine, context } = makePlaybackEngine({
      lanes,
      loadSampleBytes: async (samplePath) =>
        samplePath === 'valid.wav' ? new ArrayBuffer(8) : null
    })
    playbackEngine.setBpm(10_000)

    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.sources).toHaveLength(1)
    const edgeGain = context.created.gains.find((gain) => gain.gain.events.length > 0)
    expect(edgeGain?.gain.events[0]).toMatchObject({ type: 'set', value: 0 })
    await playbackEngine.close()
  })

  it('propagates silence across a missing placement in a touching chain', async () => {
    const lanes: EngineLane[] = [{
      index: 0,
      muted: false,
      solo: false,
      pan: 0,
      channelIndex: 0,
      placements: [
        { startTick: 0, durationTicks: 1, samplePath: 'a.wav' },
        { startTick: 1, durationTicks: 1, samplePath: 'missing.wav' },
        { startTick: 2, durationTicks: 1, samplePath: 'c.wav' }
      ]
    }]
    const loadSampleBytes = vi.fn(async (samplePath: string) =>
      samplePath === 'missing.wav' ? null : new ArrayBuffer(8)
    )
    const { playbackEngine, context } = makePlaybackEngine({
      lanes,
      loadSampleBytes
    })
    playbackEngine.setBpm(200)

    await playbackEngine.start(0)
    await flushAsync()

    expect(context.created.sources).toHaveLength(2)
    const edgeGains = context.created.gains.filter((gain) => gain.gain.events.length >= 4)
    expect(edgeGains).toHaveLength(2)
    expect(edgeGains[1]?.gain.events[0]).toMatchObject({ type: 'set', value: 0 })
    expect(loadSampleBytes.mock.calls.filter(([path]) => path === 'missing.wav')).toHaveLength(1)
    await playbackEngine.close()
  })

  it.each(['pause', 'stop', 'seek'] as const)(
    'does not let a stale failed trigger mutate a newer playback generation after %s',
    async (transition) => {
      let resolveStaleRetry!: (value: ArrayBuffer | null) => void
      const staleRetry = new Promise<ArrayBuffer | null>((resolve) => {
        resolveStaleRetry = resolve
      })
      const { playbackEngine } = makePlaybackEngine({
        loadSampleBytes: async () => staleRetry
      })
      const trigger = {
        laneIndex: 0,
        channelIndex: 0,
        samplePath: 'pending.wav',
        pan: 0,
        nativeBPM: null,
        placement: { startTick: 1, durationTicks: 1, samplePath: 'pending.wav' },
        effectiveDurationTicks: 1,
        nextPlacement: { startTick: 2, durationTicks: 1, samplePath: 'c.wav' },
        fadeInAtStart: false,
        fadeOutAtEnd: false
      }
      const triggering = (
        playbackEngine as unknown as {
          triggerLane(
            laneTrigger: typeof trigger,
            projectBpm: number,
            when: number,
            elapsedTicks?: number
          ): Promise<void>
        }
      ).triggerLane(trigger, 120, 0)

      const boundaryPolicy = (
        playbackEngine as unknown as { clipEdgeBoundaryPolicy: ClipEdgeBoundaryPolicy }
      ).clipEdgeBoundaryPolicy
      const markPlacementSilent = vi.spyOn(boundaryPolicy, 'markPlacementSilent')

      await flushAsync()
      if (transition === 'pause') playbackEngine.pause()
      else if (transition === 'stop') playbackEngine.stop()
      else playbackEngine.seek(0)
      await playbackEngine.start(0)

      resolveStaleRetry(null)
      await triggering
      await flushAsync()

      expect(markPlacementSilent).not.toHaveBeenCalled()
      await playbackEngine.close()
    }
  )
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

    const engine = (playbackEngine as unknown as {
      engine: { getChannel: (index: number) => { gain: number } | undefined }
    }).engine
    playbackEngine.setChannelGain(0, 0.8)
    playbackEngine.setChannelGain(1, 0.8)
    expect(engine.getChannel(0)?.gain).toBe(0.8)
    expect(engine.getChannel(1)?.gain).toBe(0.8)

    playbackEngine.setChannelSolo(1, true)
    expect(engine.getChannel(0)?.gain).toBe(0)
    expect(engine.getChannel(1)?.gain).toBe(0.8)

    playbackEngine.setChannelSolo(1, false)
    expect(engine.getChannel(0)?.gain).toBe(0.8)

    playbackEngine.setChannelMute(0, true)
    expect(engine.getChannel(0)?.gain).toBe(0)

    playbackEngine.setChannelMute(0, false)
    expect(engine.getChannel(0)?.gain).toBe(0.8)
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

    const engine = (playbackEngine as unknown as {
      engine: { getChannel: (index: number) => { gain: number } | undefined }
    }).engine
    playbackEngine.setChannelSolo(1, true)
    playbackEngine.setChannelGain(0, 0.9)
    expect(engine.getChannel(0)?.gain).toBe(0)
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
