import { describe, expect, it } from 'vitest'
import { anyLaneSoloed } from '../engine/lane-evaluation'
import {
  DEFAULT_LANE_COUNT,
  LANE_HEIGHT_PX,
  LANE_HEAD_WIDTH_PX,
  DEFAULT_CLIP_DURATION_TICKS,
  createDefaultLanes,
  laneShouldDim,
  moveClipOnLane,
  placeClipOnLane,
  removeClipFromLane,
  setLanePan,
  toggleLaneMute,
  toggleLaneSolo
} from '../lib/playerShell'

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

  it('removes clips that start after the new clip end but overlap from the other side', () => {
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
