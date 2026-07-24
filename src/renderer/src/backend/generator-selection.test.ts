import { describe, expect, it } from 'vitest'
import type { MixJamGeneratorSectionPlan, SampleType } from '../../../shared/backend-api'
import type { GeneratorCandidate } from './generator-library'
import type { GeneratorProfile } from './generator-profiles'
import type { PlanningCandidate, Selection } from './generator-planning-core'
import {
  applyKitCoherence,
  familyRatioOf,
  findTypeCandidates,
  selectDiverseCandidates
} from './generator-selection'

const BPM = 140

function candidate(filename: string, overrides: Partial<PlanningCandidate> = {}): PlanningCandidate {
  return {
    relpath: `Bass/${filename}`,
    filename,
    sizeBytes: 100,
    mtime: 1000,
    duration: 60 * 4 / BPM, // one bar at 140 BPM
    bpm: BPM,
    musicalKey: 'Am',
    sampleType: 'Bass',
    categoryName: 'Bass',
    paletteSlot: 2,
    metadataRevision: 1,
    analysisRevision: 1,
    ...overrides
  }
}

function selectionOf(candidates: readonly PlanningCandidate[], requestedType: SampleType = 'Bass'): Selection {
  return { requestedType, selectedType: requestedType, candidates: [...candidates] }
}

// A tiny motif-lane profile. Lane 0 is a core motif lane; lane 1 is a sibling
// motif lane. Both accept Bass, so kit coherence and selection can run.
function motifProfile(laneCount = 2, maxBars = 8): GeneratorProfile {
  return {
    schemaVersion: 1,
    id: 'fixture',
    label: 'Fixture',
    version: 1,
    order: 0,
    default: false,
    bpmTolerance: 8,
    coreLanes: [0],
    sections: Array.from({ length: laneCount }, () => ({
      name: 'Groove',
      weight: 100,
      activeLanes: Array.from({ length: laneCount }, (_, i) => i),
      phraseMode: 'steady' as const
    })),
    lanes: Array.from({ length: laneCount }, (_, index) => ({
      name: `Lane ${index}`,
      types: ['Bass'] as readonly SampleType[],
      maxBars,
      role: 'motif' as const,
      gain: 0.5,
      pan: 0
    }))
  }
}

function sections(profile: GeneratorProfile): MixJamGeneratorSectionPlan[] {
  return profile.sections.map((section, index) => ({
    name: section.name,
    startBar: index * 8,
    endBar: index * 8 + 8,
    activeLanes: [...section.activeLanes]
  }))
}

describe('familyRatioOf', () => {
  it('returns 1 for an empty selection', () => {
    expect(familyRatioOf([])).toBe(1)
  })

  it('returns 0 when every distinct sample is a lone family member', () => {
    const single = [candidate('kick.wav'), candidate('snare.wav'), candidate('clap.wav')]
    expect(familyRatioOf(single)).toBe(0)
  })

  it('returns 1 when every sample belongs to a two-plus-part family', () => {
    const family = [candidate('deep-1.wav'), candidate('deep-2.wav'), candidate('deep-3.wav')]
    expect(familyRatioOf(family)).toBe(1)
  })

  it('collapses stereo twins so a lone left/right pair counts as one member', () => {
    const twinOnly = [
      candidate('cloud-1-l.wav', { relpath: 'Sphere/cloud-1-l.wav' }),
      candidate('cloud-1-r.wav', { relpath: 'Sphere/cloud-1-r.wav' })
    ]
    // One logical sample, family has a single distinct part -> ratio 0.
    expect(familyRatioOf(twinOnly)).toBe(0)
  })
})

describe('applyKitCoherence', () => {
  it('returns early when no core lane contributes a kit family', () => {
    // Core lane 0 selection is null, so kitFamilies stays empty and sibling
    // ordering is left untouched.
    const sibling = selectionOf([candidate('warm-1.wav'), candidate('deep-1.wav')])
    const before = [...sibling.candidates]
    applyKitCoherence([null, sibling], motifProfile())
    expect(sibling.candidates).toEqual(before)
  })

  it('reorders a sibling lane to prefer the core lanes chosen kit family', () => {
    const core = selectionOf([candidate('deep-1.wav'), candidate('deep-2.wav')])
    // Sibling lane leads with a foreign family; kit coherence must float the
    // core family's parts to the front.
    const sibling = selectionOf([
      candidate('warm-1.wav'),
      candidate('deep-3.wav'),
      candidate('warm-2.wav')
    ])
    applyKitCoherence([core, sibling], motifProfile())
    expect(sibling.candidates[0]!.filename).toBe('deep-3.wav')
  })
})

