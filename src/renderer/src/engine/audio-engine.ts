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
import { clamp } from '../lib/sample-utils'
import type { EffectSlot } from './effects'
import {
  MasterMeter,
  type MasterMeterOptions,
  type MasterMeterSnapshot
} from './master-meter'
import type { ClipEdgeFadePlan } from './clip-edge-fades'

// Factory injected so tests can supply a mock AudioContext. In production this
// is `() => new AudioContext()`.
export type AudioContextFactory = () => AudioContext

export interface AudioEngineOptions {
  createContext?: AudioContextFactory
  sampleCache?: SampleCacheOptions
  // FFT size for the master analyser; smaller is cheaper, larger is smoother.
  meterFftSize?: number
  masterMeter?: MasterMeterOptions
}

export interface TriggerVoiceParams {
  buffer: AudioBuffer
  channel: Channel
  when: number
  laneIndex: number
  playbackRate?: number
  sourceOffsetSeconds?: number
  edgeFadePlan?: ClipEdgeFadePlan
  edgeFadeStartSample?: number
}

const SILENCE_DB = -100
// FFT size for per-channel analysers — small for low-latency meter reads.
const CHANNEL_METER_FFT = 256

function defaultContextFactory(): AudioContext {
  return new AudioContext()
}

// Deferred-init audio nodes — all created together by ensureContext(), never
// individually. Access through the `ctx` getter so there is never a null check
// or non-null assertion at the call site.
interface AudioNodes {
  context: AudioContext
  masterGain: GainNode
  analyser: AnalyserNode
  meterBuffer: Float32Array<ArrayBuffer>
  bypassNode: GainNode
}

export class AudioEngine {
  private nodes: AudioNodes | null = null
  private readonly createContextImpl: AudioContextFactory
  private readonly meterFftSize: number
  private readonly masterMeter: MasterMeter
  private readonly activeVoices = new Set<Voice>()
  private masterGainValue = 1
  private channelCount = 0
  private readonly channels = new Map<number, Channel>()
  // Per-channel analyser nodes inserted after the channel pan node, before master.
  private readonly channelAnalysers = new Map<number, AnalyserNode>()
  // Per-channel meter read buffers (reused across frames).
  private readonly channelMeterBuffers = new Map<number, Float32Array>()
  readonly samples: SampleCache

  constructor(options: AudioEngineOptions = {}) {
    this.createContextImpl = options.createContext ?? defaultContextFactory
    this.meterFftSize = options.meterFftSize ?? 1024
    this.masterMeter = new MasterMeter(options.masterMeter)
    this.samples = new SampleCache(
      (bytes) => this.ctx.context.decodeAudioData(bytes),
      options.sampleCache
    )
  }

  /** Guaranteed-non-null access to the deferred-init audio graph. Every public
   *  method calls this instead of `ensureContext()` + `!` assertions. */
  private get ctx(): AudioNodes {
    if (this.nodes) return this.nodes

    const context = this.createContextImpl()
    const masterGain = context.createGain()
    masterGain.gain.value = this.masterGainValue

    const analyser = context.createAnalyser()
    analyser.fftSize = this.meterFftSize

    // Master bus: channels -> masterGain -> analyser(tap) -> destination.
    masterGain.connect(analyser)
    analyser.connect(context.destination)

    // Master bypass bus for orphan lanes: unity-gain node feeding directly into
    // the master gain.
    const bypassNode = context.createGain()
    bypassNode.gain.value = 1
    bypassNode.connect(masterGain)

    const nodes: AudioNodes = {
      context,
      masterGain,
      analyser,
      meterBuffer: new Float32Array(analyser.fftSize),
      bypassNode
    }
    this.nodes = nodes
    return nodes
  }

  /** Creates the AudioContext if it does not exist yet and returns it. Kept for
   *  external callers (PlaybackEngine, tests) that need the raw context reference. */
  ensureContext(): AudioContext {
    return this.ctx.context
  }

  /** Exposed for PlaybackEngine to pass to the scheduler clock. */
  get currentTime(): number {
    return this.nodes?.context.currentTime ?? 0
  }

  get activeVoiceCount(): number {
    return this.activeVoices.size
  }

  /** Resume the AudioContext after a user gesture (autoplay policy). */
  async resume(): Promise<void> {
    const { context, masterGain } = this.ctx
    await context.resume()
    // Optional telemetry must never delay or reject audible playback.
    void this.masterMeter.initialize(context, masterGain, context.destination)
  }

