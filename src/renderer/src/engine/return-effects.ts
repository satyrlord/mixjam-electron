import { clamp } from '../lib/sample-utils'
import { createEchoformDelayProcessor } from './echoform-delay-processor'
import type { EchoformDelayState } from './echoform-delay-types'
import { isEchoformDelayDivision } from './echoform-delay-core'

export type { EchoformDelayCharacter, EchoformDelayDivision, EchoformDelayMode, EchoformDelayState } from './echoform-delay-types'
export { prepareEchoformDelayWorklet } from './echoform-delay-processor'

/** The project and audio graph always expose exactly four parallel Return buses. */
export const RETURN_BUS_COUNT = 4

/**
 * Return modules are black boxes hosted by the four fixed FX buses. The only
 * effect module is the Echoform Delay (`echoform-delay`); the legacy native
 * `delay` was replaced by it and is migrated on project load.
 */
export type ReturnModule = EmptyReturnModule | EchoformDelayModule

export interface EmptyReturnModule {
  readonly type: 'empty'
  /** Optional runtime identity; project files identify modules by bus slot. */
  readonly id?: string
}

export interface EchoformDelayModule extends EchoformDelayState {
  readonly type: 'echoform-delay'
  /** Optional runtime identity; project files identify modules by bus slot. */
  readonly id?: string
}

export interface ReturnModuleProcessor {
  readonly input: GainNode
  readonly output: GainNode
  update(module: ReturnModule, bpm: number): void
  dispose(): void
}

function disconnectAll(nodes: readonly AudioNode[]): void {
  for (const node of new Set(nodes)) {
    try { node.disconnect() } catch { /* already disconnected */ }
  }
}

function createEmptyProcessor(context: BaseAudioContext): ReturnModuleProcessor {
  const input = context.createGain()
  const output = context.createGain()
  // Empty is an identity module at the black-box boundary. The Return host
  // gates its input, so it cannot create an accidental dry send path.
  input.connect(output)
  return {
    input,
    output,
    update(): void {},
    dispose(): void { disconnectAll([input, output]) }
  }
}

export function createReturnModuleProcessor(
  context: BaseAudioContext,
  module: ReturnModule,
  bpm: number
): ReturnModuleProcessor {
  if (module.type === 'echoform-delay') return createEchoformDelayProcessor(context, module, bpm)
  return createEmptyProcessor(context)
}

export function createEmptyReturnModule(id = `fx-${crypto.randomUUID()}`): EmptyReturnModule {
  return { id, type: 'empty' }
}

/**
 * Default state is the "Wide Tape Echo" preset (spec §8 / §22). At 120 BPM the
 * synchronized readouts are L 500 ms (1/4) and R 375 ms (1/8 dotted).
 */
export function createDefaultEchoformDelayReturnModule(id = `fx-${crypto.randomUUID()}`): EchoformDelayModule {
  return {
    id,
    type: 'echoform-delay',
    mode: 'sync',
    divisionL: '1/4',
    divisionR: '1/8.',
    timeMsL: 420,
    timeMsR: 610,
    feedback: 68,
    pingPong: true,
    width: 142,
    lowCut: 160,
    highCut: 7800,
    modRate: 0.38,
    modDepth: 5.4,
    character: 'tape',
    duckAmount: 34,
    duckRelease: 620,
    outputDb: -1.5,
    freeze: false,
    bypass: false
  }
}

export type EchoformDelayPresetName =
  | 'Wide Tape Echo'
  | 'Clean Slap'
  | 'Dotted Motion'
  | 'Dub Feedback'
  | 'Ducked Eighths'
  | 'Frozen Wash'

export const ECHOFORM_DELAY_PRESET_NAMES: readonly EchoformDelayPresetName[] = [
  'Wide Tape Echo', 'Clean Slap', 'Dotted Motion', 'Dub Feedback', 'Ducked Eighths', 'Frozen Wash'
]

/**
 * Apply a built-in preset. Every field is set explicitly (spread over the
 * default so retained Sync/Free values are complete). The preset BPM reference
 * is *not* applied here — host tempo ownership is honored by the caller.
 */
export function applyEchoformDelayPreset(
  module: EchoformDelayModule,
  preset: EchoformDelayPresetName
): EchoformDelayModule {
  const base = createDefaultEchoformDelayReturnModule(module.id)
  switch (preset) {
    case 'Wide Tape Echo':
      return base
    case 'Clean Slap':
      return {
        ...base,
        mode: 'free',
        divisionL: '1/16',
        divisionR: '1/16',
        timeMsL: 96,
        timeMsR: 124,
        feedback: 18,
        pingPong: false,
        width: 118,
        lowCut: 90,
        highCut: 17200,
        modRate: 0.12,
        modDepth: 0.6,
        character: 'digital',
        duckAmount: 12,
        duckRelease: 180,
        outputDb: -2.2,
        freeze: false
      }
    case 'Dotted Motion':
      return {
        ...base,
        mode: 'sync',
        divisionL: '1/8.',
        divisionR: '1/4T',
        timeMsL: 430,
        timeMsR: 350,
        feedback: 54,
        pingPong: true,
        width: 168,
        lowCut: 240,
        highCut: 9600,
        modRate: 0.74,
        modDepth: 2.8,
        character: 'analog',
        duckAmount: 46,
        duckRelease: 480,
        outputDb: -1.8,
        freeze: false
      }
    case 'Dub Feedback':
      return {
        ...base,
        mode: 'sync',
        divisionL: '1/4.',
        divisionR: '1/2T',
        timeMsL: 680,
        timeMsR: 870,
        feedback: 94,
        pingPong: true,
        width: 136,
        lowCut: 310,
        highCut: 4400,
        modRate: 0.24,
        modDepth: 7.6,
        character: 'tape',
        duckAmount: 18,
        duckRelease: 980,
        outputDb: -4.1,
        freeze: false
      }
    case 'Ducked Eighths':
      return {
        ...base,
        mode: 'sync',
        divisionL: '1/8',
        divisionR: '1/8.',
        timeMsL: 234,
        timeMsR: 351,
        feedback: 47,
        pingPong: true,
        width: 152,
        lowCut: 190,
        highCut: 11200,
        modRate: 0.18,
        modDepth: 1.2,
        character: 'digital',
        duckAmount: 72,
        duckRelease: 340,
        outputDb: -1.0,
        freeze: false
      }
    case 'Frozen Wash':
      return {
        ...base,
        mode: 'free',
        divisionL: '1/2',
        divisionR: '1/2.',
        timeMsL: 980,
        timeMsR: 1330,
        feedback: 102,
        pingPong: true,
        width: 188,
        lowCut: 420,
        highCut: 5200,
        modRate: 0.11,
        modDepth: 9.8,
        character: 'tape',
        duckAmount: 6,
        duckRelease: 1900,
        outputDb: -7.5,
        freeze: true
      }
  }
}

