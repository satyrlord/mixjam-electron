import {
  type AetherformReverbState,
  type AetherformShimmerInterval,
  type AetherformSpaceModel
} from './aetherform-reverb-types'
import {
  clamp,
  DriftGenerator,
  driveInput,
  feedbackSoftLimit,
  flushDenormal,
  OnePoleTPT,
  readCubic,
  smooth,
  smoothCoefficient,
  tptG,
  TwoPoleFilter
} from './return-dsp-primitives'

const TWO_PI = Math.PI * 2

/** Late feedback network size. Eight mutually decorrelated delay lines. */
const LINE_COUNT = 8
/** Longest late line (Hall, size 100%) plus modulation and retime margin. */
const MAX_LINE_SECONDS = 0.135
/** Pre-delay reach (0–250 ms) plus interpolation margin. */
const MAX_PRE_DELAY_SECONDS = 0.26
/** Early-reflection buffer reach (Hall span × jitter margin). */
const MAX_EARLY_SECONDS = 0.16
/** Shimmer granular history (largest grain span plus margin). */
const SHIMMER_BUFFER_SECONDS = 0.25
/** Peak delay modulation at 100% depth before per-character scaling. */
const MAX_MOD_DEPTH_MS = 4
/** Loop gain approached while Freeze/Hold is engaged. */
const FREEZE_LOOP_GAIN = 0.9995
/** Read-head crossfade for click-free retimes (size, model, pre-delay). */
const RETIME_CROSSFADE_MS = 30
/** Early tap-set crossfade when model or size retargets the pattern. */
const TAP_CROSSFADE_MS = 45
/** Shimmer enable/disable and interval crossfade. */
const SHIMMER_CROSSFADE_MS = 120
/** Clear Tail output fade surrounding the buffer wipe. */
const CLEAR_FADE_MS = 12
/** Maximum linear send of the pitch-shifted branch back into the network. */
const MAX_SHIMMER_SEND = 0.55
/** Full ducking reaches about -24 dB of wet attenuation. */
const DUCK_RANGE_DB = 24

/**
 * Late delay-line base lengths in milliseconds at Size 100%, per space model.
 * Prime-valued so no two lines share obvious resonances. Room is compact,
 * Chamber medium and rounded, Hall long and wide, Plate short and dense.
 */
const MODEL_LINE_MS: Record<AetherformSpaceModel, readonly number[]> = {
  room: [17, 23, 29, 37, 41, 47, 53, 61],
  chamber: [29, 37, 43, 53, 61, 71, 79, 89],
  hall: [43, 53, 67, 79, 89, 101, 113, 127],
  plate: [11, 17, 23, 31, 37, 41, 47, 53]
}

/** Fixed in-loop diffusion all-pass lengths (ms), decorrelated across lines. */
const LOOP_ALLPASS_MS = [7.1, 9.7, 8.3, 11.3, 6.7, 10.9, 7.9, 12.7] as const

/** Input diffusion all-pass lengths (ms) per stereo side. */
const INPUT_ALLPASS_MS_L = [5.3, 7.9, 11.3, 15.1] as const
const INPUT_ALLPASS_MS_R = [5.9, 8.3, 10.7, 14.7] as const

/** Bloom smears late injection through two long all-passes per side. */
const BLOOM_ALLPASS_MS_L = [41.3, 67.9] as const
const BLOOM_ALLPASS_MS_R = [43.7, 63.1] as const

/** Output sign patterns; different orthogonal-ish rows decorrelate L and R. */
const OUT_SIGN_L = [1, -1, 1, -1, 1, -1, 1, -1] as const
const OUT_SIGN_R = [1, 1, -1, -1, 1, 1, -1, -1] as const

interface EarlyModelSpec {
  count: number
  spanSeconds: number
  /** Exponent shaping tap spacing: <1 front-loads, >1 spreads late. */
  shape: number
  /** Gain decay steepness across the span. */
  decay: number
  /** Stereo pan swing 0..1. */
  panSwing: number
  /** Constant pan offset breaking symmetry (Plate). */
  asymmetry: number
}

const EARLY_MODEL: Record<AetherformSpaceModel, EarlyModelSpec> = {
  room: { count: 12, spanSeconds: 0.045, shape: 0.85, decay: 4.5, panSwing: 0.7, asymmetry: 0 },
  chamber: { count: 12, spanSeconds: 0.065, shape: 1.0, decay: 3.5, panSwing: 0.6, asymmetry: 0 },
  hall: { count: 10, spanSeconds: 0.11, shape: 1.55, decay: 2.6, panSwing: 0.9, asymmetry: 0 },
  plate: { count: 14, spanSeconds: 0.038, shape: 0.95, decay: 2.0, panSwing: 0.5, asymmetry: 0.35 }
}

const MAX_EARLY_TAPS = 14

