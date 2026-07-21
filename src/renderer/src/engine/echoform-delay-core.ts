import {
  ECHOFORM_DELAY_DIVISIONS,
  type EchoformDelayCharacter,
  type EchoformDelayDivision,
  type EchoformDelayMode,
  type EchoformDelayState
} from './echoform-delay-types'

const TWO_PI = Math.PI * 2
const MIN_BPM = 20
const MAX_BPM = 400
/**
 * Longest supported synchronized value: 1/1 dotted at the lowest host BPM.
 * 1/1 dotted = 6 quarter beats; at 40 BPM a quarter is 1.5 s → 9 s. The spec
 * requires at least 10 s of headroom so that value, plus modulation depth and
 * interpolation/crossfade margin, always fits. We reserve 12 s.
 */
const MAX_DELAY_SECONDS = 12
const MIN_FREE_MS = 1
const MAX_FREE_MS = 2000
const MAX_MOD_DEPTH_MS = 20
const DENORMAL_FLOOR = 1e-20
/**
 * Feedback maps 0–110% → 0.0–1.10 loop gain (spec §13). The in-loop soft
 * limiter keeps the result finite above unity without hard-clipping repeats.
 */
const MAX_FEEDBACK_GAIN = 1.1
/** Effective loop gain approached while Freeze/Hold is engaged. */
const FREEZE_LOOP_GAIN = 0.9995
/** Read-head crossfade length for click-free Digital time changes. */
const CROSSFADE_MS = 18

