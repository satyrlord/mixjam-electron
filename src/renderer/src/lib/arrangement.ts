import type { SampleListItem } from '../../../shared/backend-api'
import { type EngineLane } from '../engine/lane-evaluation'
import { tickDurationSeconds } from '../engine/transport'
import { clamp } from './sample-utils'

/** Detail passed around the UI after a user selects or drags a sample. All
 *  paths are relpaths within the active Sample Folder's scan root. */
export type FooterSampleDetail = Pick<SampleListItem, 'name' | 'relpath' | 'tags'> & {
  duration: number | null
  /** Category-derived palette slot (0-7, 8 = Unsorted). The hex resolves at
   *  draw time from the active theme's palette, so placements recolor on theme
   *  switch while staying stable across category renames (spec-002). */
  slot?: number
}

export const DEFAULT_LANE_COUNT = 16
export const LANE_HEIGHT_PX = 44
export const LANE_HEAD_WIDTH_PX = 168
export const RULER_HEIGHT_PX = 24
export const DEFAULT_PLACEMENT_DURATION_TICKS = 32
export const SAMPLE_BUBBLE_HEIGHT_PX = 32
const SAMPLE_BUBBLE_PIXELS_PER_SECOND = 84
const SAMPLE_BUBBLE_MIN_WIDTH_PX = 12
const SAMPLE_BUBBLE_UNKNOWN_DURATION_SECONDS = 2

// Left-column (Song Controls rail) resize seam bounds. The CSS fallback in
// index.css (`var(--left-col-w, 420px)`) must stay in sync with the default.
export const LEFT_COL_DEFAULT_PX = 420
export const LEFT_COL_MIN_PX = 168
// The mixer column (168px master + 104px min mixer) appears past this width;
// below it the mixer is considered hidden.
export const LEFT_COL_MIXER_THRESHOLD_PX = 272
// Keep the seam reachable: never persist/apply a width that would push column 2
// (and the seam itself) off-screen. Capped as a fraction of the viewport.
export const LEFT_COL_MAX_FRACTION = 0.8

export interface ClipPlacement {
  id: string
  samplePath: string
  sampleName: string
  startTick: number
  durationTicks: number
  /** Audio duration in seconds — drives the bubble width so a sample has the
   *  same pixel size everywhere (tracker, browser, any view). */
  durationSeconds: number | null
  /** Category-derived palette slot, stored at placement time. The slot (not a
   *  hex) is what stays stable; the color resolves from the active theme's
   *  palette at draw time (spec-002 Sample Palette). */
  slot?: number
}

export interface LaneState {
  index: number
  name: string
  muted: boolean
  solo: boolean
  pan: number
  /** Native tempo for loop material; null keeps samples at native rate. */
  nativeBPM?: number | null
  placements: ClipPlacement[]
}

// Monotonic counter appended to generated placement ids so multiple placements
// synchronously in the same millisecond (e.g. a batched group duplicate)
// never collide on id, which would make delete/select-by-id affect both.
let placementIdSequence = 0

/** Context-independent width for the visual snapshot of a sample. */
export function sampleBubbleWidth(durationSeconds: number | null): number {
  const duration = durationSeconds !== null && durationSeconds > 0
    ? durationSeconds
    : SAMPLE_BUBBLE_UNKNOWN_DURATION_SECONDS
  return Math.max(SAMPLE_BUBBLE_MIN_WIDTH_PX, duration * SAMPLE_BUBBLE_PIXELS_PER_SECOND)
}

/** Pixel-space rect shared by Tracker drawing and hit-testing. Placement
 * position follows the timeline; bubble width follows only source duration. */
export function sampleBubbleScreenRect(placement: ClipPlacement, pixelsPerTick: number): { x: number; width: number } {
  return {
    x: placement.startTick * pixelsPerTick,
    width: sampleBubbleWidth(placement.durationSeconds)
  }
}

export function createDefaultLanes(): LaneState[] {
  return Array.from({ length: DEFAULT_LANE_COUNT }, (_, index) => ({
    index,
    name: `Lane ${index + 1}`,
    muted: false,
    solo: false,
    pan: 0,
    nativeBPM: null,
    placements: []
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
    nativeBPM: lane.nativeBPM ?? null,
    channelIndex: lane.index,
    placements: lane.placements.map((placement) => ({
      startTick: placement.startTick,
      durationTicks: placement.durationTicks,
      samplePath: placement.samplePath
    }))
  }))
}

