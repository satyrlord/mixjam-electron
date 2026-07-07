import { describe, expect, it } from 'vitest'
import { anyLaneSoloed } from '../engine/lane-evaluation'
import {
  DEFAULT_LANE_COUNT,
  LANE_HEIGHT_PX,
  LANE_HEAD_WIDTH_PX,
  DEFAULT_CLIP_DURATION_TICKS,
  clamp,
  clipScreenRect,
  createDefaultLanes,
  duplicateClipGroup,
  duplicateClipOnLane,
  laneShouldDim,
  moveClipGroup,
  moveClipOnLane,
  placeClipOnLane,
  removeClipFromLane,
  setLanePan,
  toEngineLanes,
  toggleLaneMute,
  toggleLaneSolo
} from '../lib/playerShell'

describe('clamp', () => {
  it('clamps a value within [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })
})

describe('clipScreenRect', () => {
  it('computes x/width matching the canvas draw math, with a minimum width floor', () => {
    const clip = { id: 'c', samplePath: 's', sampleName: 'n', startTick: 32, durationTicks: 16, durationSeconds: 1 }
    expect(clipScreenRect(clip, 2)).toEqual({ x: 64, width: 32 })
    // Very short clip still floors to the 12px minimum.
    expect(clipScreenRect({ ...clip, durationTicks: 1 }, 1)).toEqual({ x: 32, width: 12 })
  })
})

describe('playerShell lane constants', () => {
  it('has 16 default lanes', () => {
    expect(DEFAULT_LANE_COUNT).toBe(16)
  })

  it('has expected lane dimensions', () => {
    expect(LANE_HEIGHT_PX).toBe(44)
    expect(LANE_HEAD_WIDTH_PX).toBe(168)
  })

  it('defaults clips to 32 ticks', () => {
    expect(DEFAULT_CLIP_DURATION_TICKS).toBe(32)
  })
})

describe('createDefaultLanes', () => {
  it('creates 16 lanes with sequential names, all unmuted and unsoloed', () => {
    const lanes = createDefaultLanes()

    expect(lanes).toHaveLength(16)
    expect(lanes[0]?.name).toBe('Lane 1')
    expect(lanes[15]?.name).toBe('Lane 16')

    for (const lane of lanes) {
      expect(lane.muted).toBe(false)
      expect(lane.solo).toBe(false)
      expect(lane.clips).toEqual([])
    }
  })
})

describe('placeClipOnLane', () => {
  it('places a new clip at tick 0 on an empty lane', () => {
    const lanes = createDefaultLanes()
    const next = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)

    const clip = next[0]?.clips[0]
    expect(clip).toBeDefined()
    expect(clip?.samplePath).toBe('Drums/kick.wav')
    expect(clip?.sampleName).toBe('kick.wav')
    expect(clip?.startTick).toBe(0)
    expect(clip?.durationTicks).toBe(32)
  })

  it('does not affect other lanes', () => {
    const lanes = createDefaultLanes()
    const next = placeClipOnLane(lanes, 5, 'Drums/snare.wav', 'snare.wav', 0)

    expect(next[0]?.clips).toHaveLength(0)
    expect(next[5]?.clips).toHaveLength(1)
  })

  it('allows overlapping clips without trimming (monophonic playback, visual overlap)', () => {
    const lanes = createDefaultLanes()
    let next = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    next = placeClipOnLane(next, 0, 'Drums/snare.wav', 'snare.wav', 16)

    const clips = next[0]?.clips
    expect(clips).toHaveLength(2)
    // Both clips retain their full original lengths — overlap, no trimming.
    expect(clips?.[0]?.sampleName).toBe('kick.wav')
    expect(clips?.[0]?.startTick).toBe(0)
    expect(clips?.[0]?.durationTicks).toBe(32)
    expect(clips?.[1]?.sampleName).toBe('snare.wav')
    expect(clips?.[1]?.startTick).toBe(16)
    expect(clips?.[1]?.durationTicks).toBe(32)
  })

  it('keeps both clips when the second starts after the first one ends', () => {
    const lanes = createDefaultLanes()
    let next = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    // Place a second clip that starts at tick 64 (after the first one ends at 32)
    next = placeClipOnLane(next, 0, 'Drums/snare.wav', 'snare.wav', 64)

    expect(next[0]?.clips).toHaveLength(2)
    expect(next[0]?.clips[1]?.startTick).toBe(64)
    expect(next[0]?.clips[1]?.sampleName).toBe('snare.wav')
  })

  it('preserves sort order after multiple placements', () => {
    const lanes = createDefaultLanes()
    let next = placeClipOnLane(lanes, 0, 'Drums/third.wav', 'third.wav', 128)
    next = placeClipOnLane(next, 0, 'Drums/first.wav', 'first.wav', 0)
    next = placeClipOnLane(next, 0, 'Drums/second.wav', 'second.wav', 64)

    const clips = next[0]?.clips
    expect(clips).toHaveLength(3)
    expect(clips?.map((c) => c.startTick)).toEqual([0, 64, 128])
  })
})

