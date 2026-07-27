import { createAetherformReverbProcessor, prepareAetherformReverbWorklet } from '../aetherform-reverb-processor'
import {
  isAetherformCharacter,
  isAetherformShimmerInterval,
  isAetherformSpaceModel,
  type AetherformReverbState
} from '../aetherform-reverb-types'
import { AETHERFORM_REVERB_RANGES, numericFieldsWithinRanges } from '../return-param-ranges'
import type { ReturnEffectDescriptor } from '../return-effect-registry'

export interface AetherformReverbModule extends AetherformReverbState {
  readonly type: 'aetherform-reverb'
  /** Optional runtime identity; project files identify modules by bus slot. */
  readonly id?: string
}

const MODULE_KEYS = [
  'id', 'type', 'spaceModel', 'preDelayMs', 'decaySeconds', 'sizePercent',
  'character', 'drivePercent', 'widthPercent', 'lateBalancePercent', 'lowCutHz', 'highCutHz',
  'diffusionPercent', 'densityPercent', 'earlyReflectionsEnabled', 'modRateHz',
  'modDepthPercent', 'shimmerEnabled', 'shimmerAmountPercent',
  'shimmerIntervalSemitones', 'duckAmountPercent', 'duckReleaseMs', 'outputDb',
  'bypass'
] as const

function hasOnlyModuleKeys(module: Record<string, unknown>): boolean {
  return Object.keys(module).every((key) => MODULE_KEYS.includes(key as typeof MODULE_KEYS[number]))
}

function isAetherformReverbModule(module: Record<string, unknown>): boolean {
  return hasOnlyModuleKeys(module) &&
    numericFieldsWithinRanges(module, AETHERFORM_REVERB_RANGES) &&
    isAetherformSpaceModel(module.spaceModel) &&
    isAetherformCharacter(module.character) &&
    typeof module.earlyReflectionsEnabled === 'boolean' &&
    typeof module.shimmerEnabled === 'boolean' &&
    isAetherformShimmerInterval(module.shimmerIntervalSemitones) &&
    typeof module.bypass === 'boolean'
}

/** Default state is the Warm Chamber preset. */
export function createDefaultAetherformReverbReturnModule(
  id = `fx-${crypto.randomUUID()}`
): AetherformReverbModule {
  return {
    id,
    type: 'aetherform-reverb',
    spaceModel: 'chamber',
    preDelayMs: 24,
    decaySeconds: 2.8,
    sizePercent: 68,
    character: 'vintage',
    drivePercent: 0,
    widthPercent: 148,
    lateBalancePercent: 72,
    lowCutHz: 180,
    highCutHz: 8600,
    diffusionPercent: 78,
    densityPercent: 84,
    earlyReflectionsEnabled: true,
    modRateHz: 0.32,
    modDepthPercent: 18,
    shimmerEnabled: false,
    shimmerAmountPercent: 24,
    shimmerIntervalSemitones: 12,
    duckAmountPercent: 28,
    duckReleaseMs: 720,
    outputDb: -1.5,
    bypass: false
  }
}

export type AetherformReverbPresetName =
  | 'Warm Chamber'
  | 'Vocal Plate'
  | 'Dark Hall'
  | 'Small Room'
  | 'Ambient Bloom'
  | 'Shimmer Cloud'
  | 'Endless Cathedral'

export const AETHERFORM_REVERB_PRESET_NAMES: readonly AetherformReverbPresetName[] = [
  'Warm Chamber', 'Vocal Plate', 'Dark Hall', 'Small Room',
  'Ambient Bloom', 'Shimmer Cloud', 'Endless Cathedral'
]

