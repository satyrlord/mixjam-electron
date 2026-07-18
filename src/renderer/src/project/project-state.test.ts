import { describe, expect, it } from 'vitest'
import { createDefaultEffect } from '../engine/effects'
import {
  cloneProjectState,
  cloneProjectSongState,
  createDefaultProjectState,
  createDefaultProjectSongState
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
    expect(first.lanes).toHaveLength(16)
    expect(first.channels).toHaveLength(16)
    expect(first.channels[0]).toEqual({
      channelIndex: 0,
      gain: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      effects: []
    })

    first.channels[0]!.gain = 0.2
    expect(second.channels[0]!.gain).toBe(0.8)
  })

  it('clones every nested project replacement boundary', () => {
    const original = createDefaultProjectState()
    original.channels[0]!.effects = [createDefaultEffect('delay')]
    const clone = cloneProjectState(original)

    expect(clone).toEqual(original)
    expect(clone.song).not.toBe(original.song)
    expect(clone.song.clipEdgeMicroFades).not.toBe(original.song.clipEdgeMicroFades)
    expect(clone.lanes).not.toBe(original.lanes)
    expect(clone.lanes[0]).not.toBe(original.lanes[0])
    expect(clone.channels).not.toBe(original.channels)
    expect(clone.channels[0]).not.toBe(original.channels[0])
    expect(clone.channels[0]!.effects).not.toBe(original.channels[0]!.effects)
    expect(clone.channels[0]!.effects[0]).not.toBe(original.channels[0]!.effects[0])
  })

  it('clones supplied lanes and channels instead of retaining caller-owned values', () => {
    const source = createDefaultProjectState()
    const project = createDefaultProjectState({
      lanes: source.lanes,
      channels: source.channels
    })

    expect(project.lanes).toEqual(source.lanes)
    expect(project.channels).toEqual(source.channels)
    expect(project.lanes).not.toBe(source.lanes)
    expect(project.lanes[0]).not.toBe(source.lanes[0])
    expect(project.channels).not.toBe(source.channels)
    expect(project.channels[0]).not.toBe(source.channels[0])
  })
})
