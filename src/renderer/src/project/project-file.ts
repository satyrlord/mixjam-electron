import { isReturnModule, RETURN_BUS_COUNT, type ReturnModule } from '../engine/return-effects'
import {
  TRACKER_TOTAL_TICKS
} from '../lib/arrangement'
import {
  MAX_CLIP_EDGE_FADE_MS,
  MIN_CLIP_EDGE_FADE_MS
} from '../engine/clip-edge-fades'
import {
  MASTER_BUS_PARAMS,
  PROCESSOR_IDS,
  isValidProcessorOrder,
  type MasterBusParamId,
  type ProcessorId
} from '../engine/masterbus/params'
import {
  MASTER_BUS_PRESET_NAMES,
  isPresetName,
  type MasterBusState
} from '../engine/masterbus/presets'
import {
  cloneProjectSongState,
  cloneProjectFxBuses,
  type ClipPlacement,
  type LaneState,
  type ProjectFxBuses,
  type ProjectState,
  type ProjectSongState,
} from './project-state'
import {
  MIXJAM_GENERATOR_BPM_MODES,
  MIXJAM_GENERATOR_INTENSITIES,
  SAFE_GENERATOR_TOKEN,
  isSafeAnalysisGroupKey,
  type MixJamGeneratorBpmMode,
  type MixJamGeneratorIntensity,
  type MixJamGeneratorProfileId
} from '../../../shared/backend-api'
import { isGeneratorProfileId } from '../../../shared/generator-profile-id'

const PROJECT_FORMAT_VERSION = 6
export const NEWER_PROJECT_VERSION_MESSAGE =
  'This project was created with a newer version of MixJam. Please update the app.'

const MIN_LANES = 1
const MAX_LANES = 64

export type GeneratorProfileId = MixJamGeneratorProfileId
export type GeneratorBpmMode = MixJamGeneratorBpmMode
export type GeneratorIntensity = MixJamGeneratorIntensity

export interface GeneratorParameters {
  bpmMode: GeneratorBpmMode
  resolvedBpm: number
  tempoClusterPrefix?: string
  intensity: GeneratorIntensity
  durationSeconds: number
}

export interface ProjectGeneratorMetadata {
  generatorVersion: number
  profileId: GeneratorProfileId
  profileVersion: number
  seed: string
  parameters: GeneratorParameters
  corpusFingerprint: string
  sampleFolderKey: string
}

export interface ProjectData extends ProjectState {
  generator?: ProjectGeneratorMetadata
}

export interface ProjectDocument extends ProjectData {
  fxBuses: ProjectFxBuses
  formatVersion: typeof PROJECT_FORMAT_VERSION
  appVersion: string
  createdAt: string
  modifiedAt: string
}

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectFileError'
  }
}

interface ProjectPlacementRecord {
  id: string
  sampleRef: string
  sampleName: string
  nativeBPM: number | null
  startTick: number
  durationTicks: number
  durationSeconds: number | null
  slot: number | null
}

interface ProjectLaneRecord {
  id: string
  name: string
  gain: number
  muted: boolean
  solo: boolean
  pan: number
  sends: [number, number, number, number]
  placements: ProjectPlacementRecord[]
}

interface ProjectFxBusRecord {
  id: `fx-${1 | 2 | 3 | 4}`
  index: 0 | 1 | 2 | 3
  name: `FX${1 | 2 | 3 | 4}`
  module: ReturnModule
  powered: boolean
  returnLevel: number
  limiterEnabled: boolean
}

interface ProjectDocumentRecord {
  formatVersion: typeof PROJECT_FORMAT_VERSION
  appVersion: string
  createdAt: string
  modifiedAt: string
  song: ProjectSongState
  lanes: ProjectLaneRecord[]
  fxBuses: [ProjectFxBusRecord, ProjectFxBusRecord, ProjectFxBusRecord, ProjectFxBusRecord]
  masterBus: MasterBusState
  generator?: ProjectGeneratorMetadata
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(path: string, expectation: string): never {
  throw new ProjectFileError(`Invalid MixJam project: ${path} ${expectation}.`)
}

function readString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim() !== value) fail(`${path}.${key}`, 'must be a non-empty trimmed string')
  return value
}