describe('toggleLaneMute', () => {
  it('toggles mute on the selected lane only', () => {
    const lanes = createDefaultLanes()

    const next = toggleLaneMute(lanes, 3)

    expect(next[3]?.muted).toBe(true)
    expect(next[0]?.muted).toBe(false)
    expect(next[15]?.muted).toBe(false)

    const reverted = toggleLaneMute(next, 3)
    expect(reverted[3]?.muted).toBe(false)
  })
})

describe('toggleLaneSolo', () => {
  it('solos the selected lane and unsolos all others', () => {
    const lanes = createDefaultLanes()

    const next = toggleLaneSolo(lanes, 5)

    expect(next[5]?.solo).toBe(true)
    expect(next[0]?.solo).toBe(false)
    expect(next[10]?.solo).toBe(false)

    const reverted = toggleLaneSolo(next, 5)
    expect(reverted[5]?.solo).toBe(false)
  })

  it('transfers solo when a different lane is soloed', () => {
    const lanes = createDefaultLanes()

    let state = toggleLaneSolo(lanes, 2)
    state = toggleLaneSolo(state, 7)

    expect(state[2]?.solo).toBe(false)
    expect(state[7]?.solo).toBe(true)
  })
})

describe('anyLaneSoloed / laneShouldDim', () => {
  it('reports whether any lane is soloed', () => {
    const lanes = createDefaultLanes()

    expect(anyLaneSoloed(lanes)).toBe(false)

    const soloed = toggleLaneSolo(lanes, 0)
    expect(anyLaneSoloed(soloed)).toBe(true)
  })

  it('dims muted lanes and non-soloed lanes when solo is active', () => {
    const lanes = createDefaultLanes()

    let state = toggleLaneMute(lanes, 0)
    state = toggleLaneSolo(state, 3)

    expect(laneShouldDim(state[0]!, true)).toBe(true)
    expect(laneShouldDim(state[3]!, true)).toBe(false)
    expect(laneShouldDim(state[5]!, true)).toBe(true)
  })
})

describe('moveClipOnLane', () => {
  it('moves a clip from one lane to another at a new tick', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const clipId = state[0]!.clips[0]!.id

    state = moveClipOnLane(state, clipId, 3, 64)

    expect(state[0]!.clips).toHaveLength(0)
    expect(state[3]!.clips).toHaveLength(1)
    expect(state[3]!.clips[0]!.startTick).toBe(64)
    expect(state[3]!.clips[0]!.sampleName).toBe('kick.wav')
  })

  it('is a no-op for an unknown clip id', () => {
    const lanes = createDefaultLanes()
    const state = moveClipOnLane(lanes, 'nonexistent', 0, 0)
    expect(state).toEqual(lanes)
  })

  it('moves within the same lane to a new position', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const clipId = state[0]!.clips[0]!.id

    state = moveClipOnLane(state, clipId, 0, 96)

    expect(state[0]!.clips).toHaveLength(1)
    expect(state[0]!.clips[0]!.startTick).toBe(96)
  })
})

describe('removeClipFromLane', () => {
  it('removes a clip by id from the specified lane', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const clipId = state[0]!.clips[0]!.id

    state = removeClipFromLane(state, 0, clipId)

    expect(state[0]!.clips).toHaveLength(0)
  })

  it('does not remove clips from other lanes', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    state = placeClipOnLane(state, 3, 'Drums/snare.wav', 'snare.wav', 0)
    const clipId = state[0]!.clips[0]!.id

    state = removeClipFromLane(state, 0, clipId)

    expect(state[0]!.clips).toHaveLength(0)
    expect(state[3]!.clips).toHaveLength(1)
  })

  it('is a no-op for an unknown clip id', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const count = state[0]!.clips.length

    state = removeClipFromLane(state, 0, 'nonexistent')
    expect(state[0]!.clips).toHaveLength(count)
  })
})

describe('setLanePan', () => {
  it('sets the pan value on the specified lane', () => {
    const lanes = createDefaultLanes()
    const state = setLanePan(lanes, 5, 0.5)
    expect(state[5]!.pan).toBe(0.5)
    expect(state[0]!.pan).toBe(0)
  })

  it('clamps pan to the range [-1, 1]', () => {
    const lanes = createDefaultLanes()
    expect(setLanePan(lanes, 0, 2)[0]!.pan).toBe(1)
    expect(setLanePan(lanes, 0, -3)[0]!.pan).toBe(-1)
  })

  it('does not affect other lanes', () => {
    const lanes = createDefaultLanes()
    const state = setLanePan(lanes, 2, -0.75)
    expect(state[2]!.pan).toBe(-0.75)
    expect(state[3]!.pan).toBe(0)
  })
})

