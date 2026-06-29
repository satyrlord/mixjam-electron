import { describe, expect, it, vi } from 'vitest'
import { createScheduler, type SchedulerClock } from './scheduler'

function mockClock(): SchedulerClock & { fire: () => void } {
  let pending: (() => void) | null = null
  return {
    fire: () => pending?.(),
    setInterval: vi.fn((callback: () => void) => {
      pending = callback
      return 1
    }),
    clearInterval: vi.fn(() => {
      pending = null
    })
  }
}

describe('createScheduler', () => {
  // AC-005
  it('fires onSchedule for ticks within the lookahead window', () => {
    const audioTime = 0
    const scheduled: Array<{ tick: number; when: number }> = []
    const clock = mockClock()

    const scheduler = createScheduler({
      now: () => audioTime,
      transport: { bpm: 120 }, // step = 62.5ms; lookahead 100ms -> ~2 steps
      onSchedule: (tick, when) => scheduled.push({ tick, when }),
      clock,
      lookaheadMs: 100
    })

    scheduler.start(0)
    // Synchronous first pass already filled the window.
    expect(scheduled.length).toBeGreaterThanOrEqual(2)
    expect(scheduled[0]).toEqual({ tick: 0, when: 0 })
    expect(scheduled[1].tick).toBe(1)
    expect(scheduled[1].when).toBeCloseTo(0.0625, 5)
  })

  it('advances the window from the audio clock on each interval fire', () => {
    let audioTime = 0
    const scheduled: number[] = []
    const clock = mockClock()

    const scheduler = createScheduler({
      now: () => audioTime,
      transport: { bpm: 120 },
      onSchedule: (tick) => scheduled.push(tick),
      clock,
      lookaheadMs: 100
    })

    scheduler.start(0)
    const firstBatch = scheduled.length

    // Wall clock advances; next fire schedules further-out ticks.
    audioTime = 0.2
    clock.fire()
    expect(scheduled.length).toBeGreaterThan(firstBatch)
    // No duplicate ticks — each scheduled exactly once, monotonically.
    for (let i = 1; i < scheduled.length; i++) {
      expect(scheduled[i]).toBe(scheduled[i - 1] + 1)
    }
  })

  it('does not double-start and stops cleanly', () => {
    const clock = mockClock()
    const scheduler = createScheduler({
      now: () => 0,
      transport: { bpm: 120 },
      onSchedule: () => {},
      clock
    })
    scheduler.start()
    scheduler.start()
    expect(clock.setInterval).toHaveBeenCalledTimes(1)
    expect(scheduler.running).toBe(true)

    scheduler.stop()
    expect(clock.clearInterval).toHaveBeenCalledTimes(1)
    expect(scheduler.running).toBe(false)
  })

  it('reflects BPM changes on the next tick (faster tempo = denser steps)', () => {
    let audioTime = 0
    const bpm = { value: 120 }
    const scheduled: number[] = []
    const clock = mockClock()

    const scheduler = createScheduler({
      now: () => audioTime,
      transport: { get bpm() { return bpm.value } },
      onSchedule: (tick) => scheduled.push(tick),
      clock,
      lookaheadMs: 100
    })

    scheduler.start(0)
    const at120 = scheduled.length

    bpm.value = 240 // step halves -> more steps fit the next window
    audioTime = 0.1
    clock.fire()
    const added = scheduled.length - at120
    expect(added).toBeGreaterThanOrEqual(at120)
  })

  it('derives currentTick from the audio clock while running', () => {
    let audioTime = 0
    const clock = mockClock()
    const scheduler = createScheduler({
      now: () => audioTime,
      transport: { bpm: 120 }, // step = 0.0625s
      onSchedule: () => undefined,
      clock,
      lookaheadMs: 0
    })

    scheduler.start(0)
    expect(scheduler.currentTick()).toBe(0)
    audioTime = 0.0625 * 4 + 0.001 // 4 ticks elapsed
    expect(scheduler.currentTick()).toBe(4)
  })

  it('snapshots the playhead on stop so currentTick holds the paused position', () => {
    let audioTime = 0
    const clock = mockClock()
    const scheduler = createScheduler({
      now: () => audioTime,
      transport: { bpm: 120 },
      onSchedule: () => undefined,
      clock,
      lookaheadMs: 0
    })

    scheduler.start(0)
    audioTime = 0.0625 * 3 + 0.001
    scheduler.stop()
    audioTime = 10 // clock keeps advancing while stopped
    expect(scheduler.currentTick()).toBe(3)
  })

  it('does not loop forever or schedule when bpm is non-positive', () => {
    for (const bpm of [0, -120]) {
      const clock = mockClock()
      const scheduled: number[] = []
      const scheduler = createScheduler({
        now: () => 0,
        transport: { bpm },
        onSchedule: (tick) => scheduled.push(tick),
        clock,
        lookaheadMs: 100
      })

      expect(() => scheduler.start(0)).not.toThrow()
      expect(scheduled.length).toBe(0)
      expect(scheduler.currentTick()).toBe(0)
    }
  })
})
