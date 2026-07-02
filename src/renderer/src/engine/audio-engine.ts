// The AudioEngine owns the single AudioContext, the master gain stage, a master
// metering tap, the mixer-channel factory, and the active-voice registry.
//
// Engine boundary: pure TypeScript over the Web Audio API. Zero imports from
// React, DOM, state management, or IPC. Communication out happens through the
// VoiceEvents callbacks and the polled meter surface — the engine never knows
// who is listening.

import { type Channel, createChannel } from './channel'
import { type Voice, createVoice } from './voice'
import { SampleCache, type SampleCacheOptions } from './sample-cache'

// Factory injected so tests can supply a mock AudioContext. In production this
// is `() => new AudioContext()`.
export type AudioContextFactory = () => AudioContext

export interface AudioEngineOptions {
  createContext?: AudioContextFactory
  sampleCache?: SampleCacheOptions
  // FFT size for the master analyser; smaller is cheaper, larger is smoother.
  meterFftSize?: number
}

export interface TriggerVoiceParams {
  buffer: AudioBuffer
  channel: Channel
  when: number
  trackIndex: number
}

const SILENCE_DB = -100

function defaultContextFactory(): AudioContext {
  return new AudioContext()
}

export class AudioEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private meterBuffer: Float32Array<ArrayBuffer> | null = null
  private readonly createContextImpl: AudioContextFactory
  private readonly meterFftSize: number
  private readonly activeVoices = new Set<Voice>()
  private masterGainValue = 1
  private channelCount = 0
  private readonly channels = new Map<number, Channel>()
  readonly samples: SampleCache

  constructor(options: AudioEngineOptions = {}) {
    this.createContextImpl = options.createContext ?? defaultContextFactory
    this.meterFftSize = options.meterFftSize ?? 1024
    this.samples = new SampleCache(
      (bytes) => this.ensureContext().decodeAudioData(bytes),
      options.sampleCache
    )
  }

  // The AudioContext is created lazily on first use so nothing starts before a
  // user gesture (browser autoplay policy).
  ensureContext(): AudioContext {
    if (this.context) return this.context

    const context = this.createContextImpl()
    const masterGain = context.createGain()
    masterGain.gain.value = this.masterGainValue

    const analyser = context.createAnalyser()
    analyser.fftSize = this.meterFftSize

    // Master bus: channels -> masterGain -> analyser(tap) -> destination. The
    // analyser sits after the gain stage so the meter reflects real output.
    masterGain.connect(analyser)
    analyser.connect(context.destination)

    this.context = context
    this.masterGain = masterGain
    this.analyser = analyser
    this.meterBuffer = new Float32Array(analyser.fftSize)
    return context
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0
  }

  get activeVoiceCount(): number {
    return this.activeVoices.size
  }

  // Resume the AudioContext after a user gesture (autoplay policy).
  async resume(): Promise<void> {
    await this.ensureContext().resume()
  }

  // Creates (or returns) the mixer channel for the given index. The registry is
  // keyed by the caller's index — lane N always maps to channel N — never by
  // creation order, so channels created lazily out of order still resolve.
  // Omitting the index allocates the next sequential slot.
  createChannel(channelIndex?: number): Channel {
    this.ensureContext()
    const index = channelIndex ?? this.channelCount
    const existing = this.channels.get(index)
    if (existing) return existing
    const channel = createChannel(this.context!, index)
    channel.output.connect(this.masterGain!)
    this.channels.set(index, channel)
    this.channelCount = Math.max(this.channelCount, index + 1)
    return channel
  }

  getChannel(channelIndex: number): Channel | undefined {
    return this.channels.get(channelIndex)
  }

  setChannelPan(channelIndex: number, pan: number): void {
    const channel = this.channels.get(channelIndex)
    if (channel) channel.setPan(pan)
  }

  // Play a one-shot preview of a buffer through a dedicated temporary gain node
  // connected directly to the master bus. Returns the voice so the caller can
  // stop it early if needed.
  // `when` defaults to 0 (immediate); pass a future AudioContext time to
  // schedule the preview at a specific moment (e.g. next downbeat).
  previewBuffer(buffer: AudioBuffer, when = 0, onEnded?: (voice: Voice) => void): Voice {
    this.ensureContext()
    const previewGain = this.context!.createGain()
    previewGain.gain.value = 0.8
    previewGain.connect(this.masterGain!)
    const voice = createVoice({
      context: this.context!,
      buffer,
      destination: previewGain,
      when,
      trackIndex: -1,
      events: {
        onStarted: (v) => this.activeVoices.add(v),
        onEnded: (v) => {
          this.activeVoices.delete(v)
          previewGain.disconnect()
          onEnded?.(v)
        }
      }
    })
    return voice
  }

  // Creates a new AudioBufferSourceNode, routes it through the channel's
  // gain/pan chain into the master bus, and registers it as an active voice.
  triggerVoice({ buffer, channel, when, trackIndex }: TriggerVoiceParams): Voice {
    this.ensureContext()
    const voice = createVoice({
      context: this.context!,
      buffer,
      destination: channel.input,
      when,
      trackIndex,
      events: {
        onStarted: (v) => this.activeVoices.add(v),
        onEnded: (v) => this.activeVoices.delete(v)
      }
    })
    return voice
  }

  // 0..1, applied after all channel routing.
  setMasterGain(value: number): void {
    this.masterGainValue = Math.min(1, Math.max(0, value))
    if (this.masterGain) this.masterGain.gain.value = this.masterGainValue
  }

  get masterGainLevel(): number {
    return this.masterGainValue
  }

  // Current master output loudness in dBFS (<= 0), computed as RMS over the
  // analyser's time-domain window. Returns SILENCE_DB before the context exists
  // or when the bus is silent. Drives the Song Controls meter.
  getMasterLevelDb(): number {
    if (!this.analyser || !this.meterBuffer) return SILENCE_DB
    this.analyser.getFloatTimeDomainData(this.meterBuffer)

    let sumSquares = 0
    for (let i = 0; i < this.meterBuffer.length; i++) {
      const sample = this.meterBuffer[i]
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / this.meterBuffer.length)
    if (rms <= 0) return SILENCE_DB
    return Math.max(SILENCE_DB, 20 * Math.log10(rms))
  }

  // Immediately stops all active voices. Each voice's onended handler removes it
  // from the registry, but we clear eagerly so the count drops synchronously.
  stopAllVoices(): void {
    for (const voice of this.activeVoices) {
      voice.stop()
    }
    this.activeVoices.clear()
  }

  async close(): Promise<void> {
    this.stopAllVoices()
    this.samples.clear()
    // Channels belong to the closed context; a later ensureContext() builds a
    // fresh graph, so stale channel nodes must not survive the close.
    this.channels.clear()
    this.channelCount = 0
    if (this.context) {
      await this.context.close()
      this.context = null
      this.masterGain = null
      this.analyser = null
      this.meterBuffer = null
    }
  }
}
