// Decodes raw sample bytes into AudioBuffers once and caches them by sample ID
// with an LRU eviction policy so a 35GB library never tries to live in memory.
//
// Engine boundary: pure TypeScript. No React, no DOM, no IPC. Bytes are handed
// in by the caller (the renderer mediates the main-process read); the cache
// never touches the filesystem.

export type DecodeAudioData = (bytes: ArrayBuffer) => Promise<AudioBuffer>

export interface SampleCacheOptions {
  // Maximum number of decoded buffers retained before LRU eviction kicks in.
  maxEntries?: number
}

interface PendingDecode {
  token: symbol
  promise: Promise<AudioBuffer>
}

const DEFAULT_MAX_ENTRIES = 64

export class SampleDecodeError extends Error {
  constructor(
    readonly sampleId: string,
    readonly cause: unknown
  ) {
    super(`Failed to decode sample "${sampleId}": ${String(cause)}`)
    this.name = 'SampleDecodeError'
  }
}

export class SampleCache {
  // Map preserves insertion order; we treat it as an LRU by re-inserting on hit.
  private readonly buffers = new Map<string, AudioBuffer>()
  // In-flight decodes are deduplicated so two concurrent requests for the same
  // sample share one decode rather than racing.
  private readonly pending = new Map<string, PendingDecode>()
  private readonly maxEntries: number

  constructor(
    private readonly decode: DecodeAudioData,
    options: SampleCacheOptions = {}
  ) {
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES)
  }

  get size(): number {
    return this.buffers.size
  }

  get capacity(): number {
    return this.maxEntries
  }

  has(sampleId: string): boolean {
    return this.buffers.has(sampleId)
  }

  // Returns the cached buffer if present, marking it most-recently-used.
  peek(sampleId: string): AudioBuffer | undefined {
    const buffer = this.buffers.get(sampleId)
    if (buffer === undefined) return undefined
    this.touch(sampleId, buffer)
    return buffer
  }

  // Decodes the given bytes if the sample is not already cached, otherwise
  // returns the cached buffer without re-decoding. A failed decode rejects with
  // a SampleDecodeError and leaves the cache unchanged.
  async load(sampleId: string, bytes: ArrayBuffer): Promise<AudioBuffer> {
    const cached = this.buffers.get(sampleId)
    if (cached !== undefined) {
      this.touch(sampleId, cached)
      return cached
    }

    const inFlight = this.pending.get(sampleId)
    if (inFlight !== undefined) return inFlight.promise

    const token = Symbol(sampleId)
    const decodePromise = this.decode(bytes)
      .then((buffer) => {
        if (this.pending.get(sampleId)?.token === token) {
          this.touch(sampleId, buffer)
          this.evictIfNeeded()
        }
        return buffer
      })
      .catch((cause: unknown) => {
        throw new SampleDecodeError(sampleId, cause)
      })
      .finally(() => {
        if (this.pending.get(sampleId)?.token === token) {
          this.pending.delete(sampleId)
        }
      })

    this.pending.set(sampleId, { token, promise: decodePromise })
    return decodePromise
  }

  clear(): void {
    this.buffers.clear()
    this.pending.clear()
  }

  retain(sampleIds: ReadonlySet<string>): void {
    for (const sampleId of this.buffers.keys()) {
      if (!sampleIds.has(sampleId)) this.buffers.delete(sampleId)
    }
    for (const sampleId of this.pending.keys()) {
      if (!sampleIds.has(sampleId)) this.pending.delete(sampleId)
    }
  }

  private touch(sampleId: string, buffer: AudioBuffer): void {
    // Delete + re-insert moves the entry to the most-recently-used end.
    this.buffers.delete(sampleId)
    this.buffers.set(sampleId, buffer)
  }

  private evictIfNeeded(): void {
    while (this.buffers.size > this.maxEntries) {
      const oldest = this.buffers.keys().next().value
      if (oldest === undefined) break
      this.buffers.delete(oldest)
    }
  }
}
