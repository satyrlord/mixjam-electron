// Project fixtures for tests.
//
// These builders keep the four-Sends invariant in one factory and derive their
// shape from the project model. Ids are deterministic (`lane-1`, `lane-2`, ...)
// so a test can address a lane without capturing what the factory returned.
import type { PlaybackChannelSnapshot } from '../engine/playback-engine'
import {
  DEFAULT_LANE_GAIN,
  type LaneSendLevels,
  type LaneState
} from '../project/project-state'

/** Silent Sends of the correct width. Never write this literal inline. */
function silentSends(): LaneSendLevels {
  return [0, 0, 0, 0]
}

/**
 * One lane at `index`, with project defaults and no placements. Override any
 * field; `sends` and `placements` are copied so tests cannot alias them.
 */
export function laneFixture(index: number, overrides: Partial<LaneState> = {}): LaneState {
  const lane: LaneState = {
    id: `lane-${index + 1}`,
    index,
    name: `Lane ${index + 1}`,
    muted: false,
    solo: false,
    pan: 0,
    stereoPairId: null,
    gain: DEFAULT_LANE_GAIN,
    sends: silentSends(),
    placements: [],
    ...overrides
  }
  return {
    ...lane,
    sends: [...lane.sends] as LaneSendLevels,
    placements: lane.placements.map((placement) => ({ ...placement }))
  }
}

/** One entry of a playback channel snapshot, with silent Sends by default. */
export function channelSnapshotFixture(
  overrides: Partial<PlaybackChannelSnapshot> & Pick<PlaybackChannelSnapshot, 'laneId' | 'channelIndex'>
): PlaybackChannelSnapshot {
  const snapshot: PlaybackChannelSnapshot = {
    gain: DEFAULT_LANE_GAIN,
    pan: 0,
    muted: false,
    solo: false,
    sends: silentSends(),
    ...overrides
  }
  return { ...snapshot, sends: [...snapshot.sends] as LaneSendLevels }
}
