import type { EffectSlot } from '../engine/effects'
import { isEffectSlot } from '../engine/effects'
import {
  DEFAULT_LANE_COUNT,
  TRACKER_TOTAL_TICKS,
  type ClipPlacement,
  type LaneState
} from '../lib/arrangement'
import type { ChannelState } from '../hooks/useMixer'
import {
  MAX_CLIP_EDGE_FADE_MS,
  MIN_CLIP_EDGE_FADE_MS
} from '../engine/clip-edge-fades'
import {
  cloneProjectSongState,
  createDefaultProjectSongState,
  type ProjectSongState,
  type ProjectTransportState
} from './project-state'

const PROJECT_FORMAT_VERSION = 2
export const NEWER_PROJECT_VERSION_MESSAGE =
  'This project was created with a newer version of MixJam. Please update the app.'

const MAX_CHANNEL_COUNT = 16
const MAX_EFFECTS_PER_CHANNEL = 4

export interface ProjectData extends ProjectTransportState {
  channels: ChannelState[]
}

export interface ProjectDocument extends ProjectData {
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
  index: number
  name: string
  muted: boolean
  solo: boolean
  pan: number
  channelId: string | null
  placements: ProjectPlacementRecord[]
}

interface ProjectChannelRecord {
  id: string
  index: number
  name: string
  gain: number
  pan: number
  muted: boolean
  solo: boolean
  fx: EffectSlot[]
}

