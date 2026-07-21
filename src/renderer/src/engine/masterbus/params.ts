// Master Bus Strip parameter registry (spec-012 Chain Contract).
// Single source of truth shared by the DSP core, the worklet adapter, the
// rack UI, preset application, and project-format validation. Ranges and
// defaults here are the spec's numbers; changing them is a spec change.

export const PROCESSOR_IDS = [
  'clip',
  'tube',
  'subeq',
  'comp',
  'max',
  'addeq',
  'tape',
  'width',
  'mbc',
  'lim',
] as const

export type ProcessorId = (typeof PROCESSOR_IDS)[number]

/** The pinned Gain Stage plus the ten reorderable downstream processors. */
export type MasterBusModuleId = 'gain' | ProcessorId

export type MasterBusParamId =
  | 'gain.trim'
  | 'clip.amount'
  | 'clip.ceil'
  | 'tube.drive'
  | 'tube.mix'
  | 'subeq.hp'
  | 'subeq.mud'
  | 'subeq.harsh'
  | 'comp.thr'
  | 'comp.ratio'
  | 'comp.att'
  | 'comp.rel'
  | 'max.boost'
  | 'addeq.low'
  | 'addeq.air'
  | 'tape.drive'
  | 'tape.ips'
  | 'width.width'
  | 'width.mono'
  | 'mbc.lo'
  | 'mbc.mid'
  | 'mbc.hi'
  | 'lim.gain'
  | 'lim.ceil'

export interface MasterBusParamDef {
  readonly id: MasterBusParamId
  readonly processor: MasterBusModuleId
  readonly label: string
  readonly min: number
  readonly max: number
  readonly def: number
  /** Display unit; '' for unitless, 'switch' options rendered by the UI. */
  readonly unit: 'dB' | 'dBTP' | 'Hz' | 'ms' | '%' | ':1' | 'ips' | ''
  /** Decimal places for display and keyboard stepping. */
  readonly dp: number
  /** Discrete two-state switch (0/1) instead of a continuous knob. */
  readonly isSwitch?: boolean
  /** Large knob face in the rack UI. */
  readonly big?: boolean
}

export const MASTER_BUS_PARAMS: readonly MasterBusParamDef[] = [
  { id: 'gain.trim', processor: 'gain', label: 'TRIM', min: -24, max: 24, def: 0, unit: 'dB', dp: 1, big: true },
  { id: 'clip.amount', processor: 'clip', label: 'CLIP', min: 0, max: 6, def: 1.5, unit: 'dB', dp: 1, big: true },
  { id: 'clip.ceil', processor: 'clip', label: 'CEILING', min: -6, max: 0, def: -0.5, unit: 'dB', dp: 1 },
  { id: 'tube.drive', processor: 'tube', label: 'DRIVE', min: 0, max: 10, def: 2.5, unit: '', dp: 1, big: true },
  { id: 'tube.mix', processor: 'tube', label: 'MIX', min: 0, max: 100, def: 100, unit: '%', dp: 0 },
  { id: 'subeq.hp', processor: 'subeq', label: 'HP FREQ', min: 10, max: 40, def: 20, unit: 'Hz', dp: 0 },
  { id: 'subeq.mud', processor: 'subeq', label: 'MUD 250', min: -3, max: 0, def: -1.5, unit: 'dB', dp: 1 },
  { id: 'subeq.harsh', processor: 'subeq', label: 'HARSH 3K5', min: -3, max: 0, def: -1, unit: 'dB', dp: 1 },
  { id: 'comp.thr', processor: 'comp', label: 'THRESH', min: -30, max: 0, def: -16, unit: 'dB', dp: 0 },
  { id: 'comp.ratio', processor: 'comp', label: 'RATIO', min: 1.5, max: 10, def: 2, unit: ':1', dp: 1 },
  { id: 'comp.att', processor: 'comp', label: 'ATTACK', min: 0.1, max: 30, def: 10, unit: 'ms', dp: 1 },
  { id: 'comp.rel', processor: 'comp', label: 'RELEASE', min: 50, max: 1200, def: 300, unit: 'ms', dp: 0 },
  { id: 'max.boost', processor: 'max', label: 'BOOST', min: 0, max: 25, def: 10, unit: '%', dp: 0, big: true },
  { id: 'addeq.low', processor: 'addeq', label: 'LOW 90', min: 0, max: 2, def: 1, unit: 'dB', dp: 1 },
  { id: 'addeq.air', processor: 'addeq', label: 'AIR 12K', min: 0, max: 2, def: 1, unit: 'dB', dp: 1 },
  { id: 'tape.drive', processor: 'tape', label: 'DRIVE', min: 0, max: 10, def: 2, unit: '', dp: 1, big: true },
  { id: 'tape.ips', processor: 'tape', label: 'SPEED', min: 0, max: 1, def: 1, unit: 'ips', dp: 0, isSwitch: true },
  { id: 'width.width', processor: 'width', label: 'WIDTH', min: 60, max: 140, def: 105, unit: '%', dp: 0, big: true },
  { id: 'width.mono', processor: 'width', label: 'MONO BELOW', min: 60, max: 300, def: 120, unit: 'Hz', dp: 0 },
  { id: 'mbc.lo', processor: 'mbc', label: 'LOW', min: 0, max: 100, def: 20, unit: '%', dp: 0 },
  { id: 'mbc.mid', processor: 'mbc', label: 'MID', min: 0, max: 100, def: 15, unit: '%', dp: 0 },
  { id: 'mbc.hi', processor: 'mbc', label: 'HIGH', min: 0, max: 100, def: 20, unit: '%', dp: 0 },
  { id: 'lim.gain', processor: 'lim', label: 'GAIN', min: 0, max: 12, def: 4, unit: 'dB', dp: 1, big: true },
  { id: 'lim.ceil', processor: 'lim', label: 'CEILING', min: -3, max: 0, def: -1, unit: 'dBTP', dp: 1 },
] as const

const PARAM_BY_ID: ReadonlyMap<MasterBusParamId, MasterBusParamDef> = new Map(
  MASTER_BUS_PARAMS.map((p) => [p.id, p]),
)

export type MasterBusParamValues = Record<MasterBusParamId, number>

export function defaultParamValues(): MasterBusParamValues {
  const values = {} as MasterBusParamValues
  for (const p of MASTER_BUS_PARAMS) values[p.id] = p.def
  return values
}

export function clampParamValue(id: MasterBusParamId, value: number): number {
  const def = PARAM_BY_ID.get(id)
  if (!def || !Number.isFinite(value)) return def ? def.def : 0
  const clamped = Math.min(def.max, Math.max(def.min, value))
  return def.isSwitch ? Math.round(clamped) : clamped
}

/** Default order for the ten reorderable processors in slots 03..12. */
export const DEFAULT_PROCESSOR_ORDER: readonly ProcessorId[] = [
  'clip',
  'tube',
  'subeq',
  'comp',
  'max',
  'addeq',
  'tape',
  'width',
  'mbc',
  'lim',
]

export function isProcessorId(value: unknown): value is ProcessorId {
  return typeof value === 'string' && (PROCESSOR_IDS as readonly string[]).includes(value)
}

export function isValidProcessorOrder(order: readonly unknown[]): order is ProcessorId[] {
  if (order.length !== PROCESSOR_IDS.length) return false
  const seen = new Set<string>()
  for (const id of order) {
    if (!isProcessorId(id) || seen.has(id)) return false
    seen.add(id)
  }
  return true
}
