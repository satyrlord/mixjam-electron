import bungeeProcessorUrl from 'bungee-pitch-shift/processor?url'

export interface TimeStretchProcessor {
  stretch(buffer: AudioBuffer, speedRatio: number): Promise<AudioBuffer>
}

export interface TimeStretchEngineOptions {
  processor?: TimeStretchProcessor
  maxEntries?: number
  warn?: (message: string, cause?: unknown) => void
}

const DEFAULT_MAX_ENTRIES = 32
const RATIO_PRECISION = 1_000_000

function defaultWarn(message: string, cause?: unknown): void {
  console.warn(message, cause)
}

export function stretchRatio(
  nativeBpm: number | null | undefined,
  projectBpm: number
): number | null {
  if (nativeBpm == null) return null
  if (!Number.isFinite(nativeBpm) || nativeBpm <= 0) {
    throw new RangeError('Native BPM must be a positive finite number')
  }
  if (!Number.isFinite(projectBpm) || projectBpm <= 0) {
    throw new RangeError('Project BPM must be a positive finite number')
  }
  return projectBpm / nativeBpm
}

function cacheKey(sampleId: string, ratio: number): string {
  const normalized = Math.round(ratio * RATIO_PRECISION) / RATIO_PRECISION
  return `${sampleId}\u0000${normalized}`
}

/**
 * Pitch-preserving offline stretcher backed by Bungee's AudioWorklet/WASM
 * processor. The module and embedded WASM are fetched only on the first
 * non-passthrough stretch.
 */
class WasmTimeStretchProcessor implements TimeStretchProcessor {
  async stretch(buffer: AudioBuffer, speedRatio: number): Promise<AudioBuffer> {
    if (!Number.isFinite(speedRatio) || speedRatio <= 0) {
      throw new RangeError('Stretch ratio must be a positive finite number')
    }
    if (Math.abs(speedRatio - 1) < Number.EPSILON) return buffer
    if (typeof OfflineAudioContext === 'undefined') {
      throw new Error('OfflineAudioContext is unavailable')
    }

    const { BungeePitchShift } = await import('bungee-pitch-shift')
    const outputLength = Math.max(1, Math.ceil(buffer.length / speedRatio))
    const context = new OfflineAudioContext(
      Math.min(2, Math.max(1, buffer.numberOfChannels)),
      outputLength,
      buffer.sampleRate
    )
    const processor = await BungeePitchShift.create(context as unknown as AudioContext, {
      workletPath: bungeeProcessorUrl,
      initialPitch: 0,
      initialSpeed: speedRatio,
      initialMix: 1
    })

    try {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(processor.node)
      processor.connect(context.destination)
      source.start(0)
      return await context.startRendering()
    } finally {
      processor.dispose()
    }
  }
}

/**
 * Resolves a lane's source buffer to its project-tempo buffer. Completed and
 * in-flight work are both deduplicated by (sample id, ratio), with LRU eviction
 * bounding completed buffers. A processor failure disables stretching for the
 * playback runtime and returns the native buffer so playback remains available.
 */
export class TimeStretchEngine {
  private readonly processor: TimeStretchProcessor
  private readonly maxEntries: number
  private readonly warn: (message: string, cause?: unknown) => void
  private readonly buffers = new Map<string, AudioBuffer>()
  private readonly pending = new Map<string, Promise<AudioBuffer>>()
  private disabled = false

  constructor(options: TimeStretchEngineOptions = {}) {
    this.processor = options.processor ?? new WasmTimeStretchProcessor()
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES)
    this.warn = options.warn ?? defaultWarn
  }

  get size(): number {
    return this.buffers.size
  }

  async prepare(
    sampleId: string,
    source: AudioBuffer,
    nativeBpm: number | null | undefined,
    projectBpm: number
  ): Promise<AudioBuffer> {
    let ratio: number | null
    try {
      ratio = stretchRatio(nativeBpm, projectBpm)
    } catch (cause) {
      this.warn('Time-stretch skipped because the BPM value is invalid.', cause)
      return source
    }

    if (ratio === null || Math.abs(ratio - 1) < Number.EPSILON || this.disabled) {
      return source
    }

    const key = cacheKey(sampleId, ratio)
    const cached = this.buffers.get(key)
    if (cached) {
      this.touch(key, cached)
      return cached
    }

    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight

    const request = this.processor.stretch(source, ratio)
      .then((buffer) => {
        this.touch(key, buffer)
        this.evictIfNeeded()
        return buffer
      })
      .catch((cause: unknown) => {
        if (!this.disabled) {
          this.disabled = true
          this.warn('Time-stretch WASM failed to load or process audio; using native-rate playback.', cause)
        }
        return source
      })
      .finally(() => {
        this.pending.delete(key)
      })

    this.pending.set(key, request)
    return request
  }

  clear(): void {
    this.buffers.clear()
    this.pending.clear()
  }

  private touch(key: string, buffer: AudioBuffer): void {
    this.buffers.delete(key)
    this.buffers.set(key, buffer)
  }

  private evictIfNeeded(): void {
    while (this.buffers.size > this.maxEntries) {
      const oldest = this.buffers.keys().next().value
      if (oldest === undefined) break
      this.buffers.delete(oldest)
    }
  }
}
