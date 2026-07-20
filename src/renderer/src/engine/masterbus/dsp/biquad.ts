// RBJ biquad filters (Audio EQ Cookbook forms) with stereo state.
// Coefficients are recomputed per block when a smoothed parameter moves;
// states persist across recomputation, which is click-free at the 20 ms
// parameter smoothing rate used by the master bus core.

import { flushDenormal } from './util'

export class StereoBiquad {
  private b0 = 1
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private x1l = 0
  private x2l = 0
  private y1l = 0
  private y2l = 0
  private x1r = 0
  private x2r = 0
  private y1r = 0
  private y2r = 0

  reset(): void {
    this.x1l = this.x2l = this.y1l = this.y2l = 0
    this.x1r = this.x2r = this.y1r = this.y2r = 0
  }

  identity(): void {
    this.b0 = 1
    this.b1 = this.b2 = this.a1 = this.a2 = 0
  }

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): void {
    this.b0 = b0 / a0
    this.b1 = b1 / a0
    this.b2 = b2 / a0
    this.a1 = a1 / a0
    this.a2 = a2 / a0
  }

  peaking(sampleRate: number, freq: number, q: number, gainDb: number): void {
    const A = Math.pow(10, gainDb / 40)
    const w0 = (2 * Math.PI * freq) / sampleRate
    const alpha = Math.sin(w0) / (2 * q)
    const cosW0 = Math.cos(w0)
    this.set(1 + alpha * A, -2 * cosW0, 1 - alpha * A, 1 + alpha / A, -2 * cosW0, 1 - alpha / A)
  }

  lowShelf(sampleRate: number, freq: number, slope: number, gainDb: number): void {
    const A = Math.pow(10, gainDb / 40)
    const w0 = (2 * Math.PI * freq) / sampleRate
    const cosW0 = Math.cos(w0)
    const alpha = (Math.sin(w0) / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2)
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha
    this.set(
      A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha),
      2 * A * (A - 1 - (A + 1) * cosW0),
      A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha),
      A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha,
      -2 * (A - 1 + (A + 1) * cosW0),
      A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha,
    )
  }

  highShelf(sampleRate: number, freq: number, slope: number, gainDb: number): void {
    const A = Math.pow(10, gainDb / 40)
    const w0 = (2 * Math.PI * freq) / sampleRate
    const cosW0 = Math.cos(w0)
    const alpha = (Math.sin(w0) / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2)
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha
    this.set(
      A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha),
      -2 * A * (A - 1 + (A + 1) * cosW0),
      A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha),
      A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha,
      2 * (A - 1 - (A + 1) * cosW0),
      A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha,
    )
  }

  highpass(sampleRate: number, freq: number, q: number): void {
    const w0 = (2 * Math.PI * freq) / sampleRate
    const cosW0 = Math.cos(w0)
    const alpha = Math.sin(w0) / (2 * q)
    this.set((1 + cosW0) / 2, -(1 + cosW0), (1 + cosW0) / 2, 1 + alpha, -2 * cosW0, 1 - alpha)
  }

  lowpass(sampleRate: number, freq: number, q: number): void {
    const w0 = (2 * Math.PI * freq) / sampleRate
    const cosW0 = Math.cos(w0)
    const alpha = Math.sin(w0) / (2 * q)
    this.set((1 - cosW0) / 2, 1 - cosW0, (1 - cosW0) / 2, 1 + alpha, -2 * cosW0, 1 - alpha)
  }

  allpass(sampleRate: number, freq: number, q: number): void {
    const w0 = (2 * Math.PI * freq) / sampleRate
    const cosW0 = Math.cos(w0)
    const alpha = Math.sin(w0) / (2 * q)
    this.set(1 - alpha, -2 * cosW0, 1 + alpha, 1 + alpha, -2 * cosW0, 1 - alpha)
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const { b0, b1, b2, a1, a2 } = this
    let x1l = this.x1l
    let x2l = this.x2l
    let y1l = this.y1l
    let y2l = this.y2l
    let x1r = this.x1r
    let x2r = this.x2r
    let y1r = this.y1r
    let y2r = this.y2r
    for (let i = 0; i < n; i++) {
      const xl = l[i]
      const yl = b0 * xl + b1 * x1l + b2 * x2l - a1 * y1l - a2 * y2l
      x2l = x1l
      x1l = xl
      y2l = y1l
      y1l = yl
      l[i] = yl
      const xr = r[i]
      const yr = b0 * xr + b1 * x1r + b2 * x2r - a1 * y1r - a2 * y2r
      x2r = x1r
      x1r = xr
      y2r = y1r
      y1r = yr
      r[i] = yr
    }
    this.x1l = flushDenormal(x1l)
    this.x2l = flushDenormal(x2l)
    this.y1l = flushDenormal(y1l)
    this.y2l = flushDenormal(y2l)
    this.x1r = flushDenormal(x1r)
    this.x2r = flushDenormal(x2r)
    this.y1r = flushDenormal(y1r)
    this.y2r = flushDenormal(y2r)
  }

  processMono(x: Float32Array, n: number): void {
    this.processChannel(0, x, n)
  }

  /** Runs one channel's state (0 = left, 1 = right) over a mono buffer. */
  processChannel(channel: 0 | 1, x: Float32Array, n: number): void {
    const { b0, b1, b2, a1, a2 } = this
    let x1 = channel === 0 ? this.x1l : this.x1r
    let x2 = channel === 0 ? this.x2l : this.x2r
    let y1 = channel === 0 ? this.y1l : this.y1r
    let y2 = channel === 0 ? this.y2l : this.y2r
    for (let i = 0; i < n; i++) {
      const xi = x[i]
      const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
      x2 = x1
      x1 = xi
      y2 = y1
      y1 = yi
      x[i] = yi
    }
    if (channel === 0) {
      this.x1l = flushDenormal(x1)
      this.x2l = flushDenormal(x2)
      this.y1l = flushDenormal(y1)
      this.y2l = flushDenormal(y2)
    } else {
      this.x1r = flushDenormal(x1)
      this.x2r = flushDenormal(x2)
      this.y1r = flushDenormal(y1)
      this.y2r = flushDenormal(y2)
    }
  }
}

