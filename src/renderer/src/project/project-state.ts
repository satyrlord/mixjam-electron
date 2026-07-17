import type { ClipEdgeMicroFadeSettings } from '../engine/clip-edge-fades'
import { DEFAULT_CLIP_EDGE_MICRO_FADES } from '../engine/clip-edge-fades'
import type { LaneState } from '../lib/arrangement'

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
