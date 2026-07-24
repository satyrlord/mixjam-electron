import type {
  MixJamGeneratorLanePlan,
  MixJamGeneratorParameters,
  MixJamGeneratorPhrasePlan,
  MixJamGeneratorSectionPlan,
  SampleType
} from '../../../shared/backend-api'
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import type { AnalyzedGeneratorCandidate } from './generator-analysis'
import { generatorCandidateDurationTicks } from './generator-candidate'
import type { GeneratorCandidate } from './generator-library'
import { parseMotifKey } from './generator-motif'
import { parseMusicalKey } from './musical-key'
import type { GeneratorLaneProfile, GeneratorProfile } from './generator-profiles'

// The shared vocabulary and primitive helpers every planning stage (selection,
// scheduling, density, stereo, validation) builds on. Keeping them in one place
// lets the stage modules stay independent of one another.

export const TONAL_TYPES = new Set<SampleType>(['Bass', 'Synth', 'Loop', 'Vocal', 'Atmosphere'])
// Roles whose musical value is a coherent, authored motif rather than a single
// hit. For these the arranger must keep one numbered family together instead of
// hopping between unrelated families phrase to phrase.
export const FAMILY_ROLES = new Set(['motif', 'vocal', 'atmosphere'])

// A generated arrangement must populate at least this many lanes to sound like
// a full production, and never more than the ceiling.
export const MIN_GENERATED_LANES = 8
export const MAX_GENERATED_LANES = 32
// Minimum share of distinct placed samples that must belong to a family with
// at least two placed parts. Lower intensities are stricter: a chill track
// leans on fewer, more coherent authored kits.
export const FAMILY_RATIO_TARGETS: Record<MixJamGeneratorParameters['intensity'], number> = {
  low: 0.8,
  medium: 0.7,
  high: 0.6
}
// The Pareto density rule: at least DENSE_LANE_SHARE of populated
// non-transition lanes must have at least DENSE_BAR_SHARE of the song's bars
// populated, where a bar counts as populated when the lane sounds on most of
// its beat grid (see barPopulation).
export const DENSE_LANE_SHARE = 0.8
export const DENSE_BAR_SHARE = 0.8
// Roughly one lane in five plays as a hard-panned stereo pair; every other
// lane is perfectly centered. Pan is a three-way decision: -1, 0, or +1.
export const STEREO_PAIR_LANE_SHARE = 0.2

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

export function addPlacement(
  lane: MixJamGeneratorLanePlan, candidate: PlanningCandidate, startTick: number, span: number,
  ordinal: number, profile: GeneratorProfile, seed: string
): void {
  if (!intervalIsFree(lane, startTick, startTick + span)) return
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
}

// The anchor family is the family of the lead (highest-ranked) candidate. A
// motifs walk that family's numbered parts in order so the same coherent idea
// recurs across the song and returns after a breakdown; B motifs prefer a
// sibling family for contrast. This replaces a flat modular walk that hopped
// between unrelated families every phrase.
function partitionByFamily(candidates: readonly PlanningCandidate[]): {
  anchor: PlanningCandidate[]
  others: PlanningCandidate[]
} {
  if (candidates.length === 0) return { anchor: [], others: [] }
  const anchorFamily = parseMotifKey(candidates[0]!.filename).family
  const anchor: PlanningCandidate[] = []
  const others: PlanningCandidate[] = []
  for (const candidate of candidates) {
    if (parseMotifKey(candidate.filename).family === anchorFamily) anchor.push(candidate)
    else others.push(candidate)
  }
  return { anchor, others }
}

export function maximumLegalSpan(
  laneIndex: number,
  sections: readonly MixJamGeneratorSectionPlan[],
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
    if (!profile.sections[sectionIndex]!.activeLanes.includes(laneIndex)) return []
    const sectionSpan = (section.endBar - section.startBar) * TICKS_PER_BAR
    return [lane.role === 'atmosphere' ? sectionSpan : Math.min(8 * TICKS_PER_BAR, sectionSpan)]
  }))
}

export function candidateForPhrase(
  selection: Selection, phrase: MixJamGeneratorPhrasePlan,
  phraseOrdinal: number, laneIndex: number, offset = 0
): PlanningCandidate {
  const { anchor, others } = partitionByFamily(selection.candidates)
  // Keep a per-lane phase so independent lanes do not lockstep on part 1.
  const step = phraseOrdinal + offset + laneIndex
  if (phrase.motif === 'B' && others.length > 0) {
    return others[step % others.length]!
  }
  const pool = anchor.length > 0 ? anchor : selection.candidates
  return pool[step % pool.length]!
}

export type { GeneratorLaneProfile, GeneratorProfile }
