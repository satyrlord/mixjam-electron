/**
 * Shared Echoform Delay state. This file has no Web Audio imports so the same
 * contract can be used by the renderer controller, the worklet, and the
 * headless DSP tests.
 *
 * The serialized module type is `echoform-delay`. Older projects that used the
 * native `delay` module are upgraded to it by the v5→v6 project migration.
 */

/**
 * Fifteen synchronized note divisions, from a whole note down to a sixteenth,
 * each available straight, dotted (`.`, ×1.5) or triplet (`T`, ×2/3).
 */
export const ECHOFORM_DELAY_DIVISIONS = [
  '1/1', '1/1.', '1/1T',
  '1/2', '1/2.', '1/2T',
  '1/4', '1/4.', '1/4T',
  '1/8', '1/8.', '1/8T',
  '1/16', '1/16.', '1/16T'
] as const

export type EchoformDelayDivision = (typeof ECHOFORM_DELAY_DIVISIONS)[number]
export type EchoformDelayMode = 'sync' | 'free'
export type EchoformDelayCharacter = 'digital' | 'analog' | 'tape'

/**
 * The full parameter model. `mix` is intentionally absent: the FX-return Mix is
 * the bus `returnLevel`, so the delay always renders 100% wet. See the project
 * spec §20 and the "Echoform delay shared Mix" decision.
 */
export interface EchoformDelayState {
  mode: EchoformDelayMode
  /** Active in Sync mode. Retained when switching to Free. */
  divisionL: EchoformDelayDivision
  divisionR: EchoformDelayDivision
  /** Active in Free mode, 1–2000 ms. Retained when switching to Sync. */
  timeMsL: number
  timeMsR: number
  /** Loop gain percentage, 0–110. 100 = nominal unity before losses. */
  feedback: number
  pingPong: boolean
  /** Stereo width percentage of the wet output, 0–200. 100 = unchanged. */
  width: number
  /** Feedback-loop high-pass cutoff, 20–2000 Hz. */
  lowCut: number
  /** Feedback-loop low-pass cutoff, 1000–20000 Hz. */
  highCut: number
  /** Modulation LFO rate, 0.05–8 Hz. */
  modRate: number
  /** Peak modulation delay-time deviation, 0–20 ms. */
  modDepth: number
  character: EchoformDelayCharacter
  /**
   * Input drive ("Smash") percentage, 0–100. 0 = clean. A gain-compensated soft
   * saturation on the signal entering the delay, before the feedback network —
   * an up-front distortion distinct from the in-loop Character coloration.
   */
  drive: number
  /** Wet-only ducking depth percentage, 0–100. */
  duckAmount: number
  /** Ducking release, 50–2500 ms. */
  duckRelease: number
  /** Output trim after all wet processing, -24 to +12 dB. */
  outputDb: number
  freeze: boolean
  bypass: boolean
}