const EMPTY_KEYS = ['id', 'type'] as const
const ECHOFORM_DELAY_KEYS = [
  'id', 'type', 'mode', 'divisionL', 'divisionR', 'timeMsL', 'timeMsR',
  'feedback', 'pingPong', 'width', 'lowCut', 'highCut', 'modRate', 'modDepth',
  'character', 'duckAmount', 'duckRelease', 'outputDb', 'freeze', 'bypass'
] as const

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function numberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

export function isReturnModule(value: unknown): value is ReturnModule {
  if (!value || typeof value !== 'object') return false
  const module = value as Record<string, unknown>
  if (module.id !== undefined && (typeof module.id !== 'string' || module.id.length === 0)) return false
  if (module.type === 'empty') return hasOnlyKeys(module, EMPTY_KEYS)
  if (module.type !== 'echoform-delay') return false
  return hasOnlyKeys(module, ECHOFORM_DELAY_KEYS) &&
    (module.mode === 'free' || module.mode === 'sync') &&
    isEchoformDelayDivision(module.divisionL) &&
    isEchoformDelayDivision(module.divisionR) &&
    numberInRange(module.timeMsL, 1, 2000) &&
    numberInRange(module.timeMsR, 1, 2000) &&
    numberInRange(module.feedback, 0, 110) &&
    typeof module.pingPong === 'boolean' &&
    numberInRange(module.width, 0, 200) &&
    numberInRange(module.lowCut, 20, 2000) &&
    numberInRange(module.highCut, 1000, 20000) &&
    numberInRange(module.modRate, 0.05, 8) &&
    numberInRange(module.modDepth, 0, 20) &&
    (module.character === 'digital' || module.character === 'analog' || module.character === 'tape') &&
    numberInRange(module.duckAmount, 0, 100) &&
    numberInRange(module.duckRelease, 50, 2500) &&
    numberInRange(module.outputDb, -24, 6) &&
    typeof module.freeze === 'boolean' &&
    typeof module.bypass === 'boolean'
}

export interface SafetyLimiter {
  readonly input: GainNode
  readonly output: GainNode
  setEnabled(enabled: boolean): void
  dispose(): void
}

const SAFETY_CEILING_LINEAR = 10 ** (-1 / 20)

function createHardCeilingCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(2048 * Float32Array.BYTES_PER_ELEMENT))
  for (let i = 0; i < curve.length; i += 1) {
    const input = (i / (curve.length - 1)) * 2 - 1
    curve[i] = clamp(input, -SAFETY_CEILING_LINEAR, SAFETY_CEILING_LINEAR)
  }
  return curve
}

/** Fixed per-return limiter. Bypass is a true zero-latency direct connection. */
export function createSafetyLimiter(context: BaseAudioContext, enabled = true): SafetyLimiter {
  const input = context.createGain()
  const output = context.createGain()
  const lookahead = context.createDelay(0.05)
  const compressor = context.createDynamicsCompressor()
  const ceiling = context.createWaveShaper()
  lookahead.delayTime.value = 0.005
  // Minimal test AudioContexts may omit optional compressor AudioParams. Real
  // DynamicsCompressorNodes expose all six parameters.
  if (compressor.threshold) compressor.threshold.value = -1
  if (compressor.knee) compressor.knee.value = 0
  if (compressor.ratio) compressor.ratio.value = 20
  if (compressor.attack) compressor.attack.value = 0
  if (compressor.release) compressor.release.value = 0.1
  ceiling.curve = createHardCeilingCurve()
  ceiling.oversample = '2x'
  input.connect(lookahead)
  lookahead.connect(compressor)
  compressor.connect(ceiling)
  ceiling.connect(output)
  let isEnabled = false
  const setEnabled = (next: boolean): void => {
    if (isEnabled === next) return
    try { input.disconnect() } catch { /* edge absent */ }
    if (next) input.connect(lookahead)
    else input.connect(output)
    isEnabled = next
  }
  setEnabled(enabled)
  return {
    input,
    output,
    setEnabled,
    dispose(): void { disconnectAll([input, output, lookahead, compressor, ceiling]) }
  }
}
