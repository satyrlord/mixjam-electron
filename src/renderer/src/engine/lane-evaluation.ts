// Pure scheduling logic for lanes: given the set of lanes and a tick, decide
// which placements should trigger a voice. Respects mute, solo (solo overrides mute),
// and the monophonic rule (a lane plays at most one voice; a new trigger cuts
// off the previous one — handled by the caller via the per-lane voice it owns).
//
// Engine boundary: pure TypeScript. No React, no DOM, no Web Audio. This is the
// decision layer the scheduler consults; the engine performs the actual
// triggering.

import { weakMemoize1 } from '../lib/weak-memoize'

export interface EnginePlacement {
  startTick: number
  durationTicks: number
  samplePath: string
  nativeBPM?: number | null
}

export interface EngineLane {
  index: number
  muted: boolean
  solo: boolean
  /** Project lane pan. Playback applies it once in the lane-derived channel. */
  pan: number
  channelIndex: number
  placements: EnginePlacement[]
}

export interface LaneTrigger {
  laneIndex: number
  channelIndex: number
  samplePath: string
  nativeBPM: number | null
  placement: EnginePlacement
  /** Audible span after later same-lane placements apply monophonic precedence. */
  effectiveDurationTicks: number
  nextPlacement?: EnginePlacement
  fadeInAtStart: boolean
  fadeOutAtEnd: boolean
}

// The mute/solo audibility policy is defined once here over the minimal
// { muted, solo } shape so both the engine (EngineLane) and the UI
// (LaneState, via arrangement) share a single source of truth.
export interface MuteSolo {
  muted: boolean
  solo: boolean
}

export function anyLaneSoloed(lanes: readonly MuteSolo[]): boolean {
  return lanes.some((lane) => lane.solo)
}

// A lane is audible when it is not muted, and — if any lane is soloed — when it
// is itself soloed. Solo overrides mute for soloed lanes.
export function laneIsAudible(lane: MuteSolo, soloActive: boolean): boolean {
  if (soloActive) return lane.solo
  return !lane.muted
}

function placementEnd(placement: EnginePlacement): number {
  return placement.startTick + placement.durationTicks
}

interface EffectivePlacement {
  placement: EnginePlacement
  startTick: number
  endTick: number
}

interface LaneEvaluation {
  placements: EffectivePlacement[]
  /** startTick -> index into `placements`, so a tick lookup is O(1). */
  indexByStartTick: Map<number, number>
}

// The scheduler asks "what fires at this tick?" 40 times a second, but the
// answer only changes when the arrangement is edited. Placement arrays are
// immutable by convention (every edit produces a new array), so caching on
// array identity is exact: a stale entry is impossible, and an edit is a
// guaranteed miss. Keyed weakly so deleted lanes cannot leak.
const evaluatePlacements = weakMemoize1(
  (placements: readonly EnginePlacement[]): LaneEvaluation => {
    const winnerByStart = new Map<number, EnginePlacement>()
    for (const placement of placements) {
      winnerByStart.set(placement.startTick, placement)
    }
    const winners = [...winnerByStart.values()]
      .sort((left, right) => left.startTick - right.startTick)
    const effectivePlacements = winners.map((placement, index) => {
      const nextStart = winners[index + 1]?.startTick ?? Number.POSITIVE_INFINITY
      return {
        placement,
        startTick: placement.startTick,
        endTick: Math.min(placementEnd(placement), nextStart)
      }
    }).filter(({ startTick, endTick }) => endTick > startTick)

    const indexByStartTick = new Map<number, number>()
    for (let index = 0; index < effectivePlacements.length; index++) {
      indexByStartTick.set(effectivePlacements[index]!.startTick, index)
    }

    return { placements: effectivePlacements, indexByStartTick }
  }
)

/** Resolve the lane's stored overlaps into the segments that can actually
 * sound under the monophonic trigger rule. The last placement at one start
 * tick wins; a later start permanently cuts the prior winner. */
function evaluateLane(lane: EngineLane): LaneEvaluation {
  return evaluatePlacements(lane.placements)
}

function laneTrigger(
  lane: EngineLane,
  placements: readonly EffectivePlacement[],
  index: number
): LaneTrigger {
  const effective = placements[index]!
  const previous = placements[index - 1]
  const next = placements[index + 1]
  return {
    laneIndex: lane.index,
    channelIndex: lane.channelIndex,
    samplePath: effective.placement.samplePath,
    nativeBPM: effective.placement.nativeBPM ?? null,
    placement: effective.placement,
    effectiveDurationTicks: effective.endTick - effective.startTick,
    nextPlacement: next?.placement,
    fadeInAtStart: !previous || previous.endTick < effective.startTick,
    fadeOutAtEnd: !next || effective.endTick < next.startTick
  }
}

// Returns the triggers that fire exactly at `tick`: a placement fires when the
// playhead reaches its start tick on an audible lane. Placements that merely span the
// tick are already sounding and are not re-triggered.
export function triggersForTick(lanes: readonly EngineLane[], tick: number): LaneTrigger[] {
  const soloActive = anyLaneSoloed(lanes)
  const triggers: LaneTrigger[] = []

  for (const lane of lanes) {
    if (!laneIsAudible(lane, soloActive)) continue
    const { placements, indexByStartTick } = evaluateLane(lane)
    const index = indexByStartTick.get(tick)
    if (index !== undefined) {
      triggers.push(laneTrigger(lane, placements, index))
    }
  }

  return triggers
}

/** Returns the last placement that would already be sounding on each audible
 * lane when playback begins inside it. Exact starts remain owned by
 * triggersForTick(), avoiding duplicate voices at the starting tick. */
export function triggersForPlaybackStart(
  lanes: readonly EngineLane[],
  tick: number
): LaneTrigger[] {
  const soloActive = anyLaneSoloed(lanes)
  const triggers: LaneTrigger[] = []

  for (const lane of lanes) {
    if (!laneIsAudible(lane, soloActive)) continue
    const { placements } = evaluateLane(lane)
    const index = placements.findIndex(({ startTick, endTick }) =>
      startTick < tick && endTick > tick
    )
    if (index >= 0) {
      triggers.push(laneTrigger(lane, placements, index))
    }
  }

  return triggers
}
