// Dynamics stages: Bus Compressor, Multiband Comp, Limiter (spec-012).

import type { BusModule, ParamReader } from '../module'
import { LinkwitzRiley4, StereoBiquad } from '../biquad'
import { DelayLine, TruePeakUpsampler } from '../oversampler'
import { OnePoleSmoother, dbToLinear, flushDenormal, linearToDb } from '../util'

const KNEE_DB = 6
const DETECTOR_RMS_MS = 5

/**
 * Shared stereo-linked soft-knee gain computer: RMS-style detector on
 * max(|L|,|R|), log-domain knee/ratio, one-pole attack/release on the
 * gain-reduction envelope. Slope 0 (ratio 1:1) is an exact unity path.
 */
class EnvelopeCompressor {
  private msState = 0
  private grEnvDb = 0
  private readonly rmsCoeff: number
  private attackCoeff = 0
  private releaseCoeff = 0
  private thresholdDb = 0
  private slope = 0
  blockGrDb = 0

  constructor(private readonly sampleRate: number) {
    this.rmsCoeff = Math.exp(-1000 / (DETECTOR_RMS_MS * sampleRate))
  }

  configure(thresholdDb: number, ratio: number, attackMs: number, releaseMs: number): void {
    this.thresholdDb = thresholdDb
    this.slope = 1 - 1 / ratio
    this.attackCoeff = Math.exp(-1000 / (Math.max(0.05, attackMs) * this.sampleRate))
    this.releaseCoeff = Math.exp(-1000 / (Math.max(1, releaseMs) * this.sampleRate))
  }

  reset(): void {
    this.msState = 0
    this.grEnvDb = 0
    this.blockGrDb = 0
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    if (this.slope === 0) {
      // Ratio 1:1: exact unity, but keep the detector warm so engaging the
      // ratio later starts from an honest envelope.
      let ms = this.msState
      const rc = this.rmsCoeff
      for (let i = 0; i < n; i++) {
        const al = l[i] < 0 ? -l[i] : l[i]
        const ar = r[i] < 0 ? -r[i] : r[i]
        const d = al > ar ? al : ar
        ms = d * d + (ms - d * d) * rc
      }
      this.msState = flushDenormal(ms)
      this.grEnvDb = 0
      this.blockGrDb = 0
      return
    }
    let ms = this.msState
    let env = this.grEnvDb
    const rc = this.rmsCoeff
    const att = this.attackCoeff
    const rel = this.releaseCoeff
    const threshold = this.thresholdDb
    const slope = this.slope
    const halfKnee = KNEE_DB / 2
    let maxGr = 0
    for (let i = 0; i < n; i++) {
      const al = l[i] < 0 ? -l[i] : l[i]
      const ar = r[i] < 0 ? -r[i] : r[i]
      const d = al > ar ? al : ar
      ms = d * d + (ms - d * d) * rc
      const levelDb = ms > 1e-20 ? 10 * Math.log10(ms) : -200
      const over = levelDb - threshold
      let targetGr = 0
      if (over >= halfKnee) targetGr = slope * over
      else if (over > -halfKnee) {
        const t = over + halfKnee
        targetGr = (slope * t * t) / (2 * KNEE_DB)
      }
      env = targetGr > env ? targetGr + (env - targetGr) * att : targetGr + (env - targetGr) * rel
      if (env > maxGr) maxGr = env
      const gain = dbToLinear(-env)
      l[i] *= gain
      r[i] *= gain
    }
    this.msState = flushDenormal(ms)
    this.grEnvDb = flushDenormal(env)
    this.blockGrDb = maxGr
  }
}

export class BusCompressorModule implements BusModule {
  readonly id = 'comp' as const
  readonly latencySamples = 0
  private readonly comp: EnvelopeCompressor

  constructor(sampleRate: number) {
    this.comp = new EnvelopeCompressor(sampleRate)
  }

  get grDb(): number {
    return this.comp.blockGrDb
  }

  updateParams(read: ParamReader): void {
    this.comp.configure(read('comp.thr'), read('comp.ratio'), read('comp.att'), read('comp.rel'))
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    this.comp.process(l, r, n)
  }

  reset(): void {
    this.comp.reset()
  }
}

const MBC_LOW_XOVER_HZ = 120
const MBC_HIGH_XOVER_HZ = 2000
const BUTTERWORTH_Q = Math.SQRT1_2
// Documented amount macro: ratio = 1 + amount/50, threshold = -22 - 0.14 * amount.
// The -22 base sits under the per-band RMS of nominal -18 dBFS program so
// the default 20/15/20 amounts apply gentle, audible leveling.
function mbcRatio(amount: number): number {
  return 1 + amount / 50
}
function mbcThresholdDb(amount: number): number {
  return -22 - 0.14 * amount
}