export function placementDurationTicks(durationSeconds: number | null, bpm: number): number {
  if (!durationSeconds || durationSeconds <= 0) return DEFAULT_PLACEMENT_DURATION_TICKS
  const tickSec = tickDurationSeconds(bpm)
  return Math.max(1, Math.round(durationSeconds / tickSec))
}

export function placeSampleOnLane(
  lanes: LaneState[],
  laneIndex: number,
  samplePath: string,
  sampleName: string,
  startTick: number,
  durationTicks: number = DEFAULT_PLACEMENT_DURATION_TICKS,
  durationSeconds?: number | null,
  slot?: number
): LaneState[] {
  return lanes.map((lane) => {
    if (lane.index !== laneIndex) return lane

    placementIdSequence += 1
    const placementId = `placement-${samplePath}-${startTick}-${Date.now()}-${placementIdSequence}`
    const newPlacement: ClipPlacement = {
      id: placementId,
      samplePath,
      sampleName,
      startTick,
      durationTicks,
      durationSeconds: durationSeconds ?? null,
      slot
    }

    // Placements visually overlap and are never trimmed — overlapping samples keep
    // their full bubbles so an accidental overlap never loses sample info. Only
    // the audio is monophonic: a new trigger cuts off the previous voice on the
    // lane (handled by PlaybackEngine.laneVoices), the bubble data is untouched.
    return {
      ...lane,
      placements: sortPlacements([...lane.placements, newPlacement])
    }
  })
}

