import { SAMPLE_TYPE_VALUES, type SampleType } from './sample-types'
import { isGeneratorProfileId } from './generator-profile-id'
import { BUNDLED_GENERATOR_TEMPLATE_SOURCES } from './generator-template-sources'
import type { MixJamGeneratorProfileId } from './backend-api'

const GENERATOR_TEMPLATE_SCHEMA_VERSION = 2 as const
const GENERATOR_LANE_COUNT = 16 as const
const MAX_RETURN_BUSES = 2 as const
/** Non-pair lane position cap. Stereo *side* still needs pair evidence; this is
 *  mix position, which the template owns (spec-021 §Pan). */
export const MAX_TEMPLATE_PAN = 0.35
/** Cap for an evidence-backed mirror pair, applied by the engine, not the JSON. */

const SAMPLE_TYPES = new Set<string>(SAMPLE_TYPE_VALUES)
const LANE_ROLES = ['percussion', 'motif', 'vocal', 'atmosphere', 'transition'] as const
// Three shapes, because there are only three behaviours: ramp optional lanes in,
// hold the section's lane set, ramp them out. Everything a "breakdown" or "peak"
// used to imply is now stated directly by that section's active-lane set.
const PHRASE_MODES = ['build', 'steady', 'outro'] as const
const TRANSITION_KINDS = ['riser', 'impact'] as const
const RETURN_MODULES = ['aetherform-reverb', 'echoform-delay'] as const
const BOUNDARY_OPS = ['swap', 'roll', 'tail', 'rest'] as const

export type { MixJamGeneratorProfileId }
export type GeneratorLaneRole = (typeof LANE_ROLES)[number]
export type GeneratorPhraseMode = (typeof PHRASE_MODES)[number]
export type GeneratorTransitionKind = (typeof TRANSITION_KINDS)[number]
export type GeneratorReturnModule = (typeof RETURN_MODULES)[number]
export type GeneratorBoundaryOpKind = (typeof BOUNDARY_OPS)[number]

export interface GeneratorLaneProfile {
  name: string
  types: readonly SampleType[]
  maxBars: number
  maxBeats?: number
  role: GeneratorLaneRole
  beatPattern?: readonly number[]
  beatMutation?: readonly number[]
  preferLong?: boolean
  transitionKind?: GeneratorTransitionKind
  gain: number
  pan: number
  /** Send level into each declared return bus, in `returns` order. */
  sends: readonly number[]
}

export interface GeneratorSectionProfile {
  name: string
  weight: number
  activeLanes: readonly number[]
  phraseMode: GeneratorPhraseMode
}

/**
 * A boundary accent. Ops are declarative records addressing sections by name,
 * so a template stays duration-independent — the engine resolves names to bars
 * after section allocation. No op takes an expression or a condition.
 */
export interface GeneratorBoundaryOp {
  op: GeneratorBoundaryOpKind
  lane: number
  /** Section this op attaches to. `swap`, `roll` and `tail` fire at its start. */
  at?: string
  /** `rest` spans sections `from`..`to` inclusive. */
  from?: string
  to?: string
  /** `roll` only: bars of accelerating ramp before the boundary. */
  bars?: number
}

export interface GeneratorArcProfile {
  name: string
  sections: readonly GeneratorSectionProfile[]
  ops: readonly GeneratorBoundaryOp[]
}

export interface GeneratorReturnProfile {
  module: GeneratorReturnModule
  preset: string
  returnLevel: number
}

export interface GeneratorProfile {
  schemaVersion: typeof GENERATOR_TEMPLATE_SCHEMA_VERSION
  id: MixJamGeneratorProfileId
  label: string
  version: number
  order: number
  default: boolean
  bpmTolerance: number
  coreLanes: readonly number[]
  returns: readonly GeneratorReturnProfile[]
  arcs: readonly GeneratorArcProfile[]
  lanes: readonly GeneratorLaneProfile[]
}

interface GeneratorProfileRegistry {
  profiles: Readonly<Record<MixJamGeneratorProfileId, GeneratorProfile>>
  ids: readonly MixJamGeneratorProfileId[]
  labels: Readonly<Record<MixJamGeneratorProfileId, string>>
  versions: Readonly<Record<MixJamGeneratorProfileId, number>>
  defaultProfileId: MixJamGeneratorProfileId
}

