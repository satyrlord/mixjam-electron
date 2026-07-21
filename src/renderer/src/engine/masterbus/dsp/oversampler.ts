// Shared oversampling for the nonlinear master bus stages: cascaded 2x
// half-band linear-phase FIR polyphase stages (spec-012 / audio-engine.md).
// All work buffers are allocated at construction; process() allocates
// nothing.
//
// Tap counts are chosen so every stage's up+down round trip is an INTEGER
// number of base-rate samples: a stage whose drive is neutral can then be
// replaced by an exact integer delay, which is what makes the -100 dBFS
// null tests pass bit-exactly, and keeps the neutral<->engaged path switch
// error at the FIR reconstruction floor (~-90 dB, below the glitch gate).
//   outer 2x stage: 63 taps -> pair delay (63-1)/2 = 31 base samples
//   inner 2x stage: 45 taps -> pair delay (45-1)   = 44 samples at 2x
//                              = 11 base samples (needs (taps-1) % 4 == 0)
// The inner stage runs at the doubled rate, so it carries fewer taps; its
// stopband leakage is additionally attenuated by the outer stage.

const OUTER_TAPS = 63
const INNER_TAPS = 45
const KAISER_BETA = 9

function besselI0(x: number): number {
  // Series expansion; converges quickly for the beta range used here.
  let sum = 1
  let term = 1
  for (let k = 1; k < 64; k++) {
    term *= (x / (2 * k)) * (x / (2 * k))
    sum += term
    if (term < 1e-14 * sum) break
  }
  return sum
}

interface HalfBandKernel {
  readonly taps: Float64Array
  readonly phase0: Float64Array
  readonly phase1: Float64Array
  readonly phaseLen: number
  readonly order: number
  // A half-band kernel always has one trivial polyphase half: every tap is
  // ~zero except the 0.5 center. That phase reduces to a pure delay, which
  // halves the upsampler work. `trivialPhase` says which half (0 or 1) and
  // `trivialDelay` is the center tap's index inside that half.
  readonly trivialPhase: 0 | 1
  readonly trivialDelay: number
  /** 2 * h[center]; ~1.0 but not exactly after normalization. */
  readonly trivialGain: number
  readonly densePhase: Float64Array
  // Down path: the same sparsity means only the dense-phase taps and the
  // center contribute; `denseTapIndices` lists the nonzero full-kernel tap
  // positions.
  readonly denseTapIndices: Int32Array
  readonly denseTapValues: Float64Array
  // A half-band kernel's nonzero taps are a fixed stride-2 comb with the center
  // tap inserted in the middle: `denseFirst + 2k` below the center, `center` at
  // `densePivot`, then `denseFirst + 2(k-1)` above it. That lets the downsampler
  // walk the history with a decrementing pointer instead of loading an index per
  // tap. `designHalfBand` proves the layout before publishing these.
  readonly denseFirst: number
  readonly densePivot: number
  readonly denseCenter: number
}

function designHalfBand(taps: number, beta: number): HalfBandKernel {
  const h = new Float64Array(taps)
  const center = (taps - 1) / 2
  const i0Beta = besselI0(beta)
  for (let n = 0; n < taps; n++) {
    const m = n - center
    const sinc = m === 0 ? 0.5 : Math.sin((Math.PI * m) / 2) / (Math.PI * m)
    const t = m / center
    const window = besselI0(beta * Math.sqrt(Math.max(0, 1 - t * t))) / i0Beta
    h[n] = sinc * window
  }
  // Normalize to exactly unity DC gain.
  let sum = 0
  for (let n = 0; n < taps; n++) sum += h[n]
  for (let n = 0; n < taps; n++) h[n] /= sum
  // Polyphase halves; the odd half is zero-padded to the shared length so
  // the hot loop stays branch-free.
  const phaseLen = Math.ceil(taps / 2)
  const phase0 = new Float64Array(phaseLen)
  const phase1 = new Float64Array(phaseLen)
  for (let i = 0; i < taps; i++) {
    if (i % 2 === 0) phase0[i >> 1] = h[i]
    else phase1[i >> 1] = h[i]
  }
  const centerParity = (center % 2) as 0 | 1
  const trivialPhase = centerParity
  const trivialDelay = center >> 1
  const densePhase = trivialPhase === 0 ? phase1 : phase0
  const denseIndices: number[] = []
  const denseValues: number[] = []
  for (let i = 0; i < taps; i++) {
    if (i === center || Math.abs(h[i]) > 1e-12) {
      denseIndices.push(i)
      denseValues.push(h[i])
    }
  }
  // Prove the stride-2-with-center-insert layout the downsampler's pointer walk
  // depends on. A future tap count that broke it would otherwise read the wrong
  // history slots silently, so fail loudly at module-load time instead.
  const densePivot = denseIndices.indexOf(center)
  const denseFirst = denseIndices[0]!
  if (densePivot < 0) throw new Error('half-band kernel: center tap missing from dense set')
  for (let k = 0; k < denseIndices.length; k++) {
    const expected = k === densePivot
      ? center
      : denseFirst + 2 * (k < densePivot ? k : k - 1)
    if (denseIndices[k] !== expected) {
      throw new Error(
        `half-band kernel (${taps} taps): dense tap ${k} is ${denseIndices[k]}, expected ${expected}`
      )
    }
  }

  return {
    taps: h,
    phase0,
    phase1,
    phaseLen,
    order: taps,
    trivialPhase,
    trivialDelay,
    trivialGain: 2 * h[center],
    densePhase,
    denseTapIndices: Int32Array.from(denseIndices),
    denseTapValues: Float64Array.from(denseValues),
    denseFirst,
    densePivot,
    denseCenter: center,
  }
}