const BUTTERWORTH_Q = Math.SQRT1_2

/**
 * Linkwitz-Riley 4th-order crossover leg: two cascaded 2nd-order
 * Butterworth sections of the same type. LP and HP legs at the same
 * frequency sum to a 2nd-order allpass at that frequency, which is the
 * phase-coherence property spec-012 relies on.
 */
export class LinkwitzRiley4 {
  private readonly first = new StereoBiquad()
  private readonly second = new StereoBiquad()

  configure(type: 'lowpass' | 'highpass', sampleRate: number, freq: number): void {
    if (type === 'lowpass') {
      this.first.lowpass(sampleRate, freq, BUTTERWORTH_Q)
      this.second.lowpass(sampleRate, freq, BUTTERWORTH_Q)
    } else {
      this.first.highpass(sampleRate, freq, BUTTERWORTH_Q)
      this.second.highpass(sampleRate, freq, BUTTERWORTH_Q)
    }
  }

  reset(): void {
    this.first.reset()
    this.second.reset()
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    this.first.process(l, r, n)
    this.second.process(l, r, n)
  }

  processMono(x: Float32Array, n: number): void {
    this.first.processMono(x, n)
    this.second.processMono(x, n)
  }
}

/** The allpass an LR4 split-and-sum applies; used as null-test reference. */
export class LinkwitzRiley4Allpass {
  private readonly section = new StereoBiquad()

  configure(sampleRate: number, freq: number): void {
    this.section.allpass(sampleRate, freq, BUTTERWORTH_Q)
  }

  reset(): void {
    this.section.reset()
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    this.section.process(l, r, n)
  }
}
