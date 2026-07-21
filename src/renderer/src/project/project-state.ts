import type { ClipEdgeMicroFadeSettings } from '../engine/clip-edge-fades'
import { DEFAULT_CLIP_EDGE_MICRO_FADES } from '../engine/clip-edge-fades'
import {
  clampParamValue,
  isValidProcessorOrder,
  type MasterBusParamId,
  type ProcessorId
} from '../engine/masterbus/params'
import {
  applyPreset,
  defaultMasterBusState,
  type MasterBusPresetName,
  type MasterBusState
} from '../engine/masterbus/presets'
import type { PlaybackProjectGraphSnapshot } from '../engine/playback-engine'
import {
  createEmptyReturnModule,
  RETURN_BUS_COUNT,
  type ReturnModule
} from '../engine/return-effects'
import { clamp } from '../lib/sample-utils'

const DEFAULT_BPM = 120
// Unity since the Master Bus Strip replaced the Master Volume fader
// (spec-012): masterGain has no editable control, and the strip's
// calibration expects nominal program level at its input. Loaded projects
// keep their saved value.
const DEFAULT_MASTER_GAIN = 1
const DEFAULT_LANE_GAIN = 0.8
const DEFAULT_LANE_SENDS = [0, 0, 0, 0] as const

/** A blank project starts compact, while saved projects may grow to this hard cap. */
export const DEFAULT_LANE_COUNT = 8
export const MIN_LANE_COUNT = 1
export const MAX_LANE_COUNT = 64

export type LaneSendLevels = [number, number, number, number]

export interface ClipPlacement {
  id: string
  samplePath: string
  sampleName: string
  startTick: number
  durationTicks: number
  /** Immutable source-audio duration in seconds. Tracker geometry and playback
   * duration are controlled by durationTicks. */
  durationSeconds: number | null
  /** Native tempo captured from the sample when it is placed. */
  nativeBPM?: number | null
  /** Transient marker omitted from project files. */
  nativeBPMPending?: boolean
  /** Category-derived palette slot stored at placement time. */
  slot?: number
}

export interface LaneState {
  /** Stable project identity, independent of visible index. */
  id: string
  index: number
  name: string
  muted: boolean
  solo: boolean
  pan: number
  gain: number
  sends: LaneSendLevels
  placements: ClipPlacement[]
}

let laneIdSequence = 0

function createLane(index: number, id = `lane-${index + 1}-${++laneIdSequence}`): LaneState {
  return {
    id,
    index,
    name: `Lane ${index + 1}`,
    muted: false,
    solo: false,
    pan: 0,
    gain: DEFAULT_LANE_GAIN,
    sends: [...DEFAULT_LANE_SENDS],
    placements: []
  }
}

export function createDefaultLanes(): LaneState[] {
  return Array.from({ length: DEFAULT_LANE_COUNT }, (_, index) => createLane(index))
}

function cloneProjectLanes(lanes: readonly LaneState[]): LaneState[] {
  return lanes.map((lane) => ({
    ...lane,
    sends: [...lane.sends],
    placements: lane.placements.map((placement) => ({ ...placement }))
  }))
}

/** Add one lane after the current last lane. Returns a shallow copy at 64 lanes. */
export function addLane(lanes: readonly LaneState[]): LaneState[] {
  if (lanes.length >= MAX_LANE_COUNT) return [...lanes]
  const next = lanes.map((lane, index) => ({ ...lane, index }))
  return [...next, createLane(next.length)]
}

/** Delete a lane by visible index. The final lane cannot be removed. */
export function deleteLane(lanes: readonly LaneState[], laneIndex: number): LaneState[] {
  if (lanes.length <= MIN_LANE_COUNT) return [...lanes]
  const remaining = lanes.filter((lane) => lane.index !== laneIndex)
  if (remaining.length === lanes.length || remaining.length < MIN_LANE_COUNT) return [...lanes]
  return remaining.map((lane, index) => ({ ...lane, index }))
}

export function isEmptyLane(lane: Pick<LaneState, 'placements'>): boolean {
  return lane.placements.length === 0
}

export function deleteEmptyLanes(lanes: readonly LaneState[]): LaneState[] {
  if (lanes.length <= MIN_LANE_COUNT) return [...lanes]
  const nonEmpty = lanes.filter((lane) => !isEmptyLane(lane))
  const kept = nonEmpty.length > 0 ? nonEmpty : [lanes[0]!]
  return kept.map((lane, index) => ({ ...lane, index }))
}

export function toggleLaneMute(lanes: LaneState[], laneIndex: number): LaneState[] {
  return lanes.map((lane) =>
    lane.index === laneIndex ? { ...lane, muted: !lane.muted } : lane
  )
}