  createChannel(channelIndex?: number): Channel {
    const { context, masterGain } = this.ctx
    const index = channelIndex ?? this.channelCount
    const existing = this.channels.get(index)
    if (existing) return existing
    const channel = createChannel(context, index)

    const analyser = context.createAnalyser()
    analyser.fftSize = CHANNEL_METER_FFT
    channel.output.connect(analyser)
    analyser.connect(masterGain)

    this.channelAnalysers.set(index, analyser)
    this.channelMeterBuffers.set(index, new Float32Array(CHANNEL_METER_FFT))

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

  setChannelGain(channelIndex: number, gain: number): void {
    const channel = this.channels.get(channelIndex)
    if (channel) channel.setGain(gain)
  }

  setChannelEffects(channelIndex: number, effects: readonly EffectSlot[], bpm: number): void {
    const channel = this.channels.get(channelIndex)
    if (channel) channel.setEffects(effects, bpm)
  }

  getChannelAnalyser(channelIndex: number): AnalyserNode | undefined {
    return this.channelAnalysers.get(channelIndex)
  }

  getChannelEffectReduction(channelIndex: number, effectId: string): number {
    return this.channels.get(channelIndex)?.getEffectReduction(effectId) ?? 0
  }

  removeChannel(channelIndex: number): void {
    const channel = this.channels.get(channelIndex)
    const analyser = this.channelAnalysers.get(channelIndex)
    if (channel) {
      channel.disconnect()
      this.channels.delete(channelIndex)
    }
    if (analyser) {
      analyser.disconnect()
      this.channelAnalysers.delete(channelIndex)
      this.channelMeterBuffers.delete(channelIndex)
    }
  }

  /** The master bypass bus — a unity-gain GainNode that orphan lanes connect
   *  to. Lazily created on first access. */
  get masterBypass(): GainNode {
    return this.ctx.bypassNode
  }

  /** Preview a buffer as a one-shot through a temporary gain node connected
   *  directly to the master bus. */
  previewBuffer(
    buffer: AudioBuffer,
    when = 0,
    onEnded?: (voice: Voice) => void,
    playbackRate = 1
  ): Voice {
    const { context, masterGain } = this.ctx
    const previewGain = context.createGain()
    previewGain.gain.value = 0.8
    previewGain.connect(masterGain)
    const voice = createVoice({
      context,
      buffer,
      destination: previewGain,
      when,
      laneIndex: -1,
      playbackRate,
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

  triggerVoice({
    buffer,
    channel,
    when,
    laneIndex,
    playbackRate,
    sourceOffsetSeconds,
    edgeFadePlan,
    edgeFadeStartSample
  }: TriggerVoiceParams): Voice {
    return this.triggerVoiceTo({
      buffer,
      destination: channel.input,
      when,
      laneIndex,
      playbackRate,
      sourceOffsetSeconds,
      edgeFadePlan,
      edgeFadeStartSample
    })
  }

  triggerVoiceTo({
    buffer,
    destination,
    when,
    laneIndex,
    playbackRate,
    sourceOffsetSeconds,
    edgeFadePlan,
    edgeFadeStartSample
  }: {
    buffer: AudioBuffer
    destination: AudioNode
    when: number
    laneIndex: number
    playbackRate?: number
    sourceOffsetSeconds?: number
    edgeFadePlan?: ClipEdgeFadePlan
    edgeFadeStartSample?: number
  }): Voice {
    const { context } = this.ctx
    const voice = createVoice({
      context,
      buffer,
      destination,
      when,
      laneIndex,
      playbackRate,
      sourceOffsetSeconds,
      edgeFadePlan,
      edgeFadeStartSample,
      events: {
        onStarted: (v) => this.activeVoices.add(v),
        onEnded: (v) => this.activeVoices.delete(v)
      }
    })
    return voice
  }

  setMasterGain(value: number): void {
    this.masterGainValue = clamp(value, 0, 1)
    if (this.nodes) this.nodes.masterGain.gain.value = this.masterGainValue
  }

  get masterGainLevel(): number {
    return this.masterGainValue
  }

  /** Current master output loudness in dBFS (<= 0), computed as RMS over the
   *  analyser's time-domain window. Returns SILENCE_DB before the context
   *  exists or when the bus is silent. */
  getMasterLevelDb(): number {
    const { analyser, meterBuffer } = this.nodes ?? {}
    if (!analyser || !meterBuffer) return SILENCE_DB
    analyser.getFloatTimeDomainData(meterBuffer)

    let sumSquares = 0
    for (let i = 0; i < meterBuffer.length; i++) {
      const sample = meterBuffer[i]
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / meterBuffer.length)
    if (rms <= 0) return SILENCE_DB
    return Math.max(SILENCE_DB, 20 * Math.log10(rms))
  }

  getMasterMeterSnapshot(): MasterMeterSnapshot {
    return this.masterMeter.getSnapshot(this.getMasterLevelDb())
  }

  resetMasterMeter(): void {
    this.masterMeter.reset()
  }

  stopAllVoices(): void {
    for (const voice of this.activeVoices) {
      voice.stop()
    }
    this.activeVoices.clear()
  }

  async close(): Promise<void> {
    this.stopAllVoices()
    this.samples.clear()
    this.channels.clear()
    this.channelAnalysers.clear()
    this.channelMeterBuffers.clear()
    this.channelCount = 0
    this.masterMeter.close()
    if (this.nodes) {
      await this.nodes.context.close()
      this.nodes = null
    }
  }
}