/** Deterministic hash noise in [0, 1); stable per (index, salt), no RNG. */
function pseudoRandom(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

/** Feedback gain targeting -60 dB after `decaySeconds` for one circulation. */
export function aetherformRt60Gain(delaySeconds: number, decaySeconds: number): number {
  return 10 ** ((-3 * delaySeconds) / Math.max(1e-3, decaySeconds))
}

/** Pitch ratio for a shimmer interval: 2^(semitones/12). */
export function aetherformShimmerRatio(semitones: AetherformShimmerInterval): number {
  return 2 ** (semitones / 12)
}

/**
 * Nonlinear Size map. 5–100% spans roughly 0.28×–1× of the model's base
 * lengths, so small values stay usable and no line collapses into audible
 * pitched ringing (a 5 ms floor is enforced at retime time as well).
 */
export function aetherformSizeFactor(sizePercent: number): number {
  const normalized = clamp(sizePercent, 5, 100) / 100
  return 0.22 + 0.78 * normalized ** 0.85
}

/** Nonlinear modulation depth map: subtle through the first half. */
export function aetherformModDepthMs(depthPercent: number): number {
  const normalized = clamp(depthPercent, 0, 100) / 100
  return normalized * normalized * MAX_MOD_DEPTH_MS
}

/** Nonlinear shimmer send map: low values stay subtle. */
export function aetherformShimmerSend(amountPercent: number): number {
  const normalized = clamp(amountPercent, 0, 100) / 100
  return normalized ** 1.6 * MAX_SHIMMER_SEND
}

/** Current late line length in seconds (before the runtime 5 ms floor). */
export function aetherformLineSeconds(
  model: AetherformSpaceModel,
  sizePercent: number,
  lineIndex: number
): number {
  const base = MODEL_LINE_MS[model][lineIndex % LINE_COUNT]! / 1000
  return Math.max(0.005, base * aetherformSizeFactor(sizePercent))
}

/** Linear interpolation read for static early taps (cheaper than cubic). */
function readLinear(
  buffer: Float32Array<ArrayBuffer>,
  writeIndex: number,
  delaySamples: number
): number {
  const length = buffer.length
  const readPosition = writeIndex - delaySamples
  const base = Math.floor(readPosition)
  const fraction = readPosition - base
  const i0 = (base % length + length) % length
  const i1 = (i0 + 1) % length
  return buffer[i0]! + (buffer[i1]! - buffer[i0]!) * fraction
}

/**
 * Circular delay line with dual read heads. Retimes crossfade from the old
 * head to a new head placed at the target, so Size, model, and Pre-delay
 * changes never pitch-glide or click. Owns its own write index.
 */
class XfadeDelayLine {
  private readonly buffer: Float32Array<ArrayBuffer>
  private readonly length: number
  private index = 0
  private headATime: number
  private headBTime: number
  private crossfade = 1
  private readonly crossfadeStep: number

  constructor(maxSamples: number, initialDelaySamples: number, crossfadeSamples: number) {
    this.length = maxSamples
    this.buffer = new Float32Array(new ArrayBuffer(maxSamples * Float32Array.BYTES_PER_ELEMENT))
    this.headATime = initialDelaySamples
    this.headBTime = initialDelaySamples
    this.crossfadeStep = 1 / Math.max(1, crossfadeSamples)
  }

  clear(): void {
    this.buffer.fill(0)
  }

  reset(delaySamples: number): void {
    this.buffer.fill(0)
    this.index = 0
    this.headATime = delaySamples
    this.headBTime = delaySamples
    this.crossfade = 1
  }

  /** Current live head delay in samples (the retime target once settled). */
  currentDelaySamples(): number {
    return this.headATime
  }

  /** Begin a head crossfade when the target moved past the threshold. */
  retime(targetSamples: number, jumpThreshold: number): void {
    if (this.crossfade < 1) return
    if (Math.abs(targetSamples - this.headATime) > jumpThreshold) {
      this.headBTime = this.headATime
      this.headATime = targetSamples
      this.crossfade = 0
    } else {
      this.headATime = targetSamples
    }
  }

  /** Read the (possibly crossfaded) delayed sample; advances the crossfade. */
  read(extraSamples: number): number {
    const readA = readCubic(this.buffer, this.index, clamp(this.headATime + extraSamples, 1, this.length - 2))
    if (this.crossfade >= 1) return readA
    const readB = readCubic(this.buffer, this.index, clamp(this.headBTime + extraSamples, 1, this.length - 2))
    const out = readB + (readA - readB) * this.crossfade
    this.crossfade = Math.min(1, this.crossfade + this.crossfadeStep)
    return out
  }

  /** Read a secondary static tap at a fraction of the live head time. */
  readFraction(fraction: number): number {
    return readCubic(this.buffer, this.index, clamp(this.headATime * fraction, 1, this.length - 2))
  }

  writeAndAdvance(value: number): void {
    this.buffer[this.index] = flushDenormal(value)
    this.index += 1
    if (this.index >= this.length) this.index = 0
  }
}

/** Plain circular buffer for multi-tap early reads and shimmer history. */
class CircularBuffer {
  readonly buffer: Float32Array<ArrayBuffer>
  index = 0

  constructor(maxSamples: number) {
    this.buffer = new Float32Array(new ArrayBuffer(maxSamples * Float32Array.BYTES_PER_ELEMENT))
  }

  clear(): void {
    this.buffer.fill(0)
  }

  reset(): void {
    this.buffer.fill(0)
    this.index = 0
  }

  writeAndAdvance(value: number): void {
    this.buffer[this.index] = flushDenormal(value)
    this.index += 1
    if (this.index >= this.buffer.length) this.index = 0
  }
}

/** Schroeder all-pass with a fixed integer delay; coefficient per call. */
class Allpass {
  private readonly buffer: Float32Array<ArrayBuffer>
  private index = 0

  constructor(delaySamples: number) {
    const length = Math.max(2, Math.round(delaySamples))
    this.buffer = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
  }

  clear(): void {
    this.buffer.fill(0)
  }

  reset(): void {
    this.buffer.fill(0)
    this.index = 0
  }

  process(input: number, coefficient: number): number {
    const delayed = this.buffer[this.index]!
    const output = delayed - coefficient * input
    this.buffer[this.index] = flushDenormal(input + coefficient * output)
    this.index += 1
    if (this.index >= this.buffer.length) this.index = 0
    return output
  }
}

/**
 * One granular pitch-shifter voice: a sawtooth delay sweep with two read
 * heads half a cycle apart, each windowed by sin(π·phase) so the pair sums
 * at equal power. Duration-preserving (no playback-rate resampling): the
 * heads sweep the shared history at the target ratio and recycle.
 */
class ShimmerVoice {
  ratio = 2
  spanSamples: number
  phase: number

  constructor(spanSamples: number, initialPhase: number) {
    this.spanSamples = spanSamples
    this.phase = initialPhase % 1
  }

  copyFrom(other: ShimmerVoice): void {
    this.ratio = other.ratio
    this.spanSamples = other.spanSamples
    this.phase = other.phase
  }

  next(history: CircularBuffer, sampleRate: number): number {
    // d'(t) = 1 - ratio, so the phase (delay/span) falls at (ratio-1)/span.
    this.phase -= (this.ratio - 1) / this.spanSamples
    if (this.phase < 0) this.phase += 1
    if (this.phase >= 1) this.phase -= 1
    const phaseB = this.phase + 0.5 >= 1 ? this.phase - 0.5 : this.phase + 0.5
    const ampA = Math.sin(Math.PI * this.phase)
    const ampB = Math.sin(Math.PI * phaseB)
    const margin = 2 + sampleRate * 0.001
    const headA = readCubic(history.buffer, history.index, clamp(margin + this.phase * this.spanSamples, 2, history.buffer.length - 2))
    const headB = readCubic(history.buffer, history.index, clamp(margin + phaseB * this.spanSamples, 2, history.buffer.length - 2))
    return headA * ampA + headB * ampB
  }
}

interface EarlyTapSet {
  count: number
  times: Float32Array
  gainL: Float32Array
  gainR: Float32Array
}

function makeTapSet(): EarlyTapSet {
  return {
    count: 0,
    times: new Float32Array(MAX_EARLY_TAPS),
    gainL: new Float32Array(MAX_EARLY_TAPS),
    gainR: new Float32Array(MAX_EARLY_TAPS)
  }
}

/**
 * Allocation-free stereo Aetherform Reverb processor.
 *
 * Topology: stereo pre-delay → model-specific multi-tap early reflections
 * (toned once on output) in parallel with input diffusion → eight-line
 * Householder FDN with in-loop tone damping, character processing, in-loop
 * diffusion, modulated fractional reads, and a pitch-shifted shimmer feedback
 * branch → equal-power early/late blend → mid/side width → wet-only ducking →
 * output trim. Mix is the host FX-return level; the core renders 100% wet.
 *
 * The worklet owns one instance. All storage is created by the constructor;
 * process() performs no allocation, locking, logging, or unbounded work.
 */
export class AetherformReverbCore {
  private readonly sampleRate: number
  private readonly lineMaxSamples: number

  private target: AetherformReverbState

  // Pre-delay.
  private readonly preDelayL: XfadeDelayLine
  private readonly preDelayR: XfadeDelayLine

  // Early reflections.
  private readonly earlyBufferL: CircularBuffer
  private readonly earlyBufferR: CircularBuffer
  private readonly tapSetA = makeTapSet()
  private readonly tapSetB = makeTapSet()
  private tapCrossfade = 1
  private readonly tapCrossfadeStep: number
  private tapModel: AetherformSpaceModel
  private tapSizeFactor: number
  private readonly earlyLowCutL = new TwoPoleFilter()
  private readonly earlyLowCutR = new TwoPoleFilter()
  private readonly earlyHighCutL = new TwoPoleFilter()
  private readonly earlyHighCutR = new TwoPoleFilter()

  // Input diffusion.
  private readonly inputAllpassL: Allpass[]
  private readonly inputAllpassR: Allpass[]
  private readonly bloomAllpassL: Allpass[]
  private readonly bloomAllpassR: Allpass[]

  // Late network.
  private readonly lines: XfadeDelayLine[]
  private readonly loopAllpass: Allpass[]
  private readonly loopLowCut: TwoPoleFilter[]
  private readonly loopHighCut: TwoPoleFilter[]
  private readonly vintageDamp: OnePoleTPT[]
  private readonly lineGains = new Float64Array(LINE_COUNT)
  private readonly lineTargetSamples = new Float64Array(LINE_COUNT)
  private readonly lineOuts = new Float64Array(LINE_COUNT)
  private readonly lfoOffsets: readonly number[]

  // Shimmer.
  private readonly shimmerHistoryL: CircularBuffer
  private readonly shimmerHistoryR: CircularBuffer
  private readonly shimmerVoiceAL: ShimmerVoice
  private readonly shimmerVoiceBL: ShimmerVoice
  private readonly shimmerVoiceAR: ShimmerVoice
  private readonly shimmerVoiceBR: ShimmerVoice
  private shimmerVoiceCrossfade = 1
  private readonly shimmerVoiceCrossfadeStep: number
  private shimmerIntervalCurrent: AetherformShimmerInterval
  private readonly shimmerAaL = new TwoPoleFilter()
  private readonly shimmerAaR = new TwoPoleFilter()
  private prevLateL = 0
  private prevLateR = 0
  private prevShimmerL = 0
  private prevShimmerR = 0

  // Smoothing coefficients.
  private readonly paramSmoothing: number
  private readonly modeSlew: number
  private readonly duckAttack: number
  private readonly clearFade: number

  // Smoothed continuous scalars.
  private width: number
  private outputGain: number
  private duckAmount: number
  private driveNorm: number
  private lateBalance: number
  private diffusionNorm: number
  private densityNorm: number
  private earlyMix: number
  private shimmerMix: number
  private shimmerSend: number
  private modDepthSamples: number
  private bypassMix: number
  private freezeMix: number
  private vintageWeight: number
  private bloomWeight: number
  private plateWeight: number
  private decaySmoothed: number
  private clearGain = 1
  private clearPending = false
  private clearArming = false

  // Detector / modulation state.
  private duckEnvelope = 0
  private lfoPhase = 0
  private readonly wanderDrift: DriftGenerator

  constructor(sampleRate: number, state: AetherformReverbState) {
    this.sampleRate = Math.max(1, sampleRate)
    this.target = { ...state }

    const retimeSamples = Math.max(1, Math.round((RETIME_CROSSFADE_MS / 1000) * this.sampleRate))
    this.tapCrossfadeStep = 1 / Math.max(1, Math.round((TAP_CROSSFADE_MS / 1000) * this.sampleRate))
    this.shimmerVoiceCrossfadeStep = 1 / Math.max(1, Math.round((SHIMMER_CROSSFADE_MS / 1000) * this.sampleRate))
    this.paramSmoothing = smoothCoefficient(0.02, this.sampleRate)
    this.modeSlew = smoothCoefficient(0.05, this.sampleRate)
    this.duckAttack = smoothCoefficient(0.007, this.sampleRate)
    this.clearFade = smoothCoefficient(CLEAR_FADE_MS / 1000, this.sampleRate)

    const preDelaySamples = this.preDelayTargetSamples()
    const preDelayMax = Math.ceil(MAX_PRE_DELAY_SECONDS * this.sampleRate) + 8
    this.preDelayL = new XfadeDelayLine(preDelayMax, preDelaySamples, retimeSamples)
    this.preDelayR = new XfadeDelayLine(preDelayMax, preDelaySamples, retimeSamples)

    const earlyMax = Math.ceil(MAX_EARLY_SECONDS * this.sampleRate) + 8
    this.earlyBufferL = new CircularBuffer(earlyMax)
    this.earlyBufferR = new CircularBuffer(earlyMax)
    this.tapModel = state.spaceModel
    this.tapSizeFactor = aetherformSizeFactor(state.sizePercent)
    this.buildTapSet(this.tapSetA, this.tapModel, this.tapSizeFactor)
    this.buildTapSet(this.tapSetB, this.tapModel, this.tapSizeFactor)

    this.inputAllpassL = INPUT_ALLPASS_MS_L.map((ms) => new Allpass((ms / 1000) * this.sampleRate))
    this.inputAllpassR = INPUT_ALLPASS_MS_R.map((ms) => new Allpass((ms / 1000) * this.sampleRate))
    this.bloomAllpassL = BLOOM_ALLPASS_MS_L.map((ms) => new Allpass((ms / 1000) * this.sampleRate))
    this.bloomAllpassR = BLOOM_ALLPASS_MS_R.map((ms) => new Allpass((ms / 1000) * this.sampleRate))

    const lineMax = Math.ceil(MAX_LINE_SECONDS * this.sampleRate) + 8
    this.lineMaxSamples = lineMax
    this.lines = []
    this.loopAllpass = []
    this.loopLowCut = []
    this.loopHighCut = []
    this.vintageDamp = []
    const offsets: number[] = []
    for (let i = 0; i < LINE_COUNT; i += 1) {
      const seconds = aetherformLineSeconds(state.spaceModel, state.sizePercent, i)
      const samples = clamp(seconds * this.sampleRate, 8, lineMax - 4)
      this.lineTargetSamples[i] = samples
      this.lines.push(new XfadeDelayLine(lineMax, samples, retimeSamples))
      this.loopAllpass.push(new Allpass((LOOP_ALLPASS_MS[i]! / 1000) * this.sampleRate))
      this.loopLowCut.push(new TwoPoleFilter())
      this.loopHighCut.push(new TwoPoleFilter())
      this.vintageDamp.push(new OnePoleTPT())
      offsets.push(i / LINE_COUNT + 0.0137 * (i + 1))
    }
    this.lfoOffsets = offsets

    const shimmerMax = Math.ceil(SHIMMER_BUFFER_SECONDS * this.sampleRate) + 8
    this.shimmerHistoryL = new CircularBuffer(shimmerMax)
    this.shimmerHistoryR = new CircularBuffer(shimmerMax)
    this.shimmerIntervalCurrent = state.shimmerIntervalSemitones
    const span = this.shimmerSpanSamples(state.shimmerIntervalSemitones)
    const ratio = aetherformShimmerRatio(state.shimmerIntervalSemitones)
    this.shimmerVoiceAL = new ShimmerVoice(span, 0.0)
    this.shimmerVoiceBL = new ShimmerVoice(span, 0.0)
    this.shimmerVoiceAR = new ShimmerVoice(span, 0.25)
    this.shimmerVoiceBR = new ShimmerVoice(span, 0.25)
    this.shimmerVoiceAL.ratio = ratio
    this.shimmerVoiceAR.ratio = ratio

    this.wanderDrift = new DriftGenerator(0.7, this.sampleRate, 0.311)

    // Seed smoothed scalars at their targets so construction starts settled.
    this.width = clamp(state.widthPercent, 0, 200) / 100
    this.outputGain = 10 ** (clamp(state.outputDb, -24, 12) / 20)
    this.duckAmount = clamp(state.duckAmountPercent, 0, 100) / 100
    this.driveNorm = clamp(state.drivePercent, 0, 100) / 100
    this.lateBalance = clamp(state.lateBalancePercent, 0, 100) / 100
    this.diffusionNorm = clamp(state.diffusionPercent, 0, 100) / 100
    this.densityNorm = clamp(state.densityPercent, 0, 100) / 100
    this.earlyMix = state.earlyReflectionsEnabled ? 1 : 0
    this.shimmerMix = state.shimmerEnabled ? 1 : 0
    this.shimmerSend = aetherformShimmerSend(state.shimmerAmountPercent)
    this.modDepthSamples = (aetherformModDepthMs(state.modDepthPercent) / 1000) * this.sampleRate
    this.bypassMix = state.bypass ? 1 : 0
    this.freezeMix = state.freeze ? 1 : 0
    this.vintageWeight = state.character === 'vintage' ? 1 : 0
    this.bloomWeight = state.character === 'bloom' ? 1 : 0
    this.plateWeight = state.spaceModel === 'plate' ? 1 : 0
    this.decaySmoothed = clamp(state.decaySeconds, 0.2, 30)
  }

  update(state: AetherformReverbState): void {
    this.target = { ...state }
  }

  /** Momentary Clear Tail command: fade out, wipe all history, fade back. */
  clearTail(): void {
    this.clearArming = true
  }

  reset(): void {
    this.preDelayL.reset(this.preDelayTargetSamples())
    this.preDelayR.reset(this.preDelayTargetSamples())
    this.earlyBufferL.reset()
    this.earlyBufferR.reset()
    this.earlyLowCutL.reset(); this.earlyLowCutR.reset()
    this.earlyHighCutL.reset(); this.earlyHighCutR.reset()
    for (const stage of this.inputAllpassL) stage.reset()
    for (const stage of this.inputAllpassR) stage.reset()
    for (const stage of this.bloomAllpassL) stage.reset()
    for (const stage of this.bloomAllpassR) stage.reset()
    for (let i = 0; i < LINE_COUNT; i += 1) {
      const seconds = aetherformLineSeconds(this.target.spaceModel, this.target.sizePercent, i)
      this.lines[i]!.reset(clamp(seconds * this.sampleRate, 8, this.lineMaxSamples - 4))
      this.loopAllpass[i]!.reset()
      this.loopLowCut[i]!.reset()
      this.loopHighCut[i]!.reset()
      this.vintageDamp[i]!.reset()
    }
    this.shimmerHistoryL.reset()
    this.shimmerHistoryR.reset()
    this.shimmerAaL.reset()
    this.shimmerAaR.reset()
    this.prevLateL = this.prevLateR = 0
    this.prevShimmerL = this.prevShimmerR = 0
    this.duckEnvelope = 0
    this.lfoPhase = 0
    this.wanderDrift.reset()
    this.clearGain = 1
    this.clearPending = false
    this.clearArming = false
  }

  process(
    inputL: Float32Array,
    inputR: Float32Array,
    outputL: Float32Array,
    outputR: Float32Array
  ): void {
    const state = this.target

    // ---- Per-block targets and coefficients ----
    const lowCutG = tptG(clamp(state.lowCutHz, 20, 2000), this.sampleRate)
    const highCutG = tptG(clamp(state.highCutHz, 1000, 20000), this.sampleRate)
    const vintageDampG = tptG(Math.min(clamp(state.highCutHz, 1000, 20000), 9000) * 0.55, this.sampleRate)
    const duckReleaseCoefficient = smoothCoefficient(clamp(state.duckReleaseMs, 50, 2500) / 1000, this.sampleRate)
    const decayTarget = clamp(state.decaySeconds, 0.2, 30)
    const sizeFactor = aetherformSizeFactor(state.sizePercent)
    const modRate = clamp(state.modRateHz, 0.05, 3)
    const modDepthTarget = (aetherformModDepthMs(state.modDepthPercent) / 1000) * this.sampleRate
    const widthTarget = clamp(state.widthPercent, 0, 200) / 100
    const outputTarget = 10 ** (clamp(state.outputDb, -24, 12) / 20)
    const duckTarget = clamp(state.duckAmountPercent, 0, 100) / 100
    const driveTarget = clamp(state.drivePercent, 0, 100) / 100
    const lateBalanceTarget = clamp(state.lateBalancePercent, 0, 100) / 100
    const diffusionTarget = clamp(state.diffusionPercent, 0, 100) / 100
    const densityTarget = clamp(state.densityPercent, 0, 100) / 100
    const shimmerSendTarget = aetherformShimmerSend(state.shimmerAmountPercent)
    // Shimmer keeps circulating during bypass: bypass only mutes the audible
    // return, so unbypassing must reveal the tail that kept evolving.
    const shimmerActive = state.shimmerEnabled

    // Pre-delay retime (always head-crossfaded: no tape-style glides).
    const preDelayTarget = this.preDelayTargetSamples()
    const preJump = 0.0005 * this.sampleRate
    this.preDelayL.retime(preDelayTarget, preJump)
    this.preDelayR.retime(preDelayTarget, preJump)

    // Late line retimes for the current model and size.
    const lineJump = 0.001 * this.sampleRate
    for (let i = 0; i < LINE_COUNT; i += 1) {
      const seconds = aetherformLineSeconds(state.spaceModel, state.sizePercent, i)
      const samples = clamp(seconds * this.sampleRate, 8, this.lineMaxSamples - 4)
      this.lineTargetSamples[i] = samples
      this.lines[i]!.retime(samples, lineJump)
    }

    // Early tap retarget: crossfade to a rebuilt set on model/size movement.
    if (this.tapCrossfade >= 1 &&
      (this.tapModel !== state.spaceModel || Math.abs(this.tapSizeFactor - sizeFactor) > 0.015)) {
      const retiring = this.tapSetB
      const live = this.tapSetA
      retiring.count = live.count
      retiring.times.set(live.times)
      retiring.gainL.set(live.gainL)
      retiring.gainR.set(live.gainR)
      this.tapModel = state.spaceModel
      this.tapSizeFactor = sizeFactor
      this.buildTapSet(live, this.tapModel, this.tapSizeFactor)
      this.tapCrossfade = 0
    }

    // Shimmer interval change: crossfade a fresh voice pair in.
    if (this.shimmerVoiceCrossfade >= 1 && this.shimmerIntervalCurrent !== state.shimmerIntervalSemitones) {
      this.shimmerVoiceBL.copyFrom(this.shimmerVoiceAL)
      this.shimmerVoiceBR.copyFrom(this.shimmerVoiceAR)
      const ratio = aetherformShimmerRatio(state.shimmerIntervalSemitones)
      const span = this.shimmerSpanSamples(state.shimmerIntervalSemitones)
      this.shimmerVoiceAL.ratio = ratio
      this.shimmerVoiceAL.spanSamples = span
      this.shimmerVoiceAR.ratio = ratio
      this.shimmerVoiceAR.spanSamples = span
      this.shimmerIntervalCurrent = state.shimmerIntervalSemitones
      this.shimmerVoiceCrossfade = 0
    }

    // Anti-alias ceiling for upward shifting, also honoring High-cut.
    const shimmerRatio = aetherformShimmerRatio(this.shimmerIntervalCurrent)
    const aaCutoff = Math.min(0.45 * this.sampleRate / shimmerRatio, clamp(state.highCutHz, 1000, 20000))
    const shimmerAaG = tptG(aaCutoff, this.sampleRate)

    // Character weights (equal-power-ish scalar blend, smoothed per sample).
    const vintageTarget = state.character === 'vintage' ? 1 : 0
    const bloomTarget = state.character === 'bloom' ? 1 : 0
    const plateTarget = state.spaceModel === 'plate' ? 1 : 0

    // Arm the Clear Tail fade at a block boundary.
    if (this.clearArming) {
      this.clearArming = false
      this.clearPending = true
    }

    for (let i = 0; i < outputL.length; i += 1) {
      const dryL = Number.isFinite(inputL[i]!) ? inputL[i]! : 0
      const dryR = Number.isFinite(inputR[i]!) ? inputR[i]! : dryL

      // ---- Smoothed parameters (per sample, click-free) ----
      this.width = smooth(this.width, widthTarget, this.paramSmoothing)
      this.outputGain = smooth(this.outputGain, outputTarget, this.paramSmoothing)
      this.duckAmount = smooth(this.duckAmount, duckTarget, this.paramSmoothing)
      this.driveNorm = smooth(this.driveNorm, driveTarget, this.paramSmoothing)
      this.lateBalance = smooth(this.lateBalance, lateBalanceTarget, this.paramSmoothing)
      this.diffusionNorm = smooth(this.diffusionNorm, diffusionTarget, this.paramSmoothing)
      this.densityNorm = smooth(this.densityNorm, densityTarget, this.paramSmoothing)
      this.shimmerSend = smooth(this.shimmerSend, shimmerSendTarget, this.paramSmoothing)
      this.modDepthSamples = smooth(this.modDepthSamples, modDepthTarget, this.paramSmoothing)
      this.decaySmoothed = smooth(this.decaySmoothed, decayTarget, this.paramSmoothing)
      this.earlyMix = smooth(this.earlyMix, state.earlyReflectionsEnabled ? 1 : 0, this.modeSlew)
      this.shimmerMix = smooth(this.shimmerMix, shimmerActive ? 1 : 0, this.modeSlew)
      this.bypassMix = smooth(this.bypassMix, state.bypass ? 1 : 0, this.modeSlew)
      this.freezeMix = smooth(this.freezeMix, state.freeze ? 1 : 0, this.modeSlew)
      this.vintageWeight = smooth(this.vintageWeight, vintageTarget, this.modeSlew)
      this.bloomWeight = smooth(this.bloomWeight, bloomTarget, this.modeSlew)
      this.plateWeight = smooth(this.plateWeight, plateTarget, this.modeSlew)

      // ---- Clear Tail: fade out, wipe once silent, fade back in ----
      if (this.clearPending) {
        this.clearGain = smooth(this.clearGain, 0, this.clearFade)
        if (this.clearGain < 1e-3) {
          this.wipeHistory()
          this.clearPending = false
        }
      } else if (this.clearGain < 1) {
        this.clearGain = smooth(this.clearGain, 1, this.clearFade)
        if (this.clearGain > 0.9999) this.clearGain = 1
      }

      // ---- Ducking detector (keyed from the UN-driven input) ----
      // Read before Drive so ducking follows the natural transient.
      const detector = Math.max(Math.abs(dryL), Math.abs(dryR))
      const envCoefficient = detector > this.duckEnvelope ? this.duckAttack : duckReleaseCoefficient
      this.duckEnvelope = smooth(this.duckEnvelope, detector, envCoefficient)

      // ---- Input Drive ("Smash"): gain-compensated soft saturation on the
      // signal entering the reverb, before pre-delay/early/late. Distinct from
      // the in-loop Character shaping. Exact bypass at drivePercent = 0.
      const drivenL = driveInput(dryL, this.driveNorm)
      const drivenR = driveInput(dryR, this.driveNorm)

      // ---- Pre-delay (before both early and late paths) ----
      const preL = this.preDelayL.read(0)
      const preR = this.preDelayR.read(0)
      this.preDelayL.writeAndAdvance(drivenL)
      this.preDelayR.writeAndAdvance(drivenR)

      const inputGate = 1 - this.freezeMix

      // ---- Early reflections: multi-tap, tap-set crossfaded ----
      this.earlyBufferL.writeAndAdvance(preL)
      this.earlyBufferR.writeAndAdvance(preR)
      let earlyL = 0
      let earlyR = 0
      if (this.earlyMix > 1e-4) {
        const live = this.tapSetA
        for (let t = 0; t < live.count; t += 1) {
          const tapL = readLinear(this.earlyBufferL.buffer, this.earlyBufferL.index, live.times[t]!)
          const tapR = readLinear(this.earlyBufferR.buffer, this.earlyBufferR.index, live.times[t]!)
          earlyL += tapL * live.gainL[t]! + tapR * (live.gainR[t]! * 0.12)
          earlyR += tapR * live.gainR[t]! + tapL * (live.gainL[t]! * 0.12)
        }
        if (this.tapCrossfade < 1) {
          const retiring = this.tapSetB
          let oldL = 0
          let oldR = 0
          for (let t = 0; t < retiring.count; t += 1) {
            const tapL = readLinear(this.earlyBufferL.buffer, this.earlyBufferL.index, retiring.times[t]!)
            const tapR = readLinear(this.earlyBufferR.buffer, this.earlyBufferR.index, retiring.times[t]!)
            oldL += tapL * retiring.gainL[t]! + tapR * (retiring.gainR[t]! * 0.12)
            oldR += tapR * retiring.gainR[t]! + tapL * (retiring.gainL[t]! * 0.12)
          }
          earlyL = oldL + (earlyL - oldL) * this.tapCrossfade
          earlyR = oldR + (earlyR - oldR) * this.tapCrossfade
          this.tapCrossfade = Math.min(1, this.tapCrossfade + this.tapCrossfadeStep)
        }
        // Tone applied once so the early sound matches the late-tail color.
        earlyL = this.earlyHighCutL.lowPass(this.earlyLowCutL.highPass(earlyL, lowCutG), highCutG)
        earlyR = this.earlyHighCutR.lowPass(this.earlyLowCutR.highPass(earlyR, lowCutG), highCutG)
        earlyL *= this.earlyMix * inputGate
        earlyR *= this.earlyMix * inputGate
      }

      // ---- Input diffusion into the late network ----
      const diffusionCoefficient = clamp(0.25 + this.diffusionNorm * 0.5 + this.plateWeight * 0.08, 0, 0.78)
      let diffL = preL
      let diffR = preR
      for (let s = 0; s < this.inputAllpassL.length; s += 1) {
        diffL = this.inputAllpassL[s]!.process(diffL, diffusionCoefficient)
        diffR = this.inputAllpassR[s]!.process(diffR, diffusionCoefficient)
      }
      // Bloom: smear the injection through two long all-passes so the late
      // field opens gradually instead of appearing at full density at once.
      if (this.bloomWeight > 1e-4) {
        let bloomL = diffL
        let bloomR = diffR
        const bloomCoefficient = 0.55
        for (let s = 0; s < this.bloomAllpassL.length; s += 1) {
          bloomL = this.bloomAllpassL[s]!.process(bloomL, bloomCoefficient)
          bloomR = this.bloomAllpassR[s]!.process(bloomR, bloomCoefficient)
        }
        diffL = diffL + (bloomL - diffL) * this.bloomWeight
        diffR = diffR + (bloomR - diffR) * this.bloomWeight
      }

      // ---- Shimmer branch (fed from the previous sample's late output) ----
      let shimmerL = 0
      let shimmerR = 0
      const shimmerRunning = this.shimmerMix > 1e-4
      if (shimmerRunning) {
        // Band-limit before shifting so +19/+24 stay below Nyquist.
        this.shimmerHistoryL.writeAndAdvance(this.shimmerAaL.lowPass(this.prevLateL, shimmerAaG))
        this.shimmerHistoryR.writeAndAdvance(this.shimmerAaR.lowPass(this.prevLateR, shimmerAaG))
        shimmerL = this.shimmerVoiceAL.next(this.shimmerHistoryL, this.sampleRate)
        shimmerR = this.shimmerVoiceAR.next(this.shimmerHistoryR, this.sampleRate)
        if (this.shimmerVoiceCrossfade < 1) {
          const oldL = this.shimmerVoiceBL.next(this.shimmerHistoryL, this.sampleRate)
          const oldR = this.shimmerVoiceBR.next(this.shimmerHistoryR, this.sampleRate)
          shimmerL = oldL + (shimmerL - oldL) * this.shimmerVoiceCrossfade
          shimmerR = oldR + (shimmerR - oldR) * this.shimmerVoiceCrossfade
          this.shimmerVoiceCrossfade = Math.min(1, this.shimmerVoiceCrossfade + this.shimmerVoiceCrossfadeStep)
        }
        const send = this.shimmerSend * this.shimmerMix
        shimmerL *= send
        shimmerR *= send
        this.prevShimmerL = shimmerL
        this.prevShimmerR = shimmerR
      } else {
        // Keep history warm at negligible cost so re-enabling has real
        // material to shift and the crossfade masks the filter warm-up.
        this.shimmerHistoryL.writeAndAdvance(this.prevLateL)
        this.shimmerHistoryR.writeAndAdvance(this.prevLateR)
        this.prevShimmerL = 0
        this.prevShimmerR = 0
      }

      // ---- Late FDN ----
      const lfoBase = this.lfoPhase
      const wander = this.modDepthSamples > 0
        ? this.wanderDrift.next() * this.modDepthSamples * 0.18 * this.vintageWeight
        : 0
      const densityInjection = 0.15 + 0.85 * this.densityNorm
      const loopDiffusion = this.diffusionNorm * 0.4
      const secondTapGain = 0.35 * this.densityNorm
      const outNorm = 0.62 / Math.sqrt(4 + 4 * densityInjection * densityInjection)

      let lateL = 0
      let lateR = 0
      let matrixSum = 0
      for (let line = 0; line < LINE_COUNT; line += 1) {
        const mod = this.modDepthSamples > 0
          ? Math.sin(TWO_PI * (lfoBase + this.lfoOffsets[line]!)) * this.modDepthSamples + wander
          : 0
        const raw = this.lines[line]!.read(mod)
        const second = secondTapGain > 1e-4 ? this.lines[line]!.readFraction(0.618) * secondTapGain : 0
        const tapOut = raw + second
        lateL += tapOut * OUT_SIGN_L[line]! * (line >= 4 ? densityInjection : 1)
        lateR += tapOut * OUT_SIGN_R[line]! * (line >= 4 ? densityInjection : 1)

        // Damping and character processing inside the feedback path. The
        // low/high-cut filters and vintage damping are lossy: under normal
        // decay their per-pass energy loss is intended, but under Freeze it
        // makes a "hold" fade out (see spec-010 Freeze). While frozen, feed the
        // undamped tap so no filter/saturation loss accumulates; the in-loop
        // all-pass is energy-preserving and stays in for both, so the diffused
        // character of the held tail is unchanged.
        let damped = this.loopHighCut[line]!.lowPass(this.loopLowCut[line]!.highPass(raw, lowCutG), highCutG)
        if (this.vintageWeight > 1e-4) {
          const saturated = Math.tanh(damped * 1.4) / 1.4
          const extraDamp = this.vintageDamp[line]!.lowPass(saturated, vintageDampG)
          damped = damped + (extraDamp - damped) * this.vintageWeight
        }
        const preDiffusion = damped + (raw - damped) * this.freezeMix
        const diffused = this.loopAllpass[line]!.process(preDiffusion, loopDiffusion)
        this.lineOuts[line] = diffused
        matrixSum += diffused
      }
      lateL *= outNorm
      lateR *= outNorm

      // Householder feedback matrix: y_i = x_i - (2/N)·sum. Energy-preserving.
      const householder = matrixSum * (2 / LINE_COUNT)
      const freezeGate = inputGate * this.clearGain
      for (let line = 0; line < LINE_COUNT; line += 1) {
        const lineSeconds = this.lineTargetSamples[line]! / this.sampleRate
        const decayGain = aetherformRt60Gain(lineSeconds, this.decaySmoothed)
        const loopGain = decayGain * (1 - this.freezeMix) + FREEZE_LOOP_GAIN * this.freezeMix
        const feedback = (this.lineOuts[line]! - householder) * loopGain
        const injection = (line % 2 === 0 ? diffL : diffR) * 0.35 *
          (line >= 4 ? densityInjection : 1) * freezeGate
        const shimmerInjection = (line % 2 === 0 ? shimmerL : shimmerR) * 0.5
        this.lines[line]!.writeAndAdvance(feedbackSoftLimit(injection + shimmerInjection + feedback))
      }
      this.prevLateL = lateL
      this.prevLateR = lateR

      // ---- Early/late equal-power blend ----
      const earlyGain = Math.cos(this.lateBalance * Math.PI * 0.5)
      const lateGain = Math.sin(this.lateBalance * Math.PI * 0.5)
      let wetL = earlyL * earlyGain + lateL * lateGain
      let wetR = earlyR * earlyGain + lateR * lateGain

      // ---- Stereo width (mid/side on the combined wet signal) ----
      const mid = (wetL + wetR) * 0.5
      const side = (wetL - wetR) * 0.5 * this.width
      wetL = mid + side
      wetR = mid - side

      // ---- Wet-only ducking (soft knee, up to about -24 dB) ----
      const duckKey = Math.min(1, this.duckEnvelope * 3.5)
      const duckKnee = duckKey * duckKey * (3 - 2 * duckKey)
      const duckGain = 10 ** ((-DUCK_RANGE_DB / 20) * this.duckAmount * duckKnee)
      wetL *= duckGain
      wetR *= duckGain

      // ---- Output trim, tail-preserving bypass, Clear Tail fade ----
      const finalGain = this.outputGain * (1 - this.bypassMix) * this.clearGain
      outputL[i] = flushDenormal(wetL * finalGain)
      outputR[i] = flushDenormal(wetR * finalGain)

      // ---- Advance oscillators ----
      this.lfoPhase += (modRate * (1 - 0.3 * this.bloomWeight)) / this.sampleRate
      if (this.lfoPhase >= 1) this.lfoPhase -= 1
    }
  }

  private preDelayTargetSamples(): number {
    return clamp((clamp(this.target.preDelayMs, 0, 250) / 1000) * this.sampleRate, 1,
      MAX_PRE_DELAY_SECONDS * this.sampleRate)
  }

  private shimmerSpanSamples(interval: AetherformShimmerInterval): number {
    // Larger spans for wide intervals keep grain cycling below flutter rates.
    const spanSeconds = interval > 12 ? 0.126 : 0.08
    return spanSeconds * this.sampleRate
  }

  /**
   * Deterministic model-specific early tap pattern. Times, gains, and pans
   * derive from hash noise keyed by tap index and model, so a given module
   * state always produces the same reflection field.
   */
  private buildTapSet(set: EarlyTapSet, model: AetherformSpaceModel, sizeFactor: number): void {
    const spec = EARLY_MODEL[model]
    const seed = model === 'room' ? 3 : model === 'chamber' ? 5 : model === 'hall' ? 7 : 11
    const normalize = 2.2 / Math.sqrt(spec.count)
    set.count = spec.count
    for (let k = 0; k < spec.count; k += 1) {
      const position = ((k + 1) / spec.count) ** spec.shape
      const jitter = 0.75 + 0.5 * pseudoRandom(k, seed)
      const seconds = Math.max(0.001, spec.spanSeconds * position * jitter * sizeFactor)
      const gain = Math.exp(-spec.decay * position) * (0.9 + 0.2 * pseudoRandom(k, seed + 1)) * normalize
      const swing = (k % 2 === 0 ? 1 : -1) * spec.panSwing * (0.6 + 0.4 * pseudoRandom(k, seed + 2))
      const pan = clamp(swing + spec.asymmetry * (pseudoRandom(k, seed + 3) - 0.35), -1, 1)
      const angle = (pan + 1) * Math.PI * 0.25
      set.times[k] = clamp(seconds * this.sampleRate, 1, this.earlyBufferL.buffer.length - 2)
      set.gainL[k] = gain * Math.cos(angle)
      set.gainR[k] = gain * Math.sin(angle)
    }
  }

  /** Flush every internal audio history without touching parameter values. */
  private wipeHistory(): void {
    this.preDelayL.clear()
    this.preDelayR.clear()
    this.earlyBufferL.clear()
    this.earlyBufferR.clear()
    this.earlyLowCutL.reset(); this.earlyLowCutR.reset()
    this.earlyHighCutL.reset(); this.earlyHighCutR.reset()
    for (const stage of this.inputAllpassL) stage.clear()
    for (const stage of this.inputAllpassR) stage.clear()
    for (const stage of this.bloomAllpassL) stage.clear()
    for (const stage of this.bloomAllpassR) stage.clear()
    for (let i = 0; i < LINE_COUNT; i += 1) {
      this.lines[i]!.clear()
      this.loopAllpass[i]!.clear()
      this.loopLowCut[i]!.reset()
      this.loopHighCut[i]!.reset()
      this.vintageDamp[i]!.reset()
    }
    this.shimmerHistoryL.clear()
    this.shimmerHistoryR.clear()
    this.shimmerAaL.reset()
    this.shimmerAaR.reset()
    this.prevLateL = this.prevLateR = 0
    this.prevShimmerL = this.prevShimmerR = 0
  }
}
