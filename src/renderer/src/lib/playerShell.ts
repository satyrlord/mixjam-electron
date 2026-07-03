import type { SampleListItem } from '../../../shared/backend-api'
import { type EngineLane } from '../engine/lane-evaluation'
import { tickDurationSeconds } from '../engine/transport'
import { clamp } from './sample-utils'


/** Detail passed around the UI after a user selects or drags a sample. All
 *  paths are relpaths within the active Sample Folder's scan root. */
export type FooterSampleDetail = Pick<SampleListItem, 'name' | 'relpath' | 'tags'> & {
  duration: number | null
  /** Category-derived colour, stored so placed clips keep their colour permanently. */
  color?: string
}

export const DEFAULT_LANE_COUNT = 16
export const LANE_HEIGHT_PX = 44
export const LANE_HEAD_WIDTH_PX = 168
export const RULER_HEIGHT_PX = 24
export const DEFAULT_CLIP_DURATION_TICKS = 32

export interface LaneClip {
  id: string
  samplePath: string
  sampleName: string
  startTick: number
  durationTicks: number
  /** Audio duration in seconds — drives the bubble width so a sample has the
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

// Monotonic counter appended to generated clip ids so multiple clips placed
// synchronously in the same millisecond (e.g. a batched group duplicate)
// never collide on id, which would make delete/select-by-id affect both.
let clipIdSequence = 0

// Re-export so existing consumers (TrackerView) keep working.
export { clamp } from './sample-utils'

/** Pixel-space rect for a clip's bubble, shared by canvas drawing and
 *  rectangle-selection hit-testing so the two never drift apart. */
export function clipScreenRect(clip: LaneClip, pixelsPerTick: number): { x: number; width: number } {
  return {
    x: clip.startTick * pixelsPerTick,
    width: Math.max(12, clip.durationTicks * pixelsPerTick)
  }
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
    pan: lane.pan,
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

    clipIdSequence += 1
    const clipId = `clip-${samplePath}-${startTick}-${Date.now()}-${clipIdSequence}`
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

// A lane is dimmed when it is muted, or when any lane is soloed and this lane is
// not the soloed one. This is the *visual* policy and intentionally differs from
// engine audibility (laneIsAudible) for the soloed-and-muted edge case: a soloed
// lane is audible even if muted, but muted lanes always dim for visual feedback.
export function laneShouldDim(lane: LaneState, anySoloed: boolean): boolean {
  if (lane.muted) return true
  if (anySoloed && !lane.solo) return true
  return false
}

function findClipById(lanes: LaneState[], clipId: string): { clip: LaneClip; laneIndex: number } | null {
  for (const lane of lanes) {
    const found = lane.clips.find((c) => c.id === clipId)
    if (found) return { clip: found, laneIndex: lane.index }
  }
  return null
}

function newClipFrom(source: LaneClip, startTick: number): LaneClip {
  clipIdSequence += 1
  return {
    ...source,
    id: `clip-${source.samplePath}-${startTick}-${Date.now()}-${clipIdSequence}`,
    startTick
  }
}

export function moveClipOnLane(
  lanes: LaneState[],
  clipId: string,
  toLaneIndex: number,
  newStartTick: number
): LaneState[] {
  const found = findClipById(lanes, clipId)
  if (!found) return lanes

  // Preserve clip identity (same id) so undo/redo and multi-select tracking
  // stay consistent. Remove from the source lane, place on the target lane
  // with the original id intact.
  const movedClip: LaneClip = { ...found.clip, startTick: newStartTick }

  return lanes.map((lane) => {
    if (lane.index === found.laneIndex && lane.index === toLaneIndex) {
      // Same lane: replace in place.
      return { ...lane, clips: sortClips(lane.clips.map((c) => (c.id === clipId ? movedClip : c))) }
    }
    if (lane.index === found.laneIndex) {
      // Source lane: remove.
      return { ...lane, clips: lane.clips.filter((c) => c.id !== clipId) }
    }
    if (lane.index === toLaneIndex) {
      // Target lane: insert.
      return { ...lane, clips: sortClips([...lane.clips, movedClip]) }
    }
    return lane
  })
}

export function duplicateClipOnLane(
  lanes: LaneState[],
  clipId: string,
  toLaneIndex: number,
  newStartTick: number
): LaneState[] {
  const found = findClipById(lanes, clipId)
  if (!found) return lanes
  return placeClipOnLane(
    lanes, toLaneIndex, found.clip.samplePath, found.clip.sampleName,
    newStartTick, found.clip.durationTicks, found.clip.durationSeconds, found.clip.color
  )
}

export interface ClipGroupEntry {
  clipId: string
  toLaneIndex: number
  newStartTick: number
}

/** Batch-moves a selection of clips in a single pass over `lanes`, instead of
 *  rebuilding the full lane array once per clip. Source clips are looked up
 *  before any mutation so offsets are resolved against the pre-drag layout.
 *  Lanes that neither lose nor gain a clip keep their identity so memoized
 *  consumers skip re-rendering them. */
export function moveClipGroup(lanes: LaneState[], moves: ClipGroupEntry[]): LaneState[] {
  const resolved = moves
    .map(({ clipId, toLaneIndex, newStartTick }) => {
      const found = findClipById(lanes, clipId)
      return found ? { clipId, toLaneIndex, newStartTick, clip: found.clip } : null
    })
    .filter((entry): entry is { clipId: string; toLaneIndex: number; newStartTick: number; clip: LaneClip } => entry !== null)
  if (resolved.length === 0) return lanes

  const movingIds = new Set(resolved.map((entry) => entry.clipId))
  const gainsByLane = new Map<number, LaneClip[]>()
  for (const entry of resolved) {
    const gains = gainsByLane.get(entry.toLaneIndex) ?? []
    gains.push({ ...entry.clip, startTick: entry.newStartTick })
    gainsByLane.set(entry.toLaneIndex, gains)
  }

  return lanes.map((lane) => {
    const kept = lane.clips.filter((c) => !movingIds.has(c.id))
    const gains = gainsByLane.get(lane.index)
    if (kept.length === lane.clips.length && !gains) return lane
    return { ...lane, clips: sortClips(gains ? [...kept, ...gains] : kept) }
  })
}

/** Batch-duplicates a selection of clips in a single pass over `lanes`.
 *  Untouched lanes keep their identity. */
export function duplicateClipGroup(lanes: LaneState[], sources: ClipGroupEntry[]): LaneState[] {
  const resolved = sources
    .map(({ clipId, toLaneIndex, newStartTick }) => {
      const found = findClipById(lanes, clipId)
      return found ? { toLaneIndex, newStartTick, clip: found.clip } : null
    })
    .filter((entry): entry is { toLaneIndex: number; newStartTick: number; clip: LaneClip } => entry !== null)
  if (resolved.length === 0) return lanes

  const gainsByLane = new Map<number, LaneClip[]>()
  for (const entry of resolved) {
    const gains = gainsByLane.get(entry.toLaneIndex) ?? []
    gains.push(newClipFrom(entry.clip, entry.newStartTick))
    gainsByLane.set(entry.toLaneIndex, gains)
  }

  return lanes.map((lane) => {
    const gains = gainsByLane.get(lane.index)
    if (!gains) return lane
    return { ...lane, clips: sortClips([...lane.clips, ...gains]) }
  })
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

/** Batch-removes clips by id across all lanes in a single pass, so a
 *  multi-clip delete is one state transition (and one undo history entry).
 *  Returns the input array unchanged when no clip matched. */
export function removeClips(lanes: LaneState[], clipIds: readonly string[]): LaneState[] {
  const ids = new Set(clipIds)
  let changed = false
  const next = lanes.map((lane) => {
    const kept = lane.clips.filter((c) => !ids.has(c.id))
    if (kept.length === lane.clips.length) return lane
    changed = true
    return { ...lane, clips: kept }
  })
  return changed ? next : lanes
}

export function setLanePan(lanes: LaneState[], laneIndex: number, pan: number): LaneState[] {
  return lanes.map((lane) =>
    lane.index === laneIndex ? { ...lane, pan: clamp(pan, -1, 1) } : lane
  )
}