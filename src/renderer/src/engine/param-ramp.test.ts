// Mixer parameters must ramp, not step. A raw `.value` write is a signal
// discontinuity that clicks, and a fader drag emits one per mousemove.

import { describe, expect, it } from 'vitest'
import { rampAudioParam } from './param-ramp'

interface Event { type: string, value: number, time: number }

interface FakeParam {
  value: number
  cancelAndHoldAtTime(time: number): void
  linearRampToValueAtTime(value: number, time: number): void
}

function fakeParam(initial: number): { events: Event[], param: AudioParam } {
  const events: Event[] = []
  const param: FakeParam = {
    value: initial,
    cancelAndHoldAtTime(time) {
      events.push({ type: 'hold', value: param.value, time })
    },
    linearRampToValueAtTime(value, time) {
      param.value = value
      events.push({ type: 'linear', value, time })
    }
  }
  return { events, param: param as unknown as AudioParam }
}

describe('rampAudioParam', () => {
  it('anchors at the current value then ramps to the target', () => {
    const { param, events } = fakeParam(0.25)
    rampAudioParam(param, 0.75, { currentTime: 2 } as BaseAudioContext)

    expect(events.map((event) => event.type)).toEqual(['hold', 'linear'])
    // Anchored at what is playing now, so the ramp starts from the audible
    // value rather than from stale scheduled automation.
    expect(events[0]).toMatchObject({ value: 0.25, time: 2 })
    expect(events[1]!.value).toBe(0.75)
    expect(events[1]!.time).toBeCloseTo(2.02, 5)
  })

  it('cancels earlier automation so overlapping moves do not fight', () => {
    const { param, events } = fakeParam(0)
    rampAudioParam(param, 1, { currentTime: 0 } as BaseAudioContext)
    rampAudioParam(param, 0.5, { currentTime: 0.005 } as BaseAudioContext)

    const holds = events.filter((event) => event.type === 'hold')
    expect(holds).toHaveLength(2)
    expect(holds[1]!.time).toBe(0.005)
    expect(param.value).toBe(0.5)
  })
})
