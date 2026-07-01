import type { SampleListItem } from '../../../shared/ipc'
import { type EngineLane, anyLaneSoloed as anyMuteSoloSoloed } from '../engine/lane-evaluation'
import { tickDurationSeconds } from '../engine/transport'

/** Detail passed around the UI after a user selects or drags a sample. All paths
 *  are absolute filepaths (the sample-browser and DB pipelines both normalise to
 *  absolute paths before surfacing items to the renderer). */
export type FooterSampleDetail = Pick<SampleListItem, 'name' | 'filepath' | 'tags'> & {
  duration: number | null
  /** Category-derived colour, stored so placed clips keep their colour permanently. */
  color?: string
}

export const DEFAULT_LANE_COUNT = 16
export const LANE_HEIGHT_PX = 44
export const LANE_HEAD_WIDTH_PX = 168
export const DEFAULT_CLIP_DURATION_TICKS = 32

export interface LaneClip {
  id: string
  samplePath: string
  sampleName: string
  startTick: number
  durationTicks: number
  /** Audio duration in seconds — used for tileWidth() so the bubble has the
   *  same pixel size everywhere (tracker, browser, any view). */
  durationSeconds: number | null
  /** Stable category-derived colour — stored at placement time, never recomputed. */
  color?: string
}

export interface LaneState {
  index: number
  name: string
  muted: boolean
  solo: boolean
  pan: number
  clips: LaneClip[]
}

export function createDefaultLanes(): LaneState[] {
  return Array.from({ length: DEFAULT_LANE_COUNT }, (_, index) => ({
    index,
    name: `Lane ${index + 1}`,
    muted: false,
    solo: false,
    pan: 0,
    clips: []
  }))
}

// Maps the UI lane model onto the engine's lane model. Default routing: lane N
// plays through mixer channel N (spec-005 Lane "default routing").
export function toEngineLanes(lanes: readonly LaneState[]): EngineLane[] {
  return lanes.map((lane) => ({
    index: lane.index,
    muted: lane.muted,
    solo: lane.solo,
    channelIndex: lane.index,
    clips: lane.clips.map((clip) => ({
      startTick: clip.startTick,
      durationTicks: clip.durationTicks,
      samplePath: clip.samplePath
    }))
  }))
}

export function sampleDurationTicks(durationSeconds: number | null, bpm: number): number {
  if (!durationSeconds || durationSeconds <= 0) return DEFAULT_CLIP_DURATION_TICKS
  const tickSec = tickDurationSeconds(bpm)
  return Math.max(1, Math.round(durationSeconds / tickSec))
}

export function placeClipOnLane(
  lanes: LaneState[],
  laneIndex: number,
  samplePath: string,
  sampleName: string,
  startTick: number,
  durationTicks: number = DEFAULT_CLIP_DURATION_TICKS,
  durationSeconds?: number | null,
  color?: string
): LaneState[] {
  return lanes.map((lane) => {
    if (lane.index !== laneIndex) return lane

    const clipId = `clip-${samplePath}-${startTick}-${Date.now()}`
    const newClip: LaneClip = {
      id: clipId,
      samplePath,
      sampleName,
      startTick,
      durationTicks,
      durationSeconds: durationSeconds ?? null,
      color
    }

    // Clips visually overlap and are never trimmed — overlapping samples keep
    // their full bubbles so an accidental overlap never loses sample info. Only
    // the audio is monophonic: a new trigger cuts off the previous voice on the
    // lane (handled by Player.laneVoices), the bubble data is untouched.
    return {
      ...lane,
      clips: sortClips([...lane.clips, newClip])
    }
  })
}

function sortClips(clips: LaneClip[]): LaneClip[] {
  return [...clips].sort((a, b) => a.startTick - b.startTick)
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
    if (lane.index === laneIndex) {
      return { ...lane, solo: willSolo }
    }
    if (willSolo) {
      return { ...lane, solo: false }
    }
    return lane
  })
}

export function anyLaneSoloed(lanes: LaneState[]): boolean {
  // Delegates to the shared mute/solo policy (lane-evaluation).
  return anyMuteSoloSoloed(lanes)
}

// A lane is dimmed when it is muted, or when any lane is soloed and this lane is
// not the soloed one. This is the *visual* policy and intentionally differs from
// engine audibility (laneIsAudible) for the soloed-and-muted edge case: a soloed
// lane is audible even if muted, but muted lanes always dim for visual feedback.
export function laneShouldDim(lane: LaneState, anySoloed: boolean): boolean {
  if (lane.muted) return true
  if (anySoloed && !lane.solo) return true
  return false
}

export function moveClipOnLane(
  lanes: LaneState[],
  clipId: string,
  toLaneIndex: number,
  newStartTick: number
): LaneState[] {
  let sourceClip: LaneClip | null = null
  let sourceLaneIndex = -1
  for (const lane of lanes) {
    const found = lane.clips.find((c) => c.id === clipId)
    if (found) {
      sourceClip = found
      sourceLaneIndex = lane.index
      break
    }
  }
  if (!sourceClip) return lanes

  const withoutSource = lanes.map((lane) =>
    lane.index === sourceLaneIndex
      ? { ...lane, clips: lane.clips.filter((c) => c.id !== clipId) }
      : lane
  )

  return placeClipOnLane(
    withoutSource,
    toLaneIndex,
    sourceClip.samplePath,
    sourceClip.sampleName,
    newStartTick,
    sourceClip.durationTicks,
    sourceClip.durationSeconds,
    sourceClip.color
  )
}

export function removeClipFromLane(
  lanes: LaneState[],
  laneIndex: number,
  clipId: string
): LaneState[] {
  return lanes.map((lane) => {
    if (lane.index !== laneIndex) return lane
    return { ...lane, clips: lane.clips.filter((c) => c.id !== clipId) }
  })
}

export function setLanePan(lanes: LaneState[], laneIndex: number, pan: number): LaneState[] {
  return lanes.map((lane) =>
    lane.index === laneIndex ? { ...lane, pan: Math.max(-1, Math.min(1, pan)) } : lane
  )
}