import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TimeStretchEngine,
  type TimeStretchProcessor,
  stretchRatio
} from './time-stretch'

function buffer(name: string): AudioBuffer {
  return { name } as unknown as AudioBuffer
}

describe('stretchRatio', () => {
  it('uses project BPM divided by native BPM so the result matches project tempo', () => {
    expect(stretchRatio(100, 120)).toBe(1.2)
    expect(stretchRatio(140, 120)).toBeCloseTo(120 / 140)
  })

  it('returns null for a lane without a native BPM', () => {
    expect(stretchRatio(null, 120)).toBeNull()
    expect(stretchRatio(undefined, 120)).toBeNull()
  })

  it('rejects non-positive and non-finite BPM values', () => {
    expect(() => stretchRatio(0, 120)).toThrow(RangeError)
    expect(() => stretchRatio(120, Number.NaN)).toThrow(RangeError)
  })
})

describe('TimeStretchEngine', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('passes through null and equal native BPM without invoking the processor', async () => {
    const stretch = vi.fn<TimeStretchProcessor['stretch']>()
    const source = buffer('source')
    const engine = new TimeStretchEngine({ processor: { stretch } })

    await expect(engine.prepare('loop.wav', source, null, 140)).resolves.toBe(source)
    await expect(engine.prepare('loop.wav', source, 140, 140)).resolves.toBe(source)
    expect(stretch).not.toHaveBeenCalled()
  })

  it('caches by sample and ratio and reuses an earlier ratio after BPM changes back', async () => {
    const stretch = vi.fn(async (_source: AudioBuffer, ratio: number) => buffer(`ratio-${ratio}`))
    const engine = new TimeStretchEngine({ processor: { stretch } })
    const source = buffer('source')

    const fast = await engine.prepare('loop.wav', source, 100, 120)
    const slow = await engine.prepare('loop.wav', source, 100, 80)
    const fastAgain = await engine.prepare('loop.wav', source, 100, 120)

    expect(stretch).toHaveBeenCalledTimes(2)
    expect(stretch).toHaveBeenNthCalledWith(1, source, 1.2)
    expect(stretch).toHaveBeenNthCalledWith(2, source, 0.8)
    expect(fastAgain).toBe(fast)
    expect(slow).not.toBe(fast)
  })

  it('deduplicates concurrent work for the same sample and ratio', async () => {
    let resolve!: (value: AudioBuffer) => void
    const pending = new Promise<AudioBuffer>((done) => { resolve = done })
    const stretch = vi.fn(() => pending)
    const engine = new TimeStretchEngine({ processor: { stretch } })
    const source = buffer('source')

    const first = engine.prepare('loop.wav', source, 100, 120)
    const second = engine.prepare('loop.wav', source, 100, 120)
    resolve(buffer('stretched'))

    await expect(first).resolves.toBe(await second)
    expect(stretch).toHaveBeenCalledTimes(1)
  })

  it('evicts least-recently-used stretched buffers at the configured bound', async () => {
    const stretch = vi.fn(async () => buffer(`stretched-${stretch.mock.calls.length}`))
    const engine = new TimeStretchEngine({ processor: { stretch }, maxEntries: 1 })
    const source = buffer('source')

    await engine.prepare('loop.wav', source, 100, 120)
    await engine.prepare('loop.wav', source, 100, 80)
    await engine.prepare('loop.wav', source, 100, 120)

    expect(engine.size).toBe(1)
    expect(stretch).toHaveBeenCalledTimes(3)
  })

  it('falls back to native rate, warns, and disables further processing after failure', async () => {
    const failure = new Error('WASM unavailable')
    const stretch = vi.fn(async () => { throw failure })
    const warn = vi.fn()
    const engine = new TimeStretchEngine({ processor: { stretch }, warn })
    const source = buffer('source')

    await expect(engine.prepare('loop.wav', source, 100, 120)).resolves.toBe(source)
    await expect(engine.prepare('other.wav', source, 100, 130)).resolves.toBe(source)

    expect(stretch).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      'Time-stretch WASM failed to load or process audio; using native-rate playback.',
      failure
    )
  })

  it('warns once when different stretch keys fail concurrently', async () => {
    const failure = new Error('WASM unavailable')
    const stretch = vi.fn(async () => { throw failure })
    const warn = vi.fn()
    const engine = new TimeStretchEngine({ processor: { stretch }, warn })
    const source = buffer('source')

    const [first, second] = await Promise.all([
      engine.prepare('first.wav', source, 100, 120),
      engine.prepare('second.wav', source, 100, 140)
    ])

    expect(first).toBe(source)
    expect(second).toBe(source)
    expect(stretch).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      'Time-stretch WASM failed to load or process audio; using native-rate playback.',
      failure
    )
  })

  it('uses the default warning path when BPM validation fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const source = buffer('source')
    const engine = new TimeStretchEngine()

    await expect(engine.prepare('loop.wav', source, 0, 120)).resolves.toBe(source)

    expect(warn).toHaveBeenCalledWith(
      'Time-stretch skipped because the BPM value is invalid.',
      expect.any(RangeError)
    )
  })

  it('falls back when the default processor receives an invalid ratio or no offline context', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const source = buffer('source')
    const invalidRatioEngine = new TimeStretchEngine()

    await expect(
      invalidRatioEngine.prepare('overflow.wav', source, Number.MIN_VALUE, Number.MAX_VALUE)
    ).resolves.toBe(source)

    vi.stubGlobal('OfflineAudioContext', undefined)
    const unavailableContextEngine = new TimeStretchEngine()
    await expect(
      unavailableContextEngine.prepare('loop.wav', source, 60, 120)
    ).resolves.toBe(source)
  })
})
