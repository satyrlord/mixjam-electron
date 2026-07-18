import { describe, expect, it } from 'vitest'
import type {
  MixJamGeneratorParameters,
  MixJamGeneratorPlan,
  MixJamGeneratorProfileId,
  SampleType
} from '../../../shared/backend-api'
import { TICKS_PER_BAR } from '../engine/transport'
import type { AnalyzedGeneratorCandidate, GeneratorPlannerKind } from './generator-analysis'
import { generatorCandidateMatchesLane } from './generator-candidate'
import { createMixJamGeneratorPlan } from './generator-engine'
import { GENERATOR_PROFILES } from './generator-profiles'

const BPM = 140
const TICKS_PER_BEAT = TICKS_PER_BAR / 4
const PERCUSSION_LANES = [0, 1, 2, 3, 11] as const
const LOOP_AND_SYNTH_LANES = [5, 6, 7, 12, 13] as const
const CORE_LANES: Record<MixJamGeneratorProfileId, readonly number[]> = {
  techno: [0, 4, 6],
  trance: [0, 4, 5, 6],
  house: [0, 2, 4]
}

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
  it.each(['techno', 'trance', 'house'] as const)(
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

  it.each((['techno', 'trance', 'house'] as const).flatMap((profileId) =>
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

  it.each((['techno', 'trance', 'house'] as const).flatMap((profileId) =>
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

  it('uses intensity for sample variety, density, fills, and wet effects', () => {
    const plans = Object.fromEntries((['low', 'medium', 'high'] as const).map((intensity) => [
      intensity,
      createMixJamGeneratorPlan('root', 'fingerprint', categoryRichCandidates, {
        ...parameters('techno'),
        intensity
      })
    ])) as Record<'low' | 'medium' | 'high', MixJamGeneratorPlan>
    const minimumSamples = { low: 2, medium: 3, high: 4 } as const
    for (const intensity of ['low', 'medium', 'high'] as const) {
      expect(plans[intensity].selections.every((selection) =>
        selection.sampleRefs.length >= minimumSamples[intensity]
      )).toBe(true)
    }
    expect(plans.high.lanes.flatMap((lane) => lane.placements).length)
      .toBeGreaterThan(plans.low.lanes.flatMap((lane) => lane.placements).length)

    const snareProfile = GENERATOR_PROFILES.techno.lanes[1]!
    const fillOffsets = new Set((snareProfile.beatMutation ?? []).filter((offset) =>
      !(snareProfile.beatPattern ?? []).includes(offset)
    ))
    expect(plans.low.lanes[1]!.placements.some((placement) =>
      fillOffsets.has(placement.startTick % TICKS_PER_BAR)
    )).toBe(false)
    expect(plans.high.lanes[1]!.placements.some((placement) =>
      fillOffsets.has(placement.startTick % TICKS_PER_BAR)
    )).toBe(true)

    const wetMix = (plan: MixJamGeneratorPlan): number =>
      plan.channels[6]!.effects.find((effect) => effect.type === 'delay')!.values.mix as number
    expect(wetMix(plans.low)).toBeCloseTo(0.28)
    expect(wetMix(plans.medium)).toBeCloseTo(0.35)
    expect(wetMix(plans.high)).toBeCloseTo(0.4025)
  })

  it.each(['techno', 'trance', 'house'] as const)(
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
      expect(first.targetBars).toBe(105)
      expect(first.targetTicks).toBe(3360)
      expect(first.lanes).toHaveLength(16)
      expect(first.channels).toHaveLength(16)
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

      const breakdown = first.sections.find((section) => section.name === 'Breakdown')!
      const breakdownStart = breakdown.startBar * TICKS_PER_BAR
      const breakdownEnd = breakdown.endBar * TICKS_PER_BAR
      for (const laneIndex of [0, 4]) {
        expect(first.lanes[laneIndex]!.placements.some((placement) =>
          overlaps(breakdownStart, breakdownEnd, placement)
        )).toBe(false)
      }

      const peak = first.sections.find((section) => section.name === 'Peak')!
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

  it('clamps RMS compensation to plus or minus 6 dB and keeps final gains in range', () => {
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

    expect(plan.channels[3]!.gain).toBeCloseTo(0.42 * 10 ** (6 / 20))
    expect(plan.channels[9]!.gain).toBeCloseTo(0.34 * 10 ** (-6 / 20))
    expect(plan.channels.every((channel) => channel.gain >= 0 && channel.gain <= 1)).toBe(true)
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

  it('rounds editable duration to the nearest whole bar and ends exactly there', () => {
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', candidates, {
      ...parameters('techno'),
      bpmMode: 'fixed',
      bpm: BPM,
      durationSeconds: 181
    })

    expect(plan.targetBars).toBe(106)
    expect(plan.quantizedDurationSeconds).toBeCloseTo(106 * 240 / BPM)
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

  it.each(['techno', 'trance', 'house'] as const)(
    'bounds unchanged low-intensity phrase repetition for %s',
    (profileId) => {
      const plan = createMixJamGeneratorPlan('root', 'fingerprint', candidates, {
        ...parameters(profileId),
        intensity: 'low'
      })

      expect(plan.phrases.every((phrase) => phrase.motif !== 'B')).toBe(true)

      for (const lane of plan.lanes.slice(1, 14)) {
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
})
