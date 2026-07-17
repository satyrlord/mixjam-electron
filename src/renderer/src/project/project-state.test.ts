import { describe, expect, it } from 'vitest'
import {
  cloneProjectSongState,
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
})