export class MultibandCompModule implements BusModule {
  readonly id = 'mbc' as const
  readonly latencySamples = 0
  readonly grDb = 0
  private readonly lowLp = new LinkwitzRiley4()
  private readonly lowRestHp = new LinkwitzRiley4()
  private readonly midLp = new LinkwitzRiley4()
  private readonly highHp = new LinkwitzRiley4()
  // The low band needs the second crossover's allpass so the three bands
  // sum allpass-flat (audio-engine.md block diagram).
  private readonly lowCompensation = new StereoBiquad()
  private readonly lowComp: EnvelopeCompressor
  private readonly midComp: EnvelopeCompressor
  private readonly highComp: EnvelopeCompressor
  private readonly lowL: Float32Array
  private readonly lowR: Float32Array
  private readonly midL: Float32Array
  private readonly midR: Float32Array

  constructor(sampleRate: number, maxBlock: number) {
    this.lowLp.configure('lowpass', sampleRate, MBC_LOW_XOVER_HZ)
    this.lowRestHp.configure('highpass', sampleRate, MBC_LOW_XOVER_HZ)
    this.midLp.configure('lowpass', sampleRate, MBC_HIGH_XOVER_HZ)
    this.highHp.configure('highpass', sampleRate, MBC_HIGH_XOVER_HZ)
    this.lowCompensation.allpass(sampleRate, MBC_HIGH_XOVER_HZ, BUTTERWORTH_Q)
    this.lowComp = new EnvelopeCompressor(sampleRate)
    this.midComp = new EnvelopeCompressor(sampleRate)
    this.highComp = new EnvelopeCompressor(sampleRate)
    this.lowL = new Float32Array(maxBlock)
    this.lowR = new Float32Array(maxBlock)
    this.midL = new Float32Array(maxBlock)
    this.midR = new Float32Array(maxBlock)
  }

  updateParams(read: ParamReader): void {
    const lo = read('mbc.lo')
    const mid = read('mbc.mid')
    const hi = read('mbc.hi')
    // Fixed per-band time constants: slower lows, faster highs.
    this.lowComp.configure(mbcThresholdDb(lo), mbcRatio(lo), 30, 200)
    this.midComp.configure(mbcThresholdDb(mid), mbcRatio(mid), 15, 150)
    this.highComp.configure(mbcThresholdDb(hi), mbcRatio(hi), 5, 80)
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const { lowL, lowR, midL, midR } = this
    for (let i = 0; i < n; i++) {
      lowL[i] = l[i]
      lowR[i] = r[i]
    }
    // Low band: LP4 @120 then AP @2k compensation.
    this.lowLp.process(lowL, lowR, n)
    this.lowCompensation.process(lowL, lowR, n)
    // Rest: HP4 @120 in place, then split mid/high.
    this.lowRestHp.process(l, r, n)
    for (let i = 0; i < n; i++) {
      midL[i] = l[i]
      midR[i] = r[i]
    }
    this.midLp.process(midL, midR, n)
    this.highHp.process(l, r, n)

    this.lowComp.process(lowL, lowR, n)
    this.midComp.process(midL, midR, n)
    this.highComp.process(l, r, n)

    for (let i = 0; i < n; i++) {
      l[i] += lowL[i] + midL[i]
      r[i] += lowR[i] + midR[i]
    }
  }

  reset(): void {
    this.lowLp.reset()
    this.lowRestHp.reset()
    this.midLp.reset()
    this.highHp.reset()
    this.lowCompensation.reset()
    this.lowComp.reset()
    this.midComp.reset()
    this.highComp.reset()
  }
}

// 2.5 ms lookahead (spec-012). At 48 kHz: 120 samples.
const LOOKAHEAD_SECONDS = 0.0025
const RELEASE_MS = 100
// Slope-limited attack: full-scale descent within 64 samples, always inside
// the lookahead lead window (see audio-engine.md).
const ATTACK_SLOPE = 1 / 64
// Enforced ceiling sits 0.1 dB under the knob value so the 4x true-peak
// estimate's residual error cannot poke above the documented ceiling.
const CEILING_SAFETY = dbToLinear(-0.1)

export class LimiterModule implements BusModule {
  readonly id = 'lim' as const
  readonly latencySamples: number
  private readonly sampleRate: number
  private readonly lookahead: number
  private readonly window: number
  private readonly audioDelayL: DelayLine
  private readonly audioDelayR: DelayLine
  // The sidechain upsamples each SIGNED channel and rectifies at 4x.
  // Upsampling a rectified signal flattens inter-sample peaks (|sin| at
  // fs/4 is a constant), which would blind the true-peak detector.
  private readonly truePeakL: TruePeakUpsampler
  private readonly truePeakR: TruePeakUpsampler
  private readonly scInL: Float32Array
  private readonly scInR: Float32Array
  private readonly scUpL: Float32Array
  private readonly scUpR: Float32Array
  // Monotonic deque for the sliding-window minimum: parallel circular
  // arrays of global sample indices and their raw gain values.
  private readonly dequeIndex: Float64Array
  private readonly dequeValue: Float32Array
  private dequeHead = 0
  private dequeLen = 0
  private sampleCounter = 0
  private gain = 1
  private releaseCoeff: number
  private gainRamp: OnePoleSmoother
  private gainRampSeeded = false
  private ceiling = dbToLinear(-1) * CEILING_SAFETY
  private blockGrDb = 0

