import { describe, expect, it } from 'vitest'
import { anyLaneSoloed } from '../engine/lane-evaluation'
import {
  DEFAULT_LANE_COUNT,
  TRACKER_BAR_COUNT,
  TRACKER_BEAT_WIDTH_PX,
  TRACKER_TIMELINE_MIN_WIDTH_PX,
  TRACKER_TOTAL_TICKS,
  LANE_HEIGHT_PX,
  LANE_HEAD_WIDTH_PX,
  DEFAULT_PLACEMENT_DURATION_TICKS,
  sampleBubbleScreenRect,
  timelinePixelsPerSecond,
  createDefaultLanes,
  duplicatePlacementGroup,
  duplicatePlacement,
  laneShouldDim,
  movePlacementGroup,
  movePlacement,
  placeSampleOnLane,
  removePlacementFromLane,
  resolvePendingPlacementBpms,
  setLanePan,
  songEndTick,
  toEngineLanes,
  toggleLaneMute,
  toggleLaneSolo
} from '../lib/arrangement'
import { clamp } from './sample-utils'

describe('clamp', () => {
  it('clamps a value within [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })
})

describe('sampleBubbleScreenRect', () => {
  it('derives the shared duration scale from the Tracker time grid', () => {
    expect(timelinePixelsPerSecond(1920, 256, 120)).toBe(120)
  })

  it('uses the placement musical span for BPM-invariant width', () => {
    const placement = { id: 'p', samplePath: 's', sampleName: 'n', startTick: 32, durationTicks: 16, durationSeconds: 1 }
    expect(sampleBubbleScreenRect(placement, 2)).toEqual({ x: 64, width: 32 })
    expect(sampleBubbleScreenRect({ ...placement, durationTicks: 1 }, 1)).toEqual({ x: 32, width: 12 })
  })

  it('does not change placement width when source duration metadata changes', () => {
    const placement = { id: 'p', samplePath: 's', sampleName: 'n', startTick: 0, durationTicks: 1, durationSeconds: 0.1 }
    expect(sampleBubbleScreenRect(placement, 1).width).toBe(12)
    expect(sampleBubbleScreenRect({ ...placement, durationSeconds: null }, 1).width).toBe(12)
  })
})

describe('arrangement lane constants', () => {
  it('has 16 default lanes', () => {
    expect(DEFAULT_LANE_COUNT).toBe(16)
  })

  it('has expected lane dimensions', () => {
    expect(LANE_HEIGHT_PX).toBe(52)
    expect(LANE_HEAD_WIDTH_PX).toBe(220)
  })

  it('defaults placements to 32 ticks', () => {
    expect(DEFAULT_PLACEMENT_DURATION_TICKS).toBe(32)
  })

  it('defines the 999-bar arrangement capacity and minimum timeline density', () => {
    expect(TRACKER_BAR_COUNT).toBe(999)
    expect(TRACKER_TOTAL_TICKS).toBe(31968)
    expect(TRACKER_BEAT_WIDTH_PX).toBe(42)
    expect(TRACKER_TIMELINE_MIN_WIDTH_PX).toBe(168052)
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
      expect(lane.placements).toEqual([])
    }
  })
})

