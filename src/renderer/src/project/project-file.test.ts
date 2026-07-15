import { describe, expect, it } from 'vitest'
import { createDefaultLanes, TRACKER_TOTAL_TICKS } from '../lib/arrangement'
import { createDefaultChannels } from '../hooks/useMixer'
import {
  NEWER_PROJECT_VERSION_MESSAGE,
  ProjectFileError,
  isProjectRelativePath,
  parseProject,
  projectFingerprint,
  serializeProject,
  type ProjectData
} from './project-file'

const CREATED_AT = '2026-07-13T10:00:00.000Z'
const MODIFIED_AT = '2026-07-13T11:00:00.000Z'

function makeProject(): ProjectData {
  const lanes = createDefaultLanes()
  lanes[0] = {
    ...lanes[0]!,
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
  }
  const channels = createDefaultChannels()
  channels[0] = {
    ...channels[0]!,
    gain: 0.63,
    pan: 0.4,
    solo: true,
    effects: [{
      id: 'fx-delay-1',
      type: 'delay',
      bypassed: false,
      timeMs: 420,
      feedback: 0.45,
      mix: 0.3,
      pingPong: true,
      tempoSync: false,
      noteDivision: '1/8'
    }]
  }
  return {
    song: { bpm: 126, masterGain: 0.72 },
    lanes,
    channels
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
  it('round-trips arrangement, Song, Mixer, routing, and FX state', () => {
    const parsed = parseProject(serialize())

    expect(parsed.song).toEqual({ bpm: 126, masterGain: 0.72 })
    expect(parsed.lanes[0]).toMatchObject({
      index: 0,
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
    expect(parsed.channels[0]).toMatchObject({
      channelIndex: 0,
      gain: 0.63,
      pan: 0.4,
      solo: true,
      effects: [{ id: 'fx-delay-1', type: 'delay', pingPong: true }]
    })
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

  it('migrates the pre-v1 draft shape in memory and is idempotent afterward', () => {
    const raw = JSON.parse(serialize()) as Record<string, unknown> & {
      song?: { bpm: number; masterGain: number }
      bpm?: number
      lanes: Array<Record<string, unknown> & { placements: Array<Record<string, unknown>> }>
      channels: Array<Record<string, unknown>>
    }
    raw.formatVersion = 0
    raw.bpm = raw.song!.bpm
    delete raw.song
    for (const lane of raw.lanes) {
      delete lane.pan
      delete lane.channelId
      for (const placement of lane.placements) {
        delete placement.id
        delete placement.sampleName
        delete placement.durationSeconds
        delete placement.slot
      }
    }
    for (const channel of raw.channels) {
      delete channel.index
      delete channel.name
    }

    const migrated = parseProject(JSON.stringify(raw))
    const reparsed = parseProject(serializeProject(migrated, {
      appVersion: migrated.appVersion,
      createdAt: migrated.createdAt,
      modifiedAt: migrated.modifiedAt
    }))

    expect(migrated.formatVersion).toBe(1)
    expect(migrated.song).toEqual({ bpm: 126, masterGain: 0.8 })
    expect(migrated.lanes[0]!.placements[0]).toMatchObject({
      id: 'placement-0-0',
      sampleName: 'kick.wav',
      durationSeconds: null
    })
    expect(reparsed).toEqual(migrated)
  })

  it('fingerprints every project-owned state family but ignores file metadata', () => {
    const project = makeProject()
    const baseline = projectFingerprint(project)

    expect(projectFingerprint({ ...project, song: { ...project.song, bpm: 127 } })).not.toBe(baseline)
    expect(projectFingerprint({
      ...project,
      lanes: project.lanes.map((lane, index) => index === 0 ? { ...lane, solo: true } : lane)
    })).not.toBe(baseline)
    expect(projectFingerprint({
      ...project,
      channels: project.channels.map((channel, index) => index === 0
        ? { ...channel, gain: 0.5 }
        : channel)
    })).not.toBe(baseline)
    expect(projectFingerprint({
      ...project,
      channels: project.channels.map((channel, index) => index === 0
        ? {
            ...channel,
            effects: channel.effects.map((effect) => effect.type === 'delay'
              ? { ...effect, feedback: 0.2 }
              : effect)
          }
        : channel)
    })).not.toBe(baseline)
    expect(projectFingerprint({
      ...project,
      channels: project.channels.slice(1)
    })).not.toBe(baseline)
  })
})
