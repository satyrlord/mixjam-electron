import { describe, expect, it } from 'vitest'
import {
  anyLaneSoloed,
  laneIsAudible,
  triggersForPlaybackStart,
  triggersForTick,
  type EngineLane
} from './lane-evaluation'

function lane(partial: Partial<EngineLane> & { index: number }): EngineLane {
  return {
    muted: false,
    solo: false,
    pan: 0,
    channelIndex: partial.index,
    placements: [],
    ...partial
  }
}

describe('lane-evaluation', () => {
  it('fires a clip placement exactly at its start tick on an audible lane', () => {
    const lanes = [lane({ index: 0, placements: [{ startTick: 8, durationTicks: 16, samplePath: 's0' }] })]
    expect(triggersForTick(lanes, 7)).toHaveLength(0)
    const at8 = triggersForTick(lanes, 8)
    expect(at8).toHaveLength(1)
    expect(at8[0]).toMatchObject({ laneIndex: 0, channelIndex: 0, samplePath: 's0' })
    // A tick during an active placement does not re-trigger it.
    expect(triggersForTick(lanes, 12)).toHaveLength(0)
  })

  it('does not fire placements on a muted lane', () => {
    const lanes = [lane({ index: 0, muted: true, placements: [{ startTick: 0, durationTicks: 8, samplePath: 's' }] })]
    expect(triggersForTick(lanes, 0)).toHaveLength(0)
  })

  // AC-013
  it('solo overrides mute: only soloed lanes play', () => {
    const lanes = [
      lane({ index: 0, solo: true, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'solo' }] }),
      lane({ index: 1, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'other' }] }),
      lane({ index: 2, muted: true, solo: true, placements: [{ startTick: 0, durationTicks: 8, samplePath: 'mutedSolo' }] })
    ]

    expect(anyLaneSoloed(lanes)).toBe(true)
    const triggers = triggersForTick(lanes, 0)
    const paths = triggers.map((t) => t.samplePath).sort()
    // Soloed lanes play (even the muted-but-soloed one); non-soloed is silent.
    expect(paths).toEqual(['mutedSolo', 'solo'])
  })

  it('laneIsAudible respects mute when no solo is active', () => {
    expect(laneIsAudible(lane({ index: 0 }), false)).toBe(true)
    expect(laneIsAudible(lane({ index: 0, muted: true }), false)).toBe(false)
    expect(laneIsAudible(lane({ index: 0, solo: false }), true)).toBe(false)
    expect(laneIsAudible(lane({ index: 0, solo: true }), true)).toBe(true)
  })

  it('keeps fades at boundaries separated by silence', () => {
    const lanes = [lane({
      index: 0,
      placements: [
        { startTick: 0, durationTicks: 8, samplePath: 'a' },
        { startTick: 16, durationTicks: 8, samplePath: 'b' }
      ]
    })]

    expect(triggersForTick(lanes, 0)[0]).toMatchObject({
      fadeInAtStart: true,
      fadeOutAtEnd: true
    })
    expect(triggersForTick(lanes, 16)[0]).toMatchObject({
      fadeInAtStart: true,
      fadeOutAtEnd: true
    })
  })

  it('does not fade touching or overlapping same-lane boundaries to silence', () => {
    const touching = [lane({
      index: 0,
      placements: [
        { startTick: 0, durationTicks: 8, samplePath: 'a' },
        { startTick: 8, durationTicks: 8, samplePath: 'b' }
      ]
    })]
    const overlap = [lane({
      index: 0,
      placements: [
        { startTick: 0, durationTicks: 12, samplePath: 'a' },
        { startTick: 8, durationTicks: 8, samplePath: 'b' }
      ]
    })]

    expect(triggersForTick(touching, 0)[0]?.fadeOutAtEnd).toBe(false)
    expect(triggersForTick(touching, 8)[0]?.fadeInAtStart).toBe(false)
    expect(triggersForTick(overlap, 0)[0]?.fadeOutAtEnd).toBe(false)
    expect(triggersForTick(overlap, 8)[0]?.fadeInAtStart).toBe(false)
    expect(triggersForTick(overlap, 0)[0]?.effectiveDurationTicks).toBe(8)
    expect(triggersForTick(overlap, 8)[0]?.effectiveDurationTicks).toBe(8)
  })

  it('resumes only the latest placement sounding on a monophonic lane', () => {
    const lanes = [lane({
      index: 0,
      placements: [
        { startTick: 0, durationTicks: 16, samplePath: 'older' },
        { startTick: 8, durationTicks: 16, samplePath: 'newer' }
      ]
    })]

    expect(triggersForPlaybackStart(lanes, 12)).toHaveLength(1)
    expect(triggersForPlaybackStart(lanes, 12)[0]?.samplePath).toBe('newer')
    expect(triggersForPlaybackStart(lanes, 8)).toHaveLength(0)
    expect(triggersForTick(lanes, 8)[0]?.samplePath).toBe('newer')
  })

  it('does not resume a placement after a nested overlap has cut it off', () => {
    const lanes = [lane({
      index: 0,
      placements: [
        { startTick: 0, durationTicks: 16, samplePath: 'outer' },
        { startTick: 8, durationTicks: 4, samplePath: 'inner' }
      ]
    })]

    expect(triggersForTick(lanes, 0)[0]?.fadeOutAtEnd).toBe(false)
    expect(triggersForTick(lanes, 8)[0]).toMatchObject({
      samplePath: 'inner',
      fadeInAtStart: false,
      fadeOutAtEnd: true
    })
    expect(triggersForPlaybackStart(lanes, 13)).toHaveLength(0)
  })

  it('uses the last stored placement when multiple placements start together', () => {
    const lanes = [lane({
      index: 0,
      placements: [
        { startTick: 0, durationTicks: 16, samplePath: 'first' },
        { startTick: 0, durationTicks: 8, samplePath: 'winner' }
      ]
    })]

    expect(triggersForTick(lanes, 0)).toHaveLength(1)
    expect(triggersForTick(lanes, 0)[0]).toMatchObject({
      samplePath: 'winner',
      fadeInAtStart: true,
      fadeOutAtEnd: true
    })
  })
})
