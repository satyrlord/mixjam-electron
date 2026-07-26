import {
  type MixJamGeneratorParameters,
  type MixJamGeneratorPlan,
  type MixJamGeneratorProfileId,
  type SampleType
} from '../../../shared/backend-api'
import { MIXJAM_GENERATOR_PROFILE_IDS } from '../../../shared/generator-templates'
import { TICKS_PER_BAR } from '../engine/transport'
import type { AnalyzedGeneratorCandidate, GeneratorPlannerKind } from './generator-analysis'
import { GENERATOR_PROFILES } from './generator-profiles'

export const BPM = 140
const TICKS_PER_BEAT = TICKS_PER_BAR / 4
export const CORE_LANES: Record<MixJamGeneratorProfileId, readonly number[]> = Object.fromEntries(
  MIXJAM_GENERATOR_PROFILE_IDS.map((profileId) => [profileId, GENERATOR_PROFILES[profileId]!.coreLanes])
)

export function durationForTicks(ticks: number): number {
  return ticks * 60 / (BPM * 8)
}

function sourceSpan(sampleType: SampleType, index: number): number {
  switch (sampleType) {
    case 'Kick': return TICKS_PER_BEAT
    case 'Snare': return 4
    case 'Hi-hat': return 2
    case 'Percussion': return 3
    case 'Bass':
    case 'Loop':
    case 'Synth':
    case 'Vocal': return (index % 2 + 1) * TICKS_PER_BAR
    case 'Atmosphere': return (index % 2 + 2) * TICKS_PER_BAR
    case 'FX':
    case 'Other': return TICKS_PER_BAR
  }
}

function kindFor(sampleType: SampleType, index: number): GeneratorPlannerKind {
  switch (sampleType) {
    case 'Kick':
    case 'Snare':
    case 'Hi-hat':
    case 'Percussion': return 'one-shot'
    case 'Bass':
    case 'Synth': return 'tonal-loop'
    case 'Loop': return 'rhythmic-loop'
    case 'Vocal': return 'vocal'
    case 'Atmosphere': return 'atmosphere'
    case 'FX': return index % 2 === 0 ? 'riser' : 'impact'
    case 'Other': return 'texture'
  }
}

export function candidate(
  sampleType: SampleType,
  index: number,
  overrides: Partial<AnalyzedGeneratorCandidate> = {}
): AnalyzedGeneratorCandidate {
  const tonal = ['Bass', 'Loop', 'Synth', 'Vocal', 'Atmosphere'].includes(sampleType)
  return {
    relpath: `${sampleType}/${String(index).padStart(2, '0')}.wav`,
    filename: `${sampleType}-${index}.wav`,
    sizeBytes: 100 + index,
    mtime: 1000 + index,
    duration: durationForTicks(sourceSpan(sampleType, index)),
    bpm: BPM,
    musicalKey: tonal ? 'Am' : null,
    sampleType,
    sourceGroup: sampleType === 'Bass' ? 'Bass' : 'Unsorted',
    paletteSlot: sampleType === 'Bass' ? 2 : 8,
    poolToken: null,
    metadataRevision: 1,
    analysisRevision: 1,
    rms: 0.2,
    peak: 0.8,
    spectralCentroid: 1200,
    transientDensity: 0.1,
    attackStrength: sampleType === 'FX' && index % 2 === 1 ? 0.8 : 0.3,
    rhythmicRegularity: sampleType === 'Loop' ? 0.8 : 0.4,
    loopConfidence: 0.85,
    boundaryContinuity: 0.9,
    energySlope: sampleType === 'FX' && index % 2 === 0 ? 0.8 : 0,
    plannerKind: kindFor(sampleType, index),
    ...overrides
  }
}

export const candidates = [
  'Kick', 'Snare', 'Hi-hat', 'Percussion', 'Bass', 'Synth',
  'FX', 'Vocal', 'Loop', 'Atmosphere', 'Other'
].flatMap((type, typeIndex) => [0, 1].map((index) =>
  candidate(type as SampleType, typeIndex * 2 + index)
))

export const sourceGroupRichCandidates = [
  ...(['Kick', 'Snare', 'Hi-hat', 'Percussion'] as const).flatMap((type, typeIndex) =>
    Array.from({ length: 4 }, (_, index) => candidate(type, 100 + typeIndex * 10 + index, {
      sourceGroup: 'Drum',
      paletteSlot: 1
    }))
  ),
  ...Array.from({ length: 4 }, (_, index) => candidate('Bass', 200 + index, {
    sourceGroup: 'Bass',
    paletteSlot: 2
  })),
  ...Array.from({ length: 4 }, (_, index) => candidate('Loop', 300 + index, {
    sourceGroup: 'Loop',
    paletteSlot: 3
  })),
  ...Array.from({ length: 9 }, (_, index) => candidate('Synth', 400 + index, {
    sourceGroup: ['Keys', 'Layer', 'Seq'][index % 3]!,
    paletteSlot: 4 + index % 3
  })),
  ...Array.from({ length: 6 }, (_, index) => candidate('Vocal', 500 + index, {
    sourceGroup: index % 2 === 0 ? 'Rap' : 'Voice',
    paletteSlot: index % 2 === 0 ? 7 : 8
  })),
  ...Array.from({ length: 4 }, (_, index) => candidate('Atmosphere', 600 + index, {
    sourceGroup: 'Sphere',
    duration: durationForTicks(10 * TICKS_PER_BAR),
    paletteSlot: 0,
    plannerKind: 'atmosphere'
  })),
  ...Array.from({ length: 8 }, (_, index) => candidate('FX', 700 + index, {
    sourceGroup: 'Effect',
    paletteSlot: 1,
    plannerKind: index % 2 === 0 ? 'riser' : 'impact'
  })),
  ...Array.from({ length: 4 }, (_, index) => candidate('Other', 800 + index, {
    sourceGroup: 'Xtra',
    paletteSlot: 2,
    plannerKind: 'texture'
  }))
]

export function parameters(
  profileId: MixJamGeneratorProfileId,
  seed = 'stable-seed'
): MixJamGeneratorParameters {
  return {
    profileId,
    bpmMode: 'follow-detected',
    bpm: BPM,
    intensity: 'medium',
    durationSeconds: 180,
    seed
  }
}

export function placementEnd(
  placement: MixJamGeneratorPlan['lanes'][number]['placements'][number]
): number {
  return placement.startTick + placement.durationTicks
}

export function overlaps(
  startTick: number, endTick: number, placement: MixJamGeneratorPlan['lanes'][number]['placements'][number]
): boolean {
  return placement.startTick < endTick && placementEnd(placement) > startTick
}
