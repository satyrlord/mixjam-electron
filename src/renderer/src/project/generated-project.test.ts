import { describe, expect, it } from 'vitest'
import type { MixJamGeneratorPlan } from '../../../shared/backend-api'
import { materializeGeneratedProject } from './generated-project'
import { parseProject, serializeProject } from './project-file'

const plan: MixJamGeneratorPlan = {
  generatorVersion: 3,
  profileId: 'techno',
  profileVersion: 5,
  seed: 'seed',
  parameters: { bpmMode: 'fixed', resolvedBpm: 140, intensity: 'medium', durationSeconds: 180 },
  corpusFingerprint: 'abc123',
  sampleFolderKey: 'samples',
  targetBars: 105,
  targetTicks: 3360,
  quantizedDurationSeconds: 180,
  dominantKey: null,
  analysis: { attemptedFiles: 1, analyzedFiles: 1, uniqueReads: 1 },
  selections: [],
  substitutions: [],
  sections: [],
  phrases: [],
  lanes: Array.from({ length: 16 }, (_, index) => ({
    index, name: index === 0 ? 'Kick' : `Lane ${index + 1}`, gain: index === 0 ? 0.8 : 0.5, pan: 0, muted: false, solo: false,
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
    expect(project.fxBuses.every((bus) => bus.module.type === 'empty')).toBe(true)
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
})
