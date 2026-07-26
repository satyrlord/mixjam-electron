import type {
  MixJamGeneratorLanePlan,
  MixJamGeneratorParameters,
  MixJamGeneratorSectionPlan,
  SampleType
} from '../../../shared/backend-api'
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import { TONAL_SAMPLE_TYPES } from './analysis'
import type { AnalyzedGeneratorCandidate } from './generator-analysis'
import { generatorCandidateDurationTicks } from './generator-candidate'
import type { GeneratorCandidate } from './generator-library'
import { parseMotifKey } from './generator-motif'
import { parseMusicalKey } from './musical-key'
import type { GeneratorArcProfile, GeneratorLaneProfile, GeneratorProfile } from '../../../shared/generator-templates'

// The shared vocabulary and primitive helpers every planning stage (selection,
// scheduling, stereo, validation) builds on. Keeping them in one place lets the
// stage modules stay independent of one another.

/** Re-exported under the planning vocabulary's name; defined in `./analysis`. */
export const TONAL_TYPES = TONAL_SAMPLE_TYPES
// Roles whose musical value is a coherent, authored motif rather than a single
// hit. For these the arranger must keep one numbered family together instead of
// hopping between unrelated families phrase to phrase.
export const FAMILY_ROLES = new Set(['motif', 'vocal', 'atmosphere'])

// A generated arrangement must populate at least this many lanes to sound like
// a full production, and never more than the ceiling. These, exact song end,
// no lane overlap, and placements inside the song are the *only* hard failures
// the planner has — the occupancy envelope is a report (spec-021 §Envelope).
export const MIN_GENERATED_LANES = 8
export const MAX_GENERATED_LANES = 32
// Minimum share of distinct placed samples that must belong to a family with
// at least two placed parts. Lower intensities are stricter: a chill track
// leans on fewer, more coherent authored kits. This steers *selection*; it is
// never validated, so a family-less corpus stays generatable.
export const FAMILY_RATIO_TARGETS: Record<MixJamGeneratorParameters['intensity'], number> = {
  low: 0.8,
  medium: 0.7,
  high: 0.6
}

export type PlanningCandidate = GeneratorCandidate & Partial<Pick<AnalyzedGeneratorCandidate,
  'rms' | 'peak' | 'spectralCentroid' | 'transientDensity' | 'attackStrength' |
  'rhythmicRegularity' | 'loopConfidence' | 'boundaryContinuity' | 'energySlope' | 'plannerKind'>>

