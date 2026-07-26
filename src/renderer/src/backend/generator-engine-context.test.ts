import { describe, expect, it } from 'vitest'
import type { MixJamGeneratorPlan } from '../../../shared/backend-api'
import { TICKS_PER_BAR } from '../engine/transport'
import { createMixJamGeneratorPlan } from './generator-engine'
import {
  candidate,
  candidates,
  overlaps,
  parameters,
  placementEnd
} from './generator-engine-test-support'

describe('MixJam generator engine tonal contexts and tails', () => {
  it('rejects a missing hard-required role', () => {
    expect(() => createMixJamGeneratorPlan(
      'root',
      'fingerprint',
      candidates.filter((entry) => entry.sampleType !== 'Kick'),
      parameters('techno')
    )).toThrow('requires a Kick sample')
  })

  it('chooses a complete tonal pool over a larger incomplete pool', () => {
    const completePool = candidates.map((entry) => ({ ...entry, poolToken: '140/B' }))
    const synthMajority = Array.from({ length: 40 }, (_, index) => candidate('Synth', 3000 + index, {
      relpath: `Synth/a-majority-${index}.wav`,
      filename: `a-majority-${index}.wav`,
      poolToken: '140/A'
    }))

    const plan = createMixJamGeneratorPlan(
      'root', 'fingerprint', [...completePool, ...synthMajority], parameters('techno')
    )

    expect(plan.poolToken).toBe('140/B')
    expect(plan.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
  })

  it('chooses a viable key and pool together instead of a raw dominant key', () => {
    const completePool = candidates.map((entry) => ({ ...entry, poolToken: '140/B' }))
    const cSharpSynthMajority = Array.from({ length: 40 }, (_, index) => candidate('Synth', 3100 + index, {
      relpath: `Synth/c-sharp-majority-${index}.wav`,
      filename: `c-sharp-majority-${index}.wav`,
      poolToken: '140/A',
      musicalKey: 'C#'
    }))

    const plan = createMixJamGeneratorPlan(
      'root', 'fingerprint', [...completePool, ...cSharpSynthMajority], parameters('techno')
    )

    expect(plan.poolToken).toBe('140/B')
    expect(plan.dominantKey).toBe('Am')
    expect(plan.lanes.every((lane) => lane.placements.length > 0)).toBe(true)
  })

  it('limits tail replacement to the named boundary section and lands it exactly on that boundary', () => {
    const tunnel = createMixJamGeneratorPlan('root', 'fingerprint', candidates, parameters('techno', 'b'))
    const doubleDrop = createMixJamGeneratorPlan('root', 'fingerprint', candidates, parameters('techno'))
    expect(tunnel.arcName).toBe('Tunnel')
    expect(doubleDrop.arcName).toBe('Double Drop')

    const assertTail = (
      plan: MixJamGeneratorPlan, laneIndex: number, tailSection: string, unaffectedSections: readonly string[]
    ): void => {
      const boundary = plan.sections.find((section) => section.name === tailSection)!
      expect(plan.lanes[laneIndex]!.placements.some((placement) => placementEnd(placement) === boundary.startBar * TICKS_PER_BAR))
        .toBe(true)
      for (const sectionName of unaffectedSections) {
        const section = plan.sections.find((candidate) => candidate.name === sectionName)!
        expect(plan.lanes[laneIndex]!.placements.some((placement) =>
          overlaps(section.startBar * TICKS_PER_BAR, Math.min(section.startBar + 8, section.endBar) * TICKS_PER_BAR, placement)
        )).toBe(true)
      }
    }

    assertTail(tunnel, 9, 'Breakdown', ['Intro', 'Outro'])
    assertTail(tunnel, 10, 'Outro', ['Intro', 'Breakdown'])
    assertTail(doubleDrop, 9, 'Trough', ['Rebuild', 'Outro'])
  })
})
