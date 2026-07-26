// Project fixtures for tests.
//
// A lane fixture used to be hand-written per test file — `sends: [0, 0, 0, 0]`
// alone appeared in thirteen files, fifteen times in one of them. That spreads
// the "exactly four Sends" invariant (docs/architecture.md) across the suite,
// so changing the FX bus count would mean editing dozens of literals instead of
// one factory.
//
// These builders derive their shape from the project model, so a fixture stays
// valid by construction. Ids are deterministic (`lane-1`, `lane-2`, ...) so a
// test can address a lane without capturing what the factory returned.
import type { PlaybackChannelSnapshot } from '../engine/playback-engine'
import {
  DEFAULT_LANE_GAIN,
  type ClipPlacement,
  type LaneSendLevels,
  type LaneState
} from '../project/project-state'

/** Silent Sends of the correct width. Never write this literal inline. */
export function silentSends(): LaneSendLevels {
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

/** `count` consecutive lanes, each built by {@link laneFixture}. */
export function laneFixtures(
  count: number,
  overridesFor: (index: number) => Partial<LaneState> = () => ({})
): LaneState[] {
  return Array.from({ length: count }, (_, index) => laneFixture(index, overridesFor(index)))
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

/** One clip placement with sensible defaults, for building lane content. */
export function placementFixture(overrides: Partial<ClipPlacement> = {}): ClipPlacement {
  return {
    id: 'placement-1',
    samplePath: 'kick.wav',
    sampleName: 'kick.wav',
    startTick: 0,
    durationTicks: 8,
    durationSeconds: 0.5,
    ...overrides
  }
}
