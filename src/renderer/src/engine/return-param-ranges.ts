// Numeric parameter ranges for the Return effects, stated once.
//
// A parameter's range used to be written in three unlinked places: the
// load-time validator in `return-effects.ts`, the DSP clamp inside the effect
// core, and the knob spec in the editor. Nothing compared them, so a widened
// knob could emit values the validator would later reject — a project that
// saves but will not load.
//
// These tables are the single statement of each range. The validator derives
// its bounds from them and the editors derive their knob min/max from them, so
// the three can no longer disagree.
//
// Engine boundary: plain data. No Web Audio, no React, so the worklet realm and
// the editor can both read it.

export interface ReturnParamRange {
  readonly min: number
  readonly max: number
}

function range(min: number, max: number): ReturnParamRange {
  return { min, max }
}

/** Echoform Delay numeric parameters. Keys match `EchoformDelayState` fields. */
export const ECHOFORM_DELAY_RANGES = {
  timeMsL: range(1, 2000),
  timeMsR: range(1, 2000),
  feedback: range(0, 110),
  width: range(0, 200),
  lowCut: range(20, 2000),
  highCut: range(1000, 20000),
  modRate: range(0.05, 8),
  modDepth: range(0, 20),
  drive: range(0, 100),
  duckAmount: range(0, 100),
  duckRelease: range(50, 2500),
  outputDb: range(-24, 12)
} as const satisfies Record<string, ReturnParamRange>

/** Aetherform Reverb numeric parameters. Keys match `AetherformReverbState`. */
export const AETHERFORM_REVERB_RANGES = {
  preDelayMs: range(0, 250),
  decaySeconds: range(0.2, 30),
  sizePercent: range(5, 100),
  drivePercent: range(0, 100),
  widthPercent: range(0, 200),
  lateBalancePercent: range(0, 100),
  lowCutHz: range(20, 2000),
  highCutHz: range(1000, 20000),
  diffusionPercent: range(0, 100),
  densityPercent: range(0, 100),
  modRateHz: range(0.05, 3),
  modDepthPercent: range(0, 100),
  shimmerAmountPercent: range(0, 100),
  duckAmountPercent: range(0, 100),
  duckReleaseMs: range(50, 2500),
  outputDb: range(-24, 12)
} as const satisfies Record<string, ReturnParamRange>

export type EchoformDelayRangeKey = keyof typeof ECHOFORM_DELAY_RANGES
export type AetherformReverbRangeKey = keyof typeof AETHERFORM_REVERB_RANGES

/** True when `value` is a finite number inside `range`, inclusive. */
export function withinRange(value: unknown, { min, max }: ReturnParamRange): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/**
 * Validates every listed numeric field of `module` against its range. Returns
 * false as soon as one is missing or out of bounds, so a load-time guard reads
 * as one call instead of one line per parameter.
 */
export function numericFieldsWithinRanges(
  module: Record<string, unknown>,
  ranges: Record<string, ReturnParamRange>
): boolean {
  for (const [field, bounds] of Object.entries(ranges)) {
    if (!withinRange(module[field], bounds)) return false
  }
  return true
}
