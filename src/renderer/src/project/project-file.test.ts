import { describe, expect, it } from 'vitest'
import { TRACKER_TOTAL_TICKS } from '../lib/arrangement'
import {
  NEWER_PROJECT_VERSION_MESSAGE,
  ProjectFileError,
  isProjectRelativePath,
  parseProject,
  projectFingerprint,
  serializeProject,
  type ProjectData,
  type ProjectGeneratorMetadata
} from './project-file'
import { supportsExactGeneratorRegeneration } from './generator-support'
import { createDefaultFxBuses, createDefaultLanes, type ProjectFxBuses } from './project-state'

const CREATED_AT = '2026-07-13T10:00:00.000Z'
const MODIFIED_AT = '2026-07-13T11:00:00.000Z'
const GENERATOR: ProjectGeneratorMetadata = {
  generatorVersion: 1,
  profileId: 'techno',
  profileVersion: 2,
  seed: 'safe-seed_42',
  parameters: {
    bpmMode: 'follow-detected',
    resolvedBpm: 140,
    tempoClusterPrefix: '@cohort/Techno/SC1',
    intensity: 'medium',
    durationSeconds: 180
  },
  corpusFingerprint: 'sha256_abc123',
  sampleFolderKey: 'sample-folder-1'
}

function makeProject(): ProjectData {
  const lanes = createDefaultLanes()
  lanes[0] = {
    ...lanes[0]!,
    name: 'Kick Phrase',
    muted: true,
    pan: -0.25,
    gain: 0.63,
    solo: true,
    placements: [{
      id: 'placement-kick-1',
      samplePath: 'Drums/Kicks/kick.wav',
      sampleName: 'kick.wav',
      nativeBPM: 126,
      startTick: 8,
      durationTicks: 24,
      durationSeconds: 1.25,
      slot: 3
    }]
  }
  return {
    song: {
      bpm: 126,
      masterGain: 0.72,
      clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
    },
    lanes,
    fxBuses: createDefaultFxBuses()
  }
}

function serialize(project = makeProject(), modifiedAt = MODIFIED_AT): string {
  return serializeProject(project, {
    appVersion: 'v0.test.0',
    createdAt: CREATED_AT,
    modifiedAt
  })
}