function readBoolean(record: Record<string, unknown>, key: string, path: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') fail(`${path}.${key}`, 'must be a boolean')
  return value
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number
): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${path}.${key}`, `must be a finite number from ${minimum} to ${maximum}`)
  }
  return value
}

function readInteger(
  record: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number
): number {
  const value = readNumber(record, key, path, minimum, maximum)
  if (!Number.isInteger(value)) fail(`${path}.${key}`, 'must be an integer')
  return value
}

function readNullableNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number
): number | null {
  if (record[key] === null) return null
  return readNumber(record, key, path, minimum, maximum)
}

function readIsoTimestamp(record: Record<string, unknown>, key: string): string {
  const value = readString(record, key, 'project')
  if (Number.isNaN(Date.parse(value))) fail(`project.${key}`, 'must be an ISO timestamp')
  return value
}

function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  values: readonly T[]
): T {
  const value = record[key]
  if (typeof value !== 'string' || !values.includes(value as T)) {
    fail(`${path}.${key}`, `must be one of ${values.join(', ')}`)
  }
  return value as T
}

function readSafeGeneratorToken(record: Record<string, unknown>, key: string, path: string): string {
  const value = readString(record, key, path)
  if (!SAFE_GENERATOR_TOKEN.test(value)) {
    fail(`${path}.${key}`, 'must contain only ASCII letters, numbers, underscores, or hyphens')
  }
  return value
}

function readGeneratorSeed(record: Record<string, unknown>, path: string): string {
  const seed = readSafeGeneratorToken(record, 'seed', path)
  if (seed.length > 64) fail(`${path}.seed`, 'must contain at most 64 characters')
  return seed
}

function assertKeys(record: Record<string, unknown>, path: string, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, 'is not supported')
  }
}

function readGeneratorProfileId(record: Record<string, unknown>, path: string): GeneratorProfileId {
  const value = record.profileId
  if (!isGeneratorProfileId(value)) {
    fail(`${path}.profileId`, 'must be a lowercase profile slug containing at most 64 characters')
  }
  return value
}

function readAnalysisGroupKey(record: Record<string, unknown>, path: string): string {
  const value = record.tempoClusterPrefix
  if (typeof value !== 'string' || !isSafeAnalysisGroupKey(value)) {
    fail(`${path}.tempoClusterPrefix`, 'must be a safe relative analysis-group key')
  }
  return value
}

function parseGenerator(value: unknown): ProjectGeneratorMetadata {
  const path = 'project.generator'
  if (!isRecord(value)) fail(path, 'must be an object')
  assertKeys(value, path, ['generatorVersion', 'profileId', 'profileVersion', 'seed', 'parameters', 'corpusFingerprint', 'sampleFolderKey'])
  if (!isRecord(value.parameters)) fail(`${path}.parameters`, 'must be an object')
  assertKeys(value.parameters, `${path}.parameters`, ['bpmMode', 'resolvedBpm', 'tempoClusterPrefix', 'intensity', 'durationSeconds'])

  return {
    generatorVersion: readInteger(value, 'generatorVersion', path, 1, Number.MAX_SAFE_INTEGER),
    profileId: readGeneratorProfileId(value, path),
    profileVersion: readInteger(value, 'profileVersion', path, 1, Number.MAX_SAFE_INTEGER),
    seed: readGeneratorSeed(value, path),
    parameters: {
      bpmMode: readEnum(value.parameters, 'bpmMode', `${path}.parameters`, MIXJAM_GENERATOR_BPM_MODES),
      resolvedBpm: readInteger(value.parameters, 'resolvedBpm', `${path}.parameters`, 60, 180),
      ...(value.parameters.tempoClusterPrefix !== undefined
        ? { tempoClusterPrefix: readAnalysisGroupKey(value.parameters, `${path}.parameters`) }
        : {}),
      intensity: readEnum(value.parameters, 'intensity', `${path}.parameters`, MIXJAM_GENERATOR_INTENSITIES),
      durationSeconds: readInteger(value.parameters, 'durationSeconds', `${path}.parameters`, 30, 600)
    },
    corpusFingerprint: readSafeGeneratorToken(value, 'corpusFingerprint', path),
    sampleFolderKey: readString(value, 'sampleFolderKey', path)
  }
}

function cloneGenerator(generator: ProjectGeneratorMetadata): ProjectGeneratorMetadata {
  return {
    ...generator,
    parameters: { ...generator.parameters }
  }
}

export function isProjectRelativePath(value: string): boolean {
  if (!value || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

function readSampleRef(record: Record<string, unknown>, path: string): string {
  const value = readString(record, 'sampleRef', path)
  if (!isProjectRelativePath(value)) fail(`${path}.sampleRef`, 'must be a safe Sample Folder-relative path')
  return value
}

function serializePlacement(placement: ClipPlacement): ProjectPlacementRecord {
  return {
    id: placement.id,
    sampleRef: placement.samplePath,
    sampleName: placement.sampleName,
    nativeBPM: placement.nativeBPM ?? null,
    startTick: placement.startTick,
    durationTicks: placement.durationTicks,
    durationSeconds: placement.durationSeconds,
    slot: placement.slot ?? null
  }
}

/** Rebuild the strip record in registry key order so serialized documents and
 * fingerprints are canonical regardless of in-memory key order. */
function serializeMasterBus(masterBus: MasterBusState): MasterBusState {
  const power = {} as Record<ProcessorId, boolean>
  for (const processorId of PROCESSOR_IDS) power[processorId] = masterBus.power[processorId]
  const params = {} as Record<MasterBusParamId, number>
  for (const def of MASTER_BUS_PARAMS) params[def.id] = masterBus.params[def.id]
  return {
    order: [...masterBus.order],
    power,
    params,
    preset: masterBus.preset
  }
}

function toDocumentRecord(
  project: ProjectData,
  metadata: Pick<ProjectDocument, 'appVersion' | 'createdAt' | 'modifiedAt'>
): ProjectDocumentRecord {
  if (project.fxBuses.length !== RETURN_BUS_COUNT) {
    throw new Error(`Project state must contain exactly ${RETURN_BUS_COUNT} return buses.`)
  }
  const lanes = [...project.lanes]
    .sort((left, right) => left.index - right.index)
    .map((lane): ProjectLaneRecord => {
      return {
        id: lane.id,
        name: lane.name,
        gain: lane.gain,
        muted: lane.muted,
        solo: lane.solo,
        pan: lane.pan,
        sends: [...lane.sends],
        placements: [...lane.placements]
          .sort((left, right) => left.startTick - right.startTick || left.id.localeCompare(right.id))
          .map(serializePlacement)
      }
    })

  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    appVersion: metadata.appVersion,
    createdAt: metadata.createdAt,
    modifiedAt: metadata.modifiedAt,
    song: cloneProjectSongState(project.song),
    lanes,
    fxBuses: cloneProjectFxBuses(project.fxBuses).map((bus) => ({
      id: bus.id,
      index: bus.index,
      name: bus.name,
      module: bus.module.type === 'empty'
        ? { type: 'empty' as const }
        : { ...bus.module, id: undefined },
      powered: bus.powered,
      returnLevel: bus.returnLevel,
      limiterEnabled: bus.limiterEnabled
    })) as ProjectDocumentRecord['fxBuses'],
    masterBus: serializeMasterBus(project.masterBus),
    ...(project.generator === undefined ? {} : { generator: cloneGenerator(project.generator) })
  }
}

export function projectFingerprint(project: ProjectData): string {
  return JSON.stringify(toDocumentRecord(project, {
    appVersion: '',
    createdAt: '',
    modifiedAt: ''
  }))
}

export function serializeProject(
  project: ProjectData,
  metadata: Pick<ProjectDocument, 'appVersion' | 'createdAt' | 'modifiedAt'>
): string {
  return `${JSON.stringify(toDocumentRecord(project, metadata), null, 2)}\n`
}

const ECHOFORM_DELAY_NOTE_DIVISIONS = new Set([
  '1/1', '1/1.', '1/1T', '1/2', '1/2.', '1/2T', '1/4', '1/4.', '1/4T',
  '1/8', '1/8.', '1/8T', '1/16', '1/16.', '1/16T'
])

/** Map a legacy native-delay note division onto the Echoform division set. */
function migrateDelayDivision(value: unknown): string {
  // Legacy set was 1/4 1/8 1/16 1/8T 1/16T. Triplets used the `T` suffix,
  // which the new set keeps; straight values are already valid.
  return typeof value === 'string' && ECHOFORM_DELAY_NOTE_DIVISIONS.has(value) ? value : '1/4'
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

/**
 * Convert a legacy native `delay` FX module into an Echoform `echoform-delay`
 * module, mapping semantically equivalent values and applying Echoform
 * defaults for fields the old module never had (spec §23). A single old time
 * seeds both L and R; feedback/mode/timing/ping-pong carry over.
 */
function migrateLegacyDelayModule(module: Record<string, unknown>): Record<string, unknown> {
  const mode = module.mode === 'sync' ? 'sync' : 'free'
  const timeMs = clampNumber(module.timeMs, 1, 2000, 420)
  const division = migrateDelayDivision(module.noteDivision)
  // Old feedback was 0–75%; Echoform feedback is 0–110%. Preserve the value.
  const feedback = clampNumber(module.feedback, 0, 110, 68)
  return {
    type: 'echoform-delay',
    mode,
    divisionL: division,
    divisionR: division,
    timeMsL: timeMs,
    timeMsR: timeMs,
    feedback,
    pingPong: typeof module.pingPong === 'boolean' ? module.pingPong : true,
    width: 142,
    lowCut: 160,
    highCut: 7800,
    modRate: 0.38,
    // Old "tapeDistortion" implied a tape character but wasn't a mod depth.
    modDepth: 5.4,
    character: 'tape',
    duckAmount: 34,
    duckRelease: 620,
    outputDb: -1.5,
    freeze: false,
    bypass: false
  }
}

/**
 * Normalize a pre-release `opus-delay` sketch module onto the current Echoform
 * shape: rename the type, drop the removed `link`/`mix` fields, and re-clamp
 * ranges that widened. This shape never shipped, but keeping the migration
 * total means any stray sketch file still loads cleanly.
 */
function migrateSketchEchoformDelayModule(module: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...module, type: 'echoform-delay' }
  delete next.link
  delete next.mix
  next.divisionL = typeof module.divisionL === 'string' && ECHOFORM_DELAY_NOTE_DIVISIONS.has(module.divisionL)
    ? module.divisionL : '1/4'
  next.divisionR = typeof module.divisionR === 'string' && ECHOFORM_DELAY_NOTE_DIVISIONS.has(module.divisionR)
    ? module.divisionR : '1/8.'
  next.timeMsL = clampNumber(module.timeMsL, 1, 2000, 420)
  next.timeMsR = clampNumber(module.timeMsR, 1, 2000, 610)
  next.feedback = clampNumber(module.feedback, 0, 110, 68)
  next.width = clampNumber(module.width, 0, 200, 142)
  next.lowCut = clampNumber(module.lowCut, 20, 2000, 160)
  next.highCut = clampNumber(module.highCut, 1000, 20000, 7800)
  next.modRate = clampNumber(module.modRate, 0.05, 8, 0.38)
  next.modDepth = clampNumber(module.modDepth, 0, 20, 5.4)
  next.duckRelease = clampNumber(module.duckRelease, 50, 2500, 620)
  next.outputDb = clampNumber(module.outputDb, -24, 6, -1.5)
  return next
}

/** Transform a v5 FX-bus record's module in place, returning a new record. */
function migrateFxBusV5ToV6(bus: unknown): unknown {
  if (!isRecord(bus) || !isRecord(bus.module)) return bus
  const module = bus.module
  if (module.type === 'delay') {
    return { ...bus, module: migrateLegacyDelayModule(module) }
  }
  // Pre-release sketch used the `opus-delay` type string with link/mix fields.
  if (module.type === 'opus-delay') {
    return { ...bus, module: migrateSketchEchoformDelayModule(module) }
  }
  return bus
}

function migrateV5ToV6(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...value, formatVersion: PROJECT_FORMAT_VERSION }
  if (Array.isArray(value.fxBuses)) {
    next.fxBuses = value.fxBuses.map(migrateFxBusV5ToV6)
  }
  return next
}

function migrateToCurrent(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail('project', 'must be a JSON object')
  const rawVersion = value.formatVersion
  if (rawVersion === PROJECT_FORMAT_VERSION) return value
  if (typeof rawVersion === 'number' && rawVersion > PROJECT_FORMAT_VERSION) {
    throw new ProjectFileError(NEWER_PROJECT_VERSION_MESSAGE)
  }
  // v5 introduced the FX-return modules; upgrade its delay modules to Echoform.
  if (rawVersion === 5) return migrateV5ToV6(value)
  throw new ProjectFileError('This MixJam project uses an unsupported format version. Only format version 6 is supported.')
}

function parsePlacement(
  value: unknown,
  path: string,
  placementIds: Set<string>,
  sampleDurationTicks: Map<string, number>
): ClipPlacement {
  if (!isRecord(value)) fail(path, 'must be an object')
  assertKeys(value, path, ['id', 'sampleRef', 'sampleName', 'nativeBPM', 'startTick', 'durationTicks', 'durationSeconds', 'slot'])
  const id = readString(value, 'id', path)
  if (placementIds.has(id)) fail(`${path}.id`, 'must be unique')
  placementIds.add(id)

  const samplePath = readSampleRef(value, path)
  const startTick = readInteger(value, 'startTick', path, 0, TRACKER_TOTAL_TICKS - 1)
  const durationTicks = readInteger(value, 'durationTicks', path, 1, TRACKER_TOTAL_TICKS)
  if (startTick + durationTicks > TRACKER_TOTAL_TICKS) {
    fail(
      `${path}.durationTicks`,
      `must produce an exclusive end tick (startTick + durationTicks) no greater than ${TRACKER_TOTAL_TICKS}`
    )
  }
  const existingDurationTicks = sampleDurationTicks.get(samplePath)
  if (existingDurationTicks !== undefined && existingDurationTicks !== durationTicks) {
    fail(`${path}.durationTicks`, `must match the other placements for ${samplePath}`)
  }
  sampleDurationTicks.set(samplePath, durationTicks)

  const durationSeconds = readNullableNumber(value, 'durationSeconds', path, Number.MIN_VALUE, Number.MAX_VALUE)
  const nativeBPM = readNullableNumber(value, 'nativeBPM', path, Number.MIN_VALUE, Number.MAX_VALUE)
  const slotValue = value.slot
  let slot: number | undefined
  if (slotValue !== null) {
    if (typeof slotValue !== 'number' || !Number.isInteger(slotValue) || slotValue < 0 || slotValue > 8) {
      fail(`${path}.slot`, 'must be null or an integer from 0 to 8')
    }
    slot = slotValue
  }

  return {
    id,
    samplePath,
    sampleName: readString(value, 'sampleName', path),
    nativeBPM,
    startTick,
    durationTicks,
    durationSeconds,
    ...(slot === undefined ? {} : { slot })
  }
}

function parseMasterBus(value: unknown): MasterBusState {
  const path = 'project.masterBus'
  if (!isRecord(value)) fail(path, 'must be an object')
  assertKeys(value, path, ['order', 'power', 'params', 'preset'])

  if (!Array.isArray(value.order) || !isValidProcessorOrder(value.order)) {
    fail(`${path}.order`, 'must be a permutation of the eleven master bus processor ids')
  }

  if (!isRecord(value.power)) fail(`${path}.power`, 'must be an object')
  assertKeys(value.power, `${path}.power`, PROCESSOR_IDS)
  const power = {} as Record<ProcessorId, boolean>
  for (const processorId of PROCESSOR_IDS) {
    power[processorId] = readBoolean(value.power, processorId, `${path}.power`)
  }

  if (!isRecord(value.params)) fail(`${path}.params`, 'must be an object')
  assertKeys(value.params, `${path}.params`, MASTER_BUS_PARAMS.map((def) => def.id))
  const params = {} as Record<MasterBusParamId, number>
  for (const def of MASTER_BUS_PARAMS) {
    params[def.id] = readNumber(value.params, def.id, `${path}.params`, def.min, def.max)
  }

  const preset = value.preset
  if (preset !== null && !isPresetName(preset)) {
    fail(`${path}.preset`, `must be null or one of ${MASTER_BUS_PRESET_NAMES.join(', ')}`)
  }

  return {
    order: [...value.order],
    power,
    params,
    preset
  }
}

export function parseProject(text: string): ProjectDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ProjectFileError('This MixJam project is not valid JSON.')
  }

  const record = migrateToCurrent(parsed)
  assertKeys(record, 'project', ['formatVersion', 'appVersion', 'createdAt', 'modifiedAt', 'song', 'lanes', 'fxBuses', 'masterBus', 'generator'])
  const appVersion = readString(record, 'appVersion', 'project')
  const createdAt = readIsoTimestamp(record, 'createdAt')
  const modifiedAt = readIsoTimestamp(record, 'modifiedAt')
  const generator = record.generator === undefined ? undefined : parseGenerator(record.generator)

  if (!isRecord(record.song)) fail('project.song', 'must be an object')
  assertKeys(record.song, 'project.song', ['bpm', 'masterGain', 'clipEdgeMicroFades'])
  if (!isRecord(record.song.clipEdgeMicroFades)) {
    fail('project.song.clipEdgeMicroFades', 'must be an object')
  }
  const song = {
    bpm: readNumber(record.song, 'bpm', 'project.song', 50, 200),
    masterGain: readNumber(record.song, 'masterGain', 'project.song', 0, 1),
    clipEdgeMicroFades: {
      enabled: readBoolean(
        record.song.clipEdgeMicroFades,
        'enabled',
        'project.song.clipEdgeMicroFades'
      ),
      fadeInMs: readNumber(
        record.song.clipEdgeMicroFades,
        'fadeInMs',
        'project.song.clipEdgeMicroFades',
        MIN_CLIP_EDGE_FADE_MS,
        MAX_CLIP_EDGE_FADE_MS
      ),
      fadeOutMs: readNumber(
        record.song.clipEdgeMicroFades,
        'fadeOutMs',
        'project.song.clipEdgeMicroFades',
        MIN_CLIP_EDGE_FADE_MS,
        MAX_CLIP_EDGE_FADE_MS
      )
    }
  }

  if (!Array.isArray(record.lanes) || record.lanes.length < MIN_LANES || record.lanes.length > MAX_LANES) {
    fail('project.lanes', `must contain ${MIN_LANES} through ${MAX_LANES} lanes`)
  }
  assertKeys(record.song.clipEdgeMicroFades, 'project.song.clipEdgeMicroFades', ['enabled', 'fadeInMs', 'fadeOutMs'])
  const laneIds = new Set<string>()
  const placementIds = new Set<string>()
  const sampleDurationTicks = new Map<string, number>()
  const lanes = record.lanes.map((value, arrayIndex): LaneState => {
    const path = `project.lanes[${arrayIndex}]`
    if (!isRecord(value)) fail(path, 'must be an object')
    assertKeys(value, path, ['id', 'name', 'gain', 'muted', 'solo', 'pan', 'sends', 'placements'])
    const id = readString(value, 'id', path)
    if (laneIds.has(id)) fail(`${path}.id`, 'must be unique')
    laneIds.add(id)
    if (!Array.isArray(value.placements)) fail(`${path}.placements`, 'must be an array')
    const sendsValue = value.sends
    if (!Array.isArray(sendsValue) || sendsValue.length !== RETURN_BUS_COUNT) {
      fail(`${path}.sends`, 'must contain exactly four values')
    }
    return {
      id,
      index: arrayIndex,
      name: readString(value, 'name', path),
      gain: readNumber(value, 'gain', path, 0, 1),
      muted: readBoolean(value, 'muted', path),
      solo: readBoolean(value, 'solo', path),
      pan: readNumber(value, 'pan', path, -1, 1),
      sends: sendsValue.map((send, sendIndex) => {
        if (typeof send !== 'number' || !Number.isFinite(send) || send < 0 || send > 1) {
          fail(`${path}.sends[${sendIndex}]`, 'must be a finite number from 0 to 1')
        }
        return send
      }) as [number, number, number, number],
      placements: value.placements
        .map((placement, placementIndex) =>
          parsePlacement(
            placement,
            `${path}.placements[${placementIndex}]`,
            placementIds,
            sampleDurationTicks
          )
        )
        .sort((left, right) => left.startTick - right.startTick || left.id.localeCompare(right.id))
    }
  })

  if (!Array.isArray(record.fxBuses) || record.fxBuses.length !== RETURN_BUS_COUNT) {
    fail('project.fxBuses', 'must contain exactly four return buses')
  }
  const effectIds = new Set<string>()
  const fxBuses = record.fxBuses.map((value, index): ProjectFxBusRecord => {
    const path = `project.fxBuses[${index}]`
    if (!isRecord(value)) fail(path, 'must be an object')
    assertKeys(value, path, ['id', 'index', 'name', 'module', 'powered', 'returnLevel', 'limiterEnabled'])
    const expectedId = `fx-${index + 1}` as ProjectFxBusRecord['id']
    const expectedIndex = index as ProjectFxBusRecord['index']
    const expectedName = `FX${index + 1}` as ProjectFxBusRecord['name']
    if (value.id !== expectedId) fail(`${path}.id`, `must be ${expectedId}`)
    if (value.index !== expectedIndex) fail(`${path}.index`, `must be ${expectedIndex}`)
    if (value.name !== expectedName) fail(`${path}.name`, `must be ${expectedName}`)
    if (!isRecord(value.module)) fail(`${path}.module`, 'must be an object')
    const moduleKeys = value.module.type === 'echoform-delay'
      ? [
          'type', 'mode', 'divisionL', 'divisionR', 'timeMsL', 'timeMsR',
          'feedback', 'pingPong', 'width', 'lowCut', 'highCut', 'modRate', 'modDepth',
          'character', 'duckAmount', 'duckRelease', 'outputDb', 'freeze', 'bypass'
        ]
      : ['type']
    assertKeys(value.module, `${path}.module`, moduleKeys)
    let module: ProjectFxBusRecord['module']
    if (value.module.type === 'empty') {
      module = { id: expectedId, type: 'empty' }
    } else {
      if (!isReturnModule(value.module)) {
        fail(`${path}.module`, 'must be Empty or a supported effect with in-range parameters')
      }
      const moduleId = value.module.id ?? expectedId
      if (effectIds.has(moduleId)) fail(`${path}.module.id`, 'must be unique')
      effectIds.add(moduleId)
      module = { ...value.module, id: moduleId }
    }
    return {
      id: expectedId,
      index: expectedIndex,
      name: expectedName,
      module,
      powered: readBoolean(value, 'powered', path),
      returnLevel: readNumber(value, 'returnLevel', path, 0, 1),
      limiterEnabled: readBoolean(value, 'limiterEnabled', path)
    }
  }) as ProjectFxBuses

  const masterBus = parseMasterBus(record.masterBus)

  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    appVersion,
    createdAt,
    modifiedAt,
    song,
    lanes,
    fxBuses,
    masterBus,
    ...(generator === undefined ? {} : { generator })
  }
}
