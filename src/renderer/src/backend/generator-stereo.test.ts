import { describe, expect, it } from 'vitest'
import type { MixJamGeneratorLanePlan } from '../../../shared/backend-api'
import type { GeneratorCandidate } from './generator-library'
import { stereoTwinMap } from './generator-motif'
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
    sourceGroup: 'Sphere',
    paletteSlot: 0,
    stereoPairKey: null,
    stereoSide: null,
    poolToken: null,
    metadataRevision: 1,
    analysisRevision: 1,
    ...overrides
  }
}

function pairCandidates(family: string, parts: readonly number[]): GeneratorCandidate[] {
  return parts.flatMap((part) => (['l', 'r'] as const).map((side) => laneCandidate({
    relpath: `Sphere/${family}-${part}-${side}.wav`,
    filename: `${family}-${part}-${side}.wav`,
    stereoPairKey: `Sphere/${family}-${part}`,
    stereoSide: side === 'l' ? 'left' : 'right'
  })))
}

function twinMapOf(candidates: readonly GeneratorCandidate[]): Map<string, GeneratorCandidate> {
  return stereoTwinMap(candidates)
}

function selectionOf(candidates: readonly GeneratorCandidate[]): Selection {
  return {
    requestedType: 'Atmosphere',
    selectedType: 'Atmosphere',
    candidates: [...candidates] as Selection['candidates']
  }
}

// Mirror pairs sit at ±pairPan, not at hard ±1 — stereo *side* still needs
// pair evidence, but the spread is mix data the profile owns (spec-021 §Pan).
const PAIR_PAN = 0.45

// A profile just large enough that the pair-lane target rounds up to one: with
// nine populated tonal lanes, halfUp(9 * 0.2 / 1.8) === 1.
function profileWith(roles: readonly GeneratorProfile['lanes'][number]['role'][]): GeneratorProfile {
  return {
    schemaVersion: 2,
    id: 'fixture',
    label: 'Fixture',
    version: 1,
    order: 0,
    default: false,
    bpmTolerance: 8,
    coreLanes: [0],
    pairPan: PAIR_PAN,
    returns: [],
    arcs: [{
      name: 'Fixture arc',
      sections: [{ name: 'Groove', weight: 100, activeLanes: roles.map((_, index) => index), phraseMode: 'steady' }],
      ops: []
    }],
    lanes: roles.map((role, index) => ({
      name: `Lane ${index}`,
      types: role === 'motif' && index === 0 ? ['Bass'] : ['Atmosphere'],
      maxBars: 16,
      role,
      gain: 0.4,
      pan: 0,
      sends: []
    }))
  }
}

function lanePlan(index: number, overrides: Partial<MixJamGeneratorLanePlan> = {}): MixJamGeneratorLanePlan {
  return {
    index,
    name: `Lane ${index}`,
    gain: 0.4,
    pan: 0,
    stereoPairId: null,
    muted: false,
    solo: false,
    sends: [],
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

  it('does not designate L/R-looking filenames without analyzer evidence', () => {
    const filenamesOnly = pairCandidates('cloud', [1, 2]).map((candidate) => ({
      ...candidate,
      stereoPairKey: null,
      stereoSide: null
    }))
    const roles = Array.from({ length: 9 }, () => 'atmosphere' as const)
    const selections = roles.map((_, index) =>
      index === 8
        ? selectionOf(filenamesOnly)
        : selectionOf([laneCandidate({ relpath: `Sphere/m${index}.wav`, filename: `m${index}.wav` })])
    )
    expect(designateStereoPairLanes(selections, profileWith(roles), stereoTwinMap(filenamesOnly)).size).toBe(0)
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

  it('mirrors a designated lane into a twin lane at the profile spread', () => {
    const pairs = pairCandidates('cloud', [1, 2])
    const twins = twinMapOf(pairs)
    const lanes = [lanePlan(0, {
      name: 'Sky',
      placements: [placement('Sphere/cloud-1-l.wav'), placement('Sphere/cloud-2-l.wav', 128)]
    })]
    applyStereoPairs(lanes, new Set([0]), twins, profile, 'seed')
    expect(lanes).toHaveLength(2)
    expect(lanes[0]!.pan).toBe(-PAIR_PAN)
    expect(lanes[0]!.name).toBe('Sky L')
    expect(lanes[1]!.pan).toBe(PAIR_PAN)
    expect(lanes[1]!.name).toBe('Sky R')
    expect(lanes[0]!.stereoPairId).toMatch(/^stereo-pair-/)
    expect(lanes[1]!.stereoPairId).toBe(lanes[0]!.stereoPairId)
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
    expect(lanes[0]!.stereoPairId).toBeNull()
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
    expect(lanes[0]!.stereoPairId).toBeNull()
  })
})

describe('validateStereoImage', () => {
  it('accepts a mirrored pair at the profile spread beside centered lanes', () => {
    const lanes = [
      lanePlan(0, { pan: -PAIR_PAN, stereoPairId: 'stereo-pair-fixture', placements: [placement('a-l.wav')] }),
      lanePlan(1, { pan: 0.2, placements: [placement('b.wav')] }),
      lanePlan(2, { pan: PAIR_PAN, stereoPairId: 'stereo-pair-fixture', placements: [placement('a-r.wav')] })
    ]
    // profileLaneCount = 2: lane 2 is the appended mirror of lane 0.
    expect(() => validateStereoImage(lanes, profileWith(['motif', 'atmosphere']), new Set([0]))).not.toThrow()
  })

  it('rejects a non-pair lane panned past the mix-position cap', () => {
    const lanes = [lanePlan(0, { pan: 0.5 })]
    expect(() => validateStereoImage(lanes, profileWith(['motif']), new Set()))
      .toThrow(/past the mix-position cap/)
  })

  it('rejects a mirror lane that is not at the pair position', () => {
    const lanes = [
      lanePlan(0, { pan: -PAIR_PAN }),
      lanePlan(1, { pan: -PAIR_PAN })
    ]
    expect(() => validateStereoImage(lanes, profileWith(['motif']), new Set([0])))
      .toThrow(/not at the pair position/)
  })

  it('rejects unmatched mirrored lane counts', () => {
    const lanes = [
      lanePlan(0, { pan: 0 }),
      lanePlan(1, { pan: PAIR_PAN })
    ]
    expect(() => validateStereoImage(lanes, profileWith(['motif']), new Set()))
      .toThrow(/unmatched stereo pair/)
  })

  it('rejects more than the maximum populated lane count', () => {
    const lanes = Array.from({ length: 33 }, (_, index) =>
      lanePlan(index, { pan: 0, placements: [placement(`s${index}.wav`)] })
    )
    const profile = profileWith(Array.from({ length: 33 }, () => 'motif' as const))
    expect(() => validateStereoImage(lanes, profile, new Set())).toThrow(/at most 32 are allowed/)
  })
})
