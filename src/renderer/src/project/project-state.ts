import type { ClipEdgeMicroFadeSettings } from '../engine/clip-edge-fades'
import { DEFAULT_CLIP_EDGE_MICRO_FADES } from '../engine/clip-edge-fades'
import type { EffectSlot } from '../engine/effects'
import { createDefaultLanes, type LaneState } from '../lib/arrangement'

const DEFAULT_BPM = 120
const DEFAULT_MASTER_GAIN = 0.8
export const DEFAULT_PROJECT_CHANNEL_COUNT = 16
const DEFAULT_CHANNEL_GAIN = 0.8

export interface ProjectSongState {
  bpm: number
  masterGain: number
  clipEdgeMicroFades: ClipEdgeMicroFadeSettings
}

export interface ProjectTransportState {
  song: ProjectSongState
  lanes: LaneState[]
}

export interface ChannelState {
  /** The channel index in the audio graph (lane N -> channel N for 1:1 routing). */
  channelIndex: number
  gain: number
  pan: number
  muted: boolean
  solo: boolean
  effects: EffectSlot[]
}

/** Complete project-owned state shared by New, load, save, and generation. */
export interface ProjectState extends ProjectTransportState {
  channels: ChannelState[]
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

export function createDefaultChannel(channelIndex: number): ChannelState {
  return {
    channelIndex,
    gain: DEFAULT_CHANNEL_GAIN,
    pan: 0,
    muted: false,
    solo: false,
    effects: []
  }
}

export function createDefaultChannels(): ChannelState[] {
  return Array.from({ length: DEFAULT_PROJECT_CHANNEL_COUNT }, (_, index) =>
    createDefaultChannel(index)
  )
}

function cloneProjectChannels(channels: readonly ChannelState[]): ChannelState[] {
  return channels.map((channel) => ({
    ...channel,
    effects: channel.effects.map((effect) => ({ ...effect }))
  }))
}

function cloneProjectLanes(lanes: readonly LaneState[]): LaneState[] {
  return lanes.map((lane) => ({
    ...lane,
    placements: lane.placements.map((placement) => ({ ...placement }))
  }))
}

export function createDefaultProjectState(
  overrides: {
    song?: Partial<ProjectSongState>
    lanes?: readonly LaneState[]
    channels?: readonly ChannelState[]
  } = {}
): ProjectState {
  return {
    song: createDefaultProjectSongState(overrides.song),
    lanes: overrides.lanes ? cloneProjectLanes(overrides.lanes) : createDefaultLanes(),
    channels: overrides.channels
      ? cloneProjectChannels(overrides.channels)
      : createDefaultChannels()
  }
}

/** Clone the complete ProjectState shape. ProjectData extensions need their own
 * clone at the owning persistence boundary. */
export function cloneProjectState(project: ProjectState): ProjectState {
  return {
    song: cloneProjectSongState(project.song),
    lanes: cloneProjectLanes(project.lanes),
    channels: cloneProjectChannels(project.channels)
  }
}