interface ProjectDocumentRecord {
  formatVersion: typeof PROJECT_FORMAT_VERSION
  appVersion: string
  createdAt: string
  modifiedAt: string
  song: ProjectSongState
  lanes: ProjectLaneRecord[]
  channels: ProjectChannelRecord[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(path: string, expectation: string): never {
  throw new ProjectFileError(`Invalid MixJam project: ${path} ${expectation}.`)
}

function readString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) fail(`${path}.${key}`, 'must be a non-empty string')
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

function cloneEffect(effect: EffectSlot): EffectSlot {
  if (effect.type === 'delay') {
    return {
      id: effect.id,
      type: effect.type,
      bypassed: effect.bypassed,
      timeMs: effect.timeMs,
      feedback: effect.feedback,
      mix: effect.mix,
      pingPong: effect.pingPong,
      tempoSync: effect.tempoSync,
      noteDivision: effect.noteDivision
    }
  }
  if (effect.type === 'reverb') {
    return {
      id: effect.id,
      type: effect.type,
      bypassed: effect.bypassed,
      roomSize: effect.roomSize,
      decay: effect.decay,
      mix: effect.mix
    }
  }
  return {
    id: effect.id,
    type: effect.type,
    bypassed: effect.bypassed,
    threshold: effect.threshold,
    ratio: effect.ratio,
    attackMs: effect.attackMs,
    releaseMs: effect.releaseMs,
    makeupGain: effect.makeupGain
  }
}

function effectParametersAreInRange(effect: EffectSlot): boolean {
  if (effect.type === 'delay') {
    return effect.timeMs >= 0 && effect.timeMs <= 2000 &&
      effect.feedback >= 0 && effect.feedback <= 1 &&
      effect.mix >= 0 && effect.mix <= 1
  }
  if (effect.type === 'reverb') {
    return effect.roomSize >= 0 && effect.roomSize <= 1 &&
      effect.decay >= 0 && effect.decay <= 1 &&
      effect.mix >= 0 && effect.mix <= 1
  }
  return effect.threshold >= -60 && effect.threshold <= 0 &&
    effect.ratio >= 1 && effect.ratio <= 20 &&
    effect.attackMs >= 0 && effect.attackMs <= 200 &&
    effect.releaseMs >= 5 && effect.releaseMs <= 3000 &&
    effect.makeupGain >= 0 && effect.makeupGain <= 24
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

function channelId(channelIndex: number): string {
  return `ch-${channelIndex + 1}`
}

function toDocumentRecord(
  project: ProjectData,
  metadata: Pick<ProjectDocument, 'appVersion' | 'createdAt' | 'modifiedAt'>
): ProjectDocumentRecord {
  const channels = [...project.channels]
    .sort((left, right) => left.channelIndex - right.channelIndex)
    .map((channel): ProjectChannelRecord => ({
      id: channelId(channel.channelIndex),
      index: channel.channelIndex,
      name: `Channel ${channel.channelIndex + 1}`,
      gain: channel.gain,
      pan: channel.pan,
      muted: channel.muted,
      solo: channel.solo,
      fx: channel.effects.map(cloneEffect)
    }))
  const presentChannels = new Set(channels.map((channel) => channel.index))

  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    appVersion: metadata.appVersion,
    createdAt: metadata.createdAt,
    modifiedAt: metadata.modifiedAt,
    song: cloneProjectSongState(project.song),
    lanes: [...project.lanes]
      .sort((left, right) => left.index - right.index)
      .map((lane): ProjectLaneRecord => ({
        index: lane.index,
        name: lane.name,
        muted: lane.muted,
        solo: lane.solo,
        pan: lane.pan,
        channelId: presentChannels.has(lane.index) ? channelId(lane.index) : null,
        placements: [...lane.placements]
          .sort((left, right) => left.startTick - right.startTick || left.id.localeCompare(right.id))
          .map(serializePlacement)
      })),
    channels
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

function baseName(relpath: string): string {
  return relpath.split('/').pop() ?? relpath
}

function migrateVersionZero(document: Record<string, unknown>): Record<string, unknown> {
  const defaultSong = createDefaultProjectSongState()
  const rawChannels = Array.isArray(document.channels) ? document.channels : []
  const channelIds = new Set(
    rawChannels.flatMap((value, index) => isRecord(value)
      ? [typeof value.id === 'string' ? value.id : channelId(index)]
      : [])
  )
  const rawLanes = Array.isArray(document.lanes) ? document.lanes : []

  return {
    ...document,
    formatVersion: 1,
    song: isRecord(document.song)
      ? document.song
      : { ...defaultSong, bpm: document.bpm ?? defaultSong.bpm },
    lanes: rawLanes.map((value, laneIndex) => {
      if (!isRecord(value)) return value
      const placements = Array.isArray(value.placements) ? value.placements : []
      const expectedChannelId = channelId(laneIndex)
      return {
        ...value,
        index: value.index ?? laneIndex,
        pan: value.pan ?? 0,
        channelId: value.channelId ?? (channelIds.has(expectedChannelId) ? expectedChannelId : null),
        placements: placements.map((placement, placementIndex) => {
          if (!isRecord(placement)) return placement
          const sampleRef = typeof placement.sampleRef === 'string' ? placement.sampleRef : ''
          return {
            ...placement,
            id: placement.id ?? `placement-${laneIndex}-${placementIndex}`,
            sampleName: placement.sampleName ?? baseName(sampleRef),
            durationSeconds: placement.durationSeconds ?? null,
            slot: placement.slot ?? null
          }
        })
      }
    }),
    channels: rawChannels.map((value, index) => isRecord(value)
      ? {
          ...value,
          id: value.id ?? channelId(index),
          index: value.index ?? index,
          name: value.name ?? `Channel ${index + 1}`,
          fx: value.fx ?? []
        }
      : value)
  }
}

function migrateVersionOne(document: Record<string, unknown>): Record<string, unknown> {
  const song = isRecord(document.song) ? document.song : {}
  return {
    ...document,
    formatVersion: 2,
    song: {
      ...song,
      clipEdgeMicroFades: song.clipEdgeMicroFades ??
        createDefaultProjectSongState().clipEdgeMicroFades
    }
  }
}

function migrateToCurrent(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail('project', 'must be a JSON object')
  const rawVersion = value.formatVersion
  if (!Number.isInteger(rawVersion) || (rawVersion as number) < 0) {
    fail('project.formatVersion', 'must be a non-negative integer')
  }
  if ((rawVersion as number) > PROJECT_FORMAT_VERSION) {
    throw new ProjectFileError(NEWER_PROJECT_VERSION_MESSAGE)
  }

  let current = value
  let version = rawVersion as number
  while (version < PROJECT_FORMAT_VERSION) {
    if (version === 0) current = migrateVersionZero(current)
    else if (version === 1) current = migrateVersionOne(current)
    else fail('project.formatVersion', `has no migration from version ${version}`)
    version += 1
  }
  return current
}

function parsePlacement(
  value: unknown,
  path: string,
  placementIds: Set<string>,
  sampleDurationTicks: Map<string, number>
): ClipPlacement {
  if (!isRecord(value)) fail(path, 'must be an object')
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

function parseChannel(
  value: unknown,
  path: string,
  channelIds: Set<string>,
  channelIndices: Set<number>,
  effectIds: Set<string>
): ChannelState {
  if (!isRecord(value)) fail(path, 'must be an object')
  const id = readString(value, 'id', path)
  const index = readInteger(value, 'index', path, 0, MAX_CHANNEL_COUNT - 1)
  if (channelIds.has(id)) fail(`${path}.id`, 'must be unique')
  if (channelIndices.has(index)) fail(`${path}.index`, 'must be unique')
  if (id !== channelId(index)) fail(`${path}.id`, `must be ${channelId(index)}`)
  channelIds.add(id)
  channelIndices.add(index)
  readString(value, 'name', path)
  const effectsValue = value.fx
  if (!Array.isArray(effectsValue) || effectsValue.length > MAX_EFFECTS_PER_CHANNEL) {
    fail(`${path}.fx`, `must be an array of at most ${MAX_EFFECTS_PER_CHANNEL} effects`)
  }
  const effects = effectsValue.map((effect, effectIndex) => {
    const effectPath = `${path}.fx[${effectIndex}]`
    if (!isEffectSlot(effect) || !effectParametersAreInRange(effect)) {
      fail(effectPath, 'must be a supported effect with in-range parameters')
    }
    if (effectIds.has(effect.id)) fail(`${effectPath}.id`, 'must be unique')
    effectIds.add(effect.id)
    return cloneEffect(effect)
  })
  const gain = readNumber(value, 'gain', path, 0, 1)
  const pan = readNumber(value, 'pan', path, -1, 1)
  const muted = readBoolean(value, 'muted', path)
  const solo = readBoolean(value, 'solo', path)

  return { channelIndex: index, gain, pan, muted, solo, effects }
}

export function parseProject(text: string): ProjectDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ProjectFileError('This MixJam project is not valid JSON.')
  }

  const record = migrateToCurrent(parsed)
  const appVersion = readString(record, 'appVersion', 'project')
  const createdAt = readIsoTimestamp(record, 'createdAt')
  const modifiedAt = readIsoTimestamp(record, 'modifiedAt')

  if (!isRecord(record.song)) fail('project.song', 'must be an object')
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

  if (!Array.isArray(record.channels) || record.channels.length > MAX_CHANNEL_COUNT) {
    fail('project.channels', `must be an array of at most ${MAX_CHANNEL_COUNT} channels`)
  }
  const channelIds = new Set<string>()
  const channelIndices = new Set<number>()
  const effectIds = new Set<string>()
  const channels = record.channels.map((channel, index) =>
    parseChannel(channel, `project.channels[${index}]`, channelIds, channelIndices, effectIds)
  ).sort((left, right) => left.channelIndex - right.channelIndex)

  if (!Array.isArray(record.lanes) || record.lanes.length !== DEFAULT_LANE_COUNT) {
    fail('project.lanes', `must contain exactly ${DEFAULT_LANE_COUNT} lanes`)
  }
  const laneIndices = new Set<number>()
  const placementIds = new Set<string>()
  const sampleDurationTicks = new Map<string, number>()
  const lanes = record.lanes.map((value, arrayIndex): LaneState => {
    const path = `project.lanes[${arrayIndex}]`
    if (!isRecord(value)) fail(path, 'must be an object')
    const index = readInteger(value, 'index', path, 0, DEFAULT_LANE_COUNT - 1)
    if (laneIndices.has(index)) fail(`${path}.index`, 'must be unique')
    laneIndices.add(index)
    const expectedChannelId = channelIndices.has(index) ? channelId(index) : null
    if (value.channelId !== expectedChannelId) {
      fail(`${path}.channelId`, `must be ${expectedChannelId === null ? 'null' : expectedChannelId}`)
    }
    if (!Array.isArray(value.placements)) fail(`${path}.placements`, 'must be an array')
    return {
      index,
      name: readString(value, 'name', path),
      muted: readBoolean(value, 'muted', path),
      solo: readBoolean(value, 'solo', path),
      pan: readNumber(value, 'pan', path, -1, 1),
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
  }).sort((left, right) => left.index - right.index)

  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    appVersion,
    createdAt,
    modifiedAt,
    song,
    lanes,
    channels
  }
}