describe('project file format', () => {
  it('rejects serialization when the in-memory Return bus count is invalid', () => {
    const project = makeProject()
    project.fxBuses = [] as unknown as ProjectFxBuses
    expect(() => serialize(project)).toThrow('exactly 4 return buses')
  })
  it('supports regeneration only for the current generator and profile versions', () => {
    expect(supportsExactGeneratorRegeneration(GENERATOR)).toBe(true)
    expect(supportsExactGeneratorRegeneration({ ...GENERATOR, profileVersion: 1 })).toBe(false)
    expect(supportsExactGeneratorRegeneration({
      ...GENERATOR,
      generatorVersion: 2,
      profileVersion: 2
    })).toBe(false)
    expect(supportsExactGeneratorRegeneration({
      ...GENERATOR,
      profileId: 'future-json-profile'
    })).toBe(false)
  })

  it('loads safe metadata for an unregistered JSON profile without offering exact regeneration', () => {
    const futureGenerator = { ...GENERATOR, profileId: 'future-json-profile' }
    const parsed = parseProject(serialize({ ...makeProject(), generator: futureGenerator }))

    expect(parsed.generator).toEqual(futureGenerator)
    expect(supportsExactGeneratorRegeneration(parsed.generator!)).toBe(false)
  })

  it('round-trips arrangement, Song, Mixer, routing, and FX state', () => {
    const parsed = parseProject(serialize())

    expect(parsed.song).toEqual({
      bpm: 126,
      masterGain: 0.72,
      clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
    })
    expect(parsed.lanes[0]).toMatchObject({
      index: 0,
      name: 'Kick Phrase',
      muted: true,
      pan: -0.25,
      placements: [{
        id: 'placement-kick-1',
        samplePath: 'Drums/Kicks/kick.wav',
        sampleName: 'kick.wav',
        nativeBPM: 126,
        startTick: 8,
        durationTicks: 24,
        durationSeconds: 1.25,
        slot: 3
      }]
    })
    expect(parsed.lanes[0]).toMatchObject({ gain: 0.63, solo: true, sends: [0, 0, 0, 0] })
  })

  it('save-load-save is identical except for modifiedAt', () => {
    const first = JSON.parse(serialize()) as Record<string, unknown>
    const loaded = parseProject(JSON.stringify(first))
    const second = JSON.parse(serializeProject(loaded, {
      appVersion: loaded.appVersion,
      createdAt: loaded.createdAt,
      modifiedAt: '2026-07-13T12:00:00.000Z'
    })) as Record<string, unknown>

    delete first.modifiedAt
    delete second.modifiedAt
    expect(second).toEqual(first)
  })

  it('round-trips format-3 generator metadata', () => {
    const project = { ...makeProject(), generator: GENERATOR }
    const parsed = parseProject(serialize(project))

    expect(parsed.formatVersion).toBe(4)
    expect(parsed.generator).toEqual(GENERATOR)

    const serialized = JSON.parse(serializeProject(parsed, {
      appVersion: parsed.appVersion,
      createdAt: parsed.createdAt,
      modifiedAt: parsed.modifiedAt
    })) as { generator: ProjectGeneratorMetadata }
    expect(serialized.generator).toEqual(GENERATOR)
  })

  it('rejects version 2 projects (migration removed)', () => {
    const versionTwo = JSON.parse(serialize()) as Record<string, unknown>
    versionTwo.formatVersion = 2
    delete versionTwo.generator

    expect(() => parseProject(JSON.stringify(versionTwo))).toThrowError(ProjectFileError)
  })

  it.each([
    ['generatorVersion', 0, 'project.generator.generatorVersion'],
    ['profileId', '../ambient', 'project.generator.profileId'],
    ['profileVersion', 0, 'project.generator.profileVersion'],
    ['seed', 'not safe', 'project.generator.seed'],
    ['seed', 'a'.repeat(65), 'project.generator.seed'],
    ['corpusFingerprint', '', 'project.generator.corpusFingerprint'],
    ['sampleFolderKey', '', 'project.generator.sampleFolderKey']
  ])('rejects invalid generator %s', (field, value, expectedPath) => {
    const raw = JSON.parse(serialize({ ...makeProject(), generator: GENERATOR })) as {
      generator: Record<string, unknown>
    }
    raw.generator[field] = value

    expect(() => parseProject(JSON.stringify(raw))).toThrow(expectedPath)
  })

  it.each([
    ['bpmMode', 'automatic', 'project.generator.parameters.bpmMode'],
    ['resolvedBpm', 59, 'project.generator.parameters.resolvedBpm'],
    ['tempoClusterPrefix', '../escape', 'project.generator.parameters.tempoClusterPrefix'],
    ['intensity', 'extreme', 'project.generator.parameters.intensity'],
    ['durationSeconds', 601, 'project.generator.parameters.durationSeconds']
  ])('rejects invalid generator parameter %s', (field, value, expectedPath) => {
    const raw = JSON.parse(serialize({ ...makeProject(), generator: GENERATOR })) as {
      generator: { parameters: Record<string, unknown> }
    }
    raw.generator.parameters[field] = value

    expect(() => parseProject(JSON.stringify(raw))).toThrow(expectedPath)
  })

  it('round-trips the whole-root analysis group key', () => {
    const generator = {
      ...GENERATOR,
      parameters: { ...GENERATOR.parameters, tempoClusterPrefix: '' }
    }
    expect(parseProject(serialize({ ...makeProject(), generator })).generator).toEqual(generator)
  })

  it('serializes only project content, without capacity padding or a stored song end', () => {
    const raw = JSON.parse(serialize()) as Record<string, unknown> & {
      lanes: Array<{ placements: unknown[] }>
    }

    expect(raw).not.toHaveProperty('barCount')
    expect(raw).not.toHaveProperty('songEndTick')
    expect(raw.lanes.flatMap((lane) => lane.placements)).toHaveLength(1)
  })

  it('rejects persisted placements that extend beyond the 999-bar capacity', () => {
    const raw = JSON.parse(serialize()) as {
      lanes: Array<{ placements: Array<{ startTick: number; durationTicks: number }> }>
    }
    raw.lanes[0]!.placements[0]!.startTick = TRACKER_TOTAL_TICKS - 8
    raw.lanes[0]!.placements[0]!.durationTicks = 24

    expect(() => parseProject(JSON.stringify(raw))).toThrow(
      `project.lanes[0].placements[0].durationTicks must produce an exclusive end tick ` +
      `(startTick + durationTicks) no greater than ${TRACKER_TOTAL_TICKS}`
    )
  })

  it('rejects newer versions without changing the error wording', () => {
    const raw = JSON.parse(serialize()) as Record<string, unknown>
    raw.formatVersion = 99

    expect(() => parseProject(JSON.stringify(raw))).toThrowError(NEWER_PROJECT_VERSION_MESSAGE)
  })

  it('rejects absolute, traversal, backslash, and malformed sample refs', () => {
    expect(isProjectRelativePath('Drums/Kick.wav')).toBe(true)
    expect(isProjectRelativePath('C:/Samples/Kick.wav')).toBe(false)
    expect(isProjectRelativePath('/Samples/Kick.wav')).toBe(false)
    expect(isProjectRelativePath('../Kick.wav')).toBe(false)
    expect(isProjectRelativePath('Drums\\Kick.wav')).toBe(false)

    const raw = JSON.parse(serialize()) as { lanes: Array<{ placements: Array<{ sampleRef: string }> }> }
    raw.lanes[0]!.placements[0]!.sampleRef = '../outside.wav'
    expect(() => parseProject(JSON.stringify(raw))).toThrowError(ProjectFileError)
  })

  it('rejects conflicting musical spans for the same sample', () => {
    type SerializedPlacement = {
      id: string
      sampleRef: string
      sampleName: string
      nativeBPM: number | null
      startTick: number
      durationTicks: number
      durationSeconds: number | null
      slot: number | null
    }
    const raw = JSON.parse(serialize()) as {
      lanes: Array<{ placements: SerializedPlacement[] }>
    }
    raw.lanes[1]!.placements.push({
      ...raw.lanes[0]!.placements[0]!,
      id: 'placement-kick-2',
      startTick: 64,
      durationTicks: 48
    })

    expect(() => parseProject(JSON.stringify(raw))).toThrow(
      'durationTicks must match the other placements for Drums/Kicks/kick.wav'
    )
  })

  it('rejects pre-v1 draft format (migration removed)', () => {
    const raw = JSON.parse(serialize()) as Record<string, unknown>
    raw.formatVersion = 0

    expect(() => parseProject(JSON.stringify(raw))).toThrowError(ProjectFileError)
  })

  it('rejects version 1 projects (migration removed)', () => {
    const raw = JSON.parse(serialize()) as {
      formatVersion: number
      song: Record<string, unknown>
    }
    raw.formatVersion = 1
    delete raw.song.clipEdgeMicroFades

    expect(() => parseProject(JSON.stringify(raw))).toThrowError(ProjectFileError)
  })

  it('rejects clip-edge micro-fade settings outside the project range', () => {
    const raw = JSON.parse(serialize()) as {
      song: { clipEdgeMicroFades: { fadeInMs: number } }
    }
    raw.song.clipEdgeMicroFades.fadeInMs = 20.1

    expect(() => parseProject(JSON.stringify(raw))).toThrow(
      'project.song.clipEdgeMicroFades.fadeInMs must be a finite number from 0 to 20'
    )
  })

  it('fingerprints every project-owned state family but ignores file metadata', () => {
    const project = makeProject()
    const baseline = projectFingerprint(project)

    expect(projectFingerprint({ ...project, song: { ...project.song, bpm: 127 } })).not.toBe(baseline)
    expect(projectFingerprint({
      ...project,
      song: {
        ...project.song,
        clipEdgeMicroFades: { enabled: false, fadeInMs: 1, fadeOutMs: 3.5 }
      }
    })).not.toBe(baseline)
    expect(projectFingerprint({
      ...project,
      lanes: project.lanes.map((lane, index) => index === 0 ? { ...lane, solo: false } : lane)
    })).not.toBe(baseline)
    // Channels are derived from lanes, not serialized independently.
    // Fingerprint changes only through lane-level mutations that affect derived mixer state.
    expect(projectFingerprint({
      ...project,
      lanes: project.lanes.map((lane, index) => index === 0 ? { ...lane, gain: 0.5 } : lane)
    })).not.toBe(baseline)
    expect(projectFingerprint({
      ...project,
      lanes: project.lanes.slice(1)
    })).not.toBe(baseline)
    expect(projectFingerprint({ ...project, generator: GENERATOR })).not.toBe(baseline)
  })
})
