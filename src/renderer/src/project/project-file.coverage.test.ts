import { describe, expect, it } from 'vitest'
import { createDefaultFxBuses, createDefaultLanes, createDefaultProjectSongState } from './project-state'
import {
  parseProject,
  serializeProject,
  type ProjectData
} from './project-file'

type RawProject = Record<string, unknown> & {
  song: Record<string, unknown>
  lanes: Array<Record<string, unknown> & { placements: Array<Record<string, unknown>> }>
  generator?: Record<string, unknown> & { parameters?: Record<string, unknown> }
}

function projectWithPlacements(): ProjectData {
  const lanes = createDefaultLanes()
  lanes[0] = {
    ...lanes[0]!,
    placements: [{
      id: 'placement-a',
      samplePath: 'Drums/kick.wav',
      sampleName: 'kick.wav',
      nativeBPM: null,
      startTick: 16,
      durationTicks: 8,
      durationSeconds: null
    }, {
      id: 'placement-b',
      samplePath: 'Drums/snare.wav',
      sampleName: 'snare.wav',
      nativeBPM: 128,
      startTick: 0,
      durationTicks: 8,
      durationSeconds: 0.5,
      slot: 2
    }]
  }
  return {
    song: createDefaultProjectSongState(),
    lanes,
    fxBuses: createDefaultFxBuses()
  }
}

function rawProject(): RawProject {
  return JSON.parse(serializeProject(projectWithPlacements(), {
    appVersion: 'coverage',
    createdAt: '2026-07-18T00:00:00.000Z',
    modifiedAt: '2026-07-18T00:00:00.000Z'
  })) as RawProject
}

function expectInvalid(mutate: (raw: RawProject) => void): void {
  const raw = rawProject()
  mutate(raw)
  expect(() => parseProject(JSON.stringify(raw))).toThrow()
}

describe('project file validation coverage', () => {
  it('round-trips lane-owned Mixer state and sorted placements', () => {
    const project = projectWithPlacements()

    const parsed = parseProject(serializeProject(project, {
      appVersion: 'coverage',
      createdAt: '2026-07-18T00:00:00.000Z',
      modifiedAt: '2026-07-18T00:00:00.000Z'
    }))

    expect(parsed.lanes[0]).toMatchObject({ gain: 0.8, sends: [0, 0, 0, 0] })
    expect(parsed.lanes[0]!.placements.map((placement) => placement.id)).toEqual([
      'placement-b',
      'placement-a'
    ])
  })

  it('rejects malformed top-level and generator records', () => {
    expect(() => parseProject('[]')).toThrow('project must be a JSON object')
    expectInvalid((raw) => { raw.formatVersion = -1 })
    expectInvalid((raw) => { raw.createdAt = 'not-a-date' })
    expectInvalid((raw) => { raw.generator = null as unknown as RawProject['generator'] })
    expectInvalid((raw) => {
      raw.generator = {
        generatorVersion: 1,
        profileId: 'techno',
        profileVersion: 1,
        seed: 'seed',
        parameters: null as unknown as Record<string, unknown>,
        corpusFingerprint: 'fingerprint',
        sampleFolderKey: 'folder'
      }
    })
  })

  it('rejects malformed channel records and effects', () => {
    // Channels are derived from lanes in the current format.
    // Channel records are no longer stored in the serialized document.
    // Verify malformed lanes propagate to derived channel validation.
    expectInvalid((raw) => { raw.lanes[0]!.gain = 99 })
    expectInvalid((raw) => { raw.lanes[0]!.sends = 'bad' })
  })

  it('rejects malformed lane and placement records', () => {
    expectInvalid((raw) => { raw.lanes = null as unknown as RawProject['lanes'] })
    expectInvalid((raw) => { raw.lanes[0] = null as unknown as RawProject['lanes'][number] })
    expectInvalid((raw) => { raw.lanes[1]!.id = raw.lanes[0]!.id })
    expectInvalid((raw) => { raw.lanes[0]!.placements = null as unknown as RawProject['lanes'][number]['placements'] })
    expectInvalid((raw) => { raw.lanes[0]!.placements[0] = null as unknown as Record<string, unknown> })
    expectInvalid((raw) => {
      raw.lanes[0]!.placements[1]!.id = raw.lanes[0]!.placements[0]!.id
    })
    expectInvalid((raw) => { raw.lanes[0]!.placements[0]!.slot = 9 })
    expectInvalid((raw) => { raw.lanes[0]!.muted = 'yes' })
  })
})
