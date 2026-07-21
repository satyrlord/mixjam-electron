// Nonlinear stages: Soft Clip, Tube Saturation, Tape Saturation, Maximizer.
// All share the OversampledSaturator base: an engaged path through the
// shared oversampler and an exact-identity neutral path through an integer
// delay of the same length, so a stage at zero drive nulls bit-exactly
// against a latency-compensated bypass (spec-012 null tests).

import type { BusModule, ParamReader } from '../module'
import { StereoBiquad } from '../biquad'
import { DelayLine, OversampledStage } from '../oversampler'
import type { OversampleFactor } from '../oversampler'
import { dbToLinear, flushDenormal } from '../util'

const ENGAGE_EPS = 1e-3
// Raw-input history kept for priming the engaged path on a neutral->engaged
// switch. Must cover the oversampler state depth plus its round-trip delay
// so the switch error stays at the FIR reconstruction floor.
const PRIME_SAMPLES = 256

/** Soft-knee clipper: identity below ceiling/2, saturates at ceiling. */
export function softKneeClip(x: number, ceiling: number): number {
  const ax = x < 0 ? -x : x
  const half = ceiling * 0.5
  if (ax <= half) return x
  if (ax >= ceiling * 1.5) return x < 0 ? -ceiling : ceiling
  const t = (ax - half) / ceiling
  const y = half + half * (2 * t - t * t)
  return x < 0 ? -y : y
}

class DcBlocker {
  private x1l = 0
  private y1l = 0
  private x1r = 0
  private y1r = 0
  private readonly r: number

  constructor(sampleRate: number) {
    // First-order blocker with a ~5 Hz corner.
    this.r = 1 - (2 * Math.PI * 5) / sampleRate
  }

  reset(): void {
    this.x1l = this.y1l = this.x1r = this.y1r = 0
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    this.processChannel(0, l, n)
    this.processChannel(1, r, n)
  }

  processChannel(channel: 0 | 1, x: Float32Array, n: number): void {
    const c = this.r
    let x1 = channel === 0 ? this.x1l : this.x1r
    let y1 = channel === 0 ? this.y1l : this.y1r
    for (let i = 0; i < n; i++) {
      const xi = x[i]
      y1 = xi - x1 + c * y1
      x1 = xi
      x[i] = y1
    }
    if (channel === 0) {
      this.x1l = flushDenormal(x1)
      this.y1l = flushDenormal(y1)
    } else {
      this.x1r = flushDenormal(x1)
      this.y1r = flushDenormal(y1)
    }
  }
}

/**
 * Base for the oversampled nonlinear stages. Subclasses configure their
 * filters and shaper in updateParams/prepareBlock and report whether the
 * stage is currently engaged. The raw-input delay lines run continuously,
 * so the neutral path and the Tube dry path are always warm; only the
 * engaged path needs priming (replaying recent raw input) after a switch.
 */
abstract class OversampledSaturator implements BusModule {
  abstract readonly id: BusModule['id']
  readonly latencySamples: number
  readonly grDb = 0
  protected readonly os: OversampledStage
  protected readonly sampleRate: number
  private readonly rawDelayL: DelayLine
  private readonly rawDelayR: DelayLine
  private readonly dryL: Float32Array
  private readonly dryR: Float32Array
  private readonly histL: Float32Array
  private readonly histR: Float32Array
  private readonly primeScratch: Float32Array
  private histPos = 0
  private engaged = false

  constructor(factor: OversampleFactor, sampleRate: number, maxBlock: number) {
    this.sampleRate = sampleRate
    this.os = new OversampledStage(factor, Math.max(maxBlock, PRIME_SAMPLES))
    this.latencySamples = this.os.latencySamples
    this.rawDelayL = new DelayLine(this.latencySamples)
    this.rawDelayR = new DelayLine(this.latencySamples)
    this.dryL = new Float32Array(maxBlock)
    this.dryR = new Float32Array(maxBlock)
    this.histL = new Float32Array(PRIME_SAMPLES)
    this.histR = new Float32Array(PRIME_SAMPLES)
    this.primeScratch = new Float32Array(PRIME_SAMPLES)
  }

  abstract updateParams(read: ParamReader): void

  /** True when the current parameters require the nonlinear path. */
  protected abstract isEngaged(): boolean

