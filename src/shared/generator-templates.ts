import { SAMPLE_TYPE_VALUES, type SampleType } from './sample-types'
import { isGeneratorProfileId } from './generator-profile-id'

export const GENERATOR_TEMPLATE_SCHEMA_VERSION = 1 as const
export const GENERATOR_LANE_COUNT = 16 as const

const SAMPLE_TYPES = new Set<string>(SAMPLE_TYPE_VALUES)
const LANE_ROLES = ['percussion', 'motif', 'vocal', 'atmosphere', 'transition'] as const
const PHRASE_MODES = ['sparse', 'steady', 'build', 'breakdown', 'return', 'peak', 'outro'] as const
const TRANSITION_KINDS = ['riser', 'impact'] as const
const NOTE_DIVISIONS = ['1/4', '1/8', '1/16', '1/8T', '1/16T'] as const

export type MixJamGeneratorProfileId = string
export type GeneratorLaneRole = (typeof LANE_ROLES)[number]
export type GeneratorPhraseMode = (typeof PHRASE_MODES)[number]
export type GeneratorTransitionKind = (typeof TRANSITION_KINDS)[number]

export interface GeneratorEffectProfile {
  type: 'delay' | 'reverb' | 'compressor'
  presetName: string
  values: Record<string, number | boolean | string>
}

export interface GeneratorLaneProfile {
  name: string
  types: readonly SampleType[]
  maxBars: number
  maxBeats?: number
  role: GeneratorLaneRole
  beatPattern?: readonly number[]
  beatMutation?: readonly number[]
  intentionalAnchor?: boolean
  preferLong?: boolean
  transitionKind?: GeneratorTransitionKind
  gain: number
  pan: number
  effects: readonly GeneratorEffectProfile[]
}