export interface Selection {
  requestedType: SampleType
  selectedType: SampleType
  candidates: PlanningCandidate[]
}

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function hashText(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function stableId(prefix: string, source: string): string {
  return `${prefix}-${hashText(source).toString(16).padStart(8, '0')}`
}

export function halfUp(value: number): number {
  return Math.floor(value + 0.5)
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function quantizeUpToBeat(tick: number): number {
  return Math.ceil(tick / TICKS_PER_BEAT) * TICKS_PER_BEAT
}

export function keyRank(value: string | null, target: string | null): number {
  if (target === null) return 0
  if (value === null) return 2
  const source = parseMusicalKey(value)
  const destination = parseMusicalKey(target)
  if (!source || !destination) return 3
  if (source.root === destination.root && source.minor === destination.minor) return 0
  const relativeRoot = destination.minor ? (destination.root + 3) % 12 : (destination.root + 9) % 12
  return source.minor !== destination.minor && source.root === relativeRoot ? 1 : 3
}

export function durationTicks(candidate: PlanningCandidate, bpm: number): number {
  return generatorCandidateDurationTicks(candidate, bpm)
}

export function candidateFamily(candidate: PlanningCandidate): string {
  return parseMotifKey(candidate.filename).family
}

export function placementEnd(placement: MixJamGeneratorLanePlan['placements'][number]): number {
  return placement.startTick + placement.durationTicks
}

export function intervalIsFree(lane: MixJamGeneratorLanePlan, startTick: number, endTick: number): boolean {
  return lane.placements.every((placement) => placementEnd(placement) <= startTick || placement.startTick >= endTick)
}

/**
 * One musical span per sample, for the whole project.
 *
 * spec-011 AC-016 makes conflicting `durationTicks` for the same `sampleRef`
 * invalid project data, so a span is a property of the *sample*, not of the
 * site that placed it. Schedulers still trim (a monophonic lane cuts a hit at
 * the next one), but the first trim wins everywhere and later sites reuse it
 * rather than writing a second span. Without this the planner emits projects
 * that its own loader rejects.
 */
export interface SpanRegistry {
  /** sampleRef -> the one span every placement of that sample uses. */
  bySample: Map<string, number>
  /** Exclusive end of the song; nothing may extend past it. */
  songEndTick: number
}

export function createSpanRegistry(songEndTick: number): SpanRegistry {
  return { bySample: new Map(), songEndTick }
}

export function registeredSpan(spans: SpanRegistry, candidate: PlanningCandidate, span: number): number {
  return spans.bySample.get(candidate.relpath) ?? span
}

export function addPlacement(
  lane: MixJamGeneratorLanePlan, candidate: PlanningCandidate, startTick: number, span: number,
  ordinal: number, profile: GeneratorProfile, seed: string, spans: SpanRegistry
): boolean {
  // The registry decides the span; a caller's request only applies to a sample
  // nothing has placed yet. Re-checking the bounds below uses the resolved span,
  // so a widened reuse can neither overlap nor spill past the song end. Both
  // checks live here rather than in each scheduler because a caller that
  // computes its own bound is testing a span the registry may override.
  const resolved = registeredSpan(spans, candidate, span)
  if (resolved < 1 || startTick < 0 || startTick + resolved > spans.songEndTick) return false
  if (!intervalIsFree(lane, startTick, startTick + resolved)) return false
  spans.bySample.set(candidate.relpath, resolved)
  span = resolved
  lane.placements.push({
    id: stableId('placement', `${seed}:${profile.id}:${profile.version}:lane-${lane.index}:${ordinal}`),
    sampleRef: candidate.relpath,
    sampleName: candidate.filename,
    startTick,
    durationTicks: span,
    durationSeconds: candidate.duration,
    nativeBpm: candidate.bpm,
    slot: candidate.paletteSlot
  })
  return true
}

export function maximumLegalSpan(
  laneIndex: number,
  sections: readonly MixJamGeneratorSectionPlan[],
  arc: GeneratorArcProfile,
  profile: GeneratorProfile
): number {
  const lane = profile.lanes[laneIndex]!
  const songEnd = sections.at(-1)!.endBar * TICKS_PER_BAR
  if (lane.role === 'transition') {
    return Math.max(0, ...sections.slice(1).map((section) => {
      const boundary = section.startBar * TICKS_PER_BAR
      return lane.transitionKind === 'riser' ? boundary : songEnd - boundary
    }))
  }
  return Math.max(0, ...sections.flatMap((section, sectionIndex) => {
    if (!arc.sections[sectionIndex]!.activeLanes.includes(laneIndex)) return []
    const sectionSpan = (section.endBar - section.startBar) * TICKS_PER_BAR
    return [lane.role === 'atmosphere' ? sectionSpan : Math.min(8 * TICKS_PER_BAR, sectionSpan)]
  }))
}

/**
 * The candidate a lane plays at a given cue. A lane's selected pool is already
 * family-coherent (see `selectDiverseCandidates`), so walking it in order walks
 * one authored idea's numbered parts.
 *
 * `variant` is the swap generation — how many `swap` ops the lane has passed.
 * It shifts the starting part, which is exactly §1.5.1's technique: the lane
 * keeps its role and identity and changes to a numbered sibling at a boundary.
 * `cue` advances within a phrase so a short motif walks parts 1 → 2 → 3 rather
 * than tiling one fragment.
 */
export function candidateForCue(
  selection: Selection, variant: number, cue: number
): PlanningCandidate {
  const families = laneFamilies(selection)
  if (families.length === 0) return selection.candidates[0]!
  // With several families on the lane, a swap moves to the next family. With
  // one — the common case for a pack whose whole role shares a stem — it moves
  // to the next numbered part of that family. Either way the lane keeps its
  // identity and changes to a sibling, and `cue` never crosses a family inside
  // one phrase.
  const family = families[variant % families.length]!
  const offset = Math.floor(variant / families.length)
  return family[(offset + cue) % family.length]!
}

/** The lane's selected pool grouped by authored family, in selection order. */
function laneFamilies(selection: Selection): PlanningCandidate[][] {
  const byFamily = new Map<string, PlanningCandidate[]>()
  for (const candidate of selection.candidates) {
    const family = parseMotifKey(candidate.filename).family
    const members = byFamily.get(family)
    if (members) members.push(candidate)
    else byFamily.set(family, [candidate])
  }
  return [...byFamily.values()]
}

/**
 * The first candidate at or after `cue` whose span fits `available` ticks, or
 * null when nothing in the pool fits. Skipping rather than stopping matters: a
 * pool holding one 8-bar sibling used to end a lane's whole phrase after the
 * first 2-bar tile, and the deleted density repair pass existed to hide it.
 */
export function fittingCandidateForCue(
  selection: Selection, variant: number, cue: number, available: number, bpm: number,
  spans: SpanRegistry
): { candidate: PlanningCandidate; span: number } | null {
  for (let step = 0; step < selection.candidates.length; step++) {
    const candidate = candidateForCue(selection, variant, cue + step)
    // Fit against the span this sample will actually get, not its raw length —
    // otherwise a candidate already registered longer elsewhere reports a fit
    // and `addPlacement` then rejects it, silently truncating the phrase.
    const span = registeredSpan(spans, candidate, durationTicks(candidate, bpm))
    if (span <= available) return { candidate, span }
  }
  return null
}

export type { GeneratorArcProfile, GeneratorLaneProfile, GeneratorProfile }
