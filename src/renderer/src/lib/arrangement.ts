import type { SampleListItem } from '../../../shared/backend-api'
import { type EngineLane } from '../engine/lane-evaluation'
import { BEATS_PER_BAR, TICKS_PER_BAR, tickDurationSeconds } from '../engine/transport'
import { clamp } from './sample-utils'

/** Detail passed around the UI after a user selects or drags a sample. All
 *  paths are relpaths within the active Sample Folder's scan root. */
export type FooterSampleDetail = Pick<SampleListItem, 'name' | 'relpath' | 'tags' | 'bpm'> & {
  duration: number | null
  /** Category-derived palette slot (0-7, 8 = Unsorted). The hex resolves at
   *  draw time from the active theme's palette, so placements recolor on theme
   *  switch while staying stable across category renames (spec-002). */
  slot?: number
}

export const DEFAULT_LANE_COUNT = 16
export const TRACKER_GEOMETRY_SCALE = 0.75

function compactTrackerPixels(basePixels: number, gridPixels = 1): number {
  return Math.round(basePixels * TRACKER_GEOMETRY_SCALE / gridPixels) * gridPixels
}

// The 75% compact geometry keeps every value on a whole-pixel or small-grid
// boundary so lane heads, ruler marks, and bubble edges render without
// sub-pixel blur at default zoom.
export const LANE_HEIGHT_PX = compactTrackerPixels(52)
// Align to 8px grid so the lane-head left edge and the ruler's left padding
// share the same x-origin after the 75% scale, keeping grid lines crisp.
export const LANE_HEAD_WIDTH_PX = compactTrackerPixels(320, 8)
export const RULER_HEIGHT_PX = compactTrackerPixels(44)
// Snap mute/solo/pan controls to a 4px grid so they stay evenly sized and
// centered inside the lane head without fractional overflow.
export const TRACKER_LANE_CONTROL_SIZE_PX = compactTrackerPixels(44, 4)
export const TRACKER_BAR_COUNT = 999
export const TRACKER_BEAT_WIDTH_PX = compactTrackerPixels(42)
export const TRACKER_TOTAL_TICKS = TRACKER_BAR_COUNT * TICKS_PER_BAR
export const TRACKER_TIMELINE_MIN_WIDTH_PX =
  LANE_HEAD_WIDTH_PX + TRACKER_BAR_COUNT * BEATS_PER_BAR * TRACKER_BEAT_WIDTH_PX
export const DEFAULT_PLACEMENT_DURATION_TICKS = 32
export const SAMPLE_BUBBLE_HEIGHT_PX = compactTrackerPixels(34)
export const DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND = compactTrackerPixels(84)
const SAMPLE_BUBBLE_MIN_WIDTH_PX = 12
const SAMPLE_BUBBLE_UNKNOWN_DURATION_SECONDS = 2

/** Convert the Tracker's tick geometry into the one pixels-per-second scale
 * shared by every sample-bubble renderer. */
export function timelinePixelsPerSecond(
  timelineWidth: number,
  totalTicks: number,
  bpm: number
): number {
  if (!(timelineWidth > 0) || !(totalTicks > 0) || !(bpm > 0)) {
    return DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND
  }
  const scale = (timelineWidth / totalTicks) / tickDurationSeconds(bpm)
  return Number.isFinite(scale) && scale > 0
    ? scale
    : DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND
}

// The upper MixJam Browser must leave its collapse control reachable.
export const LEFT_COL_MIN_PX = 168

export interface ClipPlacement {
  id: string
  samplePath: string
  sampleName: string
  startTick: number
  durationTicks: number
  /** Immutable source-audio duration in seconds. Tracker geometry and playback
   * duration are controlled by durationTicks. */
  durationSeconds: number | null
  /** Native tempo captured from the sample when it is placed. Keeping tempo
   * with the placement lets one lane contain loops at different tempos. */
  nativeBPM?: number | null
  /** Transient marker for a placement created before background analysis had
   * produced a native BPM. It is intentionally omitted from project files. */
  nativeBPMPending?: boolean
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
  placements: ClipPlacement[]
}

// Monotonic counter appended to generated placement ids so multiple placements
// synchronously in the same millisecond (e.g. a batched group duplicate)
// never collide on id, which would make delete/select-by-id affect both.
let placementIdSequence = 0

