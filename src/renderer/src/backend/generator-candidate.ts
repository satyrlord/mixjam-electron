import type { SampleType } from '../../../shared/backend-api'
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import type { GeneratorCandidate } from './generator-library'
import type { GeneratorLaneProfile } from './generator-profiles'

const WHOLE_BAR_SPAN_VALUES = [1, 2, 4, 8].map((bars) => bars * TICKS_PER_BAR)
const WHOLE_BAR_SPANS = new Set(WHOLE_BAR_SPAN_VALUES)
// Per-sample BPM detection is only approximate, so a loop authored as a clean
// whole-bar phrase can resolve a few percent off the grid at the project tempo.
// Snapping within this tolerance recovers those loops (89% of a real library was
// otherwise filtered out and the arranger fell back to one-shot assembly). The
// tolerance is tight enough that it corrects detection error rather than
// inventing a musically different length.
const WHOLE_BAR_SNAP_TOLERANCE = 0.05

type CandidateWithPlannerKind = GeneratorCandidate & { plannerKind?: string }

function rawDurationTicks(candidate: GeneratorCandidate, bpm: number): number {
  return Math.max(1, Math.round(candidate.duration * (candidate.bpm ?? bpm) * 8 / 60))
}

/** The nearest whole-bar span within tolerance, or null if none is close. */
function snappedWholeBarSpan(rawSpan: number): number | null {
  for (const span of WHOLE_BAR_SPAN_VALUES) {
    if (Math.abs(rawSpan - span) <= span * WHOLE_BAR_SNAP_TOLERANCE) return span
  }
  return null
}

const PERCUSSIVE_TYPES = new Set<SampleType>(['Percussion', 'Hi-hat', 'Snare'])

export function generatorCandidateDurationTicks(
  candidate: GeneratorCandidate,
  bpm: number
): number {
  const raw = rawDurationTicks(candidate, bpm)
  // Percussive material long enough to be a groove loop (not a one-shot)
  // tiles butt-joined, so an off-grid length drifts against the bar line;
  // snap near-grid lengths exactly like tonal loops.
  const percussiveLoop = PERCUSSIVE_TYPES.has(candidate.sampleType) && raw >= TICKS_PER_BAR * 0.7
  // Loop and Synth sources tile as whole-bar phrases.
  if (candidate.sampleType === 'Loop' || candidate.sampleType === 'Synth' || percussiveLoop) {
    // First snap a near-grid length at the sample's own detected tempo.
    const detectedSnap = snappedWholeBarSpan(raw)
    if (detectedSnap !== null) return detectedSnap
    // Per-file BPM detection is unreliable, but loop/melodic content in a
    // single-tempo library is authored to the project tempo (these packs are
    // "140 BPM, A minor" apart from one-shots and FX). If the file's duration
    // resolves to a clean whole bar at the PROJECT tempo, trust that over the
    // noisy per-file reading — this recovers loops the detector mis-tempo'd.
    const atProjectBpm = Math.max(1, Math.round(candidate.duration * bpm * 8 / 60))
    const projectSnap = snappedWholeBarSpan(atProjectBpm)
    if (projectSnap !== null) return projectSnap
    return raw
  }
  return raw
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
  if (lane.role === 'transition' && candidate.plannerKind !== undefined &&
      candidate.plannerKind !== lane.transitionKind &&
      !(candidate.sampleType === 'FX' && candidate.plannerKind === 'texture')) return false
  if ((type === 'Loop' || type === 'Synth') && !WHOLE_BAR_SPANS.has(span)) return false
  // A percussive source of a bar or more is a groove loop; if its span is not
  // a whole-bar phrase it would drift against the bar grid when tiled.
  if (PERCUSSIVE_TYPES.has(type) && span >= TICKS_PER_BAR && !WHOLE_BAR_SPANS.has(span)) return false
  return true
}
