import { describe, expect, it } from 'vitest'
import type { MixJamGeneratorLanePlan } from '../../../shared/backend-api'
import type { GeneratorCandidate } from './generator-library'
import type { GeneratorProfile } from './generator-profiles'
import type { Selection } from './generator-planning-core'
import { applyStereoPairs, designateStereoPairLanes, validateStereoImage } from './generator-stereo'

// Minimal fixtures. The stereo helpers only read the lane role, core-lane
// membership, and the primary type, so a tiny hand-built profile is enough to
// exercise every branch without decoding a full template.
function laneCandidate(overrides: Partial<GeneratorCandidate> = {}): GeneratorCandidate {
  return {
    relpath: overrides.relpath ?? overrides.filename ?? 'Sphere/x.wav',
    filename: overrides.filename ?? 'x.wav',
    sizeBytes: 100,
    mtime: 1000,
    duration: 4,
    bpm: 140,
    musicalKey: 'Am',
    sampleType: 'Atmosphere',
    categoryName: 'Sphere',
    paletteSlot: 0,
    metadataRevision: 1,
    analysisRevision: 1,
    ...overrides
  }
}

function pairCandidates(family: string, parts: readonly number[]): GeneratorCandidate[] {
  return parts.flatMap((part) => (['l', 'r'] as const).map((side) => laneCandidate({
    relpath: `Sphere/${family}-${part}-${side}.wav`,
    filename: `${family}-${part}-${side}.wav`
  })))
}

function twinMapOf(candidates: readonly GeneratorCandidate[]): Map<string, GeneratorCandidate> {
  const twins = new Map<string, GeneratorCandidate>()
  const byLogical = new Map<string, GeneratorCandidate[]>()
  for (const candidate of candidates) {
    const key = candidate.filename.replace(/-(l|r)\.wav$/, '')
    byLogical.set(key, [...(byLogical.get(key) ?? []), candidate])
  }
  for (const halves of byLogical.values()) {
    const left = halves.find((c) => c.filename.endsWith('-l.wav'))
    const right = halves.find((c) => c.filename.endsWith('-r.wav'))
    if (left && right) {
      twins.set(left.relpath, right)
      twins.set(right.relpath, left)
    }
  }
  return twins
}

function selectionOf(candidates: readonly GeneratorCandidate[]): Selection {
  return {
    requestedType: 'Atmosphere',
    selectedType: 'Atmosphere',
    candidates: [...candidates] as Selection['candidates']
  }
}

// A profile just large enough that the pair-lane target rounds up to one: with
// nine populated tonal lanes, halfUp(9 * 0.2 / 1.8) === 1.
function profileWith(roles: readonly GeneratorProfile['lanes'][number]['role'][]): GeneratorProfile {
  return {
    schemaVersion: 1,
    id: 'fixture',
    label: 'Fixture',
    version: 1,
    order: 0,
    default: false,
    bpmTolerance: 8,
    coreLanes: [0],
    sections: [],
    lanes: roles.map((role, index) => ({
      name: `Lane ${index}`,
      types: role === 'motif' && index === 0 ? ['Bass'] : ['Atmosphere'],
      maxBars: 16,
      role,
      gain: 0.4,
      pan: 0
    }))
  }
}

function lanePlan(index: number, overrides: Partial<MixJamGeneratorLanePlan> = {}): MixJamGeneratorLanePlan {
  return {
    index,
    name: `Lane ${index}`,
    gain: 0.4,
    pan: 0,
    muted: false,
    solo: false,
    placements: [],
    ...overrides
  }
}

function placement(sampleRef: string, startTick = 0): MixJamGeneratorLanePlan['placements'][number] {
  return {
    id: `p-${sampleRef}`,
    sampleRef,
    sampleName: sampleRef.split('/').pop()!,
    startTick,
    durationTicks: 128,
    durationSeconds: 4,
    nativeBpm: 140,
    slot: 0
  }
}

