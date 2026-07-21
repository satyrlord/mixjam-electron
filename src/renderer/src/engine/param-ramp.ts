// Shared parameter smoothing for the mixer path.
//
// A raw `param.value = x` write is a step discontinuity in the signal, which
// clicks — and a fader drag emits one per mousemove. Every continuous mixer
// parameter therefore ramps instead. 20 ms matches the one-pole smoothing the
// Master Bus worklet applies to its own parameters (docs/audio-engine.md), so
// the whole mixer behaves consistently.
//
// Engine boundary: pure TypeScript over the Web Audio API. No React, no DOM.

const PARAM_RAMP_SECONDS = 0.02

export function rampAudioParam(
  param: AudioParam,
  value: number,
  context: BaseAudioContext
): void {
  const now = context.currentTime
  // Preserve the value playing at this instant before replacing the rest of
  // the automation timeline. cancelScheduledValues() can restore the value
  // from before an active ramp and introduce the exact discontinuity this
  // helper exists to prevent; cancelAndHoldAtTime() retains the computed value.
  param.cancelAndHoldAtTime(now)
  param.linearRampToValueAtTime(value, now + PARAM_RAMP_SECONDS)
}
