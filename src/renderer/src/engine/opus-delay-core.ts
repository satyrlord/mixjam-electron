import {
  OPUS_DELAY_DIVISIONS,
  type OpusDelayCharacter,
  type OpusDelayDivision,
  type OpusDelayMode,
  type OpusDelayState
} from './opus-delay-types'

const TWO_PI = Math.PI * 2
const MIN_BPM = 20
const MAX_BPM = 400
const MAX_DELAY_SECONDS = 12.5
const MAX_FEEDBACK = 0.98
const FREEZE_FEEDBACK = 0.999
const DENORMAL_FLOOR = 1e-20

const DIVISION_BEATS: Record<OpusDelayDivision, number> = {
  '1/1': 4,
  '1/2': 2,
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

function smoothCoefficient(seconds: number, sampleRate: number): number {
  if (seconds <= 0) return 1
  return 1 - Math.exp(-1 / (seconds * sampleRate))
}

function smooth(current: number, target: number, coefficient: number): number {
  const next = current + (target - current) * coefficient
  return Math.abs(next) < DENORMAL_FLOOR ? 0 : next
}

function lowPassCoefficient(cutoffHz: number, sampleRate: number): number {
  return 1 - Math.exp(-TWO_PI * clamp(cutoffHz, 1, sampleRate * 0.49) / sampleRate)
}

function divisionSeconds(division: OpusDelayDivision, bpm: number): number {
  return (60 / clamp(bpm, MIN_BPM, MAX_BPM)) * DIVISION_BEATS[division]
}

function delaySeconds(
  state: OpusDelayState,
  bpm: number,
  side: 'L' | 'R'
): number {
  if (state.mode === 'free') {
    return clamp(side === 'L' ? state.timeMsL : state.timeMsR, 0, 2000) / 1000
  }
  const division = side === 'L' ? state.divisionL : state.divisionR
  return divisionSeconds(division, bpm)
}

function readInterpolated(buffer: Float32Array<ArrayBuffer>, position: number): number {
  const length = buffer.length
  let wrapped = position
  while (wrapped < 0) wrapped += length
  while (wrapped >= length) wrapped -= length
  const index = Math.floor(wrapped)
  const nextIndex = index + 1 < length ? index + 1 : 0
  const fraction = wrapped - index
  return buffer[index]! + (buffer[nextIndex]! - buffer[index]!) * fraction
}

function saturate(sample: number, character: OpusDelayCharacter): number {
  if (character === 'digital') return sample
  const drive = character === 'tape' ? 2.4 : 1.6
  return Math.tanh(sample * drive) / drive
}

/**
 * Allocation-free stereo Opus Delay processor.
 *
 * The worklet owns one instance of this class. All delay storage and filter
 * state are created by the constructor; process() only reads and writes the
 * caller-owned audio blocks and its preallocated buffers.
 */
export class OpusDelayCore {
  private readonly sampleRate: number
  private readonly maxDelaySamples: number
  private readonly leftBuffer: Float32Array<ArrayBuffer>
  private readonly rightBuffer: Float32Array<ArrayBuffer>
  private readonly delaySmoothing: number
  private readonly parameterSmoothing: number
  private readonly attackSmoothing: number

  private target: OpusDelayState
  private bpm: number
  private writeIndex = 0
  private delayL: number
  private delayR: number
  private feedback = 0
  private width = 1
  private mix = 1
  private outputGain = 1
  private duckAmount = 0
  private duckRelease = 220
  private bypassMix = 0
  private pingPongMix = 0
  private freezeMix = 0
  private duckEnvelope = 0
  private lfoPhase = 0
  private flutterPhase = 0

  // First-order high-pass and low-pass state for both stereo sides.
  private lowCutStateL = 0
  private lowCutStateR = 0
  private highCutStateL = 0
  private highCutStateR = 0
  private tapeToneStateL = 0
  private tapeToneStateR = 0

  constructor(sampleRate: number, state: OpusDelayState, bpm: number) {
    this.sampleRate = Math.max(1, sampleRate)
    this.maxDelaySamples = Math.ceil(MAX_DELAY_SECONDS * this.sampleRate) + 4
    this.leftBuffer = new Float32Array(this.maxDelaySamples)
    this.rightBuffer = new Float32Array(this.maxDelaySamples)
    this.delaySmoothing = smoothCoefficient(0.025, this.sampleRate)
    this.parameterSmoothing = smoothCoefficient(0.02, this.sampleRate)
    this.attackSmoothing = smoothCoefficient(0.005, this.sampleRate)
    this.target = { ...state }
    this.bpm = clamp(bpm, MIN_BPM, MAX_BPM)
    this.delayL = this.delaySamples(delaySeconds(this.target, this.bpm, 'L'))
    this.delayR = this.delaySamples(delaySeconds(this.target, this.bpm, 'R'))
    this.feedback = this.target.feedback / 100 * MAX_FEEDBACK
    this.width = this.target.width / 100
    this.mix = this.target.mix / 100
    this.outputGain = 10 ** (this.target.outputDb / 20)
    this.duckAmount = this.target.duckAmount / 100
    this.duckRelease = this.target.duckRelease
    this.bypassMix = this.target.bypass ? 1 : 0
    this.pingPongMix = this.target.pingPong ? 1 : 0
    this.freezeMix = this.target.freeze ? 1 : 0
  }

  update(state: OpusDelayState, bpm: number): void {
    this.target = { ...state }
    this.bpm = clamp(bpm, MIN_BPM, MAX_BPM)
  }

  reset(): void {
    this.leftBuffer.fill(0)
    this.rightBuffer.fill(0)
    this.writeIndex = 0
    this.delayL = 0
    this.delayR = 0
    this.feedback = 0
    this.duckEnvelope = 0
    this.lowCutStateL = 0
    this.lowCutStateR = 0
    this.highCutStateL = 0
    this.highCutStateR = 0
    this.tapeToneStateL = 0
    this.tapeToneStateR = 0
  }

  process(
    inputL: Float32Array,
    inputR: Float32Array,
    outputL: Float32Array,
    outputR: Float32Array
  ): void {
    const lowCutCoefficient = lowPassCoefficient(this.target.lowCut, this.sampleRate)
    const highCutCoefficient = lowPassCoefficient(this.target.highCut, this.sampleRate)
    const tapeToneCoefficient = lowPassCoefficient(
      this.target.character === 'tape' ? 9000 : this.target.character === 'analog' ? 14000 : 20000,
      this.sampleRate
    )
    const duckReleaseCoefficient = smoothCoefficient(this.duckRelease / 1000, this.sampleRate)
    const lfoRate = clamp(this.target.modRate, 0.02, 10)
    const character = this.target.character
    const targetDelayL = this.delaySamples(delaySeconds(this.target, this.bpm, 'L'))
    const targetDelayR = this.delaySamples(
      delaySeconds(this.target, this.bpm, this.target.link ? 'L' : 'R')
    )

    for (let i = 0; i < outputL.length; i += 1) {
      const dryL = Number.isFinite(inputL[i]) ? inputL[i]! : 0
      const dryR = Number.isFinite(inputR[i]) ? inputR[i]! : dryL

      this.feedback = smooth(
        this.feedback,
        clamp(this.target.feedback, 0, 100) / 100 * MAX_FEEDBACK,
        this.parameterSmoothing
      )
      this.width = smooth(this.width, clamp(this.target.width, 0, 100) / 100, this.parameterSmoothing)
      this.mix = smooth(this.mix, clamp(this.target.mix, 0, 100) / 100, this.parameterSmoothing)
      this.outputGain = smooth(
        this.outputGain,
        10 ** (clamp(this.target.outputDb, -24, 6) / 20),
        this.parameterSmoothing
      )
      this.duckAmount = smooth(
        this.duckAmount,
        clamp(this.target.duckAmount, 0, 100) / 100,
        this.parameterSmoothing
      )
      this.duckRelease = smooth(
        this.duckRelease,
        clamp(this.target.duckRelease, 20, 1000),
        this.parameterSmoothing
      )
      this.bypassMix = smooth(this.bypassMix, this.target.bypass ? 1 : 0, this.parameterSmoothing)
      this.pingPongMix = smooth(this.pingPongMix, this.target.pingPong ? 1 : 0, this.parameterSmoothing)
      this.freezeMix = smooth(this.freezeMix, this.target.freeze ? 1 : 0, this.parameterSmoothing)
      this.delayL = smooth(this.delayL, targetDelayL, this.delaySmoothing)
      this.delayR = smooth(this.delayR, targetDelayR, this.delaySmoothing)

      const detector = Math.max(Math.abs(dryL), Math.abs(dryR))
      const envelopeCoefficient = detector > this.duckEnvelope
        ? this.attackSmoothing
        : duckReleaseCoefficient
      this.duckEnvelope = smooth(this.duckEnvelope, detector, envelopeCoefficient)

      const inputGate = 1 - this.freezeMix
      const feedback = this.feedback * (1 - this.freezeMix) + FREEZE_FEEDBACK * this.freezeMix
      const phaseValue = Math.sin(this.lfoPhase * TWO_PI)
      const flutterValue = Math.sin(this.flutterPhase * TWO_PI)
      const intrinsicAmount = character === 'tape' ? 0.0015 : character === 'analog' ? 0.0007 : 0
      const modulationSeconds = clamp(this.target.modDepth, 0, 100) / 100 * 0.025
      const wowSeconds = intrinsicAmount * phaseValue + intrinsicAmount * 0.35 * flutterValue
      const readL = this.delayL + (phaseValue * modulationSeconds + wowSeconds) * this.sampleRate
      const readR = this.delayR + (phaseValue * modulationSeconds + wowSeconds) * this.sampleRate
      const delayedL = readInterpolated(this.leftBuffer, this.writeIndex - clamp(readL, 0, this.maxDelaySamples - 2))
      const delayedR = readInterpolated(this.rightBuffer, this.writeIndex - clamp(readR, 0, this.maxDelaySamples - 2))

      const filteredL = this.filter(delayedL, 'L', lowCutCoefficient, highCutCoefficient)
      const filteredR = this.filter(delayedR, 'R', lowCutCoefficient, highCutCoefficient)
      const colouredL = this.colour(filteredL, 'L', character, tapeToneCoefficient)
      const colouredR = this.colour(filteredR, 'R', character, tapeToneCoefficient)

      // Smoothly blend same-side and cross-side feedback when Ping-Pong changes.
      const feedbackL = colouredL * (1 - this.pingPongMix) + colouredR * this.pingPongMix
      const feedbackR = colouredR * (1 - this.pingPongMix) + colouredL * this.pingPongMix
      this.leftBuffer[this.writeIndex] = dryL * inputGate + feedbackL * feedback
      this.rightBuffer[this.writeIndex] = dryR * inputGate + feedbackR * feedback

      const mid = (colouredL + colouredR) * 0.5
      const side = (colouredL - colouredR) * 0.5 * this.width
      const widthL = mid + side
      const widthR = mid - side
      const duckGain = 1 - this.duckAmount * clamp(this.duckEnvelope * 4, 0, 1)
      const wetL = widthL * duckGain
      const wetR = widthR * duckGain
      const mixedL = wetL * this.mix + dryL * (1 - this.mix)
      const mixedR = wetR * this.mix + dryR * (1 - this.mix)
      const processedL = mixedL * this.outputGain
      const processedR = mixedR * this.outputGain
      outputL[i] = this.flush(processedL * (1 - this.bypassMix) + dryL * this.bypassMix)
      outputR[i] = this.flush(processedR * (1 - this.bypassMix) + dryR * this.bypassMix)

      this.writeIndex += 1
      if (this.writeIndex >= this.maxDelaySamples) this.writeIndex = 0
      this.lfoPhase += lfoRate / this.sampleRate
      this.flutterPhase += 6.7 / this.sampleRate
      if (this.lfoPhase >= 1) this.lfoPhase -= 1
      if (this.flutterPhase >= 1) this.flutterPhase -= 1
    }
  }

  private delaySamples(seconds: number): number {
    return clamp(seconds * this.sampleRate, 0, this.maxDelaySamples - 2)
  }

  private filter(
    sample: number,
    side: 'L' | 'R',
    lowCutCoefficient: number,
    highCutCoefficient: number
  ): number {
    if (side === 'L') {
      this.lowCutStateL = smooth(this.lowCutStateL, sample, lowCutCoefficient)
      const highPassed = sample - this.lowCutStateL
      this.highCutStateL = smooth(this.highCutStateL, highPassed, highCutCoefficient)
      return this.highCutStateL
    }
    this.lowCutStateR = smooth(this.lowCutStateR, sample, lowCutCoefficient)
    const highPassed = sample - this.lowCutStateR
    this.highCutStateR = smooth(this.highCutStateR, highPassed, highCutCoefficient)
    return this.highCutStateR
  }

  private colour(
    sample: number,
    side: 'L' | 'R',
    character: OpusDelayCharacter,
    tapeToneCoefficient: number
  ): number {
    const saturated = saturate(sample, character)
    if (character !== 'tape') return saturated
    if (side === 'L') {
      this.tapeToneStateL = smooth(this.tapeToneStateL, saturated, tapeToneCoefficient)
      return this.tapeToneStateL
    }
    this.tapeToneStateR = smooth(this.tapeToneStateR, saturated, tapeToneCoefficient)
    return this.tapeToneStateR
  }

  private flush(value: number): number {
    if (!Number.isFinite(value) || Math.abs(value) < DENORMAL_FLOOR) return 0
    return value
  }
}

export function opusDelayDivisionBeats(division: OpusDelayDivision): number {
  return DIVISION_BEATS[division]
}

export function opusDelaySeconds(
  mode: OpusDelayMode,
  division: OpusDelayDivision,
  timeMs: number,
  bpm: number
): number {
  return mode === 'free'
    ? clamp(timeMs, 0, 2000) / 1000
    : divisionSeconds(division, bpm)
}

export function isOpusDelayDivision(value: unknown): value is OpusDelayDivision {
  return typeof value === 'string' && (OPUS_DELAY_DIVISIONS as readonly string[]).includes(value)
}
