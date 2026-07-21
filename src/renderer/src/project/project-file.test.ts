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
import {
  createDefaultFxBuses,
  createDefaultLanes,
  createDefaultMasterBusState,
  type ProjectFxBuses
} from './project-state'

const CREATED_AT = '2026-07-13T10:00:00.000Z'
const MODIFIED_AT = '2026-07-13T11:00:00.000Z'

type RawMasterBusProject = Record<string, unknown> & {
  masterBus: Record<string, unknown> & {
    order: unknown
    power: Record<string, unknown>
    params: Record<string, unknown>
    preset: unknown
  }
}
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
    fxBuses: createDefaultFxBuses(),
    masterBus: createDefaultMasterBusState()
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

    expect(parsed.formatVersion).toBe(6)
    expect(parsed.generator).toEqual(GENERATOR)

    const serialized = JSON.parse(serializeProject(parsed, {
      appVersion: parsed.appVersion,
      createdAt: parsed.createdAt,
      modifiedAt: parsed.modifiedAt
    })) as { generator: ProjectGeneratorMetadata }
    expect(serialized.generator).toEqual(GENERATOR)
  })

  it('round-trips a manually edited master bus strip record', () => {
    const project = makeProject()
    project.masterBus = {
      order: ['lim', 'clip', 'tube', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc'],
      power: { ...project.masterBus.power, max: false, mbc: false },
      params: { ...project.masterBus.params, 'gain.trim': -3.5, 'lim.ceil': -0.8 },
      preset: null
    }

    const parsed = parseProject(serialize(project))

    expect(parsed.masterBus).toEqual(project.masterBus)
  })

  it('rejects version 4 projects (below the v5 migration floor)', () => {
    const raw = JSON.parse(serialize()) as Record<string, unknown>
    raw.formatVersion = 4
    delete raw.masterBus

    expect(() => parseProject(JSON.stringify(raw))).toThrow(
      'This MixJam project uses an unsupported format version. Only format version 6 is supported.'
    )
  })

  it.each([
    ['a missing masterBus record', (raw: RawMasterBusProject) => { delete (raw as Record<string, unknown>).masterBus }, 'project.masterBus must be an object'],
    ['an unknown masterBus key', (raw: RawMasterBusProject) => { raw.masterBus.extra = true }, 'project.masterBus.extra is not supported'],
    ['a short slot order', (raw: RawMasterBusProject) => { raw.masterBus.order = ['clip'] }, 'project.masterBus.order must be a permutation of the ten reorderable master bus processor ids'],
    ['a duplicated slot order entry', (raw: RawMasterBusProject) => {
      raw.masterBus.order = ['clip', 'clip', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim']
    }, 'project.masterBus.order must be a permutation of the ten reorderable master bus processor ids'],
    ['an unknown processor id in the slot order', (raw: RawMasterBusProject) => {
      raw.masterBus.order = ['dither', 'tube', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim']
    }, 'project.masterBus.order must be a permutation of the ten reorderable master bus processor ids'],
    ['Gain Stage in the persisted order', (raw: RawMasterBusProject) => {
      raw.masterBus.order = ['gain', 'tube', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim']
    }, 'project.masterBus.order must be a permutation of the ten reorderable master bus processor ids'],
    ['a missing power flag', (raw: RawMasterBusProject) => { delete raw.masterBus.power.comp }, 'project.masterBus.power.comp must be a boolean'],
    ['an unknown power key', (raw: RawMasterBusProject) => { raw.masterBus.power.dither = true }, 'project.masterBus.power.dither is not supported'],
    ['a persisted Gain Stage power flag', (raw: RawMasterBusProject) => { raw.masterBus.power.gain = true }, 'project.masterBus.power.gain is not supported'],
    ['a non-boolean power flag', (raw: RawMasterBusProject) => { raw.masterBus.power.comp = 1 }, 'project.masterBus.power.comp must be a boolean'],
    ['a missing parameter', (raw: RawMasterBusProject) => { delete raw.masterBus.params['gain.trim'] }, 'project.masterBus.params.gain.trim must be a finite number from -24 to 24'],
    ['an unknown parameter id', (raw: RawMasterBusProject) => { raw.masterBus.params['gain.bogus'] = 0 }, 'project.masterBus.params.gain.bogus is not supported'],
    ['a non-finite parameter value', (raw: RawMasterBusProject) => { raw.masterBus.params['gain.trim'] = null }, 'project.masterBus.params.gain.trim must be a finite number from -24 to 24'],
    ['a parameter above its documented range', (raw: RawMasterBusProject) => { raw.masterBus.params['lim.gain'] = 12.5 }, 'project.masterBus.params.lim.gain must be a finite number from 0 to 12'],
    ['a parameter below its documented range', (raw: RawMasterBusProject) => { raw.masterBus.params['clip.ceil'] = -6.5 }, 'project.masterBus.params.clip.ceil must be a finite number from -6 to 0'],
    ['an unknown preset name', (raw: RawMasterBusProject) => { raw.masterBus.preset = 'Extreme' }, 'project.masterBus.preset must be null or one of Cheat Sheet, Gentle, Loud, Bypass All'],
    ['a non-string preset', (raw: RawMasterBusProject) => { raw.masterBus.preset = 5 }, 'project.masterBus.preset must be null or one of Cheat Sheet, Gentle, Loud, Bypass All']
  ])('rejects %s', (_description, mutate, expectedMessage) => {
    const raw = JSON.parse(serialize()) as RawMasterBusProject
    mutate(raw)

    expect(() => parseProject(JSON.stringify(raw))).toThrowError(ProjectFileError)
    expect(() => parseProject(JSON.stringify(raw))).toThrow(expectedMessage)
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
    expect(projectFingerprint({
      ...project,
      masterBus: { ...project.masterBus, preset: null }
    })).not.toBe(baseline)
  })
})

describe('v5 -> v6 Echoform delay migration', () => {
  /** Build a raw v5 document (serialize current, then downgrade the version). */
  function rawV5(module: Record<string, unknown>): Record<string, unknown> {
    const raw = JSON.parse(serialize()) as Record<string, unknown>
    raw.formatVersion = 5
    const buses = raw.fxBuses as Array<{ module: Record<string, unknown> }>
    buses[0]!.module = module
    return raw
  }

  it('upgrades a legacy native delay module to an Echoform delay', () => {
    const raw = rawV5({
      type: 'delay',
      mode: 'sync',
      timeMs: 500,
      noteDivision: '1/8T',
      feedback: 40,
      tapeDistortion: 5,
      pingPong: true
    })
    const parsed = parseProject(JSON.stringify(raw))
    expect(parsed.formatVersion).toBe(6)
    const module = parsed.fxBuses[0]!.module
    expect(module.type).toBe('echoform-delay')
    if (module.type !== 'echoform-delay') throw new Error('expected echoform-delay')
    // Semantically equivalent values carry over.
    expect(module.mode).toBe('sync')
    expect(module.feedback).toBe(40)
    expect(module.pingPong).toBe(true)
    // One old time seeds both L and R; the triplet division is preserved.
    expect(module.divisionL).toBe('1/8T')
    expect(module.divisionR).toBe('1/8T')
    expect(module.timeMsL).toBe(500)
    expect(module.timeMsR).toBe(500)
    // Fields absent from the old module get Echoform defaults.
    expect(module.width).toBe(142)
    expect(module.character).toBe('tape')
    // No dropped fields leak through.
    expect('mix' in module).toBe(false)
    expect('link' in module).toBe(false)
  })

  it('re-clamps a legacy division that has no Echoform equivalent', () => {
    const raw = rawV5({
      type: 'delay',
      mode: 'free',
      timeMs: 375,
      noteDivision: '1/32', // not in the Echoform set
      feedback: 35,
      tapeDistortion: 0,
      pingPong: false
    })
    const module = parseProject(JSON.stringify(raw)).fxBuses[0]!.module
    if (module.type !== 'echoform-delay') throw new Error('expected echoform-delay')
    expect(module.divisionL).toBe('1/4') // safe fallback
  })

  it('normalizes a pre-release opus-delay sketch (drops link/mix, re-clamps ranges)', () => {
    const raw = rawV5({
      type: 'opus-delay',
      mode: 'sync',
      divisionL: '1/8',
      divisionR: '1/4',
      timeMsL: 350,
      timeMsR: 500,
      link: true,
      feedback: 38,
      pingPong: true,
      width: 62,
      lowCut: 120,
      highCut: 7500,
      modRate: 0.35,
      modDepth: 18, // old sketch stored depth as a 0..100 value; re-clamped to 0..20
      character: 'tape',
      duckAmount: 0,
      duckRelease: 220,
      mix: 100,
      outputDb: 0,
      freeze: false,
      bypass: false
    })
    const module = parseProject(JSON.stringify(raw)).fxBuses[0]!.module
    expect(module.type).toBe('echoform-delay')
    if (module.type !== 'echoform-delay') throw new Error('expected echoform-delay')
    expect('link' in module).toBe(false)
    expect('mix' in module).toBe(false)
    expect(module.feedback).toBe(38)
    expect(module.divisionL).toBe('1/8')
    // Sketch modDepth 18 is already within the 0..20 range, so it is preserved.
    expect(module.modDepth).toBe(18)
    expect(module.modDepth).toBeLessThanOrEqual(20)
  })

  it('re-serializes a migrated project as version 6 and round-trips', () => {
    const raw = rawV5({
      type: 'delay',
      mode: 'free',
      timeMs: 375,
      noteDivision: '1/8',
      feedback: 35,
      tapeDistortion: 0,
      pingPong: false
    })
    const parsed = parseProject(JSON.stringify(raw))
    const reserialized = serialize(parsed)
    const reparsed = parseProject(reserialized)
    expect(reparsed.formatVersion).toBe(6)
    expect(reparsed.fxBuses[0]!.module.type).toBe('echoform-delay')
    // Idempotent: a second parse leaves the migrated module unchanged.
    expect(reparsed.fxBuses[0]!.module).toEqual(parsed.fxBuses[0]!.module)
  })
})
