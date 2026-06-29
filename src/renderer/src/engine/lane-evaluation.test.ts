import { describe, expect, it } from 'vitest'
import { anyLaneSoloed, laneIsAudible, triggersForTick, type EngineLane } from './lane-evaluation'

function lane(partial: Partial<EngineLane> & { index: number }): EngineLane {
  return {
    muted: false,
    solo: false,
    channelIndex: partial.index,
    clips: [],
    ...partial
  }
}

describe('lane-evaluation', () => {
  it('fires a clip exactly at its start tick on an audible lane', () => {
    const lanes = [lane({ index: 0, clips: [{ startTick: 8, durationTicks: 16, samplePath: 's0' }] })]
    expect(triggersForTick(lanes, 7)).toHaveLength(0)
    const at8 = triggersForTick(lanes, 8)
    expect(at8).toHaveLength(1)
    expect(at8[0]).toMatchObject({ laneIndex: 0, channelIndex: 0, samplePath: 's0' })
    // Mid-clip tick does not re-trigger.
    expect(triggersForTick(lanes, 12)).toHaveLength(0)
  })

  it('does not fire clips on a muted lane', () => {
    const lanes = [lane({ index: 0, muted: true, clips: [{ startTick: 0, durationTicks: 8, samplePath: 's' }] })]
    expect(triggersForTick(lanes, 0)).toHaveLength(0)
  })

  // AC-013
  it('solo overrides mute: only soloed lanes play', () => {
    const lanes = [
      lane({ index: 0, solo: true, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'solo' }] }),
      lane({ index: 1, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'other' }] }),
      lane({ index: 2, muted: true, solo: true, clips: [{ startTick: 0, durationTicks: 8, samplePath: 'mutedSolo' }] })
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
})