export interface GeneratorSectionProfile {
  name: string
  weight: number
  activeLanes: readonly number[]
  phraseMode: GeneratorPhraseMode
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
  sections: readonly GeneratorSectionProfile[]
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

function readUniqueLaneIndexes(value: unknown, source: string, path: string, allowEmpty = false): number[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(source, path, allowEmpty ? 'must be an array' : 'must be a non-empty array')
  }
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

function readEffectValues(
  type: GeneratorEffectProfile['type'], value: unknown, source: string, path: string
): Record<string, number | boolean | string> {
  const values = readRecord(value, source, path)
  if (type === 'delay') {
    rejectUnknownKeys(values, ['timeMs', 'feedback', 'mix', 'pingPong', 'tempoSync', 'noteDivision'], source, path)
    const pingPong = values.pingPong
    const tempoSync = values.tempoSync
    if (typeof pingPong !== 'boolean') fail(source, `${path}.pingPong`, 'must be a boolean')
    if (typeof tempoSync !== 'boolean') fail(source, `${path}.tempoSync`, 'must be a boolean')
    return {
      timeMs: readNumber(values, 'timeMs', source, path, 0, 2000),
      feedback: readNumber(values, 'feedback', source, path, 0, 1),
      mix: readNumber(values, 'mix', source, path, 0, 1),
      pingPong,
      tempoSync,
      noteDivision: readEnum(values, 'noteDivision', NOTE_DIVISIONS, source, path)
    }
  }
  if (type === 'reverb') {
    rejectUnknownKeys(values, ['roomSize', 'decay', 'mix'], source, path)
    return {
      roomSize: readNumber(values, 'roomSize', source, path, 0, 1),
      decay: readNumber(values, 'decay', source, path, 0, 1),
      mix: readNumber(values, 'mix', source, path, 0, 1)
    }
  }
  rejectUnknownKeys(values, ['threshold', 'ratio', 'attackMs', 'releaseMs', 'makeupGain'], source, path)
  return {
    threshold: readNumber(values, 'threshold', source, path, -60, 0),
    ratio: readNumber(values, 'ratio', source, path, 1, 20),
    attackMs: readNumber(values, 'attackMs', source, path, 0, 200),
    releaseMs: readNumber(values, 'releaseMs', source, path, 5, 3000),
    makeupGain: readNumber(values, 'makeupGain', source, path, 0, 24)
  }
}

function parseEffect(value: unknown, source: string, path: string): GeneratorEffectProfile {
  const effect = readRecord(value, source, path)
  rejectUnknownKeys(effect, ['type', 'presetName', 'values'], source, path)
  const type = readEnum(effect, 'type', ['delay', 'reverb', 'compressor'] as const, source, path)
  return {
    type,
    presetName: readString(effect, 'presetName', source, path),
    values: readEffectValues(type, effect.values, source, `${path}.values`)
  }
}

function parseLane(value: unknown, source: string, path: string): GeneratorLaneProfile {
  const lane = readRecord(value, source, path)
  rejectUnknownKeys(lane, [
    'name', 'types', 'maxBars', 'maxBeats', 'role', 'beatPattern', 'beatMutation',
    'intentionalAnchor', 'preferLong', 'transitionKind', 'gain', 'pan', 'effects'
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

  const effects = readArray(lane, 'effects', source, path)
  if (effects.length > 4) fail(source, `${path}.effects`, 'must contain at most four effects')
  const maxBeats = readOptionalNumber(lane, 'maxBeats', source, path, 1, 4, true)
  return {
    name: readString(lane, 'name', source, path),
    types,
    maxBars: readNumber(lane, 'maxBars', source, path, 1, 999, true),
    ...(maxBeats === undefined ? {} : { maxBeats }),
    role,
    ...(beatPattern ? { beatPattern } : {}),
    ...(beatMutation ? { beatMutation } : {}),
    ...(lane.intentionalAnchor === undefined ? {} : {
      intentionalAnchor: readBoolean(lane, 'intentionalAnchor', source, path, false)
    }),
    ...(lane.preferLong === undefined ? {} : {
      preferLong: readBoolean(lane, 'preferLong', source, path, false)
    }),
    ...(transitionKind ? { transitionKind } : {}),
    gain: readNumber(lane, 'gain', source, path, 0, 1),
    pan: readNumber(lane, 'pan', source, path, -1, 1),
    effects: effects.map((effect, index) => parseEffect(effect, source, `${path}.effects[${index}]`))
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

export function parseGeneratorTemplate(value: unknown, source = 'template'): GeneratorProfile {
  const path = 'template'
  const template = readRecord(value, source, path)
  rejectUnknownKeys(template, [
    '$schema', 'schemaVersion', 'id', 'label', 'version', 'order', 'default', 'bpmTolerance',
    'coreLanes', 'sections', 'lanes'
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
  const lanes = readArray(template, 'lanes', source, path)
    .map((lane, index) => parseLane(lane, source, `${path}.lanes[${index}]`))
  if (lanes.length !== GENERATOR_LANE_COUNT) {
    fail(source, `${path}.lanes`, `must contain exactly ${GENERATOR_LANE_COUNT} lanes`)
  }
  const laneNames = lanes.map((lane) => lane.name)
  if (new Set(laneNames).size !== laneNames.length) fail(source, `${path}.lanes`, 'must use unique lane names')

  const sections = readArray(template, 'sections', source, path)
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

  const coreLanes = readUniqueLaneIndexes(template.coreLanes, source, `${path}.coreLanes`)
  for (const coreLane of coreLanes) {
    if (!activeLanes.has(coreLane)) fail(source, `${path}.coreLanes`, `lane ${coreLane} is never active`)
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
    sections,
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

const bundledTemplates = import.meta.glob<unknown>(
  './generator-templates/templates/*.json',
  { eager: true, import: 'default' }
)
const registry = createGeneratorProfileRegistry(bundledTemplates)

export const GENERATOR_PROFILES = registry.profiles
export const MIXJAM_GENERATOR_PROFILE_IDS = registry.ids
export const MIXJAM_GENERATOR_PROFILE_LABELS = registry.labels
export const MIXJAM_GENERATOR_PROFILE_VERSIONS = registry.versions
export const MIXJAM_GENERATOR_DEFAULT_PROFILE_ID = registry.defaultProfileId