/** Width for the visual snapshot of a sample at the Player's shared timeline
 * scale. The same pixels-per-second value must be supplied to every UI view. */
export function sampleBubbleWidth(
  durationSeconds: number | null,
  pixelsPerSecond: number = DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND
): number {
  const duration = durationSeconds !== null && durationSeconds > 0
    ? durationSeconds
    : SAMPLE_BUBBLE_UNKNOWN_DURATION_SECONDS
  const scale = Number.isFinite(pixelsPerSecond) && pixelsPerSecond > 0
    ? pixelsPerSecond
    : DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND
  return Math.max(SAMPLE_BUBBLE_MIN_WIDTH_PX, duration * scale)
}

/** Convert a placement-owned musical span to its shared pixel width. */
export function sampleBubbleWidthFromTicks(
  durationTicks: number,
  pixelsPerTick: number
): number {
  const musicalWidth = durationTicks * pixelsPerTick
  return Math.max(
    SAMPLE_BUBBLE_MIN_WIDTH_PX,
    Number.isFinite(musicalWidth) && musicalWidth > 0 ? musicalWidth : 0
  )
}

/** Pixel-space rect shared by Tracker drawing and hit-testing. Both placement
 * position and width follow the musical timeline, so BPM changes cannot morph
 * the arrangement. */
export function sampleBubbleScreenRect(
  placement: ClipPlacement,
  pixelsPerTick: number
): { x: number; width: number } {
  return {
    x: placement.startTick * pixelsPerTick,
    width: sampleBubbleWidthFromTicks(placement.durationTicks, pixelsPerTick)
  }
}

export function createDefaultLanes(): LaneState[] {
  return Array.from({ length: DEFAULT_LANE_COUNT }, (_, index) => ({
    index,
    name: `Lane ${index + 1}`,
    muted: false,
    solo: false,
    pan: 0,
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
    channelIndex: lane.index,
    placements: lane.placements.map((placement) => ({
      startTick: placement.startTick,
      durationTicks: placement.durationTicks,
      samplePath: placement.samplePath,
      nativeBPM: placement.nativeBPM ?? null
    }))
  }))
}

export function placementDurationTicks(durationSeconds: number | null, bpm: number): number {
  if (!durationSeconds || durationSeconds <= 0) return DEFAULT_PLACEMENT_DURATION_TICKS
  const tickSec = tickDurationSeconds(bpm)
  return Math.max(1, Math.round(durationSeconds / tickSec))
}

/** Keep a complete placement inside the 999-bar arrangement. A sample that is
 * longer than the whole arrangement cannot be represented and is rejected. */
function clampPlacementStartTick(startTick: number, durationTicks: number): number | null {
  if (!Number.isFinite(startTick) || !Number.isFinite(durationTicks)) return null
  const duration = Math.floor(durationTicks)
  if (duration < 1 || duration > TRACKER_TOTAL_TICKS) return null
  return clamp(Math.floor(startTick), 0, TRACKER_TOTAL_TICKS - duration)
}

