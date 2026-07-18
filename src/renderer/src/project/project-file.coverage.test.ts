import { describe, expect, it } from 'vitest'
import { createDefaultLanes } from '../lib/arrangement'
import { createDefaultChannels, createDefaultProjectSongState } from './project-state'
import {
  parseProject,
  serializeProject,
  type ProjectData
} from './project-file'

type RawProject = Record<string, unknown> & {
  song: Record<string, unknown>
  lanes: Array<Record<string, unknown> & { placements: Array<Record<string, unknown>> }>
  channels: Array<Record<string, unknown> & { fx: Array<Record<string, unknown>> }>
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
    channels: createDefaultChannels()
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
  it('round-trips reverb and compressor state', () => {
    const project = projectWithPlacements()
    project.channels[0]!.effects = [{
      id: 'reverb',
      type: 'reverb',
      bypassed: false,
      roomSize: 0.5,
      decay: 0.4,
      mix: 0.3
    }]
    project.channels[1]!.effects = [{
      id: 'compressor',
      type: 'compressor',
      bypassed: true,
      threshold: -24,
      ratio: 4,
      attackMs: 10,
      releaseMs: 250,
      makeupGain: 2
    }]

    const parsed = parseProject(serializeProject(project, {
      appVersion: 'coverage',
      createdAt: '2026-07-18T00:00:00.000Z',
      modifiedAt: '2026-07-18T00:00:00.000Z'
    }))

    expect(parsed.channels[0]!.effects[0]).toMatchObject({ type: 'reverb', roomSize: 0.5 })
    expect(parsed.channels[1]!.effects[0]).toMatchObject({ type: 'compressor', ratio: 4 })
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
    expectInvalid((raw) => { raw.channels = null as unknown as RawProject['channels'] })
    expectInvalid((raw) => { raw.channels = [...raw.channels, ...raw.channels] })
    expectInvalid((raw) => { raw.channels[0] = null as unknown as RawProject['channels'][number] })
    expectInvalid((raw) => { raw.channels[1]!.id = raw.channels[0]!.id })
    expectInvalid((raw) => { raw.channels[1]!.index = raw.channels[0]!.index })
    expectInvalid((raw) => { raw.channels[0]!.id = 'wrong-channel' })
    expectInvalid((raw) => { raw.channels[0]!.fx = null as unknown as RawProject['channels'][number]['fx'] })
    expectInvalid((raw) => {
      raw.channels[0]!.fx = [{
        id: 'bad-reverb', type: 'reverb', bypassed: false,
        roomSize: 2, decay: 0.5, mix: 0.5
      }]
    })
    expectInvalid((raw) => {
      const effect = {
        id: 'duplicate-effect', type: 'reverb', bypassed: false,
        roomSize: 0.5, decay: 0.5, mix: 0.5
      }
      raw.channels[0]!.fx = [effect]
      raw.channels[1]!.fx = [effect]
    })
  })

  it('rejects malformed lane and placement records', () => {
    expectInvalid((raw) => { raw.lanes = null as unknown as RawProject['lanes'] })
    expectInvalid((raw) => { raw.lanes[0] = null as unknown as RawProject['lanes'][number] })
    expectInvalid((raw) => { raw.lanes[1]!.index = raw.lanes[0]!.index })
    expectInvalid((raw) => { raw.lanes[0]!.channelId = null })
    expectInvalid((raw) => { raw.lanes[0]!.placements = null as unknown as RawProject['lanes'][number]['placements'] })
    expectInvalid((raw) => { raw.lanes[0]!.placements[0] = null as unknown as Record<string, unknown> })
    expectInvalid((raw) => {
      raw.lanes[0]!.placements[1]!.id = raw.lanes[0]!.placements[0]!.id
    })
    expectInvalid((raw) => { raw.lanes[0]!.placements[0]!.slot = 9 })
    expectInvalid((raw) => { raw.lanes[0]!.muted = 'yes' })
  })
})
