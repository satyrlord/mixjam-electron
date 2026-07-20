// Headless harness for the production loudness worklet
// (src/renderer/src/engine/worklets/loudness.worklet.js). Installs the
// AudioWorklet global surface in the node test environment, imports the
// real release asset, and drives its processor over Float32Array blocks.
// This lets the EBU compliance and chain calibration tests measure LUFS
// and true peak with the exact meter the app ships.

interface LoudnessMeasurements {
  momentaryLoudness: number
  shortTermLoudness: number
  integratedLoudness: number
  maximumTruePeakLevel: number
  loudnessRange: number
}

interface WorkletSnapshot {
  currentMeasurements: LoudnessMeasurements[]
}

interface WorkletProcessorLike {
  port: { postMessage: (value: unknown) => void; onmessage: unknown }
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean
}

type WorkletProcessorCtor = new (options: {
  processorOptions: { interval: number }
  numberOfInputs: number
  outputChannelCount: number[]
}) => WorkletProcessorLike

interface HarnessGlobals {
  registerProcessor?: (name: string, ctor: WorkletProcessorCtor) => void
  AudioWorkletProcessor?: unknown
  sampleRate?: number
  currentFrame?: number
  currentTime?: number
}

let processorCtor: WorkletProcessorCtor | null = null
let harnessFrame = 0

async function loadProcessor(sampleRate: number): Promise<WorkletProcessorCtor> {
  if (processorCtor) return processorCtor
  const g = globalThis as HarnessGlobals
  const captured: WorkletProcessorCtor[] = []
  g.registerProcessor = (_name, ctor) => {
    captured.push(ctor)
  }
  g.AudioWorkletProcessor = class {
    port = { postMessage: (): void => {}, onmessage: null }
  }
  g.sampleRate = sampleRate
  Object.defineProperty(globalThis, 'currentFrame', {
    configurable: true,
    get: () => harnessFrame,
  })
  Object.defineProperty(globalThis, 'currentTime', {
    configurable: true,
    get: () => harnessFrame / sampleRate,
  })
  // @ts-expect-error vendored release asset ships without type declarations
  await import('../../worklets/loudness.worklet.js')
  if (captured.length === 0) throw new Error('loudness worklet did not register a processor')
  processorCtor = captured[0]
  return processorCtor
}

export interface LoudnessResult {
  integratedLufs: number
  maxMomentaryLufs: number
  maxShortTermLufs: number
  momentaryTrail: number[]
  shortTermTrail: number[]
  maxTruePeakDbtp: number
}

/** Measures a stereo program with the production BS.1770 meter. */
export async function measureLoudness(l: Float32Array, r: Float32Array, sampleRate = 48000): Promise<LoudnessResult> {
  const Ctor = await loadProcessor(sampleRate)
  harnessFrame = 0
  const snapshots: WorkletSnapshot[] = []
  const processor = new Ctor({
    processorOptions: { interval: 0.1 },
    numberOfInputs: 1,
    outputChannelCount: [2],
  })
  processor.port.postMessage = (value: unknown): void => {
    snapshots.push(value as WorkletSnapshot)
  }
  const BLOCK = 128
  const outL = new Float32Array(BLOCK)
  const outR = new Float32Array(BLOCK)
  for (let start = 0; start + BLOCK <= l.length; start += BLOCK) {
    const inputs = [[l.subarray(start, start + BLOCK), r.subarray(start, start + BLOCK)]]
    processor.process(inputs, [[outL, outR]], {})
    harnessFrame += BLOCK
  }
  // One trailing silent block so the final interval report flushes.
  harnessFrame += sampleRate
  processor.process([[new Float32Array(BLOCK), new Float32Array(BLOCK)]], [[outL, outR]], {})
  if (snapshots.length === 0) throw new Error('loudness worklet produced no snapshots')

  let maxMomentary = Number.NEGATIVE_INFINITY
  let maxShortTerm = Number.NEGATIVE_INFINITY
  let maxTruePeak = Number.NEGATIVE_INFINITY
  const momentaryTrail: number[] = []
  const shortTermTrail: number[] = []
  for (const snap of snapshots) {
    const m = snap.currentMeasurements[0]
    if (!m) continue
    if (Number.isFinite(m.momentaryLoudness)) {
      maxMomentary = Math.max(maxMomentary, m.momentaryLoudness)
      momentaryTrail.push(m.momentaryLoudness)
    }
    if (Number.isFinite(m.shortTermLoudness)) {
      maxShortTerm = Math.max(maxShortTerm, m.shortTermLoudness)
      shortTermTrail.push(m.shortTermLoudness)
    }
    if (Number.isFinite(m.maximumTruePeakLevel)) maxTruePeak = Math.max(maxTruePeak, m.maximumTruePeakLevel)
  }
  const last = snapshots[snapshots.length - 1].currentMeasurements[0]
  return {
    integratedLufs: last.integratedLoudness,
    maxMomentaryLufs: maxMomentary,
    maxShortTermLufs: maxShortTerm,
    momentaryTrail,
    shortTermTrail,
    maxTruePeakDbtp: maxTruePeak,
  }
}
