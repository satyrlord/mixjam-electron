// PlaybackEngine orchestrates the pure engine pieces into a playable whole:
// AudioEngine (context + master bus + channels), the lookahead Scheduler, lane
// evaluation, and sample loading. It is the single seam the renderer wires into.
//
// Engine boundary: pure TypeScript. The renderer injects a `loadSampleBytes`
// callback (which goes over IPC) and an AudioContext factory — the engine never
// imports IPC, React, or DOM directly.

import { AudioEngine, type AudioEngineOptions } from './audio-engine'
import { type Channel } from './channel'
import { createScheduler, type Scheduler, type SchedulerClock } from './scheduler'
import {
  type EngineLane,
  type LaneTrigger,
  triggersForPlaybackStart,
  triggersForTick
} from './lane-evaluation'
import { type Voice } from './voice'
import { stretchRatio, stretchRatioForDuration } from './time-stretch'
import type { EffectSlot } from './effects'
import type { ChannelSendSnapshot, ReturnBusSnapshot } from './audio-engine'
import type { MasterMeterSnapshot } from './master-meter'
import { tickDurationSeconds } from './transport'
import {
  createClipEdgeFadePlan,
  DEFAULT_CLIP_EDGE_MICRO_FADES,
  normalizeClipEdgeMicroFades,
  type ClipEdgeMicroFadeSettings
} from './clip-edge-fades'
import { ClipEdgeBoundaryPolicy } from './clip-edge-boundary-policy'

const PRELOAD_CONCURRENCY = 4
type SamplePreparation = 'ready' | 'failed'

// Returns the raw bytes for a sample path, or null if unreadable.
export type LoadSampleBytes = (samplePath: string) => Promise<ArrayBuffer | null>

export interface PlaybackEngineOptions extends AudioEngineOptions {
  loadSampleBytes: LoadSampleBytes
  // Returns the current arrangement of lanes. Read on every scheduler tick so
  // edits made during playback take effect.
  getLanes: () => readonly EngineLane[]
  bpm?: number
  clock?: SchedulerClock
  // Audio clock override for tests (defaults to engine.currentTime).
  now?: () => number
  clipEdgeMicroFades?: ClipEdgeMicroFadeSettings
}

export interface PlaybackChannelSnapshot {
  laneId: string
  channelIndex: number
  gain: number
  pan: number
  muted: boolean
  solo: boolean
  effects: readonly EffectSlot[]
  sends: ChannelSendSnapshot
}

export interface PlaybackReturnSnapshot extends ReturnBusSnapshot {
  index: number
}

export class PlaybackEngine {
  private readonly engine: AudioEngine
  private readonly scheduler: Scheduler
  // Persist channel controls so lazily-created channels can replay state.
  private readonly channelPans = new Map<number, number>()
  private readonly channelGains = new Map<number, number>()
  private readonly channelMutes = new Map<number, boolean>()
  private readonly channelSolos = new Map<number, boolean>()
  private readonly channelEffects = new Map<number, readonly EffectSlot[]>()
  private readonly channelSends = new Map<number, ChannelSendSnapshot>()
  private readonly channelLaneIds = new Map<number, string>()
  private readonly returnSnapshots = new Map<number, PlaybackReturnSnapshot>()
  // Persistent lane panners let live pan updates affect sounding voices.
  private readonly lanePanners = new Map<number, StereoPannerNode>()
  // The single voice currently sounding on each lane (monophonic): a new
  // trigger cuts off the previous one.
  private readonly laneVoices = new Map<number, Voice>()
  private currentBpm: number
  private lastScheduledTick = -1
  // Bumped on every stop()/pause()/close() so a trigger whose async buffer load
  // resolves after playback ended can detect it and not start a stray voice.
  private playGeneration = 0
  // Monophonic preview: only one sample previews at a time.
  private previewVoice: Voice | null = null
  private previewPath: string | null = null
  private meterFrozen = false
  private frozenMeterSnapshot: MasterMeterSnapshot | null = null
  private preloadQueue: Promise<void> = Promise.resolve()
  private clipEdgeMicroFades: ClipEdgeMicroFadeSettings = DEFAULT_CLIP_EDGE_MICRO_FADES
  private readonly clipEdgeBoundaryPolicy = new ClipEdgeBoundaryPolicy()
  private readonly laneTriggerQueues = new Map<number, Promise<void>>()
  private readonly samplePreparation = new Map<string, SamplePreparation>()