function sortPlacements(placements: ClipPlacement[]): ClipPlacement[] {
  return [...placements].sort((a, b) => a.startTick - b.startTick)
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

function findPlacementById(lanes: LaneState[], placementId: string): { placement: ClipPlacement; laneIndex: number } | null {
  for (const lane of lanes) {
    const found = lane.placements.find((placement) => placement.id === placementId)
    if (found) return { placement: found, laneIndex: lane.index }
  }
  return null
}

function newPlacementFrom(source: ClipPlacement, startTick: number): ClipPlacement {
  placementIdSequence += 1
  return {
    ...source,
    id: `placement-${source.samplePath}-${startTick}-${Date.now()}-${placementIdSequence}`,
    startTick
  }
}

export function movePlacement(
  lanes: LaneState[],
  placementId: string,
  toLaneIndex: number,
  newStartTick: number
): LaneState[] {
  const found = findPlacementById(lanes, placementId)
  if (!found) return lanes

  // Preserve placement identity (same id) so undo/redo and multi-select tracking
  // stay consistent. Remove from the source lane, place on the target lane
  // with the original id intact.
  const movedPlacement: ClipPlacement = { ...found.placement, startTick: newStartTick }

  return lanes.map((lane) => {
    if (lane.index === found.laneIndex && lane.index === toLaneIndex) {
      // Same lane: replace in place.
      return { ...lane, placements: sortPlacements(lane.placements.map((placement) => (placement.id === placementId ? movedPlacement : placement))) }
    }
    if (lane.index === found.laneIndex) {
      // Source lane: remove.
      return { ...lane, placements: lane.placements.filter((placement) => placement.id !== placementId) }
    }
    if (lane.index === toLaneIndex) {
      // Target lane: insert.
      return { ...lane, placements: sortPlacements([...lane.placements, movedPlacement]) }
    }
    return lane
  })
}

export function duplicatePlacement(
  lanes: LaneState[],
  placementId: string,
  toLaneIndex: number,
  newStartTick: number
): LaneState[] {
  const found = findPlacementById(lanes, placementId)
  if (!found) return lanes
  return placeSampleOnLane(
    lanes, toLaneIndex, found.placement.samplePath, found.placement.sampleName,
    newStartTick, found.placement.durationTicks, found.placement.durationSeconds, found.placement.slot
  )
}

export interface PlacementGroupEntry {
  placementId: string
  toLaneIndex: number
  newStartTick: number
}

/** Batch-moves a selection of placements in a single pass over `lanes`, instead of
 *  rebuilding the full lane array once per placement. Source placements are looked up
 *  before any mutation so offsets are resolved against the pre-drag layout.
 *  Lanes that neither lose nor gain a placement keep their identity so memoized
 *  consumers skip re-rendering them. */
export function movePlacementGroup(lanes: LaneState[], moves: PlacementGroupEntry[]): LaneState[] {
  const resolved = moves
    .map(({ placementId, toLaneIndex, newStartTick }) => {
      const found = findPlacementById(lanes, placementId)
      return found ? { placementId, toLaneIndex, newStartTick, placement: found.placement } : null
    })
    .filter((entry): entry is { placementId: string; toLaneIndex: number; newStartTick: number; placement: ClipPlacement } => entry !== null)
  if (resolved.length === 0) return lanes

  const movingIds = new Set(resolved.map((entry) => entry.placementId))
  const gainsByLane = new Map<number, ClipPlacement[]>()
  for (const entry of resolved) {
    const gains = gainsByLane.get(entry.toLaneIndex) ?? []
    gains.push({ ...entry.placement, startTick: entry.newStartTick })
    gainsByLane.set(entry.toLaneIndex, gains)
  }

  return lanes.map((lane) => {
    const kept = lane.placements.filter((placement) => !movingIds.has(placement.id))
    const gains = gainsByLane.get(lane.index)
    if (kept.length === lane.placements.length && !gains) return lane
    return { ...lane, placements: sortPlacements(gains ? [...kept, ...gains] : kept) }
  })
}

/** Batch-duplicates a selection of placements in a single pass over `lanes`.
 *  Untouched lanes keep their identity. */
export function duplicatePlacementGroup(lanes: LaneState[], sources: PlacementGroupEntry[]): LaneState[] {
  const resolved = sources
    .map(({ placementId, toLaneIndex, newStartTick }) => {
      const found = findPlacementById(lanes, placementId)
      return found ? { toLaneIndex, newStartTick, placement: found.placement } : null
    })
    .filter((entry): entry is { toLaneIndex: number; newStartTick: number; placement: ClipPlacement } => entry !== null)
  if (resolved.length === 0) return lanes

  const gainsByLane = new Map<number, ClipPlacement[]>()
  for (const entry of resolved) {
    const gains = gainsByLane.get(entry.toLaneIndex) ?? []
    gains.push(newPlacementFrom(entry.placement, entry.newStartTick))
    gainsByLane.set(entry.toLaneIndex, gains)
  }

  return lanes.map((lane) => {
    const gains = gainsByLane.get(lane.index)
    if (!gains) return lane
    return { ...lane, placements: sortPlacements([...lane.placements, ...gains]) }
  })
}

export function removePlacementFromLane(
  lanes: LaneState[],
  laneIndex: number,
  placementId: string
): LaneState[] {
  return lanes.map((lane) => {
    if (lane.index !== laneIndex) return lane
    return { ...lane, placements: lane.placements.filter((placement) => placement.id !== placementId) }
  })
}

/** Batch-removes placements by id across all lanes in a single pass, so a
 *  multi-placement delete is one state transition (and one undo history entry).
 *  Returns the input array unchanged when no placement matched. */
export function removePlacements(lanes: LaneState[], placementIds: readonly string[]): LaneState[] {
  const ids = new Set(placementIds)
  let changed = false
  const next = lanes.map((lane) => {
    const kept = lane.placements.filter((placement) => !ids.has(placement.id))
    if (kept.length === lane.placements.length) return lane
    changed = true
    return { ...lane, placements: kept }
  })
  return changed ? next : lanes
}

export function setLanePan(lanes: LaneState[], laneIndex: number, pan: number): LaneState[] {
  return lanes.map((lane) =>
    lane.index === laneIndex ? { ...lane, pan: clamp(pan, -1, 1) } : lane
  )
}

export function setLaneNativeBpm(
  lanes: LaneState[],
  laneIndex: number,
  nativeBPM: number | null
): LaneState[] {
  const normalized = nativeBPM !== null && Number.isFinite(nativeBPM) && nativeBPM > 0
    ? nativeBPM
    : null
  return lanes.map((lane) =>
    lane.index === laneIndex ? { ...lane, nativeBPM: normalized } : lane
  )
}