  constructor(sampleRate: number, maxBlock: number) {
    this.sampleRate = sampleRate
    this.lookahead = Math.round(LOOKAHEAD_SECONDS * sampleRate)
    this.latencySamples = this.lookahead
    this.truePeakL = new TruePeakUpsampler(maxBlock)
    this.truePeakR = new TruePeakUpsampler(maxBlock)
    const lead = this.lookahead - this.truePeakL.lagSamples
    if (lead < 96) throw new Error('Limiter lookahead must exceed the sidechain lag by the attack ramp length')
    this.window = lead + 1
    this.audioDelayL = new DelayLine(this.lookahead)
    this.audioDelayR = new DelayLine(this.lookahead)
    this.scInL = new Float32Array(maxBlock)
    this.scInR = new Float32Array(maxBlock)
    this.scUpL = new Float32Array(maxBlock * 4)
    this.scUpR = new Float32Array(maxBlock * 4)
    this.dequeIndex = new Float64Array(this.window + 1)
    this.dequeValue = new Float32Array(this.window + 1)
    this.releaseCoeff = 1 - Math.exp(-1000 / (RELEASE_MS * sampleRate))
    this.gainRamp = new OnePoleSmoother(dbToLinear(4), 20, sampleRate)
  }

  get grDb(): number {
    return this.blockGrDb
  }

  updateParams(read: ParamReader): void {
    const gainTarget = dbToLinear(read('lim.gain'))
    if (!this.gainRampSeeded) {
      this.gainRamp.snapTo(gainTarget)
      this.gainRampSeeded = true
    } else {
      this.gainRamp.setTarget(gainTarget)
    }
    this.ceiling = dbToLinear(read('lim.ceil')) * CEILING_SAFETY
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const { scInL, scInR, scUpL, scUpR, dequeIndex, dequeValue, window } = this
    const capacity = window + 1
    const ceiling = this.ceiling
    // Pre-gain (smoothed) feeds both the audio path and the sidechain.
    for (let i = 0; i < n; i++) {
      const g = this.gainRamp.next()
      l[i] *= g
      r[i] *= g
      scInL[i] = l[i]
      scInR[i] = r[i]
    }
    this.audioDelayL.process(l, n)
    this.audioDelayR.process(r, n)
    this.truePeakL.process(scInL, n, scUpL)
    this.truePeakR.process(scInR, n, scUpR)

    let gain = this.gain
    let head = this.dequeHead
    let len = this.dequeLen
    let t = this.sampleCounter
    let maxGr = 0
    const release = this.releaseCoeff
    for (let i = 0; i < n; i++) {
      const base = 4 * i
      let tp = 0
      for (let k = 0; k < 4; k++) {
        const vl = scUpL[base + k] < 0 ? -scUpL[base + k] : scUpL[base + k]
        if (vl > tp) tp = vl
        const vr = scUpR[base + k] < 0 ? -scUpR[base + k] : scUpR[base + k]
        if (vr > tp) tp = vr
      }
      const raw = tp > ceiling ? ceiling / tp : 1
      // Sliding-window minimum over the last `window` raw values.
      while (len > 0 && dequeValue[(head + len - 1) % capacity] >= raw) len--
      const back = (head + len) % capacity
      dequeIndex[back] = t
      dequeValue[back] = raw
      len++
      while (dequeIndex[head] <= t - window) {
        head = head + 1 >= capacity ? 0 : head + 1
        len--
      }
      const m = dequeValue[head]
      if (m < gain) {
        gain = gain - ATTACK_SLOPE > m ? gain - ATTACK_SLOPE : m
      } else {
        gain += (m - gain) * release
        if (gain > m) gain = m
      }
      const gr = -linearToDb(gain)
      if (gr > maxGr) maxGr = gr
      l[i] *= gain
      r[i] *= gain
      t++
    }
    this.gain = gain
    this.dequeHead = head
    this.dequeLen = len
    this.sampleCounter = t
    this.blockGrDb = maxGr
  }

  reset(): void {
    this.audioDelayL.reset()
    this.audioDelayR.reset()
    this.truePeakL.reset()
    this.truePeakR.reset()
    this.dequeHead = 0
    this.dequeLen = 0
    this.sampleCounter = 0
    this.gain = 1
    this.blockGrDb = 0
    this.gainRamp.snapTo(this.gainRamp.value)
  }
}
