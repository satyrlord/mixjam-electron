// Factory presets (spec-012 Factory Presets). A preset first resets every
// parameter to its default, then applies overrides and the power map. Only
// Cheat Sheet restores the default slot order.

import type { MasterBusParamId, ProcessorId } from './params'
import { DEFAULT_PROCESSOR_ORDER, PROCESSOR_IDS, defaultParamValues } from './params'

export const MASTER_BUS_PRESET_NAMES = ['Cheat Sheet', 'Gentle', 'Loud', 'Bypass All'] as const

export type MasterBusPresetName = (typeof MASTER_BUS_PRESET_NAMES)[number]

interface PresetDef {
  readonly restoreOrder: boolean
  /** Processors powered off by this preset; everything else is on. */
  readonly poweredOff: readonly ProcessorId[]
  readonly overrides: Readonly<Partial<Record<MasterBusParamId, number>>>
}

const PRESETS: Record<MasterBusPresetName, PresetDef> = {
  'Cheat Sheet': { restoreOrder: true, poweredOff: [], overrides: {} },
  Gentle: {
    restoreOrder: false,
    poweredOff: ['max', 'mbc'],
    overrides: {
      'clip.amount': 0.8,
      'tube.drive': 1.5,
      'comp.thr': -12,
      'lim.gain': 2.5,
      'width.width': 100,
    },
  },
  Loud: {
    restoreOrder: false,
    poweredOff: [],
    overrides: {
      'clip.amount': 2.5,
      'max.boost': 16,
      'comp.thr': -20,
      'comp.ratio': 3,
      'mbc.lo': 35,
      'mbc.mid': 25,
      'mbc.hi': 35,
      'addeq.air': 1.6,
      'lim.gain': 7,
    },
  },
  'Bypass All': { restoreOrder: false, poweredOff: [...PROCESSOR_IDS], overrides: {} },
}

export interface MasterBusState {
  order: ProcessorId[]
  power: Record<ProcessorId, boolean>
  params: Record<MasterBusParamId, number>
  /** Selected factory preset, or null after a manual edit. */
  preset: MasterBusPresetName | null
}

export function defaultMasterBusState(): MasterBusState {
  return applyPreset('Cheat Sheet', [...DEFAULT_PROCESSOR_ORDER])
}

export function isPresetName(value: unknown): value is MasterBusPresetName {
  return typeof value === 'string' && (MASTER_BUS_PRESET_NAMES as readonly string[]).includes(value)
}

/** Returns the complete strip state a preset produces from the given order. */
export function applyPreset(name: MasterBusPresetName, currentOrder: readonly ProcessorId[]): MasterBusState {
  const def = PRESETS[name]
  const params = defaultParamValues()
  for (const [id, value] of Object.entries(def.overrides)) {
    params[id as MasterBusParamId] = value
  }
  const power = {} as Record<ProcessorId, boolean>
  for (const id of PROCESSOR_IDS) power[id] = !def.poweredOff.includes(id)
  return {
    order: def.restoreOrder ? [...DEFAULT_PROCESSOR_ORDER] : [...currentOrder],
    power,
    params,
    preset: name,
  }
}
