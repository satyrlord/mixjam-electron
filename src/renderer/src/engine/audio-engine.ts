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
import {
  createEmptyReturnModule,
  createReturnModuleProcessor,
  returnEffectDescriptors,
  createSafetyLimiter,
  RETURN_BUS_COUNT,
  type ReturnModule,
  type ReturnModuleProcessor,
  type SafetyLimiter
} from './return-effects'
import {
  MasterMeter,
  type MasterMeterOptions,
  type MasterMeterSnapshot
} from './master-meter'
import { MasterBusChain, type MasterBusChainOptions } from './master-bus-chain'
import { rampAudioParam } from './param-ramp'
import type { MasterBusMeterSnapshot } from './masterbus/dsp/core'
import type { MasterBusState } from './masterbus/presets'
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
  masterBus?: MasterBusChainOptions
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

// Output buffer target in seconds. The note scheduler runs on the renderer
// main thread, so the audio thread's only protection from a UI stall is how
// much rendered audio is already buffered ahead of it. MixJam is arrangement
// playback with no live input monitoring (spec-005 non-goal) and nothing in the
// app reacts to output latency, so buying the largest practical buffer is free
// resilience rather than a trade-off. 200 ms is well beyond the worst stalls
// measured during tab switching.
const OUTPUT_LATENCY_HINT_SECONDS = 0.2

function defaultContextFactory(): AudioContext {
  return new AudioContext({ latencyHint: OUTPUT_LATENCY_HINT_SECONDS })
}

// Deferred-init audio nodes — all created together by ensureContext(), never
// individually. Access through the `ctx` getter so there is never a null check
// or non-null assertion at the call site.
interface AudioNodes {
  context: AudioContext
  masterGain: GainNode
  analyser: AnalyserNode
  meterBuffer: Float32Array<ArrayBuffer>
  returns: ReturnBusNodes[]
}

interface ReturnBusNodes {
  readonly input: GainNode
  readonly poweredInput: GainNode
  readonly returnGain: GainNode
  readonly limiter: SafetyLimiter
  module: ReturnModule
  processor: ReturnModuleProcessor
  powered: boolean
}

export interface ReturnBusSnapshot {
  module: ReturnModule
  powered: boolean
  returnLevel: number
  limiterEnabled: boolean
}

export type ChannelSendSnapshot = readonly [number, number, number, number]

export class AudioEngine {
  private nodes: AudioNodes | null = null
  private readonly createContextImpl: AudioContextFactory
  private readonly meterFftSize: number
  private readonly masterMeter: MasterMeter
  private readonly masterBusChain: MasterBusChain
  private readonly activeVoices = new Set<Voice>()
  private masterGainValue = 1
  private channelCount = 0
  private readonly channels = new Map<number, Channel>()
  private readonly returnConnectedChannels = new Set<number>()
  // Per-channel analyser nodes inserted after the channel pan node, before master.
  private readonly channelAnalysers = new Map<number, AnalyserNode>()
  // Per-channel meter read buffers (reused across frames).
  private readonly channelMeterBuffers = new Map<number, Float32Array>()
  readonly samples: SampleCache

