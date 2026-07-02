// The Player orchestrates the pure engine pieces into a playable whole:
// AudioEngine (context + master bus + channels), the lookahead Scheduler, lane
// evaluation, and sample loading. It is the single seam the renderer wires into.
//
// Engine boundary: pure TypeScript. The renderer injects a `loadSampleBytes`
// callback (which goes over IPC) and an AudioContext factory — the engine never
// imports IPC, React, or DOM directly.

import { AudioEngine, type AudioEngineOptions } from './audio-engine'
import { type Channel } from './channel'
import { createScheduler, type Scheduler, type SchedulerClock } from './scheduler'
import { type EngineLane, triggersForTick } from './lane-evaluation'
import { type Voice } from './voice'

// Returns the raw bytes for a sample path, or null if unreadable.
export type LoadSampleBytes = (samplePath: string) => Promise<ArrayBuffer | null>

export interface PlayerOptions extends AudioEngineOptions {
  loadSampleBytes: LoadSampleBytes
  // Returns the current arrangement of lanes. Read on every scheduler tick so
  // edits made during playback take effect.
  getLanes: () => readonly EngineLane[]
  bpm?: number
  clock?: SchedulerClock
  // Audio clock override for tests (defaults to engine.currentTime).
  now?: () => number
}

export class Player {
  private readonly engine: AudioEngine
  private readonly scheduler: Scheduler
  private readonly channels = new Map<number, Channel>()
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

  constructor(private readonly options: PlayerOptions) {
    this.currentBpm = options.bpm ?? 120
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

  // The playhead tick derived from the audio clock, so the UI playhead stays in
  // lock-step with the audible scheduling rather than a separate wall-clock timer.
  get currentTick(): number {
    return this.scheduler.currentTick()
  }

  setBpm(bpm: number): void {
    this.currentBpm = bpm
  }

  setMasterGain(value: number): void {
    this.engine.setMasterGain(value)
  }

  getMasterLevelDb(): number {
    return this.engine.getMasterLevelDb()
  }

  setChannelPan(channelIndex: number, pan: number): void {
    this.engine.setChannelPan(channelIndex, pan)
  }

  // Preview a sample as a one-shot.
  //
  // Monophonic toggle: clicking the same sample again stops its preview;
  // clicking a different sample stops the previous and starts the new one.
  //
  // When `whenSeconds` is provided (a future AudioContext time), the preview
  // is scheduled at that exact moment — used for quantised downbeat preview
  // while the transport is playing.  Omit to play immediately.
  async previewSample(samplePath: string, whenSeconds?: number): Promise<void> {
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
    try {
      await this.engine.resume()
      buffer = this.engine.samples.peek(samplePath) ?? (await this.loadBuffer(samplePath))
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
    })
  }

  // Decoded buffer for a sample, from cache or a fresh load. Used by the UI to
  // render waveforms; shares the cache with playback so selecting a sample
  // (which also previews it) costs a single decode.
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
  async start(fromTick = 0): Promise<void> {
    await this.engine.resume()
    this.lastScheduledTick = fromTick - 1
    this.scheduler.start(fromTick)
  }

  pause(): void {
    this.playGeneration++
    this.scheduler.stop()
    this.engine.stopAllVoices()
    this.laneVoices.clear()
  }

  stop(): void {
    this.playGeneration++
    this.scheduler.stop()
    // Stop returns the playhead to the start; pause() leaves it where it is.
    this.scheduler.reset(0)
    this.engine.stopAllVoices()
    this.laneVoices.clear()
    this.lastScheduledTick = -1
  }

  async close(): Promise<void> {
    this.playGeneration++
    this.scheduler.stop()
    await this.engine.close()
    this.channels.clear()
    this.laneVoices.clear()
  }

  private channelFor(channelIndex: number): Channel {
    let channel = this.channels.get(channelIndex)
    if (!channel) {
      channel = this.engine.createChannel()
      this.channels.set(channelIndex, channel)
    }
    return channel
  }

  private handleScheduledTick(tick: number, when: number): void {
    // Guard against the scheduler's catch-up firing a tick twice.
    if (tick <= this.lastScheduledTick) return
    this.lastScheduledTick = tick

    const triggers = triggersForTick(this.options.getLanes(), tick)
    for (const trigger of triggers) {
      void this.triggerLane(trigger.laneIndex, trigger.channelIndex, trigger.samplePath, when)
    }
  }

  private async triggerLane(
    laneIndex: number,
    channelIndex: number,
    samplePath: string,
    when: number
  ): Promise<void> {
    const generation = this.playGeneration
    let buffer: AudioBuffer | null
    try {
      buffer = this.engine.samples.peek(samplePath) ?? (await this.loadBuffer(samplePath))
    } catch {
      // Decode/read failure: skip this trigger rather than crashing the engine.
      return
    }
    if (!buffer) return

    // Playback was stopped/paused while the buffer loaded: drop this trigger so
    // no stray voice starts (with a now-past `when`) after the user hit stop.
    if (generation !== this.playGeneration) return

    // Monophonic: cut off the voice currently sounding on this lane.
    this.laneVoices.get(laneIndex)?.stop()

    const channel = this.channelFor(channelIndex)
    const voice = this.engine.triggerVoice({ buffer, channel, when, trackIndex: laneIndex })
    this.laneVoices.set(laneIndex, voice)
  }

  private async loadBuffer(samplePath: string): Promise<AudioBuffer | null> {
    const bytes = await this.options.loadSampleBytes(samplePath)
    if (!bytes) return null
    return this.engine.samples.load(samplePath, bytes)
  }
}
