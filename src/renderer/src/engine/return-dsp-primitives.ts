/**
 * Effect-agnostic DSP primitives shared by every Return-effect core.
 *
 * These are the generic building blocks — not the effect identity. Each effect's
 * character (the delay's feedback lines and tape colour, the reverb's FDN,
 * shimmer, and early reflections) stays in its own core per spec-010 "Module
 * Registration Contract". What lives here is the plumbing both cores would
 * otherwise copy verbatim: clamping, one-pole smoothing, denormal flushing,
 * cubic delay-line reads, the in-loop feedback soft limiter, TPT filters, a
 * deterministic drift generator, and the shared Input Drive ("Smash") curve.
 *
 * This module is worklet-safe: it imports nothing from Web Audio, the DOM, or
 * `masterbus/dsp` (whose helpers are not reachable inside an
 * AudioWorkletGlobalScope), so both effect cores can build on it directly.
 */

/** Denormal cutoff: values below this magnitude are flushed to exactly 0. */
const DENORMAL_FLOOR = 1e-20

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** One-pole smoothing coefficient for a given time constant. */
export function smoothCoefficient(seconds: number, sampleRate: number): number {
  if (seconds <= 0) return 1
  return 1 - Math.exp(-1 / (seconds * sampleRate))
}

/** One-pole step from `current` toward `target`, denormal-flushed. */
export function smooth(current: number, target: number, coefficient: number): number {
  const next = current + (target - current) * coefficient
  return Math.abs(next) < DENORMAL_FLOOR ? 0 : next
}

/** Flush non-finite and denormal magnitudes to 0. */
export function flushDenormal(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.abs(value) < DENORMAL_FLOOR ? 0 : value
}

/**
 * Four-point (cubic) Lagrange interpolation against a circular buffer.
 * `delaySamples` is how far behind `writeIndex` to read; every tap index is
 * wrapped into [0, length), so reads can never leave the allocation.
 */
export function readCubic(
  buffer: Float32Array<ArrayBuffer>,
  writeIndex: number,
  delaySamples: number
): number {
  const length = buffer.length
  const readPosition = writeIndex - delaySamples
  const base = Math.floor(readPosition)
  const fraction = readPosition - base
  // Wrap the four taps (base-1 .. base+2) into range without a modulo per read.
  const i0 = ((base - 1) % length + length) % length
  const i1 = (i0 + 1) % length
  const i2 = (i1 + 1) % length
  const i3 = (i2 + 1) % length
  const y0 = buffer[i0]!
  const y1 = buffer[i1]!
  const y2 = buffer[i2]!
  const y3 = buffer[i3]!
  const c0 = y1
  const c1 = 0.5 * (y2 - y0)
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
  return ((c3 * fraction + c2) * fraction + c1) * fraction + c0
}

/**
 * TPT one-pole integrator gain G = g/(1+g), g = tan(π·fc/fs). Always < 1.
 * Cutoff is clamped to [10 Hz, 0.49·fs] for stability.
 */
export function tptG(cutoffHz: number, sampleRate: number): number {
  const g = Math.tan((Math.PI * clamp(cutoffHz, 10, sampleRate * 0.49)) / sampleRate)
  return g / (1 + g)
}

/**
 * Bounded soft limiter used inside a feedback loop. Transparent below the knee
 * and asymptotic toward ±ceiling, so extreme feedback stays finite without
 * hard-clipping ordinary repeats.
 */
export function feedbackSoftLimit(sample: number): number {
  const ceiling = 1.35
  if (sample > ceiling || sample < -ceiling) {
    // Well past the knee: tanh guarantees a finite, bounded result.
    return Math.tanh(sample)
  }
  const knee = 0.9
  const abs = Math.abs(sample)
  if (abs <= knee) return sample
  const sign = sample < 0 ? -1 : 1
  const over = (abs - knee) / (ceiling - knee)
  // Smooth cubic knee from `knee` toward the ceiling.
  const shaped = knee + (ceiling - knee) * (over - (over * over * over) / 3) * 1.5
  return sign * Math.min(shaped, ceiling)
}

/**
 * Input Drive ("Smash"): gain-compensated soft saturation on a signal entering
 * an effect, before its feedback network. `g = 1 + driveNorm·8` sets the
 * pre-gain; `tanh(x·g)/g` keeps the clean level roughly matched with a mild
 * makeup, then the result is blended against the clean input by `driveNorm` so
 * `driveNorm = 0` is an exact bypass. `driveNorm` is 0..1.
 */
export function driveInput(sample: number, driveNorm: number): number {
  if (driveNorm < 1e-4) return sample
  const g = 1 + driveNorm * 8
  const makeup = 1 + driveNorm * 0.9
  const shaped = (Math.tanh(sample * g) / g) * makeup
  return sample + (shaped - sample) * driveNorm
}

/**
 * Topology-preserving (TPT) one-pole filter. Unconditionally stable at any
 * cutoff, unlike a Chamberlin SVF near Nyquist. Exposes low-pass and high-pass
 * so two cascade into a 12 dB/oct response.
 */
export class OnePoleTPT {
  private state = 0

  reset(): void { this.state = 0 }

  /** `gCoefficient` = G = g/(1+g) where g = tan(π·fc/fs). */
  lowPass(input: number, gCoefficient: number): number {
    const v = (input - this.state) * gCoefficient
    const lp = v + this.state
    this.state = flushDenormal(lp + v)
    return lp
  }

  highPass(input: number, gCoefficient: number): number {
    return input - this.lowPass(input, gCoefficient)
  }
}

/** Two cascaded TPT one-poles = a stable ~12 dB/oct filter per stereo side. */
export class TwoPoleFilter {
  private readonly a = new OnePoleTPT()
  private readonly b = new OnePoleTPT()

  reset(): void { this.a.reset(); this.b.reset() }

  highPass(input: number, g: number): number {
    return this.b.highPass(this.a.highPass(input, g), g)
  }

  lowPass(input: number, g: number): number {
    return this.b.lowPass(this.a.lowPass(input, g), g)
  }
}

/** A single deterministic drift generator (smoothed value-noise), no RNG. */
export class DriftGenerator {
  private phase: number
  private current = 0
  private target = 0
  private readonly increment: number

  constructor(rateHz: number, sampleRate: number, seed: number) {
    this.increment = rateHz / sampleRate
    // Deterministic seed so offline and real-time renders match.
    this.phase = seed % 1
  }

  reset(): void {
    this.current = 0
    this.target = 0
  }

  /** Advance one sample and return a smoothed value in roughly [-1, 1]. */
  next(): number {
    this.phase += this.increment
    if (this.phase >= 1) {
      this.phase -= 1
      // Next hold value from a hash of the running phase — stable per position.
      const hashed = Math.sin(this.phase * 12.9898 + this.current * 78.233) * 43758.5453
      this.target = (hashed - Math.floor(hashed)) * 2 - 1
    }
    this.current += (this.target - this.current) * 0.02
    return this.current
  }
}