describe('toEngineLanes', () => {
  it('maps UI lanes with clips to engine lanes', () => {
    const lanes = createDefaultLanes()
    const withClip = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0, 32, 0.5)
    const engineLanes = toEngineLanes(withClip)

    expect(engineLanes).toHaveLength(16)
    expect(engineLanes[0]!.clips).toHaveLength(1)
    expect(engineLanes[0]!.clips[0]!.samplePath).toBe('Drums/kick.wav')
    expect(engineLanes[0]!.clips[0]!.startTick).toBe(0)
    expect(engineLanes[0]!.clips[0]!.durationTicks).toBe(32)
    expect(engineLanes[0]!.channelIndex).toBe(0)
  })

  it('maps empty lanes to engine lanes with no clips', () => {
    const lanes = createDefaultLanes()
    const engineLanes = toEngineLanes(lanes)

    for (const el of engineLanes) {
      expect(el.clips).toEqual([])
    }
  })
})

describe('duplicateClipOnLane', () => {
  it('duplicates a clip to another lane at a new tick', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0, 32, 0.5)
    const clipId = state[0]!.clips[0]!.id

    state = duplicateClipOnLane(state, clipId, 2, 64)

    expect(state[0]!.clips).toHaveLength(1)
    expect(state[2]!.clips).toHaveLength(1)
    expect(state[2]!.clips[0]!.samplePath).toBe('Drums/kick.wav')
    expect(state[2]!.clips[0]!.startTick).toBe(64)
    expect(state[2]!.clips[0]!.id).not.toBe(clipId)
  })

  it('is a no-op for an unknown clip id', () => {
    const lanes = createDefaultLanes()
    const state = duplicateClipOnLane(lanes, 'nonexistent', 0, 0)
    expect(state).toEqual(lanes)
  })
})

describe('moveClipGroup', () => {
  it('moves multiple clips in a batch', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    state = placeClipOnLane(state, 1, 'Drums/snare.wav', 'snare.wav', 32)
    const clip0 = state[0]!.clips[0]!.id
    const clip1 = state[1]!.clips[0]!.id

    state = moveClipGroup(state, [
      { clipId: clip0, toLaneIndex: 4, newStartTick: 64 },
      { clipId: clip1, toLaneIndex: 5, newStartTick: 128 }
    ])

    expect(state[0]!.clips).toHaveLength(0)
    expect(state[1]!.clips).toHaveLength(0)
    expect(state[4]!.clips).toHaveLength(1)
    expect(state[4]!.clips[0]!.startTick).toBe(64)
    expect(state[5]!.clips).toHaveLength(1)
    expect(state[5]!.clips[0]!.startTick).toBe(128)
  })
})

describe('duplicateClipGroup', () => {
  it('duplicates multiple clips in a batch', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    state = placeClipOnLane(state, 1, 'Drums/snare.wav', 'snare.wav', 32)
    const clip0 = state[0]!.clips[0]!.id
    const clip1 = state[1]!.clips[0]!.id

    state = duplicateClipGroup(state, [
      { clipId: clip0, toLaneIndex: 4, newStartTick: 64 },
      { clipId: clip1, toLaneIndex: 5, newStartTick: 128 }
    ])

    expect(state[0]!.clips).toHaveLength(1)
    expect(state[1]!.clips).toHaveLength(1)
    expect(state[4]!.clips).toHaveLength(1)
    expect(state[4]!.clips[0]!.startTick).toBe(64)
    expect(state[5]!.clips).toHaveLength(1)
    expect(state[5]!.clips[0]!.startTick).toBe(128)
  })

  it('gives every duplicated clip a unique id even when two source clips share samplePath and land on the same lane/tick', () => {
    // Regression test: two clips of the same sample, clamped to the same
    // target lane+tick (e.g. a group drag near the grid edge), used to be
    // able to collide on id because ids were derived only from
    // samplePath+startTick+Date.now(). A collision meant deleting one
    // duplicated clip silently deleted both.
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    state = placeClipOnLane(state, 1, 'Drums/kick.wav', 'kick.wav', 0)
    const clip0 = state[0]!.clips[0]!.id
    const clip1 = state[1]!.clips[0]!.id

    state = duplicateClipGroup(state, [
      { clipId: clip0, toLaneIndex: 4, newStartTick: 0 },
      { clipId: clip1, toLaneIndex: 4, newStartTick: 0 }
    ])

    expect(state[4]!.clips).toHaveLength(2)
    const [dupA, dupB] = state[4]!.clips
    expect(dupA!.id).not.toBe(dupB!.id)

    // Deleting one duplicate must not remove the other.
    state = removeClipFromLane(state, 4, dupA!.id)
    expect(state[4]!.clips).toHaveLength(1)
    expect(state[4]!.clips[0]!.id).toBe(dupB!.id)
  })

  it('is a no-op per-entry for unknown clip ids without dropping the rest of the group', () => {
    const lanes = createDefaultLanes()
    let state = placeClipOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const clip0 = state[0]!.clips[0]!.id

    state = duplicateClipGroup(state, [
      { clipId: clip0, toLaneIndex: 4, newStartTick: 64 },
      { clipId: 'nonexistent', toLaneIndex: 5, newStartTick: 128 }
    ])

    expect(state[4]!.clips).toHaveLength(1)
    expect(state[5]!.clips).toHaveLength(0)
  })
})