  constructor(private readonly options: PlaybackEngineOptions) {
    this.currentBpm = options.bpm ?? 120
    this.setClipEdgeMicroFades(
      options.clipEdgeMicroFades ?? DEFAULT_CLIP_EDGE_MICRO_FADES
    )
    this.engine = new AudioEngine(options)
    const now = options.now ?? (() => this.engine.currentTime)
    // The scheduler reads BPM live through this adapter so tempo changes during
    // playback take effect on the next tick.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    this.scheduler = createScheduler({
      now,
      transport: { get bpm() { return self.currentBpm } },
      onSchedule: (tick, when) => this.handleScheduledTick(tick, when),
      clock: options.clock
    })
  }

  get audioEngine(): AudioEngine {
    return this.engine
  }

  // fallow-ignore-next-line unused-class-member
  get activeVoiceCount(): number {
    return this.engine.activeVoiceCount
  }

  // The playhead tick derived from the audio clock, so the UI playhead stays in
  // lock-step with the audible scheduling rather than a separate wall-clock timer.
  get currentTick(): number {
    return this.scheduler.currentTick()
  }

  setBpm(bpm: number): void {
    this.currentBpm = bpm
    for (const channelIndex of this.channelEffects.keys()) {
      this.engine.getChannel(channelIndex)?.setBpm(bpm)
    }
    for (const snapshot of this.returnSnapshots.values()) this.engine.setReturnBus(snapshot.index, snapshot, bpm)
  }

  setMasterGain(value: number): void {
    this.engine.setMasterGain(value)
  }

  setClipEdgeMicroFades(settings: ClipEdgeMicroFadeSettings): void {
    this.clipEdgeMicroFades = normalizeClipEdgeMicroFades(settings)
  }

  getMasterMeterSnapshot(): MasterMeterSnapshot {
    return this.frozenMeterSnapshot ?? this.engine.getMasterMeterSnapshot()
  }

  resetMasterMeter(): void {
    this.engine.resetMasterMeter()
    this.meterFrozen = false
    this.frozenMeterSnapshot = null
  }

  setChannelPan(channelIndex: number, pan: number): void {
    this.channelPans.set(channelIndex, pan)
    this.engine.setChannelPan(channelIndex, pan)
  }

  // fallow-ignore-next-line unused-class-member
  setLanePan(laneIndex: number, pan: number): void {
    const panner = this.lanePanners.get(laneIndex)
    if (panner) panner.pan.value = pan
  }

  setChannelGain(channelIndex: number, gain: number): void {
    this.channelGains.set(channelIndex, gain)
    this.engine.setChannelGain(channelIndex, this.isChannelGated(channelIndex) ? 0 : gain)
  }

  setChannelEffects(channelIndex: number, effects: readonly EffectSlot[]): void {
    this.channelEffects.set(channelIndex, effects.map((effect) => ({ ...effect })))
    this.engine.setChannelEffects(channelIndex, effects, this.currentBpm)
  }

  applyReturnSnapshot(returns: readonly PlaybackReturnSnapshot[]): void {
    for (const snapshot of returns) {
      this.returnSnapshots.set(snapshot.index, { ...snapshot, module: { ...snapshot.module } })
      this.engine.setReturnBus(snapshot.index, snapshot, this.currentBpm)
    }
  }

  // fallow-ignore-next-line unused-class-member -- invoked through the renderer-owned engine ref.
  replaceReturnSnapshot(returns: readonly PlaybackReturnSnapshot[]): void {
    this.returnSnapshots.clear()
    for (const snapshot of returns) {
      this.returnSnapshots.set(snapshot.index, { ...snapshot, module: { ...snapshot.module } })
    }
    this.engine.replaceReturnBuses(returns, this.currentBpm)
  }

  /**
   * Reconciles the complete project-owned channel state into the audio graph.
   * Callers provide data, while this graph-owning module disposes removed or
   * replaced lane identities and owns effect ordering and solo/mute gating.
   */
  applyChannelSnapshot(channels: readonly PlaybackChannelSnapshot[]): void {
    const nextByIndex = new Map(
      channels.map((channel) => [channel.channelIndex, channel] as const)
    )

    for (const [channelIndex, laneId] of [...this.channelLaneIds]) {
      const next = nextByIndex.get(channelIndex)
      if (!next || next.laneId !== laneId) {
        this.disposeLaneChannel(channelIndex)
      }
    }

    for (const channel of channels) {
      const { channelIndex, laneId } = channel
      this.channelLaneIds.set(channelIndex, laneId)
      this.channelPans.set(channelIndex, channel.pan)
      this.channelGains.set(channelIndex, channel.gain)
      this.channelMutes.set(channelIndex, channel.muted)
      this.channelSolos.set(channelIndex, channel.solo)
      this.channelEffects.set(
        channelIndex,
        channel.effects.map((effect) => ({ ...effect }))
      )
      const sends = channel.sends
      this.channelSends.set(channelIndex, [sends[0], sends[1], sends[2], sends[3]])

      this.engine.setChannelPan(channelIndex, channel.pan)
      this.engine.setChannelEffects(channelIndex, channel.effects, this.currentBpm)
      this.engine.setChannelSends(channelIndex, sends)
    }

    this.applyChannelSoloMuteGating()
  }

  private isChannelGated(channelIndex: number): boolean {
    const muted = this.channelMutes.get(channelIndex) ?? false
    const solo = this.channelSolos.get(channelIndex) ?? false
    const anySoloed = this.hasAnySolo()
    if (anySoloed) return !solo
    return muted
  }

  private hasAnySolo(): boolean {
    for (const s of this.channelSolos.values()) {
      if (s) return true
    }
    return false
  }

  setChannelMute(channelIndex: number, muted: boolean): void {
    this.channelMutes.set(channelIndex, muted)
    this.applyChannelSoloMuteGating()
  }

  setChannelSolo(channelIndex: number, solo: boolean): void {
    this.channelSolos.set(channelIndex, solo)
    this.applyChannelSoloMuteGating()
  }

  private disposeLaneChannel(channelIndex: number): void {
    const voice = this.laneVoices.get(channelIndex)
    if (voice) {
      voice.stop(this.engine.currentTime)
      this.laneVoices.delete(channelIndex)
    }
    const lanePanner = this.lanePanners.get(channelIndex)
    if (lanePanner) {
      lanePanner.disconnect()
      this.lanePanners.delete(channelIndex)
    }

    this.engine.removeChannel(channelIndex)
    this.channelLaneIds.delete(channelIndex)
    this.channelPans.delete(channelIndex)
    this.channelGains.delete(channelIndex)
    this.channelMutes.delete(channelIndex)
    this.channelSolos.delete(channelIndex)
    this.channelEffects.delete(channelIndex)
    this.channelSends.delete(channelIndex)
    this.laneTriggerQueues.delete(channelIndex)
    // Re-apply gating: removing a soloed channel changes hasAnySolo(), so the
    // remaining channels' gains must be recomputed or they stay stuck at 0.
    this.applyChannelSoloMuteGating()
  }

  getChannelAnalyser(channelIndex: number): AnalyserNode | undefined {
    return this.engine.getChannelAnalyser(channelIndex)
  }

  getChannelEffectReduction(channelIndex: number, effectId: string): number {
    return this.engine.getChannelEffectReduction(channelIndex, effectId)
  }

  // Preview a sample as a one-shot.
  //
  // Monophonic toggle: clicking the same sample again stops its preview;
  // clicking a different sample stops the previous and starts the new one.
  //
  // When `whenSeconds` is provided (a future AudioContext time), the preview
  // is scheduled at that exact moment — used for quantised downbeat preview
  // while the transport is playing.  Omit to play immediately.
  async previewSample(
    samplePath: string,
    nativeBPM: number | null = null,
    whenSeconds?: number
  ): Promise<void> {
    // Toggle: same sample clicked again → stop. (previewPath is set the moment a
    // preview is requested, before the async load, so the toggle is reliable
    // even on rapid double-clicks.)
    if (samplePath === this.previewPath) {
      this.stopPreview()
      return
    }

    // Stop any previous preview and claim the path immediately so a second click
    // (same or different sample) that races the async load sees the new state.
    this.stopPreview()
    this.previewPath = samplePath

    let buffer: AudioBuffer | null
    let playbackRate: number
    try {
      await this.engine.resume()
      buffer = this.engine.samples.peek(samplePath) ?? (await this.loadBuffer(samplePath))
      playbackRate = stretchRatio(nativeBPM, this.currentBpm) ?? 1
    } catch {
      // Decode/read failure: clear the claimed path so the next click retries.
      if (this.previewPath === samplePath) this.previewPath = null
      return
    }

    // A newer preview request superseded this one while it loaded.
    if (this.previewPath !== samplePath) return
    if (!buffer) {
      this.previewPath = null
      return
    }

    this.previewVoice = this.engine.previewBuffer(buffer, whenSeconds, (voice) => {
      // Clear state when the preview ends on its own so re-clicking replays it.
      if (this.previewVoice === voice) {
        this.previewVoice = null
        this.previewPath = null
      }
    }, playbackRate)
  }

  // Decoded buffer for a sample, from cache or a fresh load. Used by the UI to
  // render waveforms; shares the cache with playback so selecting a sample
  // (which also previews it) costs a single decode.
  // Called via optional chaining on a ref in useTransportEngine.
  async getSampleBuffer(samplePath: string): Promise<AudioBuffer | null> {
    try {
      return this.engine.samples.peek(samplePath) ?? (await this.loadBuffer(samplePath))
    } catch {
      return null
    }
  }

  private stopPreview(): void {
    if (this.previewVoice) {
      this.previewVoice.stop()
      this.previewVoice = null
    }
    this.previewPath = null
  }

  // Begin scheduling from the given tick. Resumes the AudioContext first so the
  // browser autoplay policy is satisfied by the originating user gesture.
  async start(fromTick = 0): Promise<boolean> {
    const generation = this.playGeneration
    this.clipEdgeBoundaryPolicy.reset()
    this.samplePreparation.clear()
    if (this.meterFrozen && fromTick === 0) {
      this.engine.resetMasterMeter()
    }
    this.meterFrozen = false
    this.frozenMeterSnapshot = null
    await this.engine.resume()
    // Decode a bounded upcoming working set before the scheduler starts so the
    // first trigger does not pay asynchronous file-read/decode cost.
    await this.queueUpcomingPreload(fromTick, true)
    if (generation !== this.playGeneration) return false
    this.lastScheduledTick = fromTick - 1
    const activeTriggers = triggersForPlaybackStart(this.options.getLanes(), fromTick)
    await Promise.all(activeTriggers.map((trigger) =>
      this.queueLaneTrigger(
        trigger,
        this.currentBpm,
        this.engine.currentTime,
        fromTick - trigger.placement.startTick
      )
    ))
    if (generation !== this.playGeneration) return false
    if (activeTriggers.length > 0) void this.queueUpcomingPreload(fromTick + 1)
    this.scheduler.start(fromTick)
    return true
  }

  pause(): void {
    this.playGeneration++
    this.scheduler.stop()
    this.preloadQueue = Promise.resolve()
    this.engine.stopAllVoices()
    this.laneVoices.clear()
    this.laneTriggerQueues.clear()
  }

  seek(tick: number): void {
    const nextTick = Math.max(0, Math.floor(tick))
    this.playGeneration++
    this.scheduler.stop()
    this.scheduler.reset(nextTick)
    this.preloadQueue = Promise.resolve()
    this.engine.stopAllVoices()
    this.engine.resetMasterMeter()
    this.meterFrozen = false
    this.frozenMeterSnapshot = null
    this.laneVoices.clear()
    this.laneTriggerQueues.clear()
    this.lastScheduledTick = nextTick - 1
  }

  stop(): void {
    this.playGeneration++
    this.scheduler.stop()
    this.preloadQueue = Promise.resolve()
    // Stop returns the playhead to the start; pause() leaves it where it is.
    this.scheduler.reset(0)
    this.frozenMeterSnapshot = this.engine.getMasterMeterSnapshot()
    this.engine.stopAllVoices()
    this.meterFrozen = true
    this.laneVoices.clear()
    this.laneTriggerQueues.clear()
    this.lastScheduledTick = -1
  }

  async close(): Promise<void> {
    this.playGeneration++
    this.scheduler.stop()
    this.preloadQueue = Promise.resolve()
    for (const panner of this.lanePanners.values()) {
      panner.disconnect()
    }
    this.lanePanners.clear()
    await this.engine.close()
    this.channelPans.clear()
    this.channelGains.clear()
    this.channelMutes.clear()
    this.channelSolos.clear()
    this.channelEffects.clear()
    this.channelSends.clear()
    this.channelLaneIds.clear()
    this.returnSnapshots.clear()
    this.laneVoices.clear()
    this.clipEdgeBoundaryPolicy.reset()
    this.laneTriggerQueues.clear()
    this.samplePreparation.clear()
  }

  private channelFor(channelIndex: number): Channel {
    const existing = this.engine.getChannel(channelIndex)
    if (existing) return existing
    const channel = this.engine.createChannel(channelIndex)
    const pan = this.channelPans.get(channelIndex)
    if (pan !== undefined) channel.setPan(pan)
    const gain = this.channelGains.get(channelIndex)
    if (gain !== undefined) {
      const effectiveGain = this.isChannelGated(channelIndex) ? 0 : gain
      channel.setGain(effectiveGain)
    }
    const effects = this.channelEffects.get(channelIndex)
    if (effects) channel.setEffects(effects, this.currentBpm)
    const sends = this.channelSends.get(channelIndex)
    if (sends) this.engine.setChannelSends(channelIndex, sends)
    return channel
  }

  private voiceDestination(laneIndex: number, channelIndex: number, lanePan: number): AudioNode {
    let lanePanner = this.lanePanners.get(laneIndex)
    if (!lanePanner) {
      lanePanner = this.engine.ensureContext().createStereoPanner()
      this.lanePanners.set(laneIndex, lanePanner)
    }
    lanePanner.pan.value = lanePan

    const channel = this.channelFor(channelIndex)
    lanePanner.disconnect()
    lanePanner.connect(channel.input)
    return lanePanner
  }

  private applyChannelSoloMuteGating(): void {
    const anySoloed = this.hasAnySolo()
    for (const [index] of this.channelGains) {
      const muted = this.channelMutes.get(index) ?? false
      const solo = this.channelSolos.get(index) ?? false
      const gated = anySoloed ? !solo : muted
      const storedGain = this.channelGains.get(index)!
      this.engine.setChannelGain(index, gated ? 0 : storedGain)
    }
  }

  private handleScheduledTick(tick: number, when: number): void {
    // Guard against the scheduler's catch-up firing a tick twice.
    if (tick <= this.lastScheduledTick) return
    this.lastScheduledTick = tick

    const triggers = triggersForTick(this.options.getLanes(), tick)
    for (const trigger of triggers) {
      void this.queueLaneTrigger(trigger, this.currentBpm, when)
    }
    if (triggers.length > 0) void this.queueUpcomingPreload(tick + 1)
  }

  private async triggerLane(
    trigger: LaneTrigger,
    projectBpm: number,
    when: number,
    elapsedTicks = 0
  ): Promise<void> {
    const generation = this.playGeneration
    // Monophonic precedence is a timeline rule, not a sample-readiness rule.
    // Schedule the prior voice's cutoff at the successor's exact boundary even
    // when this trigger was prepared inside the lookahead window or cannot load.
    this.laneVoices.get(trigger.laneIndex)?.stop(when)
    let buffer = this.engine.samples.peek(trigger.samplePath) ?? null
    if (!buffer && this.samplePreparation.get(trigger.samplePath) === 'failed') {
      if (generation === this.playGeneration) this.propagateSilentPlacement(trigger)
      return
    }
    if (!buffer) {
      try {
        buffer = await this.loadBuffer(trigger.samplePath)
      } catch {
        // Decode/read failure: skip this trigger rather than crashing the engine.
        if (generation === this.playGeneration) {
          this.samplePreparation.set(trigger.samplePath, 'failed')
          this.propagateSilentPlacement(trigger)
        }
        return
      }
    }
    if (!buffer) {
      if (generation === this.playGeneration) {
        this.samplePreparation.set(trigger.samplePath, 'failed')
        this.propagateSilentPlacement(trigger)
      }
      return
    }
    if (generation !== this.playGeneration) return
    this.samplePreparation.set(trigger.samplePath, 'ready')

    let playbackRate = 1
    try {
      playbackRate = stretchRatioForDuration(
        buffer.duration,
        trigger.placement.durationTicks,
        projectBpm
      )
    } catch {
      // Invalid persisted timing falls back to native-rate playback instead of
      // preventing the remaining arrangement from playing.
    }

    // Playback was stopped or paused while the buffer loaded: drop
    // this trigger so no stray voice starts after the user hit stop.
    const targetOffsetSeconds = Math.max(0, elapsedTicks) * tickDurationSeconds(projectBpm)
    const sourceOffsetSeconds = targetOffsetSeconds * playbackRate
    if (!Number.isFinite(sourceOffsetSeconds) || sourceOffsetSeconds >= buffer.duration) {
      this.propagateSilentPlacement(trigger)
      return
    }
    const audibleDurationSeconds = trigger.effectiveDurationTicks *
      tickDurationSeconds(projectBpm)
    const fadeSettings = this.clipEdgeMicroFades
    const previousVoice = this.laneVoices.get(trigger.laneIndex)
    const { fadeInEnabled, fadeOutEnabled } = this.clipEdgeBoundaryPolicy.decide(
      trigger,
      {
        previousVoicePlaying: previousVoice?.state === 'playing',
        nextPlacementReady: Boolean(
          trigger.nextPlacement && this.engine.samples.peek(trigger.nextPlacement.samplePath)
        )
      }
    )
    const edgeFadePlan = fadeSettings.enabled
      ? createClipEdgeFadePlan({
          sampleRate: this.engine.ensureContext().sampleRate,
          clipDurationSeconds: audibleDurationSeconds,
          fadeInMs: fadeSettings.fadeInMs,
          fadeOutMs: fadeSettings.fadeOutMs,
          fadeInEnabled,
          fadeOutEnabled
        })
      : undefined
    const edgeFadeStartSample = edgeFadePlan
      ? Math.round(targetOffsetSeconds * edgeFadePlan.sampleRate)
      : undefined

    const destination = this.voiceDestination(
      trigger.laneIndex,
      trigger.channelIndex,
      trigger.pan
    )

    const voice = this.engine.triggerVoiceTo({
      buffer,
      destination,
      when,
      laneIndex: trigger.laneIndex,
      playbackRate,
      sourceOffsetSeconds,
      edgeFadePlan,
      edgeFadeStartSample
    })
    this.laneVoices.set(trigger.laneIndex, voice)
  }

  private queueLaneTrigger(
    trigger: LaneTrigger,
    projectBpm: number,
    when: number,
    elapsedTicks = 0
  ): Promise<void> {
    const scheduledGeneration = this.playGeneration
    const scheduledLaneId = this.channelLaneIds.get(trigger.channelIndex)
    const previous = this.laneTriggerQueues.get(trigger.laneIndex) ?? Promise.resolve()
    const queued = previous.then(() => {
      if (scheduledGeneration !== this.playGeneration) return
      if (this.channelLaneIds.get(trigger.channelIndex) !== scheduledLaneId) return
      return this.triggerLane(trigger, projectBpm, when, elapsedTicks)
    })
    this.laneTriggerQueues.set(trigger.laneIndex, queued.catch(() => undefined))
    return queued
  }

  private propagateSilentPlacement(trigger: LaneTrigger): void {
    this.clipEdgeBoundaryPolicy.markPlacementSilent(trigger)
  }

  private async loadBuffer(samplePath: string): Promise<AudioBuffer | null> {
    const bytes = await this.options.loadSampleBytes(samplePath)
    if (!bytes) return null
    return this.engine.samples.load(samplePath, bytes)
  }

  private queueUpcomingPreload(fromTick: number, includeActive = false): Promise<void> {
    const generation = this.playGeneration
    const preload = this.preloadQueue.then(() => {
      if (generation !== this.playGeneration) return
      return this.preloadUpcomingSamples(fromTick, includeActive, generation)
    })
    this.preloadQueue = preload.catch(() => undefined)
    return preload
  }

  private async preloadUpcomingSamples(
    fromTick: number,
    includeActive: boolean,
    generation: number
  ): Promise<void> {
    if (generation !== this.playGeneration) return
    const upcoming = [] as Array<{ samplePath: string, startTick: number }>
    for (const lane of this.options.getLanes()) {
      for (const placement of lane.placements) {
        if (
          placement.startTick >= fromTick ||
          (includeActive && placement.startTick + placement.durationTicks > fromTick)
        ) {
          upcoming.push({ samplePath: placement.samplePath, startTick: placement.startTick })
        }
      }
    }
    upcoming.sort((left, right) =>
      left.startTick - right.startTick || left.samplePath.localeCompare(right.samplePath)
    )

    const samplePaths: string[] = []
    const seen = new Set<string>()
    for (const { samplePath } of upcoming) {
      if (seen.has(samplePath)) continue
      seen.add(samplePath)
      samplePaths.push(samplePath)
      if (samplePaths.length === this.engine.samples.capacity) break
    }
    this.engine.samples.retain(seen)

    for (let offset = 0; offset < samplePaths.length; offset += PRELOAD_CONCURRENCY) {
      await Promise.all(samplePaths.slice(offset, offset + PRELOAD_CONCURRENCY).map(async (samplePath) => {
        if (generation !== this.playGeneration) return
        if (this.samplePreparation.get(samplePath) === 'failed') return
        try {
          const buffer = this.engine.samples.peek(samplePath) ?? (await this.loadBuffer(samplePath))
          if (generation !== this.playGeneration) return
          this.samplePreparation.set(samplePath, buffer ? 'ready' : 'failed')
        } catch {
          // Loading failures are handled like trigger-time decode failures:
          // skip this sample without preventing the remaining arrangement.
          if (generation !== this.playGeneration) return
          this.samplePreparation.set(samplePath, 'failed')
        }
      }))
    }

    // Preserve the nearest samples as the most recently used entries even if
    // asynchronous decodes completed in a different order.
    if (generation !== this.playGeneration) return
    for (let index = samplePaths.length - 1; index >= 0; index--) {
      this.engine.samples.peek(samplePaths[index]!)
    }
  }
}
