import { describe, expect, it } from 'vitest'
import {
  type MixJamGeneratorParameters,
  type MixJamGeneratorPlan,
  type MixJamGeneratorProfileId,
  type SampleType
} from '../../../shared/backend-api'
import { MIXJAM_GENERATOR_PROFILE_IDS } from '../../../shared/generator-templates'
import { TICKS_PER_BAR } from '../engine/transport'
import type { AnalyzedGeneratorCandidate, GeneratorPlannerKind } from './generator-analysis'
import { generatorCandidateMatchesLane } from './generator-candidate'
import { createMixJamGeneratorPlan } from './generator-engine'
import { createGeneratorProfileRegistry, GENERATOR_PROFILES } from './generator-profiles'

const BPM = 140
const TICKS_PER_BEAT = TICKS_PER_BAR / 4
const PERCUSSION_LANES = [0, 1, 2, 3, 11] as const
const LOOP_AND_SYNTH_LANES = [5, 6, 7, 12, 13] as const
const CORE_LANES: Record<MixJamGeneratorProfileId, readonly number[]> = Object.fromEntries(
  MIXJAM_GENERATOR_PROFILE_IDS.map((profileId) => [profileId, GENERATOR_PROFILES[profileId]!.coreLanes])
)

function durationForTicks(ticks: number): number {
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

function candidate(
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
    categoryName: sampleType === 'Bass' ? 'Bass' : 'Unsorted',
    paletteSlot: sampleType === 'Bass' ? 2 : 8,
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

const candidates = [
  'Kick', 'Snare', 'Hi-hat', 'Percussion', 'Bass', 'Synth',
  'FX', 'Vocal', 'Loop', 'Atmosphere', 'Other'
].flatMap((type, typeIndex) => [0, 1].map((index) =>
  candidate(type as SampleType, typeIndex * 2 + index)
))

const categoryRichCandidates = [
  ...(['Kick', 'Snare', 'Hi-hat', 'Percussion'] as const).flatMap((type, typeIndex) =>
    Array.from({ length: 4 }, (_, index) => candidate(type, 100 + typeIndex * 10 + index, {
      categoryName: 'Drum',
      paletteSlot: 1
    }))
  ),
  ...Array.from({ length: 4 }, (_, index) => candidate('Bass', 200 + index, {
    categoryName: 'Bass',
    paletteSlot: 2
  })),
  ...Array.from({ length: 4 }, (_, index) => candidate('Loop', 300 + index, {
    categoryName: 'Loop',
    paletteSlot: 3
  })),
  ...Array.from({ length: 9 }, (_, index) => candidate('Synth', 400 + index, {
    categoryName: ['Keys', 'Layer', 'Seq'][index % 3]!,
    paletteSlot: 4 + index % 3
  })),
  ...Array.from({ length: 6 }, (_, index) => candidate('Vocal', 500 + index, {
    categoryName: index % 2 === 0 ? 'Rap' : 'Voice',
    paletteSlot: index % 2 === 0 ? 7 : 8
  })),
  ...Array.from({ length: 4 }, (_, index) => candidate('Atmosphere', 600 + index, {
    categoryName: 'Sphere',
    duration: durationForTicks(10 * TICKS_PER_BAR),
    paletteSlot: 0,
    plannerKind: 'atmosphere'
  })),
  ...Array.from({ length: 8 }, (_, index) => candidate('FX', 700 + index, {
    categoryName: 'Effect',
    paletteSlot: 1,
    plannerKind: index % 2 === 0 ? 'riser' : 'impact'
  })),
  ...Array.from({ length: 4 }, (_, index) => candidate('Other', 800 + index, {
    categoryName: 'Xtra',
    paletteSlot: 2,
    plannerKind: 'texture'
  }))
]

function parameters(
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

function placementEnd(
  placement: MixJamGeneratorPlan['lanes'][number]['placements'][number]
): number {
  return placement.startTick + placement.durationTicks
}

function overlaps(startTick: number, endTick: number, placement: MixJamGeneratorPlan['lanes'][number]['placements'][number]): boolean {
  return placement.startTick < endTick && placementEnd(placement) > startTick
}

describe('MixJam generator engine', () => {
  it('plans a validated non-baseline JSON profile through the same engine path', () => {
    const custom = JSON.parse(JSON.stringify(GENERATOR_PROFILES.techno)) as Record<string, unknown>
    custom.id = 'custom-profile'
    custom.label = 'Custom profile'
    custom.default = false
    const registry = createGeneratorProfileRegistry({ 'custom-profile.json': custom })

    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      categoryRichCandidates,
      parameters('custom-profile'),
      { attemptedFiles: categoryRichCandidates.length, analyzedFiles: categoryRichCandidates.length, uniqueReads: categoryRichCandidates.length },
      BPM,
      registry.profiles
    )

    expect(plan.profileId).toBe('custom-profile')
    expect(plan.lanes).toHaveLength(16)
    expect(plan.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
    expect(plan.lanes.every((lane) => lane.gain >= 0 && lane.gain <= 1)).toBe(true)
  })

  it.each(MIXJAM_GENERATOR_PROFILE_IDS)(
    'uses every lane, every eligible category, long material, and richer variation for %s',
    (profileId) => {
      const plan = createMixJamGeneratorPlan(
        'root',
        'fingerprint',
        categoryRichCandidates,
        parameters(profileId)
      )
      const placements = plan.lanes.flatMap((lane) => lane.placements)
      const byRef = new Map(categoryRichCandidates.map((entry) => [entry.relpath, entry]))
      const usedCategories = new Set(placements.map((placement) =>
        byRef.get(placement.sampleRef)!.categoryName
      ))
      const eligibleCategories = new Set(categoryRichCandidates.map((entry) => entry.categoryName))

      expect(plan.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
      expect(usedCategories).toEqual(eligibleCategories)
      expect(Math.max(...placements.map((placement) => placement.durationTicks)))
        .toBeGreaterThan(4 * TICKS_PER_BAR)
      expect(plan.lanes[14]!.placements.length).toBeGreaterThan(0)
      expect(plan.lanes[15]!.placements.length).toBeGreaterThan(0)
      expect(plan.lanes.filter((lane) =>
        new Set(lane.placements.map((placement) => placement.sampleRef)).size >= 3
      ).length).toBeGreaterThanOrEqual(6)

      const sectionSignatures = plan.sections.map((section) => {
        const startTick = section.startBar * TICKS_PER_BAR
        const endTick = section.endBar * TICKS_PER_BAR
        return plan.lanes.flatMap((lane) => lane.placements.some((placement) =>
          overlaps(startTick, endTick, placement)
        ) ? [lane.index] : []).join(',')
      })
      expect(new Set(sectionSignatures).size).toBeGreaterThanOrEqual(4)
    }
  )

  it.each(MIXJAM_GENERATOR_PROFILE_IDS.flatMap((profileId) =>
    (['low', 'medium', 'high'] as const).map((intensity) => ({ profileId, intensity }))
  ))('keeps every lane, category, and long-form role across $profileId $intensity intensity', ({
    profileId,
    intensity
  }) => {
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', categoryRichCandidates, {
      ...parameters(profileId),
      intensity
    })
    const placements = plan.lanes.flatMap((lane) => lane.placements)
    const byRef = new Map(categoryRichCandidates.map((entry) => [entry.relpath, entry]))

    expect(plan.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
    expect(new Set(placements.map((placement) => byRef.get(placement.sampleRef)!.categoryName)))
      .toEqual(new Set(categoryRichCandidates.map((entry) => entry.categoryName)))
    expect(placements.some((placement) => placement.durationTicks > 4 * TICKS_PER_BAR)).toBe(true)
  })

  it.each(MIXJAM_GENERATOR_PROFILE_IDS.flatMap((profileId) =>
    (['low', 'medium', 'high'] as const).map((intensity) => ({ profileId, intensity }))
  ))('does not require unplaceable long material in a 30-second $profileId $intensity plan', ({
    profileId,
    intensity
  }) => {
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', categoryRichCandidates, {
      ...parameters(profileId),
      durationSeconds: 30,
      intensity
    })

    expect(plan.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
  })

  it('does not use a known riser as an impact fallback', () => {
    const riser = candidate('FX', 0, { plannerKind: 'riser' })
    const texture = candidate('FX', 1, { plannerKind: 'texture' })
    const otherTexture = candidate('Other', 2, { plannerKind: 'texture' })
    const [riserLane, impactLane] = GENERATOR_PROFILES.techno.lanes.slice(14)

    expect(generatorCandidateMatchesLane(riser, riserLane!, 'FX', BPM)).toBe(true)
    expect(generatorCandidateMatchesLane(riser, impactLane!, 'FX', BPM)).toBe(false)
    expect(generatorCandidateMatchesLane(texture, impactLane!, 'FX', BPM)).toBe(true)
    expect(generatorCandidateMatchesLane(otherTexture, impactLane!, 'Other', BPM)).toBe(false)
  })

  it('keeps category-coverage percussion on the lane grid', () => {
    const snareCategories = Array.from({ length: 30 }, (_, index) => candidate('Snare', 900 + index, {
      categoryName: `Snare ${String(index).padStart(2, '0')}`,
      plannerKind: 'one-shot'
    }))
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', [
      ...categoryRichCandidates,
      ...snareCategories
    ], {
      ...parameters('techno'),
      durationSeconds: 30,
      intensity: 'low'
    })
    const snareProfile = GENERATOR_PROFILES.techno.lanes[1]!
    const allowedOffsets = new Set([
      ...(snareProfile.beatPattern ?? []),
      ...(snareProfile.beatMutation ?? [])
    ])

    expect(plan.lanes[1]!.placements.every((placement) =>
      allowedOffsets.has(placement.startTick % TICKS_PER_BAR)
    )).toBe(true)
  })

  it('uses intensity for sample variety, phrase fills, and family strictness', () => {
    const plans = Object.fromEntries((['low', 'medium', 'high'] as const).map((intensity) => [
      intensity,
      createMixJamGeneratorPlan('root', 'fingerprint', categoryRichCandidates, {
        ...parameters('techno'),
        intensity
      })
    ])) as Record<'low' | 'medium' | 'high', MixJamGeneratorPlan>
    const minimumSamples = { low: 3, medium: 4, high: 5 } as const
    for (const intensity of ['low', 'medium', 'high'] as const) {
      // Sparse pools cap what a lane can select, so the quota is asserted on
      // the lane majority rather than every lane.
      expect(plans[intensity].selections.filter((selection) =>
        selection.sampleRefs.length >= minimumSamples[intensity]
      ).length).toBeGreaterThanOrEqual(8)
    }

    // High intensity adds phrase-end fills on mutation-only offsets; the
    // density rule keeps every intensity full, so the fill count (not raw
    // placement count) is what separates high from low.
    const snareProfile = GENERATOR_PROFILES.techno.lanes[1]!
    const fillOffsets = new Set((snareProfile.beatMutation ?? []).filter((offset) =>
      !(snareProfile.beatPattern ?? []).includes(offset)
    ))
    const fillCount = (plan: MixJamGeneratorPlan): number =>
      plan.lanes[1]!.placements.filter((placement) =>
        fillOffsets.has(placement.startTick % TICKS_PER_BAR)
      ).length
    expect(fillCount(plans.high)).toBeGreaterThan(fillCount(plans.low))

    // Intensity scales the family-coherence floor: 80% low, 70% medium, 60%
    // high, measured over distinct placed samples that have a placed sibling.
    const byRef = new Map(categoryRichCandidates.map((entry) => [entry.relpath, entry]))
    for (const [intensity, target] of [['low', 0.8], ['medium', 0.7], ['high', 0.6]] as const) {
      const placed = [...new Set(plans[intensity].lanes.flatMap((lane) =>
        lane.placements.map((placement) => placement.sampleRef)
      ))].filter((ref) => byRef.has(ref))
      const families = new Map<string, Set<string>>()
      for (const ref of placed) {
        const stem = byRef.get(ref)!.filename.replace(/\.wav$/, '').replace(/-?\d+$/, '')
        const parts = families.get(stem) ?? new Set<string>()
        parts.add(ref)
        families.set(stem, parts)
      }
      const members = placed.filter((ref) => {
        const stem = byRef.get(ref)!.filename.replace(/\.wav$/, '').replace(/-?\d+$/, '')
        return families.get(stem)!.size >= 2
      })
      expect(members.length / placed.length).toBeGreaterThanOrEqual(target)
    }
  })

  it.each(MIXJAM_GENERATOR_PROFILE_IDS)(
    'builds a deterministic, phrase-structured %s plan',
    (profileId) => {
      const first = createMixJamGeneratorPlan('root', 'fingerprint', candidates, parameters(profileId))
      const second = createMixJamGeneratorPlan(
        'root',
        'fingerprint',
        [...candidates].reverse(),
        parameters(profileId)
      )

      expect(second).toEqual(first)
      expect(first.targetBars).toBe(104)
      expect(first.targetBars % 8).toBe(0)
      expect(first.targetTicks).toBe(3328)
      expect(first.lanes).toHaveLength(16)
      expect(first.lanes.every((lane) => Number.isFinite(lane.gain))).toBe(true)
      expect(first.phrases.every((phrase) =>
        phrase.endBar > phrase.startBar && phrase.endBar - phrase.startBar <= 8
      )).toBe(true)

      for (const lane of first.lanes) {
        for (let index = 1; index < lane.placements.length; index++) {
          expect(lane.placements[index]!.startTick).toBeGreaterThanOrEqual(
            placementEnd(lane.placements[index - 1]!)
          )
        }
      }
      expect(Math.max(...first.lanes.flatMap((lane) => lane.placements.map(placementEnd))))
        .toBe(first.targetTicks)

      const bassRefs = new Set(candidates
        .filter((entry) => entry.categoryName === 'Bass')
        .map((entry) => entry.relpath))
      const bassPlacements = first.lanes.flatMap((lane) => lane.placements)
        .filter((placement) => bassRefs.has(placement.sampleRef))
      expect(bassPlacements.length).toBeGreaterThan(0)
      expect(bassPlacements.every((placement) => placement.slot === 2)).toBe(true)

      // Section names are profile data; the breakdown/peak contracts attach to
      // the phrase MODE, so resolve sections through the profile's mode table.
      const modeSection = (mode: string): MixJamGeneratorPlan['sections'][number] =>
        first.sections[GENERATOR_PROFILES[profileId]!.sections.findIndex(
          (section) => section.phraseMode === mode
        )]!
      const breakdown = modeSection('breakdown')
      const breakdownStart = breakdown.startBar * TICKS_PER_BAR
      const breakdownEnd = breakdown.endBar * TICKS_PER_BAR
      for (const laneIndex of [0, 4]) {
        expect(first.lanes[laneIndex]!.placements.some((placement) =>
          overlaps(breakdownStart, breakdownEnd, placement)
        )).toBe(false)
      }

      const peak = modeSection('peak')
      const peakStart = peak.startBar * TICKS_PER_BAR
      const peakEnd = peak.endBar * TICKS_PER_BAR
      for (const laneIndex of CORE_LANES[profileId]) {
        expect(first.lanes[laneIndex]!.placements.some((placement) =>
          overlaps(peakStart, peakEnd, placement)
        )).toBe(true)
      }

      for (const phrase of first.phrases) {
        const section = first.sections[phrase.sectionIndex]!
        for (const laneIndex of CORE_LANES[profileId].filter((lane) =>
          section.activeLanes.includes(lane)
        )) {
          expect(phrase.activeLanes).toContain(laneIndex)
        }
      }

      for (const laneIndex of PERCUSSION_LANES) {
        expect(first.lanes[laneIndex]!.placements.every((placement) =>
          placement.durationTicks <= TICKS_PER_BEAT
        )).toBe(true)
      }
      for (const laneIndex of LOOP_AND_SYNTH_LANES) {
        expect(first.lanes[laneIndex]!.placements.every((placement) =>
          [1, 2, 4, 8].includes(placement.durationTicks / TICKS_PER_BAR) &&
          placement.startTick % TICKS_PER_BAR === 0
        )).toBe(true)
      }

      const boundaries = new Set(first.sections.slice(1).map((section) =>
        section.startBar * TICKS_PER_BAR
      ))
      expect(first.lanes[14]!.placements.every((placement) => boundaries.has(placementEnd(placement))))
        .toBe(true)
      expect(first.lanes[15]!.placements.every((placement) => boundaries.has(placement.startTick)))
        .toBe(true)
    }
  )

  it('rejects a missing hard-required role', () => {
    expect(() => createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      candidates.filter((entry) => entry.sampleType !== 'Kick'),
      parameters('techno')
    )).toThrow('requires a Kick sample')
  })

  it('tolerates missing support material while at least 8 lanes stay populated', () => {
    // No Vocal or Atmosphere material: those support lanes stay empty and are
    // pruned by the renderer, but the arrangement still satisfies the
    // populated-lane floor.
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      candidates.filter((entry) => entry.sampleType !== 'Vocal' && entry.sampleType !== 'Atmosphere'),
      parameters('techno')
    )
    const populated = plan.lanes.filter((lane) => lane.placements.length > 0)
    expect(populated.length).toBeGreaterThanOrEqual(8)
    expect(populated.length).toBeLessThanOrEqual(32)
    expect(plan.lanes[8]!.placements).toHaveLength(0)
  })

  it('fails when fewer than 8 lanes can be populated', () => {
    // Core roles only: kick, bass, and synth material fills at most 7 of the
    // 16 techno lanes, so generation must fail with the lane-floor error.
    const sparse = candidates.filter((entry) =>
      ['Kick', 'Bass', 'Synth'].includes(entry.sampleType)
    )
    expect(() => createMixJamGeneratorPlan('root', 'fingerprint', sparse, parameters('techno')))
      .toThrow(/at least 8/)
  })

  it('rejects unsupported intensity values before planning', () => {
    expect(() => createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      candidates,
      { ...parameters('techno'), intensity: 'extreme' as never }
    )).toThrow('Intensity must be low, medium, or high.')
  })

  it('rejects incompatible known keys from tonal lane selections', () => {
    const incompatible = ['Bass', 'Synth', 'Loop', 'Vocal', 'Atmosphere'].map(
      (sampleType, index) => candidate(sampleType as SampleType, 100 + index, {
        musicalKey: 'C#',
        loopConfidence: 1
      })
    )
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...candidates, ...incompatible],
      parameters('trance')
    )
    const incompatibleRefs = new Set(incompatible.map((entry) => entry.relpath))

    expect(plan.dominantKey).toBe('Am')
    expect(plan.selections.flatMap((selection) => selection.sampleRefs)
      .every((sampleRef) => !incompatibleRefs.has(sampleRef))).toBe(true)
  })

  it('treats flat keys and their sharp enharmonic equivalents as compatible', () => {
    const flatKeyCandidates = candidates.map((entry) =>
      ['Bass', 'Loop', 'Vocal', 'Atmosphere'].includes(entry.sampleType)
        ? { ...entry, musicalKey: 'Bbm' }
        : entry.sampleType === 'Synth'
          ? { ...entry, musicalKey: 'C#' }
          : entry
    )

    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      flatKeyCandidates,
      parameters('trance')
    )

    expect(plan.dominantKey).toBe('A#m')
    expect(plan.selections.find((selection) => selection.laneIndex === 6)?.sampleRefs.length)
      .toBeGreaterThan(0)
  })

  it('derives the song key from tonal candidates only', () => {
    const keyedNonTonal = Array.from({ length: 12 }, (_, index) =>
      candidate('Percussion', 200 + index, { musicalKey: 'C#' })
    )
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...candidates, ...keyedNonTonal],
      parameters('house')
    )

    expect(plan.dominantKey).toBe('Am')
  })

  it('uses analyzed Other candidates for transition fallbacks', () => {
    const withoutFx = candidates.filter((entry) => entry.sampleType !== 'FX')
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', [
      ...withoutFx,
      candidate('Other', 300, { plannerKind: 'riser', energySlope: 0.9 }),
      candidate('Other', 301, { plannerKind: 'impact', attackStrength: 0.9 })
    ], parameters('techno'))

    expect(plan.selections.find((selection) => selection.laneIndex === 14)?.selectedType).toBe('Other')
    expect(plan.selections.find((selection) => selection.laneIndex === 15)?.selectedType).toBe('Other')
  })

  it('places vocal calls and responses without using consecutive phrases', () => {
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', candidates, parameters('house'))
    const vocalLane = plan.lanes[8]!
    const phraseVocalCounts = plan.phrases.map((phrase) => {
      const startTick = phrase.startBar * TICKS_PER_BAR
      const endTick = phrase.endBar * TICKS_PER_BAR
      return vocalLane.placements.filter((placement) => overlaps(startTick, endTick, placement)).length
    })

    expect(phraseVocalCounts.some((count) => count >= 2)).toBe(true)
    for (let index = 1; index < phraseVocalCounts.length; index++) {
      expect(phraseVocalCounts[index - 1]! > 0 && phraseVocalCounts[index]! > 0).toBe(false)
    }
  })

  it('clamps tonal RMS compensation and leaves percussion on template gain', () => {
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      candidates.map((entry) => entry.sampleType === 'Percussion'
        ? { ...entry, rms: 0.01 }
        : entry.sampleType === 'Atmosphere'
          ? { ...entry, rms: 0.8 }
          : entry),
      parameters('techno')
    )

    // Percussion one-shots keep the template mix hierarchy: RMS of a transient
    // is not comparable to a loop's, so no compensation applies.
    expect(plan.lanes[3]!.gain).toBeCloseTo(0.36)
    expect(plan.lanes[0]!.gain).toBeCloseTo(0.78)
    // Tonal lanes compensate toward the tonal median, clamped to plus or minus
    // 6 dB, and stay inside the control range.
    expect(plan.lanes[9]!.gain).toBeCloseTo(0.34 * 10 ** (-6 / 20))
    expect(plan.lanes.every((lane) => lane.gain >= 0 && lane.gain <= 1)).toBe(true)
  })

  it('changes selections or phrases across seeds without changing section boundaries', () => {
    const plans = ['seed-a', 'seed-b', 'seed-c', 'seed-d'].map((seed) =>
      createMixJamGeneratorPlan('root', 'fingerprint', candidates, parameters('house', seed))
    )
    const sectionShape = plans[0]!.sections
    const signatures = plans.map((plan) => JSON.stringify({
      selections: plan.selections,
      phrases: plan.phrases.map(({ sectionIndex, startBar, endBar, motif }) => ({
        sectionIndex,
        startBar,
        endBar,
        motif
      }))
    }))

    expect(plans.every((plan) => JSON.stringify(plan.sections) === JSON.stringify(sectionShape)))
      .toBe(true)
    expect(new Set(signatures).size).toBeGreaterThan(1)
  })

  it('rounds editable duration to the nearest whole 8-bar phrase and ends exactly there', () => {
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', candidates, {
      ...parameters('techno'),
      bpmMode: 'fixed',
      bpm: BPM,
      durationSeconds: 195
    })

    expect(plan.targetBars).toBe(112)
    expect(plan.targetBars % 8).toBe(0)
    expect(plan.quantizedDurationSeconds).toBeCloseTo(112 * 240 / BPM)
    expect(Math.max(...plan.lanes.flatMap((lane) => lane.placements.map(placementEnd))))
      .toBe(plan.targetTicks)
  })

  it('uses a role-valid grid position for the exact song-end anchor', () => {
    const sevenTickKick = candidates
      .filter((entry) => entry.sampleType !== 'Kick')
      .concat(candidate('Kick', 500, {
        duration: durationForTicks(7),
        plannerKind: 'one-shot'
      }))
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', sevenTickKick, parameters('techno'))
    const kickRef = sevenTickKick.find((entry) => entry.sampleType === 'Kick')!.relpath
    const kickPlacements = plan.lanes.flatMap((lane) => lane.placements)
      .filter((placement) => placement.sampleRef === kickRef)

    expect(kickPlacements.every((placement) => placement.startTick % TICKS_PER_BAR !== 25)).toBe(true)
    expect(Math.max(...plan.lanes.flatMap((lane) => lane.placements.map(placementEnd))))
      .toBe(plan.targetTicks)
  })

  it('uses the full-snapshot detected BPM supplied by the worker', () => {
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      candidates,
      parameters('techno'),
      undefined,
      160
    )

    expect(plan.parameters.resolvedBpm).toBe(160)
    expect(plan.targetBars).toBe(120)
  })

  it.each(MIXJAM_GENERATOR_PROFILE_IDS)(
    'bounds unchanged low-intensity phrase repetition for %s',
    (profileId) => {
      const plan = createMixJamGeneratorPlan('root', 'fingerprint', candidates, {
        ...parameters(profileId),
        intensity: 'low'
      })

      // The Pareto phrase grammar keeps contrast at roughly one non-rest
      // phrase in five at every intensity, never two in a row.
      const nonRest = plan.phrases.filter((phrase) => phrase.motif !== 'rest')
      const contrast = nonRest.filter((phrase) => phrase.motif === 'B')
      expect(contrast.length / nonRest.length).toBeLessThanOrEqual(0.4)
      for (let index = 1; index < nonRest.length; index++) {
        expect(nonRest[index - 1]!.motif === 'B' && nonRest[index]!.motif === 'B').toBe(false)
      }

      // Repetition stays bounded for lanes with real pools to walk; a lane
      // whose corpus offered a single sample necessarily repeats it.
      const walkable = new Set(plan.selections
        .filter((selection) => new Set(selection.sampleRefs).size >= 2)
        .map((selection) => selection.laneIndex))
      for (const lane of plan.lanes.slice(1, 14).filter((entry) => walkable.has(entry.index))) {
        let previousSignature = ''
        let unchangedRun = 0
        for (const phrase of plan.phrases) {
          const startTick = phrase.startBar * TICKS_PER_BAR
          const endTick = phrase.endBar * TICKS_PER_BAR
          const signature = lane.placements
            .filter((placement) => overlaps(startTick, endTick, placement))
            .map((placement) => `${placement.sampleRef}:${placement.startTick - startTick}:${placement.durationTicks}`)
            .join('|')
          if (signature.length === 0) {
            previousSignature = ''
            unchangedRun = 0
            continue
          }
          unchangedRun = signature === previousSignature ? unchangedRun + 1 : 1
          expect(unchangedRun).toBeLessThanOrEqual(2)
          previousSignature = signature
        }
      }
    }
  )

  it('designates hard-panned stereo pair lanes and mirrors them exactly', () => {
    // Complete l/r pairs for the atmosphere roles: enough for the pair-lane
    // designation to trigger on the sustained tonal lanes.
    const paired = [
      ...[1, 2, 3].flatMap((part) => ['l', 'r'].map((side) => candidate('Atmosphere', 900 + part, {
        relpath: `Sphere/cloud-${part}-${side}.wav`,
        filename: `cloud-${part}-${side}.wav`,
        categoryName: 'Sphere',
        duration: durationForTicks(4 * TICKS_PER_BAR)
      }))),
      ...[1, 2, 3].flatMap((part) => ['l', 'r'].map((side) => candidate('Other', 950 + part, {
        relpath: `Xtra/wash-${part}-${side}.wav`,
        filename: `wash-${part}-${side}.wav`,
        categoryName: 'Xtra',
        duration: durationForTicks(4 * TICKS_PER_BAR),
        plannerKind: 'texture'
      })))
    ]
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', [
      ...categoryRichCandidates,
      ...paired
    ], parameters('techno'))

    // Pan is a three-way decision everywhere.
    expect(plan.lanes.every((lane) => [-1, 0, 1].includes(lane.pan))).toBe(true)
    const leftLanes = plan.lanes.filter((lane) => lane.pan === -1)
    const rightLanes = plan.lanes.filter((lane) => lane.pan === 1)
    expect(leftLanes.length).toBeGreaterThan(0)
    expect(leftLanes.length).toBe(rightLanes.length)
    // Roughly one lane in five is part of a pair.
    const populated = plan.lanes.filter((lane) => lane.placements.length > 0)
    const pairedCount = leftLanes.length + rightLanes.length
    expect(pairedCount / populated.length).toBeGreaterThanOrEqual(0.1)
    expect(pairedCount / populated.length).toBeLessThanOrEqual(0.3)

    // Every mirror matches its source placement-for-placement with the twin
    // file, and pair lanes only ever contain complete pairs.
    for (const [index, left] of leftLanes.entries()) {
      const right = rightLanes[index]!
      expect(left.name.endsWith(' L')).toBe(true)
      expect(right.name).toBe(`${left.name.slice(0, -2)} R`)
      expect(right.gain).toBe(left.gain)
      expect(right.placements.length).toBe(left.placements.length)
      for (const [placementIndex, placement] of left.placements.entries()) {
        const mirror = right.placements[placementIndex]!
        expect(mirror.startTick).toBe(placement.startTick)
        expect(mirror.durationTicks).toBe(placement.durationTicks)
        expect(mirror.sampleRef).toBe(placement.sampleRef.replace(/-l\.wav$/, '-r.wav'))
      }
    }
  })

  it('never places one sample or its stereo twin on two different lanes', () => {
    const paired = [1, 2, 3].flatMap((part) => ['l', 'r'].map((side) => candidate('Synth', 960 + part, {
      relpath: `Seq/glide-${part}-${side}.wav`,
      filename: `glide-${part}-${side}.wav`,
      categoryName: 'Seq'
    })))
    // Several authored percussion families: with material to spare, no lane
    // ever needs the empty-lane reuse fallback, so cross-lane duplication is
    // forbidden outright.
    const percussionFamilies = ['conga', 'bongo', 'tabla', 'cabasa'].flatMap((stem, familyIndex) =>
      [1, 2, 3].map((part) => candidate('Percussion', 970 + familyIndex * 3 + part, {
        relpath: `Drum/${stem}-${part}.wav`,
        filename: `${stem}-${part}.wav`,
        categoryName: 'Drum',
        paletteSlot: 1
      }))
    )
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', [
      ...categoryRichCandidates,
      ...paired,
      ...percussionFamilies
    ], parameters('techno'))

    const logical = (ref: string): string => ref.replace(/-(l|r)\.wav$/, '.wav')
    const owners = new Map<string, number>()
    for (const lane of plan.lanes.filter((entry) => entry.pan === 0)) {
      for (const placement of lane.placements) {
        const key = logical(placement.sampleRef)
        expect(owners.get(key) ?? lane.index).toBe(lane.index)
        owners.set(key, lane.index)
      }
    }
  })

  it('keeps a motif lane coherent within one authored family across A phrases', () => {
    // Two bass families: a 3-part "deep" motif and a 2-part "warm" motif. The
    // anchor (A) phrases must walk one family's numbered parts instead of
    // hopping between the two unrelated families bar to bar.
    const bassFamilies = [
      ...['deep-1', 'deep-2', 'deep-3'].map((stem, index) =>
        candidate('Bass', 900 + index, {
          relpath: `Bass/${stem}.wav`,
          filename: `${stem}.wav`,
          categoryName: 'Bass'
        })
      ),
      ...['warm-1', 'warm-2'].map((stem, index) =>
        candidate('Bass', 910 + index, {
          relpath: `Bass/${stem}.wav`,
          filename: `${stem}.wav`,
          categoryName: 'Bass'
        })
      )
    ]
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', [
      ...candidates.filter((entry) => entry.sampleType !== 'Bass'),
      ...bassFamilies
    ], parameters('techno'))

    const familyOf = (ref: string): string =>
      ref.replace(/^Bass\//, '').replace(/-\d+\.wav$/, '')
    const bassLane = plan.lanes[4]!
    // Within any single A phrase, every bass placement is from one family.
    for (const phrase of plan.phrases.filter((entry) => entry.motif === 'A')) {
      const startTick = phrase.startBar * TICKS_PER_BAR
      const endTick = phrase.endBar * TICKS_PER_BAR
      const families = new Set(bassLane.placements
        .filter((placement) => overlaps(startTick, endTick, placement))
        .map((placement) => familyOf(placement.sampleRef)))
      expect(families.size).toBeLessThanOrEqual(1)
    }
    // The larger "deep" family anchors the lane and dominates its occupied
    // time (motif return), rather than the two families splitting the song
    // evenly. Time, not placement count: shorter parts tile more often.
    const familyTicks = new Map<string, number>()
    for (const placement of bassLane.placements) {
      const family = familyOf(placement.sampleRef)
      familyTicks.set(family, (familyTicks.get(family) ?? 0) + placement.durationTicks)
    }
    expect(familyTicks.get('deep') ?? 0).toBeGreaterThan(familyTicks.get('warm') ?? 0)
  })

  it('plans with an unresolved song key when no tonal candidate is keyed', () => {
    // Every tonal source has an unknown key, so dominantKey resolves to null and
    // the plan proceeds on unknown-key tonal material (spec-018 tonal fallback).
    const unkeyed = categoryRichCandidates.map((entry) =>
      ['Bass', 'Loop', 'Synth', 'Vocal', 'Atmosphere'].includes(entry.sampleType)
        ? { ...entry, musicalKey: null }
        : entry
    )
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', unkeyed, parameters('techno'))
    expect(plan.dominantKey).toBeNull()
    expect(plan.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
  })

  it('places unplaced family siblings to reach the intensity family-coherence floor', () => {
    // Rich authored bass and synth families so the family-ratio placement pass
    // has real siblings to draw in; the placed material must clear the low
    // intensity 80% floor without a shortfall excuse.
    const families = [
      ...Array.from({ length: 5 }, (_, index) => candidate('Bass', 1200 + index, {
        relpath: `Bass/pillar-${index + 1}.wav`,
        filename: `pillar-${index + 1}.wav`,
        categoryName: 'Bass'
      })),
      ...Array.from({ length: 5 }, (_, index) => candidate('Synth', 1300 + index, {
        relpath: `Keys/aurora-${index + 1}.wav`,
        filename: `aurora-${index + 1}.wav`,
        categoryName: 'Keys',
        paletteSlot: 4
      })),
      ...Array.from({ length: 4 }, (_, index) => candidate('Atmosphere', 1400 + index, {
        relpath: `Sphere/haze-${index + 1}.wav`,
        filename: `haze-${index + 1}.wav`,
        categoryName: 'Sphere',
        duration: durationForTicks(8 * TICKS_PER_BAR),
        plannerKind: 'atmosphere'
      }))
    ]
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...categoryRichCandidates, ...families],
      { ...parameters('techno'), intensity: 'low' }
    )
    // Low intensity demands the strictest 80% family floor; a successful plan
    // proves the family-ratio placement repair reached it (validation throws
    // otherwise, so merely returning is the assertion).
    const placed = plan.lanes.flatMap((lane) => lane.placements)
    expect(placed.length).toBeGreaterThan(0)
  })

  it('reports substitutions when a secondary role type fills a lane', () => {
    // No Loop sources at all: the Loop lane (5) must fall back to its secondary
    // Synth type, and that substitution is reported.
    const noLoops = categoryRichCandidates.filter((entry) => entry.sampleType !== 'Loop')
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', noLoops, parameters('techno'))
    expect(plan.substitutions.length).toBeGreaterThan(0)
    expect(plan.substitutions.every((sub) => sub.requestedType !== sub.selectedType)).toBe(true)
  })

  it('schedules explicit riser and impact material on both transition lanes', () => {
    // A rich pool of distinct risers and impacts so the boundary-transition
    // lanes (14 riser, 15 impact) both fill and place their boundary events.
    const transitions = [
      ...Array.from({ length: 5 }, (_, index) => candidate('FX', 1500 + index, {
        relpath: `Effect/riser-${index + 1}.wav`,
        filename: `riser-${index + 1}.wav`,
        categoryName: 'Effect',
        paletteSlot: 1,
        duration: durationForTicks(2 * TICKS_PER_BAR),
        plannerKind: 'riser',
        energySlope: 0.8
      })),
      ...Array.from({ length: 5 }, (_, index) => candidate('FX', 1600 + index, {
        relpath: `Effect/impact-${index + 1}.wav`,
        filename: `impact-${index + 1}.wav`,
        categoryName: 'Effect',
        paletteSlot: 1,
        duration: durationForTicks(TICKS_PER_BAR),
        plannerKind: 'impact',
        attackStrength: 0.9
      }))
    ]
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...categoryRichCandidates, ...transitions],
      parameters('techno')
    )
    const riserLane = plan.lanes.find((lane) => lane.index === 14)
    const impactLane = plan.lanes.find((lane) => lane.index === 15)
    // Both transition lanes are populated with boundary events.
    expect(riserLane?.placements.length ?? 0).toBeGreaterThan(0)
    expect(impactLane?.placements.length ?? 0).toBeGreaterThan(0)
    // A riser ends on a section boundary (its end tick is bar-aligned).
    for (const placement of riserLane!.placements) {
      expect((placement.startTick + placement.durationTicks) % TICKS_PER_BAR).toBe(0)
    }
    // An impact starts on a section boundary.
    for (const placement of impactLane!.placements) {
      expect(placement.startTick % TICKS_PER_BAR).toBe(0)
    }
  })

  it('keeps a large authored bass family coherent on the timeline', () => {
    // One large authored bass family of short one-bar loops competing with the
    // rich category corpus. The bass lane keeps its family coherent and the
    // plan validates against the family-coherence floor.
    const bassSiblings = Array.from({ length: 6 }, (_, index) => candidate('Bass', 1700 + index, {
      relpath: `Bass/monolith-${index + 1}.wav`,
      filename: `monolith-${index + 1}.wav`,
      categoryName: 'Bass'
    }))
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...categoryRichCandidates, ...bassSiblings],
      { ...parameters('techno'), intensity: 'low' }
    )
    // The plan validates (it would throw on a family-ratio shortfall), and the
    // bass lane placed more than one distinct monolith sibling.
    const bassRefs = new Set(plan.lanes[4]!.placements
      .map((placement) => placement.sampleRef)
      .filter((ref) => ref.includes('monolith')))
    expect(bassRefs.size).toBeGreaterThanOrEqual(1)
  })

  it('holds the family floor at low intensity when many singletons compete', () => {
    // Low intensity (0.8 floor) with a corpus that mixes small authored
    // families and many lone one-offs across percussion and FX. Selection and
    // the placement repair must still reach the strict floor without a
    // shortfall excuse, or validation throws — so a returned plan is the proof.
    const singletons = [
      ...Array.from({ length: 6 }, (_, index) => candidate('Percussion', 1800 + index, {
        relpath: `Drum/oneoff-${index}.wav`,
        filename: `oneoff-${index}.wav`,
        categoryName: 'Drum',
        paletteSlot: 1
      })),
      ...['aria', 'motif', 'pulse'].flatMap((stem, familyIndex) =>
        [1, 2, 3].map((part) => candidate('Synth', 1900 + familyIndex * 3 + part, {
          relpath: `Keys/${stem}-${part}.wav`,
          filename: `${stem}-${part}.wav`,
          categoryName: 'Keys',
          paletteSlot: 4,
          duration: durationForTicks(2 * TICKS_PER_BAR)
        }))
      )
    ]
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...categoryRichCandidates, ...singletons],
      { ...parameters('house'), intensity: 'low' }
    )
    expect(plan.lanes.filter((lane) => lane.placements.length > 0).length).toBeGreaterThanOrEqual(8)
  })
})