  /** Runs the engaged path in place (filters + oversampled shaper). */
  protected abstract processEngaged(l: Float32Array, r: Float32Array, n: number): void

  /** Clears engaged-path filter state before a priming replay. */
  protected abstract resetEngagedState(): void

  /**
   * Combines engaged output with the aligned dry signal. Default replaces
   * dry entirely; Tube overrides for its Mix control.
   */
  protected combine(l: Float32Array, r: Float32Array, dryL: Float32Array, dryR: Float32Array, n: number): void {
    void l
    void r
    void dryL
    void dryR
    void n
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const engagedNow = this.isEngaged()
    if (engagedNow && !this.engaged) this.primeEngagedPath()
    this.engaged = engagedNow

    // Record raw input and produce the aligned dry signal before the
    // engaged path mutates the buffers.
    this.recordHistory(l, r, n)
    for (let i = 0; i < n; i++) {
      this.dryL[i] = l[i]
      this.dryR[i] = r[i]
    }
    this.rawDelayL.process(this.dryL, n)
    this.rawDelayR.process(this.dryR, n)

    if (!engagedNow) {
      l.set(this.dryL.subarray(0, n))
      r.set(this.dryR.subarray(0, n))
      return
    }
    this.processEngaged(l, r, n)
    this.combine(l, r, this.dryL, this.dryR, n)
  }

  reset(): void {
    this.os.reset()
    this.rawDelayL.reset()
    this.rawDelayR.reset()
    this.histL.fill(0)
    this.histR.fill(0)
    this.histPos = 0
    this.resetEngagedState()
    this.engaged = false
  }

  private recordHistory(l: Float32Array, r: Float32Array, n: number): void {
    const { histL, histR } = this
    let pos = this.histPos
    for (let i = 0; i < n; i++) {
      histL[pos] = l[i]
      histR[pos] = r[i]
      pos++
      if (pos >= PRIME_SAMPLES) pos = 0
    }
    this.histPos = pos
  }

  private primeEngagedPath(): void {
    this.os.reset()
    this.resetEngagedState()
    // Replay recent raw input through the engaged path, discarding output,
    // so its filter states match a path that had been running all along.
    // All engaged-path state is per-channel, so replaying one channel at a
    // time is exact.
    const scratch = this.primeScratch
    const replay = (hist: Float32Array): void => {
      const start = this.histPos
      for (let i = 0; i < PRIME_SAMPLES; i++) {
        scratch[i] = hist[(start + i) % PRIME_SAMPLES]
      }
    }
    replay(this.histL)
    this.primeChannel(scratch, 0)
    replay(this.histR)
    this.primeChannel(scratch, 1)
  }

  /** Replays one channel of history through the engaged path. */
  protected abstract primeChannel(data: Float32Array, channel: number): void
}

export class SoftClipModule extends OversampledSaturator {
  readonly id = 'clip' as const
  private drive = 1
  private ceiling = dbToLinear(-0.5)
  private amount = 0
  private readonly shaper: (data: Float32Array, len: number) => void

  constructor(sampleRate: number, maxBlock: number) {
    super(4, sampleRate, maxBlock)
    // The knee curve is odd, so it generates no DC by construction; a DC
    // blocker here would add low-frequency phase shift that breaks the
    // below-knee identity.
    this.shaper = (data, len) => {
      const g = this.drive
      const inv = 1 / g
      const c = this.ceiling
      for (let i = 0; i < len; i++) {
        data[i] = softKneeClip(data[i] * g, c) * inv
      }
    }
  }

  updateParams(read: ParamReader): void {
    this.amount = read('clip.amount')
    this.drive = dbToLinear(this.amount)
    this.ceiling = dbToLinear(read('clip.ceil'))
  }

  protected isEngaged(): boolean {
    return this.amount > ENGAGE_EPS
  }

  protected processEngaged(l: Float32Array, r: Float32Array, n: number): void {
    this.os.process(l, r, n, this.shaper)
  }

  protected resetEngagedState(): void {}

  protected primeChannel(data: Float32Array, channel: number): void {
    this.os.processChannel(channel, data, PRIME_SAMPLES, this.shaper)
  }
}

