import { describe, expect, it } from 'vitest'
import type { MixJamGeneratorPlan } from '../../../shared/backend-api'
import { materializeGeneratedProject } from './generated-project'
import { parseProject, serializeProject } from './project-file'

const plan: MixJamGeneratorPlan = {
  generatorVersion: 3,
  profileId: 'techno',
  profileVersion: 6,
  arcName: 'Tunnel',
  seed: 'seed',
  parameters: { bpmMode: 'fixed', resolvedBpm: 140, intensity: 'medium', durationSeconds: 180 },
  corpusFingerprint: 'abc123',
  sampleFolderKey: 'samples',
  targetBars: 105,
  targetTicks: 3360,
  quantizedDurationSeconds: 180,
  dominantKey: null,
  poolToken: '140/A',
  analysis: { attemptedFiles: 1, analyzedFiles: 1, uniqueReads: 1 },
  selections: [],
  substitutions: [],
  sections: [],
  phrases: [],
  returns: [
    { index: 0, module: 'aetherform-reverb', preset: 'Small Room', returnLevel: 0.3 },
    { index: 1, module: 'echoform-delay', preset: 'Wide Tape Echo', returnLevel: 0.28 }
  ],
  lanes: Array.from({ length: 16 }, (_, index) => ({
    index, name: index === 0 ? 'Kick' : `Lane ${index + 1}`, gain: index === 0 ? 0.8 : 0.5, pan: 0, muted: false, solo: false,
    sends: index === 0 ? [0, 0] : [0.2, 0.1],
    placements: index === 0 ? [{ id: 'p1', sampleRef: 'Kick/k.wav', sampleName: 'k.wav', startTick: 3328, durationTicks: 32, durationSeconds: 1, nativeBpm: 140, slot: 2 }] : []
  }))
}

describe('materializeGeneratedProject', () => {
  it('maps a neutral worker plan into a strict format-6 project', () => {
    const project = materializeGeneratedProject(plan)
    expect(project.song.bpm).toBe(140)
    expect(project.lanes[0]?.placements[0]).toMatchObject({ samplePath: 'Kick/k.wav', nativeBPM: 140 })
    expect(project.lanes[0]?.placements[0]?.slot).toBe(2)
    expect(project.lanes[0]).toMatchObject({ gain: 0.8, sends: [0, 0, 0, 0] })
    // The profile's two return buses are materialized from their preset names;
    // the unused slots stay Empty.
    expect(project.fxBuses.map((bus) => bus.module.type))
      .toEqual(['aetherform-reverb', 'echoform-delay', 'empty', 'empty'])
    expect(project.fxBuses[0]!.returnLevel).toBe(0.3)
    expect(project.fxBuses[1]!.returnLevel).toBe(0.28)
    expect(project.generator).toMatchObject({ profileId: 'techno', corpusFingerprint: 'abc123' })

    const parsed = parseProject(serializeProject(project, {
      appVersion: 'test',
      createdAt: '2026-07-17T00:00:00.000Z',
      modifiedAt: '2026-07-17T00:00:00.000Z'
    }))
    expect(parsed.lanes).toHaveLength(1)
    expect(parsed.generator).toEqual(project.generator)
    expect(parsed.lanes[0]?.placements[0]?.slot).toBe(2)
    expect(parsed.lanes[0]?.placements[0]?.startTick + parsed.lanes[0]!.placements[0]!.durationTicks)
      .toBe(plan.targetTicks)
  })

  it('materializes lane-owned Mixer values from generator plans', () => {
    const invalidPlan: MixJamGeneratorPlan = {
      ...plan,
      lanes: plan.lanes.map((lane, index) => ({ ...lane, gain: index === 0 ? 0.65 : lane.gain }))
    }

    expect(materializeGeneratedProject(invalidPlan).lanes[0]).toMatchObject({ gain: 0.65, sends: [0, 0, 0, 0] })
  })

  it('widens the profile send vector into the four project slots', () => {
    const sending: MixJamGeneratorPlan = {
      ...plan,
      lanes: plan.lanes.map((lane) => ({ ...lane, sends: [0.25, 0.15], placements: lane.placements }))
    }
    expect(materializeGeneratedProject(sending).lanes[0]!.sends).toEqual([0.25, 0.15, 0, 0])
  })

  it('preserves evidence-backed stereo-pair identity through strict persistence', () => {
    const paired: MixJamGeneratorPlan = {
      ...plan,
      lanes: plan.lanes.map((lane, index) => index < 2 ? {
        ...lane,
        pan: index === 0 ? -0.5 : 0.5,
        stereoPairId: 'stereo-pair-1234abcd',
        placements: [{
          ...plan.lanes[0]!.placements[0]!,
          id: `pair-placement-${index}`,
          sampleRef: `Sphere/pad-${index}.wav`,
          sampleName: `pad-${index}.wav`
        }]
      } : lane)
    }
    const project = materializeGeneratedProject(paired)
    const parsed = parseProject(serializeProject(project, {
      appVersion: 'test',
      createdAt: '2026-07-17T00:00:00.000Z',
      modifiedAt: '2026-07-17T00:00:00.000Z'
    }))
    expect(parsed.lanes.map((lane) => lane.stereoPairId))
      .toEqual(['stereo-pair-1234abcd', 'stereo-pair-1234abcd'])
  })

  it('rejects a profile naming a preset the shipped module does not have', () => {
    const unknown: MixJamGeneratorPlan = {
      ...plan,
      returns: [{ index: 0, module: 'aetherform-reverb', preset: 'Cathedral of Doubt', returnLevel: 0.3 }]
    }
    expect(() => materializeGeneratedProject(unknown)).toThrow(/Unknown Aetherform Reverb preset/)
  })

  it.each([-1, 4, 0.5])('rejects an out-of-range or fractional return index: %s', (index) => {
    const invalid: MixJamGeneratorPlan = {
      ...plan,
      returns: [{ ...plan.returns[0]!, index }]
    }
    expect(() => materializeGeneratedProject(invalid)).toThrow(/Generator return index must be an integer from 0 to 3/)
  })

  it('rejects duplicate return indexes', () => {
    const duplicate: MixJamGeneratorPlan = {
      ...plan,
      returns: [
        plan.returns[0]!,
        { ...plan.returns[1]!, index: plan.returns[0]!.index }
      ]
    }
    expect(() => materializeGeneratedProject(duplicate)).toThrow(/Duplicate generator return index: 0/)
  })
})
