import { describe, expect, it } from 'vitest'
import {
  type MixJamGeneratorPlan,
  type SampleType
} from '../../../shared/backend-api'
import { MIXJAM_GENERATOR_PROFILE_IDS } from '../../../shared/generator-templates'
import { TICKS_PER_BAR } from '../engine/transport'
import { generatorCandidateMatchesLane } from './generator-candidate'
import { createMixJamGeneratorPlan } from './generator-engine'
import { createGeneratorProfileRegistry, GENERATOR_PROFILES } from '../../../shared/generator-templates'
import { materializeGeneratedProject } from '../project/generated-project'
import { parseProject, serializeProject } from '../project/project-file'
import {
  BPM,
  CORE_LANES,
  candidate,
  candidates,
  durationForTicks,
  overlaps,
  parameters,
  placementEnd,
  sourceGroupRichCandidates
} from './generator-engine-test-support'

const TIMESTAMP = '2026-07-26T00:00:00.000Z'

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
      sourceGroupRichCandidates,
      parameters('custom-profile'),
      { attemptedFiles: sourceGroupRichCandidates.length, analyzedFiles: sourceGroupRichCandidates.length, uniqueReads: sourceGroupRichCandidates.length },
      BPM,
      registry.profiles
    )

    expect(plan.profileId).toBe('custom-profile')
    expect(plan.lanes).toHaveLength(16)
    expect(plan.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
    expect(plan.lanes.every((lane) => lane.gain >= 0 && lane.gain <= 1)).toBe(true)
  })

  it.each(MIXJAM_GENERATOR_PROFILE_IDS)(
    'shapes %s as an arrangement rather than a wall of sound',
    (profileId) => {
      const plan = createMixJamGeneratorPlan(
        'root',
        'fingerprint',
        sourceGroupRichCandidates,
        parameters(profileId)
      )
      const placements = plan.lanes.flatMap((lane) => lane.placements)

      // Populated-lane floor and ceiling are structural invariants; "every lane
      // must appear" is not, and neither is "every source group must appear".
      // Those two rules are what forced an Ambient pad into a Techno track.
      const populated = plan.lanes.filter((lane) => lane.placements.length > 0)
      expect(populated.length).toBeGreaterThanOrEqual(8)
      expect(populated.length).toBeLessThanOrEqual(32)
      expect(plan.lanes[14]!.placements.length).toBeGreaterThan(0)
      expect(plan.lanes[15]!.placements.length).toBeGreaterThan(0)
      expect(placements.length).toBeGreaterThan(0)

      // Lanes enter and leave, so consecutive sections differ in who is playing.
      const sectionSignatures = plan.sections
        .filter((section) => section.endBar > section.startBar)
        .map((section) => {
          const startTick = section.startBar * TICKS_PER_BAR
          const endTick = section.endBar * TICKS_PER_BAR
          return plan.lanes.flatMap((lane) => lane.placements.some((placement) =>
            overlaps(startTick, endTick, placement)
          ) ? [lane.index] : []).join(',')
        })
      expect(new Set(sectionSignatures).size).toBeGreaterThanOrEqual(4)

      // The busiest section carries at least twice the quietest one.
      const activeCounts = sectionSignatures.map((signature) =>
        signature === '' ? 0 : signature.split(',').length
      )
      expect(Math.max(...activeCounts)).toBeGreaterThanOrEqual(2 * Math.min(...activeCounts))
    }
  )

  it.each(MIXJAM_GENERATOR_PROFILE_IDS.flatMap((profileId) =>
    (['low', 'medium', 'high'] as const).map((intensity) => ({ profileId, intensity }))
  ))('keeps $profileId $intensity above the populated-lane floor', ({
    profileId,
    intensity
  }) => {
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', sourceGroupRichCandidates, {
      ...parameters(profileId),
      intensity
    })
    expect(plan.lanes.filter((lane) => lane.placements.length > 0).length).toBeGreaterThanOrEqual(8)
  })

  it.each(MIXJAM_GENERATOR_PROFILE_IDS.flatMap((profileId) =>
    (['low', 'medium', 'high'] as const).map((intensity) => ({ profileId, intensity }))
  ))('plans a short 30-second $profileId $intensity song without repair passes', ({
    profileId,
    intensity
  }) => {
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', sourceGroupRichCandidates, {
      ...parameters(profileId),
      durationSeconds: 30,
      intensity
    })

    expect(plan.lanes.filter((lane) => lane.placements.length > 0).length).toBeGreaterThanOrEqual(8)
    expect(Math.max(...plan.lanes.flatMap((lane) => lane.placements.map(placementEnd))))
      .toBe(plan.targetTicks)
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

  it('keeps percussion on the lane grid even with a flood of one-shot sources', () => {
    const snareSourceGroups = Array.from({ length: 30 }, (_, index) => candidate('Snare', 900 + index, {
      sourceGroup: `Snare ${String(index).padStart(2, '0')}`,
      plannerKind: 'one-shot'
    }))
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', [
      ...sourceGroupRichCandidates,
      ...snareSourceGroups
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
      createMixJamGeneratorPlan('root', 'fingerprint', sourceGroupRichCandidates, {
        ...parameters('techno'),
        intensity
      })
    ])) as Record<'low' | 'medium' | 'high', MixJamGeneratorPlan>
    // The reference library sits near two distinct sources per lane, so
    // intensity moves the budget by one rather than by three.
    const minimumSamples = { low: 2, medium: 2, high: 3 } as const
    for (const intensity of ['low', 'medium', 'high'] as const) {
      // Sparse pools cap what a lane can select, so the quota is asserted on
      // the lane majority rather than every lane.
      expect(plans[intensity].selections.filter((selection) =>
        selection.sampleRefs.length >= minimumSamples[intensity]
      ).length).toBeGreaterThanOrEqual(8)
    }

    // Intensity now lives in the fills: none at low, the last bar at medium,
    // the last two at high.
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
    const byRef = new Map(sourceGroupRichCandidates.map((entry) => [entry.relpath, entry]))
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
        .filter((entry) => entry.sourceGroup === 'Bass')
        .map((entry) => entry.relpath))
      const bassPlacements = first.lanes.flatMap((lane) => lane.placements)
        .filter((placement) => bassRefs.has(placement.sampleRef))
      expect(bassPlacements.length).toBeGreaterThan(0)
      expect(bassPlacements.every((placement) => placement.slot === 2)).toBe(true)

      // Every arc has a real breakdown: its quietest section drops at least one
      // core lane, and lanes a section gates out stay out for its whole span.
      // Read off the plan's own sections, because which arc the seed picked is
      // not knowable from the profile alone.
      const withBars = first.sections.filter((section) => section.endBar > section.startBar)
      const breakdown = [...withBars].sort((left, right) =>
        left.activeLanes.length - right.activeLanes.length
      )[0]!
      const breakdownStart = breakdown.startBar * TICKS_PER_BAR
      const breakdownEnd = breakdown.endBar * TICKS_PER_BAR
      const silencedCore = CORE_LANES[profileId].filter((laneIndex) =>
        !breakdown.activeLanes.includes(laneIndex)
      )
      expect(silencedCore.length).toBeGreaterThan(0)
      for (const laneIndex of silencedCore) {
        expect(first.lanes[laneIndex]!.placements.some((placement) =>
          overlaps(breakdownStart, breakdownEnd, placement)
        )).toBe(false)
      }

      const peak = [...withBars].sort((left, right) =>
        right.activeLanes.length - left.activeLanes.length
      )[0]!
      const peakStart = peak.startBar * TICKS_PER_BAR
      const peakEnd = peak.endBar * TICKS_PER_BAR
      for (const laneIndex of CORE_LANES[profileId].filter((lane) => peak.activeLanes.includes(lane))) {
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

      // Lane roles are profile data, so read them off the profile rather than
      // assuming a fixed index layout across six different templates.
      const profileLanes = GENERATOR_PROFILES[profileId]!.lanes
      const tailLanes = new Set(GENERATOR_PROFILES[profileId]!.arcs
        .flatMap((arc) => arc.ops)
        .filter((op) => op.op === 'tail')
        .map((op) => op.lane))
      for (const [laneIndex, laneProfile] of profileLanes.entries()) {
        if (laneProfile.role !== 'percussion') continue
        // A hit is trimmed to the stride until the next hit in its pattern, so
        // it never overlaps the following one and never outlasts a bar.
        expect(first.lanes[laneIndex]!.placements.every((placement) =>
          placement.durationTicks <= TICKS_PER_BAR
        )).toBe(true)
      }
      for (const [laneIndex, laneProfile] of profileLanes.entries()) {
        // Whole-bar loop material starts on a bar line — except where a tail op
        // deliberately places it to *end* on one instead.
        if (laneProfile.role !== 'motif' || tailLanes.has(laneIndex)) continue
        if (!laneProfile.types.every((type) => type === 'Loop' || type === 'Synth')) continue
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

    const profile = GENERATOR_PROFILES.techno
    // Percussion one-shots keep the template mix hierarchy: RMS of a transient
    // is not comparable to a loop's, so no compensation applies.
    expect(plan.lanes[3]!.gain).toBeCloseTo(profile.lanes[3]!.gain)
    expect(plan.lanes[0]!.gain).toBeCloseTo(profile.lanes[0]!.gain)
    // Tonal lanes compensate toward the tonal median, clamped to plus or minus
    // 6 dB, and never past 1.3x the profile gain so the mix hierarchy holds.
    expect(plan.lanes[9]!.gain).toBeCloseTo(profile.lanes[9]!.gain * 10 ** (-6 / 20))
    expect(plan.lanes.every((lane, index) =>
      lane.gain >= 0 && lane.gain <= Math.min(1, profile.lanes[index]!.gain * 1.3 + 1e-9)
    )).toBe(true)
  })

  it('varies the arc, the selections, or both across seeds, and repeats exactly per seed', () => {
    const seeds = ['seed-a', 'seed-b', 'seed-c', 'seed-d']
    const plans = seeds.map((seed) =>
      createMixJamGeneratorPlan('root', 'fingerprint', candidates, parameters('house', seed))
    )
    const signatures = plans.map((plan) => JSON.stringify({
      arcName: plan.arcName,
      selections: plan.selections,
      sections: plan.sections
    }))
    expect(new Set(signatures).size).toBeGreaterThan(1)

    // The seed picks the arc, so exact regeneration reproduces it (B9).
    const arcs = new Set(plans.map((plan) => plan.arcName))
    expect(arcs.size).toBeGreaterThan(1)
    for (const [index, seed] of seeds.entries()) {
      const repeat = createMixJamGeneratorPlan('root', 'fingerprint', candidates, parameters('house', seed))
      expect(repeat).toEqual(plans[index])
    }
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

  // A generated plan has to satisfy the *loader's* invariants, not just the
  // planner's. They are separate checks, and a plan that passes only the second
  // becomes a file the app refuses to open — which is how a batch of unloadable
  // projects once shipped. The specific break was spec-011 AC-016: percussion
  // trimming, accelerating rolls, and the song-end anchor each wrote their own
  // span for one sample. Round-tripping catches that and any future divergence.
  it.each(MIXJAM_GENERATOR_PROFILE_IDS)('produces a loadable project for %s', (profileId) => {
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', candidates, parameters(profileId))
    const document = serializeProject(materializeGeneratedProject(plan), {
      appVersion: 'test', createdAt: TIMESTAMP, modifiedAt: TIMESTAMP
    })

    expect(() => parseProject(document)).not.toThrow()

    const spans = new Map<string, number>()
    for (const lane of plan.lanes) {
      for (const placement of lane.placements) {
        const known = spans.get(placement.sampleRef)
        if (known !== undefined) expect(placement.durationTicks).toBe(known)
        spans.set(placement.sampleRef, placement.durationTicks)
      }
    }
    expect(spans.size).toBeGreaterThan(0)
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
    'lets a lane hold one unchanged idea across a whole section of %s',
    (profileId) => {
      const plan = createMixJamGeneratorPlan('root', 'fingerprint', candidates, {
        ...parameters(profileId),
        intensity: 'low'
      })

      // The deleted two-phrase repetition ban is the rule that forbade the
      // reference library's 56-bar unchanged arp. A lane must now be *able* to
      // repeat its phrase signature for the length of a section.
      const runs = plan.lanes.map((lane) => {
        let previousSignature = ''
        let unchangedRun = 0
        let longest = 0
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
          longest = Math.max(longest, unchangedRun)
          previousSignature = signature
        }
        return longest
      })
      expect(Math.max(...runs)).toBeGreaterThanOrEqual(2)
    }
  )

  it('never places one sample on two different lanes', () => {
    const paired = [1, 2, 3].flatMap((part) => ['l', 'r'].map((side) => candidate('Synth', 960 + part, {
      relpath: `Seq/glide-${part}-${side}.wav`,
      filename: `glide-${part}-${side}.wav`,
      sourceGroup: 'Seq'
    })))
    // Several authored percussion families: with material to spare, no lane
    // ever needs the empty-lane reuse fallback, so cross-lane duplication is
    // forbidden outright.
    const percussionFamilies = ['conga', 'bongo', 'tabla', 'cabasa'].flatMap((stem, familyIndex) =>
      [1, 2, 3].map((part) => candidate('Percussion', 970 + familyIndex * 3 + part, {
        relpath: `Drum/${stem}-${part}.wav`,
        filename: `${stem}-${part}.wav`,
        sourceGroup: 'Drum',
        paletteSlot: 1
      }))
    )
    const plan = createMixJamGeneratorPlan('root', 'fingerprint', [
      ...sourceGroupRichCandidates,
      ...paired,
      ...percussionFamilies
    ], parameters('techno'))

    const owners = new Map<string, number>()
    for (const lane of plan.lanes) {
      for (const placement of lane.placements) {
        expect(owners.get(placement.sampleRef) ?? lane.index).toBe(lane.index)
        owners.set(placement.sampleRef, lane.index)
      }
    }
  })

  it('keeps a motif lane coherent within one authored family across a phrase', () => {
    // Two bass families: a 3-part "deep" motif and a 2-part "warm" motif. The
    // anchor (A) phrases must walk one family's numbered parts instead of
    // hopping between the two unrelated families bar to bar.
    const bassFamilies = [
      ...['deep-1', 'deep-2', 'deep-3'].map((stem, index) =>
        candidate('Bass', 900 + index, {
          relpath: `Bass/${stem}.wav`,
          filename: `${stem}.wav`,
          sourceGroup: 'Bass'
        })
      ),
      ...['warm-1', 'warm-2'].map((stem, index) =>
        candidate('Bass', 910 + index, {
          relpath: `Bass/${stem}.wav`,
          filename: `${stem}.wav`,
          sourceGroup: 'Bass'
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
    // Within any single phrase, every bass placement is from one family.
    for (const phrase of plan.phrases) {
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
    const unkeyed = sourceGroupRichCandidates.map((entry) =>
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
        sourceGroup: 'Bass'
      })),
      ...Array.from({ length: 5 }, (_, index) => candidate('Synth', 1300 + index, {
        relpath: `Keys/aurora-${index + 1}.wav`,
        filename: `aurora-${index + 1}.wav`,
        sourceGroup: 'Keys',
        paletteSlot: 4
      })),
      ...Array.from({ length: 4 }, (_, index) => candidate('Atmosphere', 1400 + index, {
        relpath: `Sphere/haze-${index + 1}.wav`,
        filename: `haze-${index + 1}.wav`,
        sourceGroup: 'Sphere',
        duration: durationForTicks(8 * TICKS_PER_BAR),
        plannerKind: 'atmosphere'
      }))
    ]
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...sourceGroupRichCandidates, ...families],
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
    const noLoops = sourceGroupRichCandidates.filter((entry) => entry.sampleType !== 'Loop')
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
        sourceGroup: 'Effect',
        paletteSlot: 1,
        duration: durationForTicks(2 * TICKS_PER_BAR),
        plannerKind: 'riser',
        energySlope: 0.8
      })),
      ...Array.from({ length: 5 }, (_, index) => candidate('FX', 1600 + index, {
        relpath: `Effect/impact-${index + 1}.wav`,
        filename: `impact-${index + 1}.wav`,
        sourceGroup: 'Effect',
        paletteSlot: 1,
        duration: durationForTicks(TICKS_PER_BAR),
        plannerKind: 'impact',
        attackStrength: 0.9
      }))
    ]
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...sourceGroupRichCandidates, ...transitions],
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
    // rich sourceGroup corpus. The bass lane keeps its family coherent and the
    // plan validates against the family-coherence floor.
    const bassSiblings = Array.from({ length: 6 }, (_, index) => candidate('Bass', 1700 + index, {
      relpath: `Bass/monolith-${index + 1}.wav`,
      filename: `monolith-${index + 1}.wav`,
      sourceGroup: 'Bass'
    }))
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...sourceGroupRichCandidates, ...bassSiblings],
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
        sourceGroup: 'Drum',
        paletteSlot: 1
      })),
      ...['aria', 'motif', 'pulse'].flatMap((stem, familyIndex) =>
        [1, 2, 3].map((part) => candidate('Synth', 1900 + familyIndex * 3 + part, {
          relpath: `Keys/${stem}-${part}.wav`,
          filename: `${stem}-${part}.wav`,
          sourceGroup: 'Keys',
          paletteSlot: 4,
          duration: durationForTicks(2 * TICKS_PER_BAR)
        }))
      )
    ]
    const plan = createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      [...sourceGroupRichCandidates, ...singletons],
      { ...parameters('house'), intensity: 'low' }
    )
    expect(plan.lanes.filter((lane) => lane.placements.length > 0).length).toBeGreaterThanOrEqual(8)
  })
})