describe('placeSampleOnLane', () => {
  it('places a sample at tick 0 on an empty lane', () => {
    const lanes = createDefaultLanes()
    const next = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)

    const placement = next[0]?.placements[0]
    expect(placement).toBeDefined()
    expect(placement?.samplePath).toBe('Drums/kick.wav')
    expect(placement?.sampleName).toBe('kick.wav')
    expect(placement?.startTick).toBe(0)
    expect(placement?.durationTicks).toBe(32)
  })

  it('does not affect other lanes', () => {
    const lanes = createDefaultLanes()
    const next = placeSampleOnLane(lanes, 5, 'Drums/snare.wav', 'snare.wav', 0)

    expect(next[0]?.placements).toHaveLength(0)
    expect(next[5]?.placements).toHaveLength(1)
  })

  it('allows overlapping placements without trimming (monophonic playback, visual overlap)', () => {
    const lanes = createDefaultLanes()
    let next = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    next = placeSampleOnLane(next, 0, 'Drums/snare.wav', 'snare.wav', 16)

    const placements = next[0]?.placements
    expect(placements).toHaveLength(2)
    // Both placements retain their full original lengths — overlap, no trimming.
    expect(placements?.[0]?.sampleName).toBe('kick.wav')
    expect(placements?.[0]?.startTick).toBe(0)
    expect(placements?.[0]?.durationTicks).toBe(32)
    expect(placements?.[1]?.sampleName).toBe('snare.wav')
    expect(placements?.[1]?.startTick).toBe(16)
    expect(placements?.[1]?.durationTicks).toBe(32)
  })

  it('keeps each placement native BPM independent on a shared lane', () => {
    const lanes = createDefaultLanes()
    let next = placeSampleOnLane(lanes, 0, 'Loops/slow.wav', 'slow.wav', 0, 32, 1, 0, 90)
    next = placeSampleOnLane(next, 0, 'Loops/fast.wav', 'fast.wav', 32, 32, 1, 0, 140)

    expect(next[0]!.placements.map((placement) => placement.nativeBPM)).toEqual([90, 140])
  })

  it('resolves only native BPM values that were pending when placed', () => {
    const lanes = createDefaultLanes()
    let next = placeSampleOnLane(lanes, 0, 'Loops/pending.wav', 'pending.wav', 0, 32, 40, 0, null)
    next = placeSampleOnLane(next, 0, 'Loops/pinned.wav', 'pinned.wav', 32, 32, 4, 0, 120)

    const resolved = resolvePendingPlacementBpms(next, new Map([
      ['Loops/pending.wav', 95.8],
      ['Loops/pinned.wav', 128]
    ]))

    expect(resolved[0]!.placements.map((placement) => placement.nativeBPM)).toEqual([95.8, 120])
    expect(resolved[0]!.placements.map((placement) => placement.nativeBPMPending)).toEqual([false, false])
  })

  it('keeps both placements when the second starts after the first one ends', () => {
    const lanes = createDefaultLanes()
    let next = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    // Place a second sample at tick 64 (after the first placement ends at 32)
    next = placeSampleOnLane(next, 0, 'Drums/snare.wav', 'snare.wav', 64)

    expect(next[0]?.placements).toHaveLength(2)
    expect(next[0]?.placements[1]?.startTick).toBe(64)
    expect(next[0]?.placements[1]?.sampleName).toBe('snare.wav')
  })

  it('preserves sort order after multiple placements', () => {
    const lanes = createDefaultLanes()
    let next = placeSampleOnLane(lanes, 0, 'Drums/third.wav', 'third.wav', 128)
    next = placeSampleOnLane(next, 0, 'Drums/first.wav', 'first.wav', 0)
    next = placeSampleOnLane(next, 0, 'Drums/second.wav', 'second.wav', 64)

    const placements = next[0]?.placements
    expect(placements).toHaveLength(3)
    expect(placements?.map((c) => c.startTick)).toEqual([0, 64, 128])
  })

  it('clamps a complete placement to the capacity boundary', () => {
    const lanes = createDefaultLanes()
    const next = placeSampleOnLane(lanes, 0, 'tail.wav', 'tail.wav', TRACKER_TOTAL_TICKS - 1, 32)

    expect(next[0]!.placements[0]!.startTick).toBe(TRACKER_TOTAL_TICKS - 32)
    expect(next[0]!.placements[0]!.startTick + next[0]!.placements[0]!.durationTicks)
      .toBe(TRACKER_TOTAL_TICKS)
  })

  it('silently rejects a sample longer than the whole arrangement', () => {
    const lanes = createDefaultLanes()
    const next = placeSampleOnLane(lanes, 0, 'too-long.wav', 'too-long.wav', 0, TRACKER_TOTAL_TICKS + 1)

    expect(next).toBe(lanes)
    expect(next[0]!.placements).toEqual([])
  })
})

