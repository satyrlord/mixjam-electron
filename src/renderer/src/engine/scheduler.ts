// Lookahead scheduler (Chris Wilson, "A Tale of Two Clocks"). A coarse
// setInterval ticks every ~25ms and, on each tick, schedules every step whose
// AudioContext time falls within a ~100ms lookahead window. It self-corrects
// from the audio clock on every tick so a stalled event loop catches up rather
// than drifting.
//
// The scheduler does not own the transport — it reads BPM/tick conversion from
// it and calls back with (tick, when) pairs. It is a standalone module,
// testable with a mock clock and a mock time source.
//
// Engine boundary: pure TypeScript. No React, no DOM beyond the injected timer.

import { tickDurationSeconds } from './transport'

export interface SchedulerClock {
  setInterval(callback: () => void, intervalMs: number): number
  clearInterval(handle: number): void
}

export interface SchedulerTransport {
  readonly bpm: number
}

export type ScheduleCallback = (tick: number, when: number) => void

export interface SchedulerOptions {
  // Audio clock: returns the current AudioContext time in seconds.
  now: () => number
  transport: SchedulerTransport
  onSchedule: ScheduleCallback
  clock?: SchedulerClock
  lookaheadMs?: number
  intervalMs?: number
  // Tick the playhead starts from when start() is called (default 0).
  startTick?: number
}

const DEFAULT_INTERVAL_MS = 25
const DEFAULT_LOOKAHEAD_MS = 100

function defaultClock(): SchedulerClock {
  return {
    setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
    clearInterval: (handle) => window.clearInterval(handle)
  }
}

export interface Scheduler {
  readonly running: boolean
  start(fromTick?: number): void
  stop(): void
  // The integer tick the playhead is currently on, derived from the audio clock
  // (not a wall-clock timer) so the visual playhead never drifts from the sound.
  currentTick(): number
  // Moves the (stopped) playhead to a specific tick. No-op while running.
  reset(tick: number): void
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const clock = options.clock ?? defaultClock()
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const lookaheadSeconds = (options.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS) / 1000

  let timerHandle: number | null = null
  // The next tick we still need to schedule, and the absolute audio time it
  // fires at. These advance together so timing derives from the audio clock,
  // never from accumulated timer jitter.
  let nextTick = options.startTick ?? 0
  let nextTickTime = 0
  // Anchor for deriving the live playhead tick from the audio clock: the tick at
  // anchorTime and the audio time it began. Set on start().
  let anchorTick = nextTick
  let anchorTime = 0

  function tick(): void {
    const now = options.now()
    const stepSeconds = tickDurationSeconds(options.transport.bpm)
    // Guard against a non-finite/non-positive step (bpm <= 0) which would loop
    // forever or schedule garbage.
    if (!(stepSeconds > 0) || !Number.isFinite(stepSeconds)) return

    // Fold the anchor forward to the last whole tick boundary. liveTick()
    // divides (now - anchorTime) by the *current* step, so without folding a
    // BPM change would retroactively reinterpret the entire play segment at the
    // new tempo and jump the playhead. Folding on every pass bounds the
    // reinterpreted span to one timer interval.
    const elapsedTicks = Math.floor(Math.max(0, now - anchorTime) / stepSeconds)
    if (elapsedTicks > 0) {
      anchorTick += elapsedTicks
      anchorTime += elapsedTicks * stepSeconds
    }

    // A main-thread stall longer than the lookahead leaves a backlog of ticks
    // whose audio time has already passed. Scheduling them anyway would hand
    // Web Audio start times in the past, which it clamps to "now" — firing the
    // whole backlog at once as an audible burst. Drop what can no longer sound
    // on time and resume from the present instead: a stall costs the notes it
    // covered, never a machine-gun catch-up. The playhead itself is derived
    // from the audio clock (liveTick), so it stays correct either way.
    //
    // Only a real backlog qualifies. A step whose time has just barely passed —
    // ordinary timer jitter, or the clock advancing between start() and the
    // first pass on a device with a large output buffer — is still audibly on
    // time, and dropping it would silence the downbeat.
    const backlogSeconds = now - nextTickTime
    if (backlogSeconds > lookaheadSeconds) {
      const missedTicks = Math.ceil(backlogSeconds / stepSeconds)
      nextTick += missedTicks
      nextTickTime += missedTicks * stepSeconds
    }

    const horizon = now + lookaheadSeconds
    while (nextTickTime < horizon) {
      options.onSchedule(nextTick, nextTickTime)
      nextTick += 1
      nextTickTime += stepSeconds
    }
  }

  return {
    get running() {
      return timerHandle !== null
    },

    start(fromTick?: number): void {
      if (timerHandle !== null) return
      if (fromTick !== undefined) nextTick = fromTick
      // Anchor the first step to the current audio time so playback begins
      // immediately rather than at whatever stale time the cursor held.
      nextTickTime = options.now()
      anchorTick = nextTick
      anchorTime = nextTickTime
      timerHandle = clock.setInterval(tick, intervalMs)
      // Run one pass synchronously so the leading window is filled without
      // waiting a full interval.
      tick()
    },

    stop(): void {
      if (timerHandle === null) return
      // Snapshot the playhead into the anchor so currentTick() keeps reporting
      // the paused position rather than collapsing back to the start tick.
      anchorTick = liveTick()
      anchorTime = options.now()
      clock.clearInterval(timerHandle)
      timerHandle = null
    },

    currentTick(): number {
      return liveTick()
    },

    reset(tick: number): void {
      if (timerHandle !== null) return
      nextTick = tick
      anchorTick = tick
    }
  }

  function liveTick(): number {
    if (timerHandle === null) return anchorTick
    const stepSeconds = tickDurationSeconds(options.transport.bpm)
    if (!(stepSeconds > 0) || !Number.isFinite(stepSeconds)) return anchorTick
    const elapsed = options.now() - anchorTime
    return anchorTick + Math.max(0, Math.floor(elapsed / stepSeconds))
  }
}