describe('designateStereoPairLanes', () => {
  it('returns no lanes when the pair target rounds to zero', () => {
    // A single populated lane: halfUp(1 * 0.2 / 1.8) === 0, so no pairing.
    const twins = twinMapOf(pairCandidates('cloud', [1, 2]))
    const selections = [selectionOf(pairCandidates('cloud', [1, 2]))]
    const result = designateStereoPairLanes(selections, profileWith(['atmosphere']), twins)
    expect(result.size).toBe(0)
  })

  it('skips a lane with fewer than two complete pairs', () => {
    // Nine tonal lanes so the target is 1, but the only eligible lane has one
    // pair; it must not designate on a single pair.
    const onePair = pairCandidates('cloud', [1])
    const twins = twinMapOf(onePair)
    const roles = Array.from({ length: 9 }, () => 'atmosphere' as const)
    const selections = roles.map((_, index) =>
      index === 8 ? selectionOf(onePair) : selectionOf([laneCandidate({ relpath: `Sphere/m${index}.wav`, filename: `m${index}.wav` })])
    )
    const result = designateStereoPairLanes(selections, profileWith(roles), twins)
    expect(result.size).toBe(0)
  })

  it('designates a lane and restricts its pool to left halves when two pairs exist', () => {
    const pairs = pairCandidates('cloud', [1, 2])
    const twins = twinMapOf(pairs)
    const roles = Array.from({ length: 9 }, () => 'atmosphere' as const)
    const selections = roles.map((_, index) =>
      index === 8 ? selectionOf(pairs) : selectionOf([laneCandidate({ relpath: `Sphere/m${index}.wav`, filename: `m${index}.wav` })])
    )
    const result = designateStereoPairLanes(selections, profileWith(roles), twins)
    expect(result.has(8)).toBe(true)
    // The designated lane's pool now holds only left halves.
    expect(selections[8]!.candidates.every((c) => c.filename.endsWith('-l.wav'))).toBe(true)
    expect(selections[8]!.candidates).toHaveLength(2)
  })

  it('never designates a Bass motif lane even with complete pairs', () => {
    const pairs = pairCandidates('cloud', [1, 2])
    const twins = twinMapOf(pairs)
    // Lane 0 is a Bass-typed motif lane; it holds pairs but must stay centered.
    const roles: GeneratorProfile['lanes'][number]['role'][] =
      Array.from({ length: 9 }, (_, i) => (i === 0 ? 'motif' : 'atmosphere'))
    const selections = roles.map((_, index) => selectionOf(index === 0 ? pairs : [laneCandidate({ relpath: `Sphere/m${index}.wav`, filename: `m${index}.wav` })]))
    const result = designateStereoPairLanes(selections, profileWith(roles), twins)
    expect(result.has(0)).toBe(false)
  })
})

describe('applyStereoPairs', () => {
  const profile = profileWith(['atmosphere', 'atmosphere'])

  it('mirrors a designated lane into a hard-panned right twin lane', () => {
    const pairs = pairCandidates('cloud', [1, 2])
    const twins = twinMapOf(pairs)
    const lanes = [lanePlan(0, {
      name: 'Sky',
      placements: [placement('Sphere/cloud-1-l.wav'), placement('Sphere/cloud-2-l.wav', 128)]
    })]
    applyStereoPairs(lanes, new Set([0]), twins, profile, 'seed')
    expect(lanes).toHaveLength(2)
    expect(lanes[0]!.pan).toBe(-1)
    expect(lanes[0]!.name).toBe('Sky L')
    expect(lanes[1]!.pan).toBe(1)
    expect(lanes[1]!.name).toBe('Sky R')
    expect(lanes[1]!.placements.map((p) => p.sampleRef)).toEqual([
      'Sphere/cloud-1-r.wav',
      'Sphere/cloud-2-r.wav'
    ])
    expect(lanes[1]!.placements[0]!.startTick).toBe(lanes[0]!.placements[0]!.startTick)
  })

  it('leaves an empty designated lane untouched', () => {
    const twins = twinMapOf(pairCandidates('cloud', [1, 2]))
    const lanes = [lanePlan(0)]
    applyStereoPairs(lanes, new Set([0]), twins, profile, 'seed')
    expect(lanes).toHaveLength(1)
    expect(lanes[0]!.pan).toBe(0)
  })

  it('leaves a lane centered when any placement lacks a twin', () => {
    // Only cloud-1 has a twin; cloud-9 is an orphan, so the lane cannot mirror.
    const twins = twinMapOf(pairCandidates('cloud', [1]))
    const lanes = [lanePlan(0, {
      placements: [placement('Sphere/cloud-1-l.wav'), placement('Sphere/cloud-9-l.wav', 128)]
    })]
    applyStereoPairs(lanes, new Set([0]), twins, profile, 'seed')
    expect(lanes).toHaveLength(1)
    expect(lanes[0]!.pan).toBe(0)
  })
})

describe('validateStereoImage', () => {
  it('accepts a clean centered/paired image', () => {
    const lanes = [
      lanePlan(0, { pan: -1, placements: [placement('a-l.wav')] }),
      lanePlan(1, { pan: 0, placements: [placement('b.wav')] }),
      lanePlan(2, { pan: 1, placements: [placement('a-r.wav')] })
    ]
    // profileLaneCount = 2: lane 2 is the appended mirror.
    expect(() => validateStereoImage(lanes, 2)).not.toThrow()
  })

  it('rejects a lane with variable (non-three-way) panning', () => {
    const lanes = [lanePlan(0, { pan: 0.5 })]
    expect(() => validateStereoImage(lanes, 1)).toThrow(/variable panning/)
  })

  it('rejects a mirror lane that is not hard-panned right', () => {
    const lanes = [
      lanePlan(0, { pan: -1 }),
      lanePlan(1, { pan: -1 }) // appended mirror must be +1
    ]
    expect(() => validateStereoImage(lanes, 1)).toThrow(/not hard-panned right/)
  })

  it('rejects unmatched left/mirror lane counts', () => {
    // No left lane in the base region, but one appended mirror at +1.
    const lanes = [
      lanePlan(0, { pan: 0 }),
      lanePlan(1, { pan: 1 })
    ]
    expect(() => validateStereoImage(lanes, 1)).toThrow(/unmatched stereo pair/)
  })

  it('rejects more than the maximum populated lane count', () => {
    const lanes = Array.from({ length: 33 }, (_, index) =>
      lanePlan(index, { pan: 0, placements: [placement(`s${index}.wav`)] })
    )
    expect(() => validateStereoImage(lanes, 33)).toThrow(/at most 32 are allowed/)
  })
})
