// The Transport is a pure state machine for the play/pause/stop lifecycle plus
// tempo and tick<->time conversion. It owns NO timer: the audio-clock Scheduler
// (see scheduler.ts) drives sample scheduling and the visual playhead, so the
// transport never needs its own wall-clock ticker. This keeps a single timing
// source and avoids drift between the playhead and the audible output.
//
// Engine boundary: pure TypeScript. No React, no DOM, no Web Audio.

export type TransportState = 'stopped' | 'playing' | 'paused'

export interface Transport {
  readonly state: TransportState
  readonly bpm: number

  play(): void
  pause(): void
  stop(): void
  skipBack(): void
  setBpm(bpm: number): void
  tickDurationSeconds(): number
  tickToTime(tick: number, referenceTick: number, referenceTime: number): number
  destroy(): void
}

// Step resolution: 1/32 note. 8 ticks per beat at 4/4 — every lane shares this
// global grid (see spec-005 Transport). These are the single source of truth
// for grid math; the ruler, lane canvas, and drop snapping all derive from them.
export const TICKS_PER_BEAT = 8
export const BEATS_PER_BAR = 4
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR

export function tickDurationSeconds(bpm: number): number {
  return 60 / bpm / TICKS_PER_BEAT
}

export function createTransport(bpm = 120): Transport {
  let state: TransportState = 'stopped'
  let currentBpm = bpm

  return {
    get state() {
      return state
    },

    get bpm() {
      return currentBpm
    },

    play(): void {
      if (state === 'playing') return
      state = 'playing'
    },

    pause(): void {
      if (state !== 'playing') return
      state = 'paused'
    },

    stop(): void {
      state = 'stopped'
    },

    // Playhead position is owned by the Scheduler; skipBack only affects state,
    // which is currently a no-op (kept for API symmetry with play/pause/stop).
    skipBack(): void {},

    setBpm(newBpm: number): void {
      currentBpm = newBpm
    },

    tickDurationSeconds(): number {
      return tickDurationSeconds(currentBpm)
    },

    tickToTime(tick: number, referenceTick: number, referenceTime: number): number {
      return referenceTime + (tick - referenceTick) * tickDurationSeconds(currentBpm)
    },

    destroy(): void {}
  }
}
