import { isEchoformDelayDivision } from '../echoform-delay-core'
import { createEchoformDelayProcessor, prepareEchoformDelayWorklet } from '../echoform-delay-processor'
import type { EchoformDelayState } from '../echoform-delay-types'
import { ECHOFORM_DELAY_RANGES, numericFieldsWithinRanges } from '../return-param-ranges'
import type { ReturnEffectDescriptor } from '../return-effect-registry'

export interface EchoformDelayModule extends EchoformDelayState {
  readonly type: 'echoform-delay'
  /** Optional runtime identity; project files identify modules by bus slot. */
  readonly id?: string
}

const MODULE_KEYS = [
  'id', 'type', 'mode', 'divisionL', 'divisionR', 'timeMsL', 'timeMsR',
  'feedback', 'pingPong', 'width', 'lowCut', 'highCut', 'modRate', 'modDepth',
  'character', 'drive', 'duckAmount', 'duckRelease', 'outputDb', 'bypass'
] as const

function hasOnlyModuleKeys(module: Record<string, unknown>): boolean {
  return Object.keys(module).every((key) => MODULE_KEYS.includes(key as typeof MODULE_KEYS[number]))
}

function isEchoformDelayModule(module: Record<string, unknown>): boolean {
  return hasOnlyModuleKeys(module) &&
    numericFieldsWithinRanges(module, ECHOFORM_DELAY_RANGES) &&
    (module.mode === 'free' || module.mode === 'sync') &&
    isEchoformDelayDivision(module.divisionL) &&
    isEchoformDelayDivision(module.divisionR) &&
    typeof module.pingPong === 'boolean' &&
    (module.character === 'digital' || module.character === 'analog' || module.character === 'tape') &&
    typeof module.bypass === 'boolean'
}

/** Default state is the Wide Tape Echo preset. */
export function createDefaultEchoformDelayReturnModule(
  id = `fx-${crypto.randomUUID()}`
): EchoformDelayModule {
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
    drive: 0,
    duckAmount: 34,
    duckRelease: 620,
    outputDb: -1.5,
    bypass: false
  }
}

export type EchoformDelayPresetName =
  | 'Wide Tape Echo'
  | 'Clean Slap'
  | 'Dotted Motion'
  | 'Dub Feedback'
  | 'Ducked Eighths'
  | 'Endless Wash'

export const ECHOFORM_DELAY_PRESET_NAMES: readonly EchoformDelayPresetName[] = [
  'Wide Tape Echo', 'Clean Slap', 'Dotted Motion', 'Dub Feedback', 'Ducked Eighths', 'Endless Wash'
]

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
        ...base, mode: 'free', divisionL: '1/16', divisionR: '1/16',
        timeMsL: 96, timeMsR: 124, feedback: 18, pingPong: false,
        width: 118, lowCut: 90, highCut: 17200, modRate: 0.12,
        modDepth: 0.6, character: 'digital', duckAmount: 12,
        duckRelease: 180, outputDb: -2.2
      }
    case 'Dotted Motion':
      return {
        ...base, mode: 'sync', divisionL: '1/8.', divisionR: '1/4T',
        timeMsL: 430, timeMsR: 350, feedback: 54, pingPong: true,
        width: 168, lowCut: 240, highCut: 9600, modRate: 0.74,
        modDepth: 2.8, character: 'analog', duckAmount: 46,
        duckRelease: 480, outputDb: -1.8
      }
    case 'Dub Feedback':
      return {
        ...base, mode: 'sync', divisionL: '1/4.', divisionR: '1/2T',
        timeMsL: 680, timeMsR: 870, feedback: 94, pingPong: true,
        width: 136, lowCut: 310, highCut: 4400, modRate: 0.24,
        modDepth: 7.6, character: 'tape', drive: 32, duckAmount: 18,
        duckRelease: 980, outputDb: -4.1
      }
    case 'Ducked Eighths':
      return {
        ...base, mode: 'sync', divisionL: '1/8', divisionR: '1/8.',
        timeMsL: 234, timeMsR: 351, feedback: 47, pingPong: true,
        width: 152, lowCut: 190, highCut: 11200, modRate: 0.18,
        modDepth: 1.2, character: 'digital', duckAmount: 72,
        duckRelease: 340, outputDb: -1.0
      }
    case 'Endless Wash':
      return {
        ...base, mode: 'free', divisionL: '1/2', divisionR: '1/2.',
        timeMsL: 980, timeMsR: 1330, feedback: 110, pingPong: true,
        width: 188, lowCut: 420, highCut: 5200, modRate: 0.11,
        modDepth: 9.8, character: 'tape', duckAmount: 6,
        duckRelease: 1900, outputDb: -7.5
      }
  }
}

export const echoformDelayDescriptor: ReturnEffectDescriptor = {
  type: 'echoform-delay',
  label: 'Echoform Delay',
  tempoAware: true,
  supportsClearTail: false,
  createProcessor: (context, module, bpm) =>
    createEchoformDelayProcessor(context, module as EchoformDelayModule, bpm),
  prepareWorklet: prepareEchoformDelayWorklet,
  createDefault: createDefaultEchoformDelayReturnModule,
  validate: isEchoformDelayModule,
  moduleKeys: MODULE_KEYS.filter((key) => key !== 'id')
}