const TUBE_ASYMMETRY = 0.5
// Reference amplitude for the loudness compensation fit: a -18 dBFS RMS
// sine, the chain's nominal program level (spec-012 calibration).
const TUBE_REFERENCE_AMPLITUDE = Math.SQRT2 * Math.pow(10, -18 / 20)

export class TubeSaturationModule extends OversampledSaturator {
  readonly id = 'tube' as const
  private drive = -1
  private tubeGain = 1
  private makeup = 1
  private mixCurrent = 1
  private mixTarget = 1
  private readonly dc: DcBlocker
  private readonly shaper: (data: Float32Array, len: number) => void

  constructor(sampleRate: number, maxBlock: number) {
    super(4, sampleRate, maxBlock)
    this.dc = new DcBlocker(sampleRate)
    this.shaper = (data, len) => {
      const d = this.tubeGain
      const inv = this.makeup / d
      for (let i = 0; i < len; i++) {
        const t = Math.tanh(data[i] * d)
        data[i] = (t - TUBE_ASYMMETRY * t * t) * inv
      }
    }
  }

  updateParams(read: ParamReader): void {
    const drive = read('tube.drive')
    if (drive !== this.drive) {
      this.drive = drive
      this.tubeGain = 1 + drive * 0.4
      this.makeup = this.computeMakeup()
    }
    this.mixTarget = read('tube.mix') / 100
  }

  /**
   * Loudness compensation (spec-012: approximately unity loudness across
   * Drive): measures the shaper's RMS gain on one cycle of a nominal-level
   * reference sine and inverts it. 64-point loop, runs only when Drive
   * changes.
   */
  private computeMakeup(): number {
    const d = this.tubeGain
    let inMs = 0
    let outMs = 0
    for (let i = 0; i < 64; i++) {
      const x = TUBE_REFERENCE_AMPLITUDE * Math.sin((2 * Math.PI * i) / 64)
      const t = Math.tanh(x * d)
      const y = (t - TUBE_ASYMMETRY * t * t) / d
      inMs += x * x
      outMs += y * y
    }
    // The DC term the blocker removes must not count toward loudness.
    let mean = 0
    for (let i = 0; i < 64; i++) {
      const x = TUBE_REFERENCE_AMPLITUDE * Math.sin((2 * Math.PI * i) / 64)
      const t = Math.tanh(x * d)
      mean += (t - TUBE_ASYMMETRY * t * t) / d
    }
    mean /= 64
    outMs = Math.max(1e-20, outMs / 64 - mean * mean)
    inMs /= 64
    return Math.sqrt(inMs / outMs)
  }

  protected isEngaged(): boolean {
    return this.drive > ENGAGE_EPS
  }

  protected processEngaged(l: Float32Array, r: Float32Array, n: number): void {
    this.os.process(l, r, n, this.shaper)
    this.dc.process(l, r, n)
  }

  protected resetEngagedState(): void {
    this.dc.reset()
    this.mixCurrent = this.mixTarget
  }

  protected primeChannel(data: Float32Array, channel: number): void {
    this.os.processChannel(channel, data, PRIME_SAMPLES, this.shaper)
    this.dc.processChannel(channel as 0 | 1, data, PRIME_SAMPLES)
  }

  protected override combine(l: Float32Array, r: Float32Array, dryL: Float32Array, dryR: Float32Array, n: number): void {
    const from = this.mixCurrent
    const to = this.mixTarget
    const step = (to - from) / n
    let mix = from
    for (let i = 0; i < n; i++) {
      mix += step
      l[i] = l[i] * mix + dryL[i] * (1 - mix)
      r[i] = r[i] * mix + dryR[i] * (1 - mix)
    }
    this.mixCurrent = to
  }
}

const MAXIMIZER_CEILING = dbToLinear(-1)

export class MaximizerModule extends OversampledSaturator {
  readonly id = 'max' as const
  private boost = 0
  private drive = 1
  private readonly shaper: (data: Float32Array, len: number) => void

  constructor(sampleRate: number, maxBlock: number) {
    super(4, sampleRate, maxBlock)
    this.shaper = (data, len) => {
      const g = this.drive
      for (let i = 0; i < len; i++) {
        data[i] = softKneeClip(data[i] * g, MAXIMIZER_CEILING)
      }
    }
  }