describe('songEndTick', () => {
  it('uses the latest exact placement end across silent gaps and all lanes', () => {
    let lanes = createDefaultLanes()
    lanes = placeSampleOnLane(lanes, 0, 'first.wav', 'first.wav', 0, 10)
    lanes = placeSampleOnLane(lanes, 5, 'last.wav', 'last.wav', 20, 7)
    lanes[5] = { ...lanes[5]!, muted: true }

    expect(songEndTick(lanes)).toBe(27)
  })

  it('returns zero for an empty arrangement', () => {
    expect(songEndTick(createDefaultLanes())).toBe(0)
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

describe('movePlacement', () => {
  it('moves a placement from one lane to another at a new tick', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const placementId = state[0]!.placements[0]!.id

    state = movePlacement(state, placementId, 3, 64)

    expect(state[0]!.placements).toHaveLength(0)
    expect(state[3]!.placements).toHaveLength(1)
    expect(state[3]!.placements[0]!.startTick).toBe(64)
    expect(state[3]!.placements[0]!.sampleName).toBe('kick.wav')
  })

  it('is a no-op for an unknown placement id', () => {
    const lanes = createDefaultLanes()
    const state = movePlacement(lanes, 'nonexistent', 0, 0)
    expect(state).toEqual(lanes)
  })

  it('moves within the same lane to a new position', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const placementId = state[0]!.placements[0]!.id

    state = movePlacement(state, placementId, 0, 96)

    expect(state[0]!.placements).toHaveLength(1)
    expect(state[0]!.placements[0]!.startTick).toBe(96)
  })
})

describe('removePlacementFromLane', () => {
  it('removes a placement by id from the specified lane', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const placementId = state[0]!.placements[0]!.id

    state = removePlacementFromLane(state, 0, placementId)

    expect(state[0]!.placements).toHaveLength(0)
  })

  it('does not remove placements from other lanes', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    state = placeSampleOnLane(state, 3, 'Drums/snare.wav', 'snare.wav', 0)
    const placementId = state[0]!.placements[0]!.id

    state = removePlacementFromLane(state, 0, placementId)

    expect(state[0]!.placements).toHaveLength(0)
    expect(state[3]!.placements).toHaveLength(1)
  })

  it('is a no-op for an unknown placement id', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const count = state[0]!.placements.length

    state = removePlacementFromLane(state, 0, 'nonexistent')
    expect(state[0]!.placements).toHaveLength(count)
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
  it('maps UI lanes with placements to engine lanes', () => {
    const lanes = createDefaultLanes()
    const withPlacement = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0, 32, 0.5, 0, 124)
    const engineLanes = toEngineLanes(withPlacement)

    expect(engineLanes).toHaveLength(16)
    expect(engineLanes[0]!.placements).toHaveLength(1)
    expect(engineLanes[0]!.placements[0]!.samplePath).toBe('Drums/kick.wav')
    expect(engineLanes[0]!.placements[0]!.startTick).toBe(0)
    expect(engineLanes[0]!.placements[0]!.durationTicks).toBe(32)
    expect(engineLanes[0]!.placements[0]!.nativeBPM).toBe(124)
    expect(engineLanes[0]!.channelIndex).toBe(0)
  })

  it('maps empty lanes to engine lanes with no placements', () => {
    const lanes = createDefaultLanes()
    const engineLanes = toEngineLanes(lanes)

    for (const el of engineLanes) {
      expect(el.placements).toEqual([])
    }
  })
})

describe('duplicatePlacement', () => {
  it('duplicates a placement to another lane at a new tick', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0, 32, 0.5)
    const placementId = state[0]!.placements[0]!.id

    state = duplicatePlacement(state, placementId, 2, 64)

    expect(state[0]!.placements).toHaveLength(1)
    expect(state[2]!.placements).toHaveLength(1)
    expect(state[2]!.placements[0]!.samplePath).toBe('Drums/kick.wav')
    expect(state[2]!.placements[0]!.startTick).toBe(64)
    expect(state[2]!.placements[0]!.id).not.toBe(placementId)
  })

  it('is a no-op for an unknown placement id', () => {
    const lanes = createDefaultLanes()
    const state = duplicatePlacement(lanes, 'nonexistent', 0, 0)
    expect(state).toEqual(lanes)
  })
})

