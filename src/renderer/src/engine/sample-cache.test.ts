import { describe, expect, it, vi } from 'vitest'
import { SampleCache, SampleDecodeError } from './sample-cache'

function makeBuffer(id: string): AudioBuffer {
  return { duration: 1, sampleRate: 44100, _id: id } as unknown as AudioBuffer
}

describe('SampleCache', () => {
  // AC-010
  it('decodes a sample once and returns the cached buffer on subsequent loads', async () => {
    const decode = vi.fn(async () => makeBuffer('a'))
    const cache = new SampleCache(decode)

    const first = await cache.load('sample-a', new ArrayBuffer(8))
    const second = await cache.load('sample-a', new ArrayBuffer(8))

    expect(decode).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('deduplicates concurrent decodes of the same sample', async () => {
    const decode = vi.fn(async () => makeBuffer('a'))
    const cache = new SampleCache(decode)

    const [a, b] = await Promise.all([
      cache.load('sample-a', new ArrayBuffer(8)),
      cache.load('sample-a', new ArrayBuffer(8))
    ])

    expect(decode).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  // AC-011
  it('reports a decode error without caching and without throwing a raw error', async () => {
    const decode = vi.fn(async () => {
      throw new Error('corrupt')
    })
    const cache = new SampleCache(decode)

    await expect(cache.load('bad', new ArrayBuffer(8))).rejects.toBeInstanceOf(SampleDecodeError)
    expect(cache.has('bad')).toBe(false)

    // A later successful decode of the same id still works (cache wasn't poisoned).
    const good = new SampleCache(vi.fn(async () => makeBuffer('ok')))
    expect(await good.load('ok', new ArrayBuffer(8))).toBeDefined()
  })

  it('evicts least-recently-used entries beyond the configured cap', async () => {
    const cache = new SampleCache(vi.fn(async () => makeBuffer('x')), { maxEntries: 2 })

    expect(cache.capacity).toBe(2)

    await cache.load('a', new ArrayBuffer(8))
    await cache.load('b', new ArrayBuffer(8))
    // Touch 'a' so 'b' becomes least-recently-used.
    cache.peek('a')
    await cache.load('c', new ArrayBuffer(8))

    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('c')).toBe(true)
    expect(cache.size).toBe(2)
  })

  it('discards decoded entries outside a requested working set', async () => {
    const cache = new SampleCache(vi.fn(async () => makeBuffer('x')))
    await cache.load('past', new ArrayBuffer(8))
    await cache.load('upcoming', new ArrayBuffer(8))

    cache.retain(new Set(['upcoming']))

    expect(cache.has('past')).toBe(false)
    expect(cache.has('upcoming')).toBe(true)
  })

  it('does not restore an invalidated entry when its pending decode resolves', async () => {
    let resolvePast!: (buffer: AudioBuffer) => void
    const pastDecode = new Promise<AudioBuffer>((resolve) => { resolvePast = resolve })
    const staleBuffer = makeBuffer('stale')
    const replacementBuffer = makeBuffer('replacement')
    const decode = vi.fn()
      .mockReturnValueOnce(pastDecode)
      .mockResolvedValueOnce(replacementBuffer)
    const cache = new SampleCache(decode)

    const staleLoad = cache.load('past', new ArrayBuffer(8))
    cache.retain(new Set())
    const replacement = await cache.load('past', new ArrayBuffer(8))
    resolvePast(staleBuffer)

    await expect(staleLoad).resolves.toBe(staleBuffer)
    expect(cache.peek('past')).toBe(replacement)
    expect(cache.peek('past')).toBe(replacementBuffer)
    expect(decode).toHaveBeenCalledTimes(2)
  })
})