  updateParams(read: ParamReader): void {
    this.boost = read('max.boost')
    // Documented mapping: drive dB = 0.25 x Boost % (calibrated so the
    // Cheat Sheet defaults land at -14 LUFS-I from a -18 dBFS RMS program).
    this.drive = dbToLinear(0.25 * this.boost)
  }

  protected isEngaged(): boolean {
    return this.boost > ENGAGE_EPS
  }

  protected processEngaged(l: Float32Array, r: Float32Array, n: number): void {
    this.os.process(l, r, n, this.shaper)
  }

  protected resetEngagedState(): void {}

  protected primeChannel(data: Float32Array, channel: number): void {
    this.os.processChannel(channel, data, PRIME_SAMPLES, this.shaper)
  }
}

const TAPE_EMPHASIS_DB = 4
const TAPE_EMPHASIS_HZ = 4500
const TAPE_SHELF_SLOPE = 0.7

export class TapeSaturationModule extends OversampledSaturator {
  readonly id = 'tape' as const
  private drive = 0
  private tapeGain = 1
  private is30Ips = true
  private readonly preEmphasis = new StereoBiquad()
  private readonly deEmphasis = new StereoBiquad()
  private readonly headBump = new StereoBiquad()
  private readonly rolloff = new StereoBiquad()
  private readonly shaper: (data: Float32Array, len: number) => void

  constructor(sampleRate: number, maxBlock: number) {
    super(2, sampleRate, maxBlock)
    this.shaper = (data, len) => {
      const d = this.tapeGain
      const inv = 1 / d
      for (let i = 0; i < len; i++) {
        data[i] = Math.tanh(data[i] * d) * inv
      }
    }
    this.configureFilters()
  }

  private configureFilters(): void {
    const fs = this.sampleRate
    this.preEmphasis.highShelf(fs, TAPE_EMPHASIS_HZ, TAPE_SHELF_SLOPE, TAPE_EMPHASIS_DB)
    this.deEmphasis.highShelf(fs, TAPE_EMPHASIS_HZ, TAPE_SHELF_SLOPE, -TAPE_EMPHASIS_DB)
    const driveScale = this.drive / 10
    // Speed-dependent head model (spec-012): bump center 55 Hz at 15 IPS /
    // 35 Hz at 30 IPS; HF roll-off corner 11 kHz at 15 IPS / 16 kHz at 30.
    const bumpHz = this.is30Ips ? 35 : 55
    this.headBump.peaking(fs, bumpHz, 0.9, 1.5 * driveScale)
    const rolloffHz = this.is30Ips ? 16000 : 11000
    const rolloffDb = -1.5 * driveScale * (this.is30Ips ? 1 : 1.5)
    this.rolloff.highShelf(fs, Math.min(rolloffHz, fs * 0.45), TAPE_SHELF_SLOPE, rolloffDb)
  }

  updateParams(read: ParamReader): void {
    const drive = read('tape.drive')
    const is30 = read('tape.ips') >= 0.5
    if (drive !== this.drive || is30 !== this.is30Ips) {
      this.drive = drive
      this.is30Ips = is30
      this.tapeGain = 1 + drive * 0.45
      this.configureFilters()
    }
  }

  protected isEngaged(): boolean {
    return this.drive > ENGAGE_EPS
  }

  protected processEngaged(l: Float32Array, r: Float32Array, n: number): void {
    this.preEmphasis.process(l, r, n)
    this.os.process(l, r, n, this.shaper)
    this.deEmphasis.process(l, r, n)
    this.headBump.process(l, r, n)
    this.rolloff.process(l, r, n)
  }

  protected resetEngagedState(): void {
    this.preEmphasis.reset()
    this.deEmphasis.reset()
    this.headBump.reset()
    this.rolloff.reset()
  }

  protected primeChannel(data: Float32Array, channel: number): void {
    const ch = channel as 0 | 1
    this.preEmphasis.processChannel(ch, data, PRIME_SAMPLES)
    this.os.processChannel(channel, data, PRIME_SAMPLES, this.shaper)
    this.deEmphasis.processChannel(ch, data, PRIME_SAMPLES)
    this.headBump.processChannel(ch, data, PRIME_SAMPLES)
    this.rolloff.processChannel(ch, data, PRIME_SAMPLES)
  }
}