export function placeSampleOnLane(
  lanes: LaneState[],
  laneIndex: number,
  samplePath: string,
  sampleName: string,
  startTick: number,
  durationTicks: number = DEFAULT_PLACEMENT_DURATION_TICKS,
  durationSeconds?: number | null,
  slot?: number,
  sampleBpm?: number | null
): LaneState[] {
  const boundedStartTick = clampPlacementStartTick(startTick, durationTicks)
  if (boundedStartTick === null) return lanes
  const boundedDurationTicks = Math.floor(durationTicks)

  return lanes.map((lane) => {
    if (lane.index !== laneIndex) return lane

    placementIdSequence += 1
    const placementId = `placement-${samplePath}-${boundedStartTick}-${Date.now()}-${placementIdSequence}`
    const newPlacement: ClipPlacement = {
      id: placementId,
      samplePath,
      sampleName,
      startTick: boundedStartTick,
      durationTicks: boundedDurationTicks,
      durationSeconds: durationSeconds ?? null,
      nativeBPM: sampleBpm !== null && sampleBpm !== undefined && Number.isFinite(sampleBpm) && sampleBpm > 0
        ? sampleBpm
        : null,
      nativeBPMPending: sampleBpm === null || sampleBpm === undefined || !Number.isFinite(sampleBpm) || sampleBpm <= 0,
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

/** Exact musical end of the arrangement. Silent gaps and lane audibility do
 * not affect the result: every persisted placement contributes its end tick. */
export function songEndTick(lanes: readonly LaneState[]): number {
  let endTick = 0
  for (const lane of lanes) {
    for (const placement of lane.placements) {
      endTick = Math.max(endTick, placement.startTick + placement.durationTicks)
    }
  }
  return Math.min(TRACKER_TOTAL_TICKS, endTick)
}

/** Fills only placements that were created before analysis finished. Positive
 * BPM values captured at drop time remain placement-owned and never drift when
 * sample metadata is edited later. */
export function resolvePendingPlacementBpms(
  lanes: LaneState[],
  sampleBpms: ReadonlyMap<string, number>
): LaneState[] {
  let changed = false
  const next = lanes.map((lane) => {
    let laneChanged = false
    const placements = lane.placements.map((placement) => {
      if (!placement.nativeBPMPending) return placement
      const bpm = sampleBpms.get(placement.samplePath)
      if (bpm === undefined || !Number.isFinite(bpm) || bpm <= 0) return placement
      changed = true
      laneChanged = true
      return { ...placement, nativeBPM: bpm, nativeBPMPending: false }
    })
    return laneChanged ? { ...lane, placements } : lane
  })
  return changed ? next : lanes
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
  const boundedStartTick = clampPlacementStartTick(newStartTick, found.placement.durationTicks)
  if (boundedStartTick === null) return lanes

  // Preserve placement identity (same id) so undo/redo and multi-select tracking
  // stay consistent. Remove from the source lane, place on the target lane
  // with the original id intact.
  const movedPlacement: ClipPlacement = { ...found.placement, startTick: boundedStartTick }

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
    newStartTick, found.placement.durationTicks, found.placement.durationSeconds, found.placement.slot,
    found.placement.nativeBPM
  )
}

export interface PlacementGroupEntry {
  placementId: string
  toLaneIndex: number
  newStartTick: number
}

interface ResolvedPlacementGroupEntry extends PlacementGroupEntry {
  placement: ClipPlacement
}

function clampPlacementGroup(entries: ResolvedPlacementGroupEntry[]): ResolvedPlacementGroupEntry[] | null {
  const starts = entries.map((entry) => Math.floor(entry.newStartTick))
  if (starts.some((startTick) => !Number.isFinite(startTick))) return null
  if (entries.some((entry) => entry.placement.durationTicks < 1 || entry.placement.durationTicks > TRACKER_TOTAL_TICKS)) {
    return null
  }

  const minimumStart = Math.min(...starts)
  const maximumEnd = Math.max(...entries.map((entry, index) =>
    starts[index]! + entry.placement.durationTicks
  ))
  if (maximumEnd - minimumStart > TRACKER_TOTAL_TICKS) return null

  const shift = minimumStart < 0
    ? -minimumStart
    : maximumEnd > TRACKER_TOTAL_TICKS
      ? TRACKER_TOTAL_TICKS - maximumEnd
      : 0
  return entries.map((entry, index) => ({
    ...entry,
    newStartTick: starts[index]! + shift
  }))
}

/** Batch-moves a selection of placements in a single pass over `lanes`, instead of
 *  rebuilding the full lane array once per placement. Source placements are looked up
 *  before any mutation so offsets are resolved against the pre-drag layout.
 *  Lanes that neither lose nor gain a placement keep their identity so memoized
 *  consumers skip re-rendering them. */
export function movePlacementGroup(lanes: LaneState[], moves: PlacementGroupEntry[]): LaneState[] {
  const resolved = clampPlacementGroup(moves
    .map(({ placementId, toLaneIndex, newStartTick }) => {
      const found = findPlacementById(lanes, placementId)
      return found ? { placementId, toLaneIndex, newStartTick, placement: found.placement } : null
    })
    .filter((entry): entry is ResolvedPlacementGroupEntry => entry !== null))
  if (!resolved || resolved.length === 0) return lanes

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
  const resolved = clampPlacementGroup(sources
    .map(({ placementId, toLaneIndex, newStartTick }) => {
      const found = findPlacementById(lanes, placementId)
      return found ? { placementId, toLaneIndex, newStartTick, placement: found.placement } : null
    })
    .filter((entry): entry is ResolvedPlacementGroupEntry => entry !== null))
  if (!resolved || resolved.length === 0) return lanes

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

