// Shared scalar helpers for the master bus DSP core. Pure TypeScript, no
// Web Audio types: the same code runs in the AudioWorklet and in node tests.

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

export function linearToDb(linear: number): number {
  return linear > 1e-10 ? 20 * Math.log10(linear) : -200
}

// Values below this are treated as silence to keep feedback states out of
// the denormal range, where x87/SSE math becomes orders of magnitude slower.
const DENORMAL_FLOOR = 1e-20

export function flushDenormal(value: number): number {
  return value > DENORMAL_FLOOR || value < -DENORMAL_FLOOR ? value : 0
}

/**
 * One-pole parameter smoother. `timeMs` is the time constant; a step input
 * reaches ~63% of its target after `timeMs`. Call `next()` once per sample
 * or `advance(n)` once per block when only the settled value matters.
 */
/** Block-level surface used by the Master Bus parameter-smoothing loop. */
interface BlockSmoother {
  readonly pending: boolean
  advance(samples: number): number
}

export class OnePoleSmoother implements BlockSmoother {
  private current: number
  private target: number
  private coeff: number

  constructor(initial: number, timeMs: number, sampleRate: number) {
    this.current = initial
    this.target = initial
    this.coeff = OnePoleSmoother.coefficient(timeMs, sampleRate)
  }

  static coefficient(timeMs: number, sampleRate: number): number {
    return Math.exp(-1000 / (timeMs * sampleRate))
  }

  setTarget(value: number): void {
    this.target = value
  }

  /** Jump to a value with no ramp (used on reset, never mid-audio). */
  snapTo(value: number): void {
    this.current = value
    this.target = value
  }

  get value(): number {
    return this.current
  }

  get pending(): boolean {
    return this.current !== this.target
  }

  next(): number {
    const c = this.coeff
    const next = this.target + (this.current - this.target) * c
    // Snap when the remaining error is inaudible so `pending` settles.
    this.current = Math.abs(next - this.target) < 1e-9 ? this.target : next
    return this.current
  }

  advance(samples: number): number {
    if (this.current === this.target) return this.current
    const decay = Math.pow(this.coeff, samples)
    const next = this.target + (this.current - this.target) * decay
    this.current = Math.abs(next - this.target) < 1e-9 ? this.target : next
    return this.current
  }
}

/**
 * Replaces non-finite samples with 0 in place. Returns true when the block
 * was clean. Called at module boundaries so one faulty module cannot take
 * down the bus (spec-012 numerical hygiene).
 */
export function sanitizeBlock(l: Float32Array, r: Float32Array, n: number): boolean {
  let clean = true
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(l[i])) {
      l[i] = 0
      clean = false
    }
    if (!Number.isFinite(r[i])) {
      r[i] = 0
      clean = false
    }
  }
  return clean
}
