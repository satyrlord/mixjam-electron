import { describe, expect, it } from 'vitest'
import { DEFAULT_PROCESSOR_ORDER, PROCESSOR_IDS } from '../engine/masterbus/params'
import { createDefaultEchoformDelayReturnModule } from '../engine/return-effects'
import {
  applyMasterBusPreset,
  cloneMasterBusState,
  cloneProjectState,
  cloneProjectSongState,
  createDefaultMasterBusState,
  createDefaultProjectEditState,
  createDefaultProjectState,
  createDefaultProjectSongState,
  projectEditStateFromProject,
  reorderMasterBus,
  setMasterBusParam,
  toggleMasterBusPower,
  toPlaybackProjectGraphSnapshot
} from './project-state'

describe('project state', () => {
  it('creates the canonical Song defaults and merges nested overrides', () => {
    expect(createDefaultProjectSongState()).toEqual({
      bpm: 120,
      masterGain: 1,
      clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 }
    })
    expect(createDefaultProjectSongState({
      bpm: 140,
      clipEdgeMicroFades: { enabled: false, fadeInMs: 1, fadeOutMs: 6 }
    })).toEqual({
      bpm: 140,
      masterGain: 1,
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
    source.fxBuses[0]!.module = createDefaultEchoformDelayReturnModule('fx-1')
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

  it('starts new projects on the Cheat Sheet master bus preset', () => {
    const project = createDefaultProjectState()
    const editState = createDefaultProjectEditState()

    expect(project.masterBus.preset).toBe('Cheat Sheet')
    expect(project.masterBus.order).toEqual([...DEFAULT_PROCESSOR_ORDER])
    expect(project.masterBus.order).toHaveLength(10)
    expect(PROCESSOR_IDS.every((id) => project.masterBus.power[id])).toBe(true)
    expect('gain' in project.masterBus.power).toBe(false)
    expect(editState.masterBus).toEqual(project.masterBus)
    expect(project.masterBus).toEqual(createDefaultMasterBusState())
  })

  it('deep-clones the master bus record at every replacement boundary', () => {
    const project = createDefaultProjectState()
    const clone = cloneProjectState(project)
    const editState = projectEditStateFromProject(project)
    const busClone = cloneMasterBusState(project.masterBus)

    for (const copy of [clone.masterBus, editState.masterBus, busClone]) {
      expect(copy).toEqual(project.masterBus)
      expect(copy).not.toBe(project.masterBus)
      expect(copy.order).not.toBe(project.masterBus.order)
      expect(copy.power).not.toBe(project.masterBus.power)
      expect(copy.params).not.toBe(project.masterBus.params)
    }

    const supplied = createDefaultProjectState({ masterBus: project.masterBus })
    expect(supplied.masterBus).toEqual(project.masterBus)
    expect(supplied.masterBus).not.toBe(project.masterBus)
  })

  it('clamps master bus parameter edits and clears the preset selection', () => {
    const masterBus = createDefaultMasterBusState()

    const edited = setMasterBusParam(masterBus, 'gain.trim', 99)
    expect(edited).not.toBe(masterBus)
    expect(edited.params['gain.trim']).toBe(24)
    expect(edited.preset).toBeNull()

    // Switch parameters snap to their discrete positions.
    expect(setMasterBusParam(masterBus, 'tape.ips', 0.4).params['tape.ips']).toBe(0)

    // The source state stays untouched.
    expect(masterBus.params['gain.trim']).toBe(0)
    expect(masterBus.preset).toBe('Cheat Sheet')
  })

  it('toggles processor power and clears the preset selection', () => {
    const masterBus = createDefaultMasterBusState()

    const toggled = toggleMasterBusPower(masterBus, 'comp')
    expect(toggled.power.comp).toBe(false)
    expect(toggled.preset).toBeNull()
    expect(toggleMasterBusPower(toggled, 'comp').power.comp).toBe(true)
    expect(masterBus.power.comp).toBe(true)
  })

  it('reorders the strip only for a valid permutation of the processor ids', () => {
    const masterBus = createDefaultMasterBusState()
    const reversed = [...DEFAULT_PROCESSOR_ORDER].reverse()

    const reordered = reorderMasterBus(masterBus, reversed)
    expect(reordered.order).toEqual(reversed)
    expect(reordered.order).not.toBe(reversed)
    expect(reordered.preset).toBeNull()

    expect(reorderMasterBus(masterBus, ['clip'])).toBe(masterBus)
    expect(reorderMasterBus(
      masterBus,
      [...masterBus.order.slice(1), 'gain'] as unknown as typeof masterBus.order
    )).toBe(masterBus)
  })

  it('recalls presets from the current order; only Cheat Sheet restores the default order', () => {
    const reversed = [...DEFAULT_PROCESSOR_ORDER].reverse()
    const reordered = reorderMasterBus(createDefaultMasterBusState(), reversed)

    const gentle = applyMasterBusPreset(reordered, 'Gentle')
    expect(gentle.preset).toBe('Gentle')
    expect(gentle.order).toEqual(reversed)
    expect(gentle.power.max).toBe(false)
    expect(gentle.power.mbc).toBe(false)
    expect(gentle.params['clip.amount']).toBe(0.8)

    const cheatSheet = applyMasterBusPreset(reordered, 'Cheat Sheet')
    expect(cheatSheet).toEqual(createDefaultMasterBusState())
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
    expect(graph.masterBus).toEqual(project.masterBus)
    expect(graph.masterBus).not.toBe(project.masterBus)

    // Telemetry-only callers reconcile lanes and Returns without a strip record.
    const partial = toPlaybackProjectGraphSnapshot({
      lanes: project.lanes,
      fxBuses: project.fxBuses
    })
    expect(partial.masterBus).toBeUndefined()
  })
})