export function toggleLaneSolo(lanes: LaneState[], laneIndex: number): LaneState[] {
  const targetLane = lanes.find((lane) => lane.index === laneIndex)
  if (!targetLane) return lanes
  const willSolo = !targetLane.solo
  return lanes.map((lane) => {
    if (lane.index === laneIndex) return { ...lane, solo: willSolo }
    return willSolo ? { ...lane, solo: false } : lane
  })
}

export function setLanePan(lanes: LaneState[], laneIndex: number, pan: number): LaneState[] {
  return lanes.map((lane) =>
    lane.index === laneIndex ? { ...lane, pan: clamp(pan, -1, 1) } : lane
  )
}

export function setLaneGain(lanes: LaneState[], laneIndex: number, gain: number): LaneState[] {
  const bounded = clamp(gain, 0, 1)
  return lanes.map((lane) => lane.index === laneIndex ? { ...lane, gain: bounded } : lane)
}

export function setLaneSend(
  lanes: LaneState[],
  laneIndex: number,
  sendIndex: number,
  value: number
): LaneState[] {
  if (sendIndex < 0 || sendIndex >= RETURN_BUS_COUNT) return lanes
  return lanes.map((lane) => {
    if (lane.index !== laneIndex) return lane
    const sends: LaneSendLevels = [...lane.sends]
    sends[sendIndex] = clamp(value, 0, 1)
    return { ...lane, sends }
  })
}

export function renameLane(lanes: LaneState[], laneIndex: number, name: string): LaneState[] {
  const nextName = name.trim()
  if (!nextName) return lanes
  let changed = false
  const next = lanes.map((lane) => {
    if (lane.index !== laneIndex || lane.name === nextName) return lane
    changed = true
    return { ...lane, name: nextName }
  })
  return changed ? next : lanes
}

export interface ProjectSongState {
  bpm: number
  masterGain: number
  clipEdgeMicroFades: ClipEdgeMicroFadeSettings
}

export interface ProjectTransportState {
  song: ProjectSongState
  lanes: LaneState[]
}

export interface ProjectFxBusState {
  id: `fx-${1 | 2 | 3 | 4}`
  index: 0 | 1 | 2 | 3
  name: `FX${1 | 2 | 3 | 4}`
  module: ReturnModule
  powered: boolean
  returnLevel: number
  limiterEnabled: boolean
}

export type ProjectFxBuses = [
  ProjectFxBusState,
  ProjectFxBusState,
  ProjectFxBusState,
  ProjectFxBusState
]

/** Complete project-owned state shared by New, load, save, and generation. */
export interface ProjectState extends ProjectTransportState {
  fxBuses: ProjectFxBuses
  masterBus: MasterBusState
}

/** The lane, Return, and Master Bus state covered by the shared edit-history contract. */
export type ProjectEditState = Pick<ProjectState, 'lanes' | 'fxBuses' | 'masterBus'>

export function createDefaultProjectEditState(): ProjectEditState {
  return {
    lanes: createDefaultLanes(),
    fxBuses: createDefaultFxBuses(),
    masterBus: createDefaultMasterBusState()
  }
}

export function createDefaultProjectSongState(
  overrides: Partial<ProjectSongState> = {}
): ProjectSongState {
  const defaults: ProjectSongState = {
    bpm: DEFAULT_BPM,
    masterGain: DEFAULT_MASTER_GAIN,
    clipEdgeMicroFades: { ...DEFAULT_CLIP_EDGE_MICRO_FADES }
  }

  return {
    ...defaults,
    ...overrides,
    clipEdgeMicroFades: {
      ...defaults.clipEdgeMicroFades,
      ...overrides.clipEdgeMicroFades
    }
  }
}

export function cloneProjectSongState(song: ProjectSongState): ProjectSongState {
  return {
    ...song,
    clipEdgeMicroFades: { ...song.clipEdgeMicroFades }
  }
}

export function createDefaultFxBuses(): ProjectFxBuses {
  return Array.from({ length: RETURN_BUS_COUNT }, (_, index) => ({
    id: `fx-${index + 1}` as ProjectFxBusState['id'],
    index: index as ProjectFxBusState['index'],
    name: `FX${index + 1}` as ProjectFxBusState['name'],
    module: createEmptyReturnModule(`fx-${index + 1}`),
    powered: true,
    returnLevel: 1,
    limiterEnabled: true
  })) as ProjectFxBuses
}

export function cloneProjectFxBuses(buses: readonly ProjectFxBusState[]): ProjectFxBuses {
  if (buses.length !== RETURN_BUS_COUNT) {
    throw new Error(`Project state must contain exactly ${RETURN_BUS_COUNT} return buses.`)
  }
  return buses.map((bus, index) => {
    const expectedId = `fx-${index + 1}`
    const expectedName = `FX${index + 1}`
    if (bus.id !== expectedId || bus.index !== index || bus.name !== expectedName) {
      throw new Error(`Return bus ${index + 1} must use identity ${expectedId}/${index}/${expectedName}.`)
    }
    return {
      ...bus,
      module: { ...bus.module } as ProjectFxBusState['module']
    }
  }) as ProjectFxBuses
}

