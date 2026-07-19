import { describe, expect, it } from 'vitest'
import {
  cloneProjectState,
  cloneProjectSongState,
  createDefaultProjectState,
  createDefaultProjectSongState,
  projectEditStateFromProject,
  toPlaybackProjectGraphSnapshot
} from './project-state'

describe('project state', () => {
  it('creates the canonical Song defaults and merges nested overrides', () => {
    expect(createDefaultProjectSongState()).toEqual({
      bpm: 120,
      masterGain: 0.8,
      clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
    })
    expect(createDefaultProjectSongState({
      bpm: 140,
      clipEdgeMicroFades: { enabled: false, fadeInMs: 1, fadeOutMs: 6 }
    })).toEqual({
      bpm: 140,
      masterGain: 0.8,
      clipEdgeMicroFades: { enabled: false, fadeInMs: 1, fadeOutMs: 6 }
    })
  })

  it('returns isolated Song settings for replacement boundaries', () => {
    const first = createDefaultProjectSongState()
    const second = createDefaultProjectSongState()
    const clone = cloneProjectSongState(first)

    expect(second).not.toBe(first)
    expect(second.clipEdgeMicroFades).not.toBe(first.clipEdgeMicroFades)
    expect(clone).toEqual(first)
    expect(clone).not.toBe(first)
    expect(clone.clipEdgeMicroFades).not.toBe(first.clipEdgeMicroFades)
  })

  it('owns complete isolated project defaults', () => {
    const first = createDefaultProjectState()
    const second = createDefaultProjectState()

    expect(first.song.bpm).toBe(120)
    expect(first.lanes).toHaveLength(8)
    expect(first.lanes[0]).toEqual(expect.objectContaining({
      index: 0,
      gain: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      sends: [0, 0, 0, 0]
    }))

    first.lanes[0]!.gain = 0.2
    expect(second.lanes[0]!.gain).toBe(0.8)
  })

  it('clones every nested project replacement boundary', () => {
    const original = createDefaultProjectState()
    const clone = cloneProjectState(original)

    expect(clone).toEqual(original)
    expect(clone.song).not.toBe(original.song)
    expect(clone.song.clipEdgeMicroFades).not.toBe(original.song.clipEdgeMicroFades)
    expect(clone.lanes).not.toBe(original.lanes)
    expect(clone.lanes[0]).not.toBe(original.lanes[0])
    expect(clone.lanes[0]!.placements).not.toBe(original.lanes[0]!.placements)
  })

  it('clones supplied lanes instead of retaining caller-owned values', () => {
    const source = createDefaultProjectState()
    const project = createDefaultProjectState({
      lanes: source.lanes
    })

    expect(project.lanes).toEqual(source.lanes)
    expect(project.lanes).not.toBe(source.lanes)
    expect(project.lanes[0]).not.toBe(source.lanes[0])
  })

  it('deep-clones lane-owned send values', () => {
    const source = createDefaultProjectState()
    source.lanes[0]!.sends = [0.1, 0.2, 0.3, 0.4]
    const clone = cloneProjectState(source)
    expect(clone.lanes[0]!.sends).toEqual([0.1, 0.2, 0.3, 0.4])
    expect(clone.lanes[0]!.sends).not.toBe(source.lanes[0]!.sends)
  })

  it('clones supplied FX buses without creating a second Mixer state model', () => {
    const source = createDefaultProjectState()
    source.fxBuses[0]!.module = {
      id: 'fx-1', type: 'delay', mode: 'sync', timeMs: 500,
      noteDivision: '1/4', feedback: 40, tapeDistortion: 5, pingPong: true
    }
    const created = createDefaultProjectState({
      lanes: source.lanes,
      fxBuses: source.fxBuses
    })
    const cloned = cloneProjectState(created)

    expect(created.lanes[0]!.sends).toEqual([0, 0, 0, 0])
    expect(created.fxBuses[0]).not.toBe(source.fxBuses[0])
    expect(created.fxBuses[0]!.module).not.toBe(source.fxBuses[0]!.module)
    expect(cloned.fxBuses[0]!.module).not.toBe(created.fxBuses[0]!.module)
  })

  it('rejects project state with a non-canonical return bus count', () => {
    expect(() => createDefaultProjectState({ fxBuses: [] })).toThrow('exactly 4 return buses')
  })

  it('creates an isolated complete edit-state replacement', () => {
    const project = createDefaultProjectState()
    project.lanes[0]!.sends = [0.1, 0.2, 0.3, 0.4]
    project.lanes[0]!.placements.push({
      id: 'placement-1', samplePath: 'kick.wav', sampleName: 'Kick',
      startTick: 0, durationTicks: 8, durationSeconds: 0.5
    })
    const editState = projectEditStateFromProject(project)

    expect(editState.lanes[0]!.sends).not.toBe(project.lanes[0]!.sends)
    expect(editState.lanes[0]!.placements[0]).not.toBe(project.lanes[0]!.placements[0])
    expect(editState.fxBuses[0]!.module).not.toBe(project.fxBuses[0]!.module)
  })

  it('adapts one complete graph snapshot with the project-owned pan', () => {
    const project = createDefaultProjectState()
    project.lanes[0] = {
      ...project.lanes[0]!, gain: 0.4, pan: -0.75, muted: true,
      sends: [0.1, 0.2, 0.3, 0.4]
    }
    const graph = toPlaybackProjectGraphSnapshot(project)

    expect(graph.channels[0]).toMatchObject({
      gain: 0.4, pan: -0.75, muted: true, sends: [0.1, 0.2, 0.3, 0.4]
    })
    expect(graph.returns).toHaveLength(4)
    expect(graph.channels[0]!.sends).not.toBe(project.lanes[0]!.sends)
    expect(graph.returns[0]!.module).not.toBe(project.fxBuses[0]!.module)
  })
})