function fail(source: string, path: string, message: string): never {
  throw new Error(`Invalid generator template ${source} at ${path}: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown, source: string, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(source, path, 'must be an object')
  return value
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  source: string,
  path: string
): void {
  const allowedKeys = new Set(allowed)
  const unknown = Object.keys(record).find((key) => !allowedKeys.has(key))
  if (unknown) fail(source, `${path}.${unknown}`, 'is not a supported field')
}

function readString(record: Record<string, unknown>, key: string, source: string, path: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') fail(source, `${path}.${key}`, 'must be a non-empty string')
  return value
}

function readBoolean(
  record: Record<string, unknown>, key: string, source: string, path: string, fallback: boolean
): boolean {
  const value = record[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') fail(source, `${path}.${key}`, 'must be a boolean')
  return value
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  source: string,
  path: string,
  minimum: number,
  maximum: number,
  integer = false
): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    const kind = integer ? 'integer' : 'number'
    fail(source, `${path}.${key}`, `must be a ${kind} from ${minimum} to ${maximum}`)
  }
  return value
}

function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
  source: string,
  path: string,
  minimum: number,
  maximum: number,
  integer = false
): number | undefined {
  if (record[key] === undefined) return undefined
  return readNumber(record, key, source, path, minimum, maximum, integer)
}

function readEnum<T extends string>(
  record: Record<string, unknown>, key: string, values: readonly T[], source: string, path: string
): T {
  const value = record[key]
  if (typeof value !== 'string' || !values.includes(value as T)) {
    fail(source, `${path}.${key}`, `must be one of ${values.join(', ')}`)
  }
  return value as T
}

function readArray(record: Record<string, unknown>, key: string, source: string, path: string): unknown[] {
  const value = record[key]
  if (!Array.isArray(value)) fail(source, `${path}.${key}`, 'must be an array')
  return value
}

function readUniqueLaneIndexes(value: unknown, source: string, path: string): number[] {
  if (!Array.isArray(value) || value.length === 0) fail(source, path, 'must be a non-empty array')
  const lanes = value.map((lane, index) => {
    if (!Number.isInteger(lane) || (lane as number) < 0 || (lane as number) >= GENERATOR_LANE_COUNT) {
      fail(source, `${path}[${index}]`, `must be an integer from 0 to ${GENERATOR_LANE_COUNT - 1}`)
    }
    return lane as number
  })
  if (new Set(lanes).size !== lanes.length) fail(source, path, 'must not contain duplicate lane indexes')
  return lanes
}

function readBeatOffsets(value: unknown, source: string, path: string): number[] {
  if (!Array.isArray(value) || value.length === 0) fail(source, path, 'must be a non-empty array')
  const offsets = value.map((offset, index) => {
    if (!Number.isInteger(offset) || (offset as number) < 0 || (offset as number) > 31) {
      fail(source, `${path}[${index}]`, 'must be an integer from 0 to 31')
    }
    return offset as number
  })
  if (new Set(offsets).size !== offsets.length) fail(source, path, 'must not contain duplicate offsets')
  return offsets
}

function readSends(value: unknown, source: string, path: string, returnCount: number): number[] {
  if (!Array.isArray(value)) fail(source, path, 'must be an array')
  if (value.length !== returnCount) fail(source, path, `must hold one level per return bus (${returnCount})`)
  return value.map((send, index) => {
    if (typeof send !== 'number' || !Number.isFinite(send) || send < 0 || send > 1) {
      fail(source, `${path}[${index}]`, 'must be a number from 0 to 1')
    }
    return send as number
  })
}

function parseLane(value: unknown, source: string, path: string, returnCount: number): GeneratorLaneProfile {
  const lane = readRecord(value, source, path)
  rejectUnknownKeys(lane, [
    'name', 'types', 'maxBars', 'maxBeats', 'role', 'beatPattern', 'beatMutation',
    'preferLong', 'transitionKind', 'gain', 'pan', 'sends'
  ], source, path)
  const types = readArray(lane, 'types', source, path).map((type, index) => {
    if (typeof type !== 'string' || !SAMPLE_TYPES.has(type)) {
      fail(source, `${path}.types[${index}]`, `must be one of ${SAMPLE_TYPE_VALUES.join(', ')}`)
    }
    return type as SampleType
  })
  if (types.length === 0) fail(source, `${path}.types`, 'must contain at least one sample type')
  if (new Set(types).size !== types.length) fail(source, `${path}.types`, 'must not contain duplicate sample types')

  const role = readEnum(lane, 'role', LANE_ROLES, source, path)
  const beatPattern = lane.beatPattern === undefined
    ? undefined
    : readBeatOffsets(lane.beatPattern, source, `${path}.beatPattern`)
  const beatMutation = lane.beatMutation === undefined
    ? undefined
    : readBeatOffsets(lane.beatMutation, source, `${path}.beatMutation`)
  const transitionKind = lane.transitionKind === undefined
    ? undefined
    : readEnum(lane, 'transitionKind', TRANSITION_KINDS, source, path)
  if (role === 'percussion' && !beatPattern) fail(source, `${path}.beatPattern`, 'is required for a percussion lane')
  if (role !== 'percussion' && (beatPattern || beatMutation)) {
    fail(source, path, 'beat patterns are supported only for percussion lanes')
  }
  if (role === 'transition' && !transitionKind) fail(source, `${path}.transitionKind`, 'is required for a transition lane')
  if (role !== 'transition' && transitionKind) fail(source, `${path}.transitionKind`, 'is supported only for transition lanes')

  const maxBeats = readOptionalNumber(lane, 'maxBeats', source, path, 1, 4, true)
  return {
    name: readString(lane, 'name', source, path),
    types,
    maxBars: readNumber(lane, 'maxBars', source, path, 1, 999, true),
    ...(maxBeats === undefined ? {} : { maxBeats }),
    role,
    ...(beatPattern ? { beatPattern } : {}),
    ...(beatMutation ? { beatMutation } : {}),
    ...(lane.preferLong === undefined ? {} : {
      preferLong: readBoolean(lane, 'preferLong', source, path, false)
    }),
    ...(transitionKind ? { transitionKind } : {}),
    gain: readNumber(lane, 'gain', source, path, 0, 1),
    pan: readNumber(lane, 'pan', source, path, -MAX_TEMPLATE_PAN, MAX_TEMPLATE_PAN),
    sends: readSends(lane.sends, source, `${path}.sends`, returnCount)
  }
}

function parseSection(value: unknown, source: string, path: string): GeneratorSectionProfile {
  const section = readRecord(value, source, path)
  rejectUnknownKeys(section, ['name', 'weight', 'activeLanes', 'phraseMode'], source, path)
  return {
    name: readString(section, 'name', source, path),
    weight: readNumber(section, 'weight', source, path, 1, 100, true),
    activeLanes: readUniqueLaneIndexes(section.activeLanes, source, `${path}.activeLanes`),
    phraseMode: readEnum(section, 'phraseMode', PHRASE_MODES, source, path)
  }
}

function parseBoundaryOp(
  value: unknown, source: string, path: string, sectionNames: ReadonlySet<string>
): GeneratorBoundaryOp {
  const record = readRecord(value, source, path)
  rejectUnknownKeys(record, ['op', 'lane', 'at', 'from', 'to', 'bars'], source, path)
  const op = readEnum(record, 'op', BOUNDARY_OPS, source, path)
  const lane = readNumber(record, 'lane', source, path, 0, GENERATOR_LANE_COUNT - 1, true)
  const requireSection = (key: 'at' | 'from' | 'to'): string => {
    const name = readString(record, key, source, path)
    if (!sectionNames.has(name)) fail(source, `${path}.${key}`, 'must name a section in this arc')
    return name
  }
  if (op === 'rest') {
    if (record.at !== undefined) fail(source, `${path}.at`, 'is not supported for a rest op; use from and to')
    const from = requireSection('from')
    const to = requireSection('to')
    return { op, lane, from, to }
  }
  if (record.from !== undefined || record.to !== undefined) {
    fail(source, path, 'only a rest op spans a section range')
  }
  const at = requireSection('at')
  if (op === 'roll') {
    return { op, lane, at, bars: readOptionalNumber(record, 'bars', source, path, 1, 4, true) ?? 2 }
  }
  if (record.bars !== undefined) fail(source, `${path}.bars`, 'is supported only for a roll op')
  return { op, lane, at }
}

function parseArc(
  value: unknown, source: string, path: string, lanes: readonly GeneratorLaneProfile[]
): GeneratorArcProfile {
  const arc = readRecord(value, source, path)
  rejectUnknownKeys(arc, ['name', 'sections', 'ops'], source, path)
  const sections = readArray(arc, 'sections', source, path)
    .map((section, index) => parseSection(section, source, `${path}.sections[${index}]`))
  if (sections.length === 0) fail(source, `${path}.sections`, 'must contain at least one section')
  const sectionNames = sections.map((section) => section.name)
  if (new Set(sectionNames).size !== sectionNames.length) fail(source, `${path}.sections`, 'must use unique section names')
  if (sections.reduce((sum, section) => sum + section.weight, 0) !== 100) {
    fail(source, `${path}.sections`, 'weights must sum to 100')
  }
  const activeLanes = new Set(sections.flatMap((section) => section.activeLanes))
  if (activeLanes.size !== GENERATOR_LANE_COUNT) {
    fail(source, `${path}.sections`, `must activate every lane from 0 to ${GENERATOR_LANE_COUNT - 1}`)
  }

  const names = new Set(sectionNames)
  const ops = (arc.ops === undefined ? [] : readArray(arc, 'ops', source, path))
    .map((op, index) => parseBoundaryOp(op, source, `${path}.ops[${index}]`, names))
  for (const [index, op] of ops.entries()) {
    const lane = lanes[op.lane]!
    if (op.op === 'roll' && lane.role !== 'percussion') {
      fail(source, `${path}.ops[${index}].lane`, 'a roll op needs a percussion lane')
    }
    if (op.op === 'tail' && lane.role === 'percussion') {
      fail(source, `${path}.ops[${index}].lane`, 'a tail op needs a sustained lane')
    }
  }
  return { name: readString(arc, 'name', source, path), sections, ops }
}

function parseReturn(value: unknown, source: string, path: string): GeneratorReturnProfile {
  const bus = readRecord(value, source, path)
  rejectUnknownKeys(bus, ['module', 'preset', 'returnLevel'], source, path)
  return {
    module: readEnum(bus, 'module', RETURN_MODULES, source, path),
    // Preset names are owned by spec-010 and spec-013; the engine resolves the
    // name and throws if the shipped preset list no longer has it, so the
    // template never duplicates module state.
    preset: readString(bus, 'preset', source, path),
    returnLevel: readNumber(bus, 'returnLevel', source, path, 0, 1)
  }
}

export function parseGeneratorTemplate(value: unknown, source = 'template'): GeneratorProfile {
  const path = 'template'
  const template = readRecord(value, source, path)
  rejectUnknownKeys(template, [
    '$schema', 'schemaVersion', 'id', 'label', 'version', 'order', 'default', 'bpmTolerance',
    'coreLanes', 'returns', 'arcs', 'lanes'
  ], source, path)
  if (template.$schema !== undefined && typeof template.$schema !== 'string') {
    fail(source, `${path}.$schema`, 'must be a string')
  }
  const schemaVersion = readNumber(
    template, 'schemaVersion', source, path,
    GENERATOR_TEMPLATE_SCHEMA_VERSION, GENERATOR_TEMPLATE_SCHEMA_VERSION, true
  ) as typeof GENERATOR_TEMPLATE_SCHEMA_VERSION
  const id = readString(template, 'id', source, path)
  if (!isGeneratorProfileId(id)) {
    fail(source, `${path}.id`, 'must be a lowercase slug containing letters, numbers, and single hyphens')
  }
  const label = readString(template, 'label', source, path)
  if (label.length > 64) fail(source, `${path}.label`, 'must contain at most 64 characters')

  const returns = readArray(template, 'returns', source, path)
    .map((bus, index) => parseReturn(bus, source, `${path}.returns[${index}]`))
  if (returns.length > MAX_RETURN_BUSES) {
    fail(source, `${path}.returns`, `must declare at most ${MAX_RETURN_BUSES} return buses`)
  }
  const modules = returns.map((bus) => bus.module)
  if (new Set(modules).size !== modules.length) {
    fail(source, `${path}.returns`, 'must not declare the same module twice')
  }

  const lanes = readArray(template, 'lanes', source, path)
    .map((lane, index) => parseLane(lane, source, `${path}.lanes[${index}]`, returns.length))
  if (lanes.length !== GENERATOR_LANE_COUNT) {
    fail(source, `${path}.lanes`, `must contain exactly ${GENERATOR_LANE_COUNT} lanes`)
  }
  const laneNames = lanes.map((lane) => lane.name)
  if (new Set(laneNames).size !== laneNames.length) fail(source, `${path}.lanes`, 'must use unique lane names')

  const arcs = readArray(template, 'arcs', source, path)
    .map((arc, index) => parseArc(arc, source, `${path}.arcs[${index}]`, lanes))
  if (arcs.length === 0) fail(source, `${path}.arcs`, 'must contain at least one section arc')
  const arcNames = arcs.map((arc) => arc.name)
  if (new Set(arcNames).size !== arcNames.length) fail(source, `${path}.arcs`, 'must use unique arc names')

  const coreLanes = readUniqueLaneIndexes(template.coreLanes, source, `${path}.coreLanes`)
  for (const arc of arcs) {
    const active = new Set(arc.sections.flatMap((section) => section.activeLanes))
    for (const coreLane of coreLanes) {
      if (!active.has(coreLane)) fail(source, `${path}.coreLanes`, `lane ${coreLane} is never active in arc ${arc.name}`)
    }
  }
  return {
    schemaVersion,
    id,
    label,
    version: readNumber(template, 'version', source, path, 1, Number.MAX_SAFE_INTEGER, true),
    order: readOptionalNumber(template, 'order', source, path, 0, Number.MAX_SAFE_INTEGER, true) ?? 1000,
    default: readBoolean(template, 'default', source, path, false),
    bpmTolerance: readNumber(template, 'bpmTolerance', source, path, 0, 60),
    coreLanes,
    returns,
    arcs,
    lanes
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

export function createGeneratorProfileRegistry(sources: Readonly<Record<string, unknown>>): GeneratorProfileRegistry {
  const parsed = Object.entries(sources).map(([source, value]) => {
    const profile = parseGeneratorTemplate(value, source)
    const filename = source.replace(/\\/g, '/').split('/').pop()
    const filenameId = filename?.endsWith('.json') ? filename.slice(0, -'.json'.length) : null
    if (!filenameId || profile.id !== filenameId) {
      fail(source, 'template.id', 'must match the JSON filename')
    }
    return profile
  })
  if (parsed.length === 0) throw new Error('No bundled generator templates were found.')
  const ids = new Set<string>()
  for (const profile of parsed) {
    if (ids.has(profile.id)) throw new Error(`Duplicate generator template id: ${profile.id}`)
    ids.add(profile.id)
  }
  const defaults = parsed.filter((profile) => profile.default)
  if (defaults.length > 1) throw new Error('Only one bundled generator template may be the default.')
  parsed.sort((left, right) => left.order - right.order || left.label.localeCompare(right.label) || left.id.localeCompare(right.id))

  const profiles: Record<string, GeneratorProfile> = {}
  const labels: Record<string, string> = {}
  const versions: Record<string, number> = {}
  for (const profile of parsed) {
    profiles[profile.id] = deepFreeze(profile)
    labels[profile.id] = profile.label
    versions[profile.id] = profile.version
  }
  return deepFreeze({
    profiles,
    ids: parsed.map((profile) => profile.id),
    labels,
    versions,
    defaultProfileId: defaults[0]?.id ?? parsed[0]!.id
  })
}

const registry = createGeneratorProfileRegistry(BUNDLED_GENERATOR_TEMPLATE_SOURCES)

export const GENERATOR_PROFILES = registry.profiles
export const MIXJAM_GENERATOR_PROFILE_IDS = registry.ids
export const MIXJAM_GENERATOR_PROFILE_LABELS = registry.labels
export const MIXJAM_GENERATOR_PROFILE_VERSIONS = registry.versions
export const MIXJAM_GENERATOR_DEFAULT_PROFILE_ID = registry.defaultProfileId
