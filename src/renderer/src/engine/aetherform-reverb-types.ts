/**
 * Shared Aetherform Reverb state. This file has no Web Audio imports so the
 * same contract can be used by the renderer controller, the worklet, and the
 * headless DSP tests.
 *
 * The serialized module type is `aetherform-reverb`. Mix is intentionally
 * absent: the FX-return Mix is the bus `returnLevel`, so the reverb always
 * renders 100% wet — the same shared-Mix contract as the Echoform Delay.
 */

export type AetherformSpaceModel = 'room' | 'hall' | 'plate' | 'chamber'
export type AetherformCharacter = 'natural' | 'vintage' | 'bloom'

export const AETHERFORM_SHIMMER_INTERVALS = [7, 12, 19, 24] as const
export type AetherformShimmerInterval = (typeof AETHERFORM_SHIMMER_INTERVALS)[number]

/** The full parameter model. Clear Tail is a momentary command, not a field. */
export interface AetherformReverbState {
  spaceModel: AetherformSpaceModel
  /** Stereo pre-delay before both the early and late paths, 0–250 ms. */
  preDelayMs: number
  /** Approximate midband RT60 target, 0.2–30 s. */
  decaySeconds: number
  /** Perceived scale of the environment, 5–100. Does not change Decay. */
  sizePercent: number
  character: AetherformCharacter
  /**
   * Input drive ("Smash") percentage, 0–100. 0 = clean. A gain-compensated soft
   * saturation on the signal entering the reverb, before the network — an
   * up-front distortion distinct from the in-loop Character shaping.
   */
  drivePercent: number
  /** Stereo width of the wet output, 0–200. 100 = unchanged. */
  widthPercent: number
  /** Early/late blend, 0 = early reflections only, 100 = late tail only. */
  lateBalancePercent: number
  /** Feedback-loop high-pass cutoff, 20–2000 Hz. */
  lowCutHz: number
  /** Feedback-loop low-pass cutoff, 1000–20000 Hz. */
  highCutHz: number
  /** How quickly discrete reflections smear into a smooth field, 0–100. */
  diffusionPercent: number
  /** Reflection count and late-tail fullness, 0–100. */
  densityPercent: number
  earlyReflectionsEnabled: boolean
  /** Late delay-line modulation LFO rate, 0.05–3 Hz. */
  modRateHz: number
  /** Modulation amount, 0–100. Nonlinear map to at most ~3–4 ms deviation. */
  modDepthPercent: number
  shimmerEnabled: boolean
  /** Strength of the pitch-shifted feedback branch, 0–100. Retained while off. */
  shimmerAmountPercent: number
  shimmerIntervalSemitones: AetherformShimmerInterval
  /** Wet-only ducking depth percentage, 0–100. */
  duckAmountPercent: number
  /** Ducking release, 50–2500 ms. */
  duckReleaseMs: number
  /** Output trim after all wet processing, -24 to +12 dB. */
  outputDb: number
  freeze: boolean
  bypass: boolean
}

export function isAetherformShimmerInterval(value: unknown): value is AetherformShimmerInterval {
  return typeof value === 'number' && (AETHERFORM_SHIMMER_INTERVALS as readonly number[]).includes(value)
}

export function isAetherformSpaceModel(value: unknown): value is AetherformSpaceModel {
  return value === 'room' || value === 'hall' || value === 'plate' || value === 'chamber'
}

export function isAetherformCharacter(value: unknown): value is AetherformCharacter {
  return value === 'natural' || value === 'vintage' || value === 'bloom'
}