/** New projects start on the Cheat Sheet preset (spec-012 Persistence). */
export function createDefaultMasterBusState(): MasterBusState {
  return defaultMasterBusState()
}

export function cloneMasterBusState(masterBus: MasterBusState): MasterBusState {
  return {
    order: [...masterBus.order],
    power: { ...masterBus.power },
    params: { ...masterBus.params },
    preset: masterBus.preset
  }
}

/** Set one strip parameter, clamped to its documented range. A manual edit
 * clears the preset selection. */
export function setMasterBusParam(
  masterBus: MasterBusState,
  paramId: MasterBusParamId,
  value: number
): MasterBusState {
  return {
    ...masterBus,
    params: { ...masterBus.params, [paramId]: clampParamValue(paramId, value) },
    preset: null
  }
}

/** Toggle one downstream processor's power flag. The pinned Gain Stage has no
 * power state. A manual edit clears the preset selection. */
export function toggleMasterBusPower(
  masterBus: MasterBusState,
  processorId: ProcessorId
): MasterBusState {
  return {
    ...masterBus,
    power: { ...masterBus.power, [processorId]: !masterBus.power[processorId] },
    preset: null
  }
}

/** Replace the downstream processor order. An order that is not a permutation
 * of the ten processor ids leaves the state unchanged. */
export function reorderMasterBus(
  masterBus: MasterBusState,
  order: readonly ProcessorId[]
): MasterBusState {
  if (!isValidProcessorOrder(order)) return masterBus
  return { ...masterBus, order: [...order], preset: null }
}

/** Recall a factory preset from the current order (only Cheat Sheet restores
 * the default order). */
export function applyMasterBusPreset(
  masterBus: MasterBusState,
  name: MasterBusPresetName
): MasterBusState {
  return applyPreset(name, masterBus.order)
}

export function createDefaultProjectState(
  overrides: {
    song?: Partial<ProjectSongState>
    lanes?: readonly LaneState[]
    fxBuses?: readonly ProjectFxBusState[]
    masterBus?: MasterBusState
  } = {}
): ProjectState {
  return {
    song: createDefaultProjectSongState(overrides.song),
    lanes: overrides.lanes ? cloneProjectLanes(overrides.lanes) : createDefaultLanes(),
    fxBuses: overrides.fxBuses ? cloneProjectFxBuses(overrides.fxBuses) : createDefaultFxBuses(),
    masterBus: overrides.masterBus
      ? cloneMasterBusState(overrides.masterBus)
      : createDefaultMasterBusState()
  }
}

/** Clone the complete ProjectState shape. ProjectData extensions need their own
 * clone at the owning persistence boundary. */
export function cloneProjectState(project: ProjectState): ProjectState {
  return {
    song: cloneProjectSongState(project.song),
    lanes: cloneProjectLanes(project.lanes),
    fxBuses: cloneProjectFxBuses(project.fxBuses),
    masterBus: cloneMasterBusState(project.masterBus)
  }
}

export function projectEditStateFromProject(project: ProjectState): ProjectEditState {
  const lanes = cloneProjectLanes(project.lanes.slice(0, MAX_LANE_COUNT))
  return {
    lanes: lanes.length > 0 ? lanes : createDefaultLanes().slice(0, MIN_LANE_COUNT),
    fxBuses: cloneProjectFxBuses(project.fxBuses),
    masterBus: cloneMasterBusState(project.masterBus)
  }
}

/** Adapt project-owned lane, Return, and Master Bus state to the one snapshot
 * consumed by playback graph reconciliation. Callers that only reconcile lanes
 * and Returns (visual telemetry) may omit masterBus. */
export function toPlaybackProjectGraphSnapshot(
  project: Pick<ProjectEditState, 'lanes' | 'fxBuses'> & Partial<Pick<ProjectEditState, 'masterBus'>>
): PlaybackProjectGraphSnapshot {
  return {
    ...(project.masterBus === undefined
      ? {}
      : { masterBus: cloneMasterBusState(project.masterBus) }),
    channels: project.lanes.map((lane) => ({
      laneId: lane.id,
      channelIndex: lane.index,
      gain: lane.gain,
      pan: lane.pan,
      muted: lane.muted,
      solo: lane.solo,
      sends: [...lane.sends]
    })),
    returns: project.fxBuses.map((bus) => ({
      index: bus.index,
      module: { ...bus.module } as ReturnModule,
      powered: bus.powered,
      returnLevel: bus.returnLevel,
      limiterEnabled: bus.limiterEnabled
    }))
  }
}
