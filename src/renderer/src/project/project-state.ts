import type { ClipEdgeMicroFadeSettings } from '../engine/clip-edge-fades'
import { DEFAULT_CLIP_EDGE_MICRO_FADES } from '../engine/clip-edge-fades'
import {
  createEmptyReturnModule,
  RETURN_BUS_COUNT,
  type ReturnModule
} from '../engine/return-effects'
import { createDefaultLanes, type LaneState } from '../lib/arrangement'

const DEFAULT_BPM = 120
const DEFAULT_MASTER_GAIN = 0.8

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

function cloneProjectLanes(lanes: readonly LaneState[]): LaneState[] {
  return lanes.map((lane) => ({
    ...lane,
    sends: [...lane.sends],
    placements: lane.placements.map((placement) => ({ ...placement }))
  }))
}

export function createDefaultProjectState(
  overrides: {
    song?: Partial<ProjectSongState>
    lanes?: readonly LaneState[]
    fxBuses?: readonly ProjectFxBusState[]
  } = {}
): ProjectState {
  return {
    song: createDefaultProjectSongState(overrides.song),
    lanes: overrides.lanes ? cloneProjectLanes(overrides.lanes) : createDefaultLanes(),
    fxBuses: overrides.fxBuses ? cloneProjectFxBuses(overrides.fxBuses) : createDefaultFxBuses()
  }
}

/** Clone the complete ProjectState shape. ProjectData extensions need their own
 * clone at the owning persistence boundary. */
export function cloneProjectState(project: ProjectState): ProjectState {
  return {
    song: cloneProjectSongState(project.song),
    lanes: cloneProjectLanes(project.lanes),
    fxBuses: cloneProjectFxBuses(project.fxBuses)
  }
}
