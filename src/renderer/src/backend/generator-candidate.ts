import type { SampleType } from '../../../shared/backend-api'
import { TICKS_PER_BAR } from '../engine/transport'
import type { GeneratorCandidate } from './generator-library'
import type { GeneratorLaneProfile } from './generator-profiles'

const TICKS_PER_BEAT = TICKS_PER_BAR / 4
const WHOLE_BAR_SPANS = new Set([1, 2, 4, 8].map((bars) => bars * TICKS_PER_BAR))

type CandidateWithPlannerKind = GeneratorCandidate & { plannerKind?: string }

export function generatorCandidateDurationTicks(
  candidate: GeneratorCandidate,
  bpm: number
): number {
  return Math.max(1, Math.round(candidate.duration * (candidate.bpm ?? bpm) * 8 / 60))
}

export function generatorCandidateMatchesLane(
  candidate: CandidateWithPlannerKind,
  lane: GeneratorLaneProfile,
  type: SampleType,
  bpm: number
): boolean {
  const span = generatorCandidateDurationTicks(candidate, bpm)
  if (span > lane.maxBars * TICKS_PER_BAR) return false
  if (lane.maxBeats !== undefined && span > lane.maxBeats * TICKS_PER_BEAT) return false
  if (lane.role === 'percussion' && candidate.plannerKind !== undefined && candidate.plannerKind !== 'one-shot') return false
  if (lane.role === 'transition' && candidate.plannerKind !== undefined && candidate.plannerKind !== lane.transitionKind) return false
  if ((type === 'Loop' || type === 'Synth') && !WHOLE_BAR_SPANS.has(span)) return false
  return true
}