  constructor(options: AudioEngineOptions = {}) {
    this.createContextImpl = options.createContext ?? defaultContextFactory
    this.meterFftSize = options.meterFftSize ?? 1024
    this.masterMeter = new MasterMeter(options.masterMeter)
    this.masterBusChain = new MasterBusChain(options.masterBus)
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

    const nodes: AudioNodes = {
      context,
      masterGain,
      analyser,
      meterBuffer: new Float32Array(analyser.fftSize),
      returns: []
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

  /** Whether the deferred AudioContext and graph have been materialized. */
  get hasContext(): boolean {
    return this.nodes !== null
  }

  private ensureReturnBuses(): ReturnBusNodes[] {
    const nodes = this.ctx
    if (nodes.returns.length > 0) return nodes.returns
    const { context, masterGain } = nodes
    nodes.returns = Array.from({ length: RETURN_BUS_COUNT }, (_, index) => {
      const input = context.createGain()
      const poweredInput = context.createGain()
      const returnGain = context.createGain()
      const module = createEmptyReturnModule(`fx-${index + 1}`)
      const processor = createReturnModuleProcessor(context, module, 120)
      const limiter = createSafetyLimiter(context, true)
      input.connect(poweredInput)
      poweredInput.connect(processor.input)
      processor.output.connect(returnGain)
      returnGain.connect(limiter.input)
      limiter.output.connect(masterGain)
      poweredInput.gain.value = 0
      returnGain.gain.value = 1
      return { input, poweredInput, returnGain, limiter, module, processor, powered: true }
    })
    return nodes.returns
  }

  /** Resume the AudioContext after a user gesture (autoplay policy). */
  async resume(): Promise<void> {
    const { context, masterGain, analyser } = this.ctx
    await context.resume()
    // Every registered FX-return processor must be registered before a
    // populated Return snapshot is materialized. Driven by the effect registry
    // so a new effect prepares automatically. Unsupported test contexts use
    // their identity fallbacks; Electron's production AudioContext loads the
    // same-origin worklets emitted by Vite.
    await Promise.all(
      returnEffectDescriptors().map((descriptor) => descriptor.prepareWorklet(context))
    )
    // The master bus strip inserts between masterGain and the analyser tap
    // (spec-012 signal position); the loudness meter then taps the chain
    // output so all master readouts are post-chain and delivery-accurate.
    // Neither may delay or reject audible playback.
    void this.masterBusChain.initialize(context, masterGain, analyser).then(() => {
      const source = this.masterBusChain.output ?? masterGain
      void this.masterMeter.initialize(context, source, context.destination)
    })
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

  setChannelSends(channelIndex: number, sends: ChannelSendSnapshot): void {
    const channel = this.channels.get(channelIndex)
    if (!channel) return
    if (!this.returnConnectedChannels.has(channelIndex)) {
      const returns = this.ensureReturnBuses()
      for (let sendIndex = 0; sendIndex < RETURN_BUS_COUNT; sendIndex += 1) {
        channel.sendOutputs[sendIndex]!.connect(returns[sendIndex]!.input)
      }
      this.returnConnectedChannels.add(channelIndex)
    }
    for (let index = 0; index < RETURN_BUS_COUNT; index += 1) channel.setSend(index, sends[index]!)
  }

  setReturnBus(index: number, snapshot: ReturnBusSnapshot, bpm: number): void {
    const bus = this.ensureReturnBuses()[index]
    if (!bus) return
    const sameType = bus.module.type === snapshot.module.type
    if (!sameType) {
      bus.processor.dispose()
      bus.processor = createReturnModuleProcessor(this.ctx.context, snapshot.module, bpm)
      bus.poweredInput.disconnect()
      bus.poweredInput.connect(bus.processor.input)
      bus.processor.output.connect(bus.returnGain)
    } else {
      bus.processor.update(snapshot.module, bpm)
    }
    bus.module = { ...snapshot.module }
    bus.powered = snapshot.powered
    // Live edits ramp: powering a bus and dragging its return level are both
    // continuous user gestures, and stepping either one clicks.
    const context = this.ctx.context
    const poweredGain = snapshot.powered && snapshot.module.type !== 'empty' ? 1 : 0
    rampAudioParam(bus.poweredInput.gain, poweredGain, context)
    rampAudioParam(bus.returnGain.gain, clamp(snapshot.returnLevel, 0, 1), context)
    bus.limiter.setEnabled(snapshot.limiterEnabled)
  }

  /** Momentary command: flush a Return module's audio history (Clear Tail). */
  clearReturnTail(index: number): void {
    this.nodes?.returns[index]?.processor.clearTail?.()
  }

  /** Replace project-owned Return graphs even when the module type is unchanged.
   * This cuts buffered tails at project replacement boundaries. */
  replaceReturnBuses(
    snapshots: readonly (ReturnBusSnapshot & { index: number })[],
    bpm: number
  ): void {
    const byIndex = new Map(snapshots.map((snapshot) => [snapshot.index, snapshot] as const))
    for (let index = 0; index < RETURN_BUS_COUNT; index += 1) {
      const snapshot = byIndex.get(index)
      if (!snapshot) continue
      const bus = this.ensureReturnBuses()[index]!
      bus.processor.dispose()
      bus.poweredInput.disconnect()
      bus.processor = createReturnModuleProcessor(this.ctx.context, snapshot.module, bpm)
      bus.poweredInput.connect(bus.processor.input)
      bus.processor.output.connect(bus.returnGain)
      bus.module = { ...snapshot.module }
      bus.powered = snapshot.powered
      bus.poweredInput.gain.value = snapshot.powered && snapshot.module.type !== 'empty' ? 1 : 0
      bus.returnGain.gain.value = clamp(snapshot.returnLevel, 0, 1)
      bus.limiter.setEnabled(snapshot.limiterEnabled)
    }
  }

  getChannelAnalyser(channelIndex: number): AnalyserNode | undefined {
    return this.channelAnalysers.get(channelIndex)
  }

  removeChannel(channelIndex: number): void {
    const channel = this.channels.get(channelIndex)
    const analyser = this.channelAnalysers.get(channelIndex)
    if (channel) {
      channel.disconnect()
      this.channels.delete(channelIndex)
      this.returnConnectedChannels.delete(channelIndex)
    }
    if (analyser) {
      analyser.disconnect()
      this.channelAnalysers.delete(channelIndex)
      this.channelMeterBuffers.delete(channelIndex)
    }
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
    if (this.nodes) {
      rampAudioParam(this.nodes.masterGain.gain, this.masterGainValue, this.nodes.context)
    }
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

  /**
   * Applies strip state. 'replace' snaps without fading (project load);
   * 'reconcile' diffs and lets the worklet crossfade/smooth the changes.
   */
  applyMasterBusState(state: MasterBusState, mode: 'reconcile' | 'replace' = 'replace'): void {
    if (mode === 'reconcile') this.masterBusChain.reconcile(state)
    else this.masterBusChain.applyState(state)
  }

  getMasterBusMeterSnapshot(): MasterBusMeterSnapshot | null {
    return this.masterBusChain.getMeterSnapshot()
  }

  /** Streams strip meter snapshots only while the Master tab shows them. */
  setMasterBusMetersActive(active: boolean): void {
    this.masterBusChain.setMetersEnabled(active)
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
    this.returnConnectedChannels.clear()
    this.channelAnalysers.clear()
    this.channelMeterBuffers.clear()
    this.channelCount = 0
    this.masterMeter.close()
    this.masterBusChain.close()
    if (this.nodes) {
      for (const bus of this.nodes.returns) {
        bus.processor.dispose()
        bus.limiter.dispose()
        bus.input.disconnect()
        bus.poweredInput.disconnect()
        bus.returnGain.disconnect()
      }
      await this.nodes.context.close()
      this.nodes = null
    }
  }
}