const OUTER_KERNEL = designHalfBand(OUTER_TAPS, KAISER_BETA)
const INNER_KERNEL = designHalfBand(INNER_TAPS, KAISER_BETA)

// The history rings hold f64. Every value written into them is copied from a
// Float32Array, so it is exactly representable and the stored double equals the
// widened float32 the old Float32Array ring produced — bit-identical reads, but
// without a narrowing store and a widening load on the hot path.
class Upsampler2x {
  private readonly history: Float64Array
  private readonly kernel: HalfBandKernel

  constructor(kernel: HalfBandKernel, maxInput: number) {
    this.kernel = kernel
    this.history = new Float64Array(maxInput + kernel.phaseLen)
  }

  reset(): void {
    this.history.fill(0)
  }

  /** Writes 2*n samples into out from n input samples. Gain-compensated. */
  process(input: Float32Array, n: number, out: Float32Array): void {
    const hist = this.history
    const { densePhase, phaseLen, trivialPhase, trivialDelay, trivialGain } = this.kernel
    for (let i = 0; i < n; i++) hist[phaseLen + i] = input[i]
    // The trivial phase is the ~0.5 center tap: after the x2 zero-stuffing
    // compensation it is a delayed, near-unity copy of the input.
    for (let i = 0; i < n; i++) {
      let acc = 0
      for (let k = 0; k < phaseLen; k++) {
        acc += densePhase[k] * hist[phaseLen + i - k]
      }
      const dense = 2 * acc
      const aligned = trivialGain * hist[phaseLen + i - trivialDelay]
      if (trivialPhase === 0) {
        out[2 * i] = aligned
        out[2 * i + 1] = dense
      } else {
        out[2 * i] = dense
        out[2 * i + 1] = aligned
      }
    }
    hist.copyWithin(0, n, n + phaseLen)
  }
}

class Downsampler2x {
  private readonly history: Float64Array
  private readonly kernel: HalfBandKernel

  constructor(kernel: HalfBandKernel, maxInput: number) {
    this.kernel = kernel
    this.history = new Float64Array(maxInput + kernel.order)
  }

  reset(): void {
    this.history.fill(0)
  }

  /** Writes n/2 samples into out from n high-rate input samples. */
  process(input: Float32Array, n: number, out: Float32Array): void {
    const hist = this.history
    const { order, denseTapIndices, denseTapValues, denseFirst, densePivot, denseCenter } = this.kernel
    for (let i = 0; i < n; i++) hist[order + i] = input[i]
    const outN = n >> 1
    const denseCount = denseTapIndices.length
    for (let i = 0; i < outN; i++) {
      let acc = 0
      const base = order + 2 * i
      // Only the ~order/2 nonzero half-band taps contribute. Their positions are
      // a stride-2 comb (asserted in designHalfBand), so walk the history with a
      // decrementing pointer rather than loading an index per tap. Terms and
      // summation order are identical to the indexed form, so this is bit-exact.
      let p = base - denseFirst
      for (let k = 0; k < densePivot; k++) {
        acc += denseTapValues[k] * hist[p]
        p -= 2
      }
      acc += denseTapValues[densePivot] * hist[base - denseCenter]
      for (let k = densePivot + 1; k < denseCount; k++) {
        acc += denseTapValues[k] * hist[p]
        p -= 2
      }
      out[i] = acc
    }
    hist.copyWithin(0, n, n + order)
  }
}

/** Integer round-trip delay of a 2x stage, in base-rate samples. */
export const OVERSAMPLE_2X_LATENCY = OUTER_TAPS - 1 >> 1
/** Integer round-trip delay of a 4x stage, in base-rate samples. */
export const OVERSAMPLE_4X_LATENCY = (OUTER_TAPS - 1 >> 1) + (INNER_TAPS - 1 >> 2)