describe('findTypeCandidates', () => {
  it('returns null when no candidate matches the lane type', () => {
    const hats = [candidate('hat.wav', { sampleType: 'Hi-hat', categoryName: 'Drum' })]
    expect(findTypeCandidates(hats, motifProfile(), 0, BPM, 'Am', 'seed')).toBeNull()
  })

  it('orders a multi-part family ahead of a singleton on a motif lane', () => {
    const pool = [
      candidate('lone.wav'),
      candidate('deep-1.wav'),
      candidate('deep-2.wav')
    ]
    const selection = findTypeCandidates(pool, motifProfile(), 0, BPM, 'Am', 'seed')
    expect(selection).not.toBeNull()
    // The two-part "deep" family anchors ahead of the singleton.
    expect(selection!.candidates[0]!.filename.startsWith('deep')).toBe(true)
  })
})

describe('selectDiverseCandidates', () => {
  it('falls back to a shorter sibling when the anchor exceeds the lane span', () => {
    const profile = motifProfile(2, 8)
    // Lane 0 anchor is an 16-bar loop (too long for the 8-bar cap); a 1-bar
    // sibling of the same family must be pulled in as the legal fallback.
    const longLoop = candidate('deep-1.wav', { duration: 60 * 4 * 16 / BPM })
    const shortLoop = candidate('deep-2.wav', { duration: 60 * 4 / BPM })
    const laneSelection = selectionOf([longLoop, shortLoop])
    const other = selectionOf([candidate('warm-1.wav'), candidate('warm-2.wav')])
    const { selected } = selectDiverseCandidates(
      [laneSelection, other], 3, sections(profile), profile, BPM, new Map(), 0.6
    )
    const lane0 = selected[0]!
    // At least one selected candidate on lane 0 fits inside the 8-bar cap.
    expect(lane0.candidates.some((c) => c.filename === 'deep-2.wav')).toBe(true)
  })

  it('reports a family-ratio shortfall for a family-less corpus', () => {
    const profile = motifProfile(2, 8)
    // Every candidate is a lone family member across two lanes, so the repair
    // loop can neither grow a family nor trim below coverage: shortfall = true.
    const a = selectionOf([candidate('one.wav'), candidate('two.wav')])
    const b = selectionOf([candidate('three.wav'), candidate('four.wav')])
    const { selected, familyRatioShortfall } = selectDiverseCandidates(
      [a, b], 3, sections(profile), profile, BPM, new Map(), 0.8
    )
    expect(familyRatioShortfall).toBe(true)
    expect(selected.filter(Boolean).length).toBe(2)
  })

  it('repairs toward the family target by adding an unused sibling', () => {
    const profile = motifProfile(2, 8)
    // Lane 0 leads with a singleton but its pool holds two siblings of one
    // family; the repair loop should pull a sibling in to clear the 0.6 floor.
    const laneSelection = selectionOf([
      candidate('lone.wav'),
      candidate('deep-1.wav'),
      candidate('deep-2.wav')
    ])
    const other = selectionOf([candidate('warm-1.wav'), candidate('warm-2.wav')])
    const { selected, familyRatioShortfall } = selectDiverseCandidates(
      [laneSelection, other], 3, sections(profile), profile, BPM, new Map(), 0.6
    )
    expect(familyRatioShortfall).toBe(false)
    const placed = selected.flatMap((s) => s?.candidates ?? [])
    expect(familyRatioOf(placed)).toBeGreaterThanOrEqual(0.6)
  })
})

// A twin map fixture confirming selection claims both halves of a stereo pair.
describe('selectDiverseCandidates stereo claiming', () => {
  it('never selects both halves of one stereo pair', () => {
    const profile = motifProfile(2, 8)
    const left = candidate('cloud-1-l.wav', { relpath: 'Bass/cloud-1-l.wav' })
    const right = candidate('cloud-1-r.wav', { relpath: 'Bass/cloud-1-r.wav' })
    const twins = new Map<string, GeneratorCandidate>([
      [left.relpath, right],
      [right.relpath, left]
    ])
    const laneSelection = selectionOf([left, right, candidate('deep-1.wav')])
    const other = selectionOf([candidate('warm-1.wav'), candidate('warm-2.wav')])
    const { selected } = selectDiverseCandidates(
      [laneSelection, other], 3, sections(profile), profile, BPM, twins, 0.6
    )
    const refs = selected.flatMap((s) => s?.candidates.map((c) => c.relpath) ?? [])
    // Only one half of the cloud pair may be placed.
    const halves = refs.filter((ref) => ref.includes('cloud-1-'))
    expect(halves.length).toBeLessThanOrEqual(1)
  })
})