describe('movePlacementGroup', () => {
  it('moves multiple placements in a batch', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    state = placeSampleOnLane(state, 1, 'Drums/snare.wav', 'snare.wav', 32)
    const placement0 = state[0]!.placements[0]!.id
    const placement1 = state[1]!.placements[0]!.id

    state = movePlacementGroup(state, [
      { placementId: placement0, toLaneIndex: 4, newStartTick: 64 },
      { placementId: placement1, toLaneIndex: 5, newStartTick: 128 }
    ])

    expect(state[0]!.placements).toHaveLength(0)
    expect(state[1]!.placements).toHaveLength(0)
    expect(state[4]!.placements).toHaveLength(1)
    expect(state[4]!.placements[0]!.startTick).toBe(64)
    expect(state[5]!.placements).toHaveLength(1)
    expect(state[5]!.placements[0]!.startTick).toBe(128)
  })

  it('clamps the group as one unit while preserving tick offsets', () => {
    let state = placeSampleOnLane(createDefaultLanes(), 0, 'first.wav', 'first.wav', 0, 32)
    state = placeSampleOnLane(state, 1, 'second.wav', 'second.wav', 64, 32)
    const firstId = state[0]!.placements[0]!.id
    const secondId = state[1]!.placements[0]!.id

    state = movePlacementGroup(state, [
      { placementId: firstId, toLaneIndex: 2, newStartTick: TRACKER_TOTAL_TICKS - 16 },
      { placementId: secondId, toLaneIndex: 3, newStartTick: TRACKER_TOTAL_TICKS + 48 }
    ])

    expect(state[2]!.placements[0]!.startTick).toBe(TRACKER_TOTAL_TICKS - 96)
    expect(state[3]!.placements[0]!.startTick).toBe(TRACKER_TOTAL_TICKS - 32)
  })
})

describe('duplicatePlacementGroup', () => {
  it('duplicates multiple placements in a batch', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    state = placeSampleOnLane(state, 1, 'Drums/snare.wav', 'snare.wav', 32)
    const placement0 = state[0]!.placements[0]!.id
    const placement1 = state[1]!.placements[0]!.id

    state = duplicatePlacementGroup(state, [
      { placementId: placement0, toLaneIndex: 4, newStartTick: 64 },
      { placementId: placement1, toLaneIndex: 5, newStartTick: 128 }
    ])

    expect(state[0]!.placements).toHaveLength(1)
    expect(state[1]!.placements).toHaveLength(1)
    expect(state[4]!.placements).toHaveLength(1)
    expect(state[4]!.placements[0]!.startTick).toBe(64)
    expect(state[5]!.placements).toHaveLength(1)
    expect(state[5]!.placements[0]!.startTick).toBe(128)
  })

  it('gives every duplicated placement a unique id when sources share samplePath and destination', () => {
    // Regression test: two placements of the same sample, clamped to the same
    // target lane+tick (e.g. a group drag near the grid edge), used to be
    // able to collide on id because ids were derived only from
    // samplePath+startTick+Date.now(). A collision meant deleting one
    // duplicated placement silently deleted both.
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    state = placeSampleOnLane(state, 1, 'Drums/kick.wav', 'kick.wav', 0)
    const placement0 = state[0]!.placements[0]!.id
    const placement1 = state[1]!.placements[0]!.id

    state = duplicatePlacementGroup(state, [
      { placementId: placement0, toLaneIndex: 4, newStartTick: 0 },
      { placementId: placement1, toLaneIndex: 4, newStartTick: 0 }
    ])

    expect(state[4]!.placements).toHaveLength(2)
    const [dupA, dupB] = state[4]!.placements
    expect(dupA!.id).not.toBe(dupB!.id)

    // Deleting one duplicate must not remove the other.
    state = removePlacementFromLane(state, 4, dupA!.id)
    expect(state[4]!.placements).toHaveLength(1)
    expect(state[4]!.placements[0]!.id).toBe(dupB!.id)
  })

  it('is a no-op per-entry for unknown placement ids without dropping the rest of the group', () => {
    const lanes = createDefaultLanes()
    let state = placeSampleOnLane(lanes, 0, 'Drums/kick.wav', 'kick.wav', 0)
    const placement0 = state[0]!.placements[0]!.id

    state = duplicatePlacementGroup(state, [
      { placementId: placement0, toLaneIndex: 4, newStartTick: 64 },
      { placementId: 'nonexistent', toLaneIndex: 5, newStartTick: 128 }
    ])

    expect(state[4]!.placements).toHaveLength(1)
    expect(state[5]!.placements).toHaveLength(0)
  })
})