const DIVISION_BEATS: Record<EchoformDelayDivision, number> = {
  '1/1': 4,
  '1/1.': 6,
  '1/1T': 8 / 3,
  '1/2': 2,
  '1/2.': 3,
  '1/2T': 4 / 3,
  '1/4': 1,
  '1/4.': 1.5,
  '1/4T': 2 / 3,
  '1/8': 0.5,
  '1/8.': 0.75,
  '1/8T': 1 / 3,
  '1/16': 0.25,
  '1/16.': 0.375,
  '1/16T': 1 / 6
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** One-pole smoothing coefficient for a given time constant. */
function smoothCoefficient(seconds: number, sampleRate: number): number {
  if (seconds <= 0) return 1
  return 1 - Math.exp(-1 / (seconds * sampleRate))
}

function smooth(current: number, target: number, coefficient: number): number {
  const next = current + (target - current) * coefficient
  return Math.abs(next) < DENORMAL_FLOOR ? 0 : next
}

function flushDenormal(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.abs(value) < DENORMAL_FLOOR ? 0 : value
}

function divisionSeconds(division: EchoformDelayDivision, bpm: number): number {
  return (60 / clamp(bpm, MIN_BPM, MAX_BPM)) * DIVISION_BEATS[division]
}

function delaySeconds(state: EchoformDelayState, bpm: number, side: 'L' | 'R'): number {
  if (state.mode === 'free') {
    return clamp(side === 'L' ? state.timeMsL : state.timeMsR, MIN_FREE_MS, MAX_FREE_MS) / 1000
  }
  return divisionSeconds(side === 'L' ? state.divisionL : state.divisionR, bpm)
}

/**
 * Four-point (cubic) Lagrange interpolation. `delaySamples` is how far behind
 * the write head to read; the buffer is treated as a circular line of `length`.
 * Reads are bounds-safe: every index is wrapped into [0, length).
 */
function readCubic(
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
 * Topology-preserving (TPT) one-pole filter. Unconditionally stable at any
 * cutoff, unlike a Chamberlin SVF near Nyquist. Exposes both low-pass and
 * high-pass outputs so two of these cascade into a 12 dB/oct response.
 */
class OnePoleTPT {
  private state = 0

  reset(): void { this.state = 0 }

  /** `gCoefficient` = G = g/(1+g) where g = tan(π·fc/fs). Returns [lp, hp]. */
  process(input: number, gCoefficient: number): { lp: number; hp: number } {
    const v = (input - this.state) * gCoefficient
    const lp = v + this.state
    this.state = flushDenormal(lp + v)
    return { lp, hp: input - lp }
  }
}

/** Two cascaded TPT one-poles = a stable ~12 dB/oct filter per stereo side. */
class TwoPoleFilter {
  private readonly a = new OnePoleTPT()
  private readonly b = new OnePoleTPT()

  reset(): void { this.a.reset(); this.b.reset() }

  highPass(input: number, g: number): number {
    return this.b.process(this.a.process(input, g).hp, g).hp
  }

  lowPass(input: number, g: number): number {
    return this.b.process(this.a.process(input, g).lp, g).lp
  }
}

/**
 * Bounded soft limiter used inside the feedback loop. It is effectively
 * transparent below the threshold and asymptotes toward ±ceiling, so extreme
 * feedback stays finite without hard-clipping ordinary repeats.
 */
function feedbackSoftLimit(sample: number): number {
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

/** A single deterministic drift generator (smoothed value-noise), no RNG. */
class DriftGenerator {
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

/** Per-side delay line with dual read heads for click-free time changes. */
class DelayLine {
  readonly buffer: Float32Array<ArrayBuffer>
  private readonly length: number
  // Read head A is the live head; head B is the retiring head during a crossfade.
  private headATime: number
  private headBTime: number
  private crossfade = 1 // 1 = fully on head A
  private readonly crossfadeStep: number

  constructor(maxSamples: number, initialDelaySamples: number, crossfadeSamples: number) {
    this.length = maxSamples
    this.buffer = new Float32Array(new ArrayBuffer(maxSamples * Float32Array.BYTES_PER_ELEMENT))
    this.headATime = initialDelaySamples
    this.headBTime = initialDelaySamples
    this.crossfadeStep = 1 / Math.max(1, crossfadeSamples)
  }

  reset(delaySamples: number): void {
    this.buffer.fill(0)
    this.headATime = delaySamples
    this.headBTime = delaySamples
    this.crossfade = 1
  }

  /**
   * Digital retime: if the jump is large, start a crossfade from the old head
   * (B) to a new head (A) placed at the target, avoiding a pitch glide.
   */
  retimeHard(targetSamples: number, jumpThreshold: number): void {
    if (this.crossfade >= 1 && Math.abs(targetSamples - this.headATime) > jumpThreshold) {
      this.headBTime = this.headATime
      this.headATime = targetSamples
      this.crossfade = 0
    } else if (this.crossfade >= 1) {
      this.headATime = targetSamples
    }
  }

  /** Analog/Tape retime: slew the live head so the pitch transition is audible but controlled. */
  retimeSlew(targetSamples: number, slewCoefficient: number): void {
    if (this.crossfade < 1) return // let an in-flight crossfade finish first
    this.headATime = smooth(this.headATime, targetSamples, slewCoefficient)
  }

  /** Read the (possibly crossfaded) delayed sample at the given write index. */
  read(writeIndex: number, extraSamples: number): number {
    const readA = readCubic(this.buffer, writeIndex, clamp(this.headATime + extraSamples, 1, this.length - 2))
    if (this.crossfade >= 1) return readA
    const readB = readCubic(this.buffer, writeIndex, clamp(this.headBTime + extraSamples, 1, this.length - 2))
    const out = readB + (readA - readB) * this.crossfade
    this.crossfade = Math.min(1, this.crossfade + this.crossfadeStep)
    return out
  }

  write(writeIndex: number, value: number): void {
    this.buffer[writeIndex] = flushDenormal(value)
  }
}

/**
 * Allocation-free stereo Echoform Delay processor.
 *
 * The worklet owns one instance. All delay storage and filter state are created
 * by the constructor; process() only reads/writes caller-owned audio blocks and
 * its preallocated buffers — no allocation, locks, logging, or unbounded work.
 */
export class EchoformDelayCore {
  private readonly sampleRate: number
  private readonly maxDelaySamples: number
  private readonly crossfadeSamples: number
  private readonly lineL: DelayLine
  private readonly lineR: DelayLine

  private target: EchoformDelayState
  private bpm: number
  private writeIndex = 0

  // Smoothing coefficients.
  private readonly paramSmoothing: number
  private readonly duckAttack: number
  private readonly modeSlew: number

  // Smoothed continuous scalars.
  private feedback = 0
  private width = 1
  private outputGain = 1
  private duckAmount = 0
  private bypassMix = 0
  private pingPongMix = 0
  private freezeMix = 0

  // Detector / modulation state.
  private duckEnvelope = 0
  private lfoPhase = 0
  private flutterPhase = 0
  private readonly wowDrift: DriftGenerator
  private readonly flutterDrift: DriftGenerator

  // Feedback-loop filters (two-pole HPF for low-cut, two-pole LPF for high-cut).
  private readonly lowCutL = new TwoPoleFilter()
  private readonly lowCutR = new TwoPoleFilter()
  private readonly highCutL = new TwoPoleFilter()
  private readonly highCutR = new TwoPoleFilter()
  // DC blockers for the asymmetric Tape path.
  private dcPrevInL = 0
  private dcPrevOutL = 0
  private dcPrevInR = 0
  private dcPrevOutR = 0

  constructor(sampleRate: number, state: EchoformDelayState, bpm: number) {
    this.sampleRate = Math.max(1, sampleRate)
    this.maxDelaySamples = Math.ceil(MAX_DELAY_SECONDS * this.sampleRate) + 8
    this.crossfadeSamples = Math.max(1, Math.round((CROSSFADE_MS / 1000) * this.sampleRate))
    this.paramSmoothing = smoothCoefficient(0.02, this.sampleRate)
    this.duckAttack = smoothCoefficient(0.007, this.sampleRate)
    this.modeSlew = smoothCoefficient(0.06, this.sampleRate)
    this.target = { ...state }
    this.bpm = clamp(bpm, MIN_BPM, MAX_BPM)

    const initialL = this.delaySamples(delaySeconds(this.target, this.bpm, 'L'))
    const initialR = this.delaySamples(delaySeconds(this.target, this.bpm, 'R'))
    this.lineL = new DelayLine(this.maxDelaySamples, initialL, this.crossfadeSamples)
    this.lineR = new DelayLine(this.maxDelaySamples, initialR, this.crossfadeSamples)
    this.wowDrift = new DriftGenerator(0.9, this.sampleRate, 0.137)
    this.flutterDrift = new DriftGenerator(7.3, this.sampleRate, 0.611)

    this.feedback = this.feedbackTarget()
    this.width = clamp(this.target.width, 0, 200) / 100
    this.outputGain = 10 ** (clamp(this.target.outputDb, -24, 6) / 20)
    this.duckAmount = clamp(this.target.duckAmount, 0, 100) / 100
    this.bypassMix = this.target.bypass ? 1 : 0
    this.pingPongMix = this.target.pingPong ? 1 : 0
    this.freezeMix = this.target.freeze ? 1 : 0
  }

  update(state: EchoformDelayState, bpm: number): void {
    this.target = { ...state }
    this.bpm = clamp(bpm, MIN_BPM, MAX_BPM)
  }

  reset(): void {
    const initialL = this.delaySamples(delaySeconds(this.target, this.bpm, 'L'))
    const initialR = this.delaySamples(delaySeconds(this.target, this.bpm, 'R'))
    this.lineL.reset(initialL)
    this.lineR.reset(initialR)
    this.writeIndex = 0
    this.duckEnvelope = 0
    this.lowCutL.reset(); this.lowCutR.reset()
    this.highCutL.reset(); this.highCutR.reset()
    this.wowDrift.reset(); this.flutterDrift.reset()
    this.dcPrevInL = this.dcPrevOutL = this.dcPrevInR = this.dcPrevOutR = 0
  }

  process(
    inputL: Float32Array,
    inputR: Float32Array,
    outputL: Float32Array,
    outputR: Float32Array
  ): void {
    const character = this.target.character
    // Per-block TPT filter coefficients (unconditionally stable at any cutoff).
    const lowCutG = this.tptG(clamp(this.target.lowCut, 20, 2000))
    const highCutG = this.tptG(clamp(this.target.highCut, 1000, 20000))

    const duckReleaseCoefficient = smoothCoefficient(
      clamp(this.target.duckRelease, 50, 2500) / 1000,
      this.sampleRate
    )
    const lfoRate = clamp(this.target.modRate, 0.05, 8)
    const modDepthSamples = (clamp(this.target.modDepth, 0, MAX_MOD_DEPTH_MS) / 1000) * this.sampleRate
    const targetL = this.delaySamples(delaySeconds(this.target, this.bpm, 'L'))
    const targetR = this.delaySamples(delaySeconds(this.target, this.bpm, 'R'))
    const jumpThreshold = 0.002 * this.sampleRate // ~2 ms counts as a "large" jump.

    for (let i = 0; i < outputL.length; i += 1) {
      const dryL = Number.isFinite(inputL[i]) ? inputL[i]! : 0
      const dryR = Number.isFinite(inputR[i]) ? inputR[i]! : dryL

      // --- Smoothed parameters (per sample, click-free) ---
      this.feedback = smooth(this.feedback, this.feedbackTarget(), this.paramSmoothing)
      this.width = smooth(this.width, clamp(this.target.width, 0, 200) / 100, this.paramSmoothing)
      this.outputGain = smooth(this.outputGain, 10 ** (clamp(this.target.outputDb, -24, 6) / 20), this.paramSmoothing)
      this.duckAmount = smooth(this.duckAmount, clamp(this.target.duckAmount, 0, 100) / 100, this.paramSmoothing)
      this.bypassMix = smooth(this.bypassMix, this.target.bypass ? 1 : 0, this.modeSlew)
      this.pingPongMix = smooth(this.pingPongMix, this.target.pingPong ? 1 : 0, this.modeSlew)
      this.freezeMix = smooth(this.freezeMix, this.target.freeze ? 1 : 0, this.modeSlew)

      // --- Retime read heads by character ---
      if (character === 'digital') {
        this.lineL.retimeHard(targetL, jumpThreshold)
        this.lineR.retimeHard(targetR, jumpThreshold)
      } else {
        const slew = smoothCoefficient(character === 'tape' ? 0.09 : 0.045, this.sampleRate)
        this.lineL.retimeSlew(targetL, slew)
        this.lineR.retimeSlew(targetR, slew)
      }

      // --- Ducking detector (keyed from the dry input, stereo-linked) ---
      const detector = Math.max(Math.abs(dryL), Math.abs(dryR))
      const envCoefficient = detector > this.duckEnvelope ? this.duckAttack : duckReleaseCoefficient
      this.duckEnvelope = smooth(this.duckEnvelope, detector, envCoefficient)

      // --- Modulation (character-scaled), zero when depth is zero ---
      const sinPhase = Math.sin(this.lfoPhase * TWO_PI)
      let modL = sinPhase * modDepthSamples
      let modR = Math.sin((this.lfoPhase + 0.25) * TWO_PI) * modDepthSamples // 90° apart
      if (modDepthSamples > 0) {
        if (character === 'analog') {
          const drift = this.wowDrift.next() * modDepthSamples * 0.12
          modL += drift; modR += drift * 0.8
        } else if (character === 'tape') {
          const wow = this.wowDrift.next() * modDepthSamples * 0.28
          const flutter = Math.sin(this.flutterPhase * TWO_PI) * modDepthSamples * 0.14
          const flutterDrift = this.flutterDrift.next() * modDepthSamples * 0.08
          modL += wow + flutter + flutterDrift
          modR += wow * 0.85 + flutter * 0.7 + flutterDrift
        }
      }

      // --- Read the delayed taps ---
      const delayedL = this.lineL.read(this.writeIndex, modL)
      const delayedR = this.lineR.read(this.writeIndex, modR)

      // --- Feedback-path filters (accumulate across repeats), 2-pole each ---
      // Low-cut is a high-pass; high-cut is a low-pass. Both inside the loop.
      const lpL = this.highCutL.lowPass(this.lowCutL.highPass(delayedL, lowCutG), highCutG)
      const lpR = this.highCutR.lowPass(this.lowCutR.highPass(delayedR, lowCutG), highCutG)

      // --- Character coloration inside the feedback path ---
      const colouredL = this.colour(lpL, character, 'L')
      const colouredR = this.colour(lpR, character, 'R')

      // --- Feedback matrix (normal vs ping-pong), crossfaded on change ---
      const fbSourceL = colouredL * (1 - this.pingPongMix) + colouredR * this.pingPongMix
      const fbSourceR = colouredR * (1 - this.pingPongMix) + colouredL * this.pingPongMix

      // --- Loop gain, with Freeze pushing gain toward unity and gating input ---
      const loopGain = this.feedback * (1 - this.freezeMix) + FREEZE_LOOP_GAIN * this.freezeMix
      const inputGate = 1 - this.freezeMix
      const writeL = feedbackSoftLimit(dryL * inputGate + fbSourceL * loopGain)
      const writeR = feedbackSoftLimit(dryR * inputGate + fbSourceR * loopGain)
      this.lineL.write(this.writeIndex, writeL)
      this.lineR.write(this.writeIndex, writeR)

      // --- Wet output taps are the (coloured) delayed signal ---
      // Stereo width via mid/side AFTER the loop.
      const mid = (colouredL + colouredR) * 0.5
      const sideRaw = (colouredL - colouredR) * 0.5
      const side = sideRaw * this.width
      let wetL = mid + side
      let wetR = mid - side

      // --- Ducking applies to wet only; soft knee so it never snaps on ---
      const duckKey = Math.min(1, this.duckEnvelope * 3.5)
      const duckKnee = duckKey * duckKey * (3 - 2 * duckKey) // smoothstep
      const duckGain = 1 - this.duckAmount * duckKnee
      wetL *= duckGain
      wetR *= duckGain

      // --- Output level (Mix is the FX-return level, applied by the host) ---
      const processedL = wetL * this.outputGain
      const processedR = wetR * this.outputGain

      // --- Tail-preserving bypass: crossfade the audible return to silence.
      // The loop keeps running above, so unbypassing reveals the live tail.
      outputL[i] = flushDenormal(processedL * (1 - this.bypassMix))
      outputR[i] = flushDenormal(processedR * (1 - this.bypassMix))

      // --- Advance ---
      this.writeIndex += 1
      if (this.writeIndex >= this.maxDelaySamples) this.writeIndex = 0
      this.lfoPhase += lfoRate / this.sampleRate
      if (this.lfoPhase >= 1) this.lfoPhase -= 1
      this.flutterPhase += (lfoRate * 9) / this.sampleRate
      if (this.flutterPhase >= 1) this.flutterPhase -= 1
    }
  }

  private feedbackTarget(): number {
    return (clamp(this.target.feedback, 0, 110) / 100) * MAX_FEEDBACK_GAIN
  }

  private delaySamples(seconds: number): number {
    return clamp(seconds * this.sampleRate, 1, this.maxDelaySamples - 2 - MAX_MOD_DEPTH_MS / 1000 * this.sampleRate)
  }

  /** TPT one-pole integrator gain G = g/(1+g), g = tan(π·fc/fs). Always < 1. */
  private tptG(cutoffHz: number): number {
    const g = Math.tan((Math.PI * clamp(cutoffHz, 10, this.sampleRate * 0.49)) / this.sampleRate)
    return g / (1 + g)
  }

  /**
   * Character coloration inside the feedback loop:
   * - Digital: transparent.
   * - Analog: mild soft saturation, gentle rounding.
   * - Tape: stronger soft saturation with slight asymmetry, DC-removed.
   * Apparent loudness is kept roughly matched across modes.
   */
  private colour(sample: number, character: EchoformDelayCharacter, side: 'L' | 'R'): number {
    if (character === 'digital') return sample
    if (character === 'analog') {
      const drive = 1.5
      return Math.tanh(sample * drive) / drive
    }
    // Tape: asymmetric soft saturation, then DC block so asymmetry adds no DC.
    const drive = 2.1
    const biased = sample + 0.02
    const saturated = Math.tanh(biased * drive) / drive
    return this.dcBlock(saturated, side)
  }

  /** One-pole DC blocker per side (for the asymmetric Tape path). */
  private dcBlock(input: number, side: 'L' | 'R'): number {
    if (side === 'L') {
      const out = input - this.dcPrevInL + 0.9975 * this.dcPrevOutL
      this.dcPrevInL = input
      this.dcPrevOutL = flushDenormal(out)
      return this.dcPrevOutL
    }
    const out = input - this.dcPrevInR + 0.9975 * this.dcPrevOutR
    this.dcPrevInR = input
    this.dcPrevOutR = flushDenormal(out)
    return this.dcPrevOutR
  }
}

export function echoformDelayDivisionBeats(division: EchoformDelayDivision): number {
  return DIVISION_BEATS[division]
}

export function echoformDelaySeconds(
  mode: EchoformDelayMode,
  division: EchoformDelayDivision,
  timeMs: number,
  bpm: number
): number {
  return mode === 'free'
    ? clamp(timeMs, MIN_FREE_MS, MAX_FREE_MS) / 1000
    : divisionSeconds(division, bpm)
}

export function isEchoformDelayDivision(value: unknown): value is EchoformDelayDivision {
  return typeof value === 'string' && (ECHOFORM_DELAY_DIVISIONS as readonly string[]).includes(value)
}