export type OversampleFactor = 2 | 4

/**
 * Runs a per-channel nonlinearity at 2x or 4x the base rate. The shaper
 * callback mutates the oversampled buffer in place and must not allocate.
 */
export class OversampledStage {
  readonly factor: OversampleFactor
  /** Total round-trip group delay in samples at the base rate (integer). */
  readonly latencySamples: number
  private readonly upA: Upsampler2x[]
  private readonly upB: Upsampler2x[]
  private readonly downA: Downsampler2x[]
  private readonly downB: Downsampler2x[]
  private readonly mid: Float32Array[]
  private readonly work: Float32Array[]

  constructor(factor: OversampleFactor, maxBlock: number, channels = 2) {
    this.factor = factor
    this.upA = []
    this.upB = []
    this.downA = []
    this.downB = []
    this.mid = []
    this.work = []
    for (let c = 0; c < channels; c++) {
      this.upA.push(new Upsampler2x(OUTER_KERNEL, maxBlock))
      this.downA.push(new Downsampler2x(OUTER_KERNEL, maxBlock * 2))
      this.mid.push(new Float32Array(maxBlock * 2))
      if (factor === 4) {
        this.upB.push(new Upsampler2x(INNER_KERNEL, maxBlock * 2))
        this.downB.push(new Downsampler2x(INNER_KERNEL, maxBlock * 4))
        this.work.push(new Float32Array(maxBlock * 4))
      }
    }
    this.latencySamples = factor === 2 ? OVERSAMPLE_2X_LATENCY : OVERSAMPLE_4X_LATENCY
  }

  reset(): void {
    for (const u of this.upA) u.reset()
    for (const u of this.upB) u.reset()
    for (const d of this.downA) d.reset()
    for (const d of this.downB) d.reset()
  }

  processChannel(channel: number, buf: Float32Array, n: number, shaper: (data: Float32Array, len: number) => void): void {
    const mid = this.mid[channel]
    this.upA[channel].process(buf, n, mid)
    if (this.factor === 2) {
      shaper(mid, n * 2)
      this.downA[channel].process(mid, n * 2, buf)
      return
    }
    const work = this.work[channel]
    this.upB[channel].process(mid, n * 2, work)
    shaper(work, n * 4)
    this.downB[channel].process(work, n * 4, mid)
    this.downA[channel].process(mid, n * 2, buf)
  }

  process(l: Float32Array, r: Float32Array, n: number, shaper: (data: Float32Array, len: number) => void): void {
    this.processChannel(0, l, n, shaper)
    this.processChannel(1, r, n, shaper)
  }
}

// Base-rate group delay of the mono 4x up-only sidechain path. The two
// half-delays are fractional (15.5 + 7.5) but their sum is integral.
export const TRUE_PEAK_UPSAMPLER_LAG = (2 * (OUTER_TAPS - 1) + (INNER_TAPS - 1)) / 8

/**
 * Mono 4x up-only path for true-peak detection (limiter sidechain and
 * meters). Writes 4*n oversampled samples; the caller takes the absolute
 * maximum per base-sample group.
 */
export class TruePeakUpsampler {
  readonly lagSamples = TRUE_PEAK_UPSAMPLER_LAG
  private readonly first: Upsampler2x
  private readonly second: Upsampler2x
  private readonly mid: Float32Array

  constructor(maxBlock: number) {
    this.first = new Upsampler2x(OUTER_KERNEL, maxBlock)
    this.second = new Upsampler2x(INNER_KERNEL, maxBlock * 2)
    this.mid = new Float32Array(maxBlock * 2)
  }

  reset(): void {
    this.first.reset()
    this.second.reset()
  }

  process(input: Float32Array, n: number, out: Float32Array): void {
    this.first.process(input, n, this.mid)
    this.second.process(this.mid, n * 2, out)
  }
}

/**
 * Fixed integer delay line. Used both for the limiter lookahead and as the
 * exact-identity path of a neutral oversampled stage (same latency as the
 * engaged path, bit-exact samples).
 */
export class DelayLine {
  private readonly buffer: Float32Array
  private readonly length: number
  private pos = 0

  constructor(delaySamples: number) {
    this.length = Math.max(1, delaySamples)
    this.buffer = new Float32Array(this.length)
  }

  reset(): void {
    this.buffer.fill(0)
    this.pos = 0
  }

  process(data: Float32Array, n: number): void {
    const buf = this.buffer
    const len = this.length
    let pos = this.pos
    for (let i = 0; i < n; i++) {
      const delayed = buf[pos]
      buf[pos] = data[i]
      data[i] = delayed
      pos++
      if (pos >= len) pos = 0
    }
    this.pos = pos
  }
}