export function applyAetherformReverbPreset(
  module: AetherformReverbModule,
  preset: AetherformReverbPresetName
): AetherformReverbModule {
  const base = createDefaultAetherformReverbReturnModule(module.id)
  switch (preset) {
    case 'Warm Chamber':
      return base
    case 'Vocal Plate':
      return {
        ...base, spaceModel: 'plate', character: 'natural', preDelayMs: 56,
        decaySeconds: 1.9, sizePercent: 52, widthPercent: 132,
        lateBalancePercent: 62, lowCutHz: 220, highCutHz: 12500,
        diffusionPercent: 86, densityPercent: 90, modRateHz: 0.18,
        modDepthPercent: 9, shimmerAmountPercent: 14,
        duckAmountPercent: 46, duckReleaseMs: 420, outputDb: -2.0
      }
    case 'Dark Hall':
      return {
        ...base, spaceModel: 'hall', character: 'vintage', preDelayMs: 38,
        decaySeconds: 5.6, sizePercent: 88, widthPercent: 164,
        lateBalancePercent: 82, lowCutHz: 260, highCutHz: 4800,
        diffusionPercent: 70, densityPercent: 76, modRateHz: 0.21,
        modDepthPercent: 24, shimmerAmountPercent: 18,
        shimmerIntervalSemitones: 7, duckAmountPercent: 18,
        duckReleaseMs: 1100, outputDb: -3.5
      }
    case 'Small Room':
      return {
        ...base, spaceModel: 'room', character: 'natural', preDelayMs: 8,
        decaySeconds: 0.7, sizePercent: 28, widthPercent: 110,
        lateBalancePercent: 48, lowCutHz: 120, highCutHz: 14800,
        diffusionPercent: 58, densityPercent: 64, modRateHz: 0.12,
        modDepthPercent: 4, shimmerAmountPercent: 0,
        duckAmountPercent: 12, duckReleaseMs: 220, outputDb: -1.0
      }
    case 'Ambient Bloom':
      return {
        ...base, spaceModel: 'hall', character: 'bloom', preDelayMs: 72,
        decaySeconds: 9.5, sizePercent: 96, widthPercent: 188,
        lateBalancePercent: 91, lowCutHz: 340, highCutHz: 7200,
        diffusionPercent: 94, densityPercent: 98, modRateHz: 0.14,
        modDepthPercent: 42, shimmerEnabled: true,
        shimmerAmountPercent: 38, duckAmountPercent: 8,
        duckReleaseMs: 1800, outputDb: -5.2
      }
    case 'Shimmer Cloud':
      return {
        ...base, spaceModel: 'hall', character: 'bloom', preDelayMs: 84,
        decaySeconds: 12.4, sizePercent: 100, widthPercent: 196,
        lateBalancePercent: 94, lowCutHz: 460, highCutHz: 9800,
        diffusionPercent: 98, densityPercent: 100,
        earlyReflectionsEnabled: false, modRateHz: 0.1,
        modDepthPercent: 36, shimmerEnabled: true,
        shimmerAmountPercent: 72, duckAmountPercent: 4,
        duckReleaseMs: 2200, outputDb: -6.0
      }
    case 'Endless Cathedral':
      return {
        ...base, spaceModel: 'hall', character: 'bloom', preDelayMs: 110,
        decaySeconds: 30, sizePercent: 100, widthPercent: 200,
        lateBalancePercent: 96, lowCutHz: 420, highCutHz: 5600,
        diffusionPercent: 100, densityPercent: 100,
        earlyReflectionsEnabled: false, modRateHz: 0.08,
        modDepthPercent: 55, shimmerEnabled: true,
        shimmerAmountPercent: 84, shimmerIntervalSemitones: 19,
        duckAmountPercent: 0, duckReleaseMs: 2500, outputDb: -7.0
      }
  }
}

export const aetherformReverbDescriptor: ReturnEffectDescriptor = {
  type: 'aetherform-reverb',
  label: 'Aetherform Reverb',
  tempoAware: false,
  supportsClearTail: true,
  createProcessor: (context, module) =>
    createAetherformReverbProcessor(context, module as AetherformReverbModule),
  prepareWorklet: prepareAetherformReverbWorklet,
  createDefault: createDefaultAetherformReverbReturnModule,
  validate: isAetherformReverbModule,
  moduleKeys: MODULE_KEYS.filter((key) => key !== 'id')
}
