import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransport, type TransportScheduler } from '../engine/transport'

function mockScheduler(): TransportScheduler & { pending: (() => void)[] } {
  const pending: (() => void)[] = []
  return {
    pending,
    setInterval: vi.fn((callback: () => void) => {
      pending.push(callback)
      return pending.length - 1
    }),
    clearInterval: vi.fn(() => {
      pending.length = 0
    })
  }
}

describe('createTransport', () => {
  let scheduler: ReturnType<typeof mockScheduler>

  beforeEach(() => {
    scheduler = mockScheduler()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in stopped state at tick 0 with default BPM 120', () => {
    const transport = createTransport(120, scheduler)

    expect(transport.state).toBe('stopped')
    expect(transport.currentTick).toBe(0)
    expect(transport.bpm).toBe(120)
  })

  it('transitions to playing on play() and starts the timer', () => {
    const transport = createTransport(120, scheduler)

    transport.play()

    expect(transport.state).toBe('playing')
    expect(scheduler.setInterval).toHaveBeenCalledTimes(1)
  })

  it('does not restart timer on duplicate play()', () => {
    const transport = createTransport(120, scheduler)

    transport.play()
    transport.play()

    expect(scheduler.setInterval).toHaveBeenCalledTimes(1)
  })

  it('pauses and clears the timer', () => {
    const transport = createTransport(120, scheduler)

    transport.play()
    transport.pause()

    expect(transport.state).toBe('paused')
    expect(scheduler.clearInterval).toHaveBeenCalled()
  })

  it('stop resets to tick 0 and stopped state', () => {
    const transport = createTransport(120, scheduler)

    transport.play()
    transport.stop()

    expect(transport.state).toBe('stopped')
    expect(transport.currentTick).toBe(0)
    expect(scheduler.clearInterval).toHaveBeenCalled()
  })

  it('skipBack resets tick to 0 without stopping playback', () => {
    const transport = createTransport(120, scheduler)

    transport.play()
    scheduler.pending[0]?.()
    scheduler.pending[0]?.()
    scheduler.pending[0]?.()

    expect(transport.currentTick).toBe(3)

    transport.skipBack()
    expect(transport.currentTick).toBe(0)
    expect(transport.state).toBe('playing')
  })

  it('advances tick on each scheduler fire', () => {
    const transport = createTransport(120, scheduler)

    transport.play()
    scheduler.pending[0]?.()

    expect(transport.currentTick).toBe(1)
  })

  it('fires onTick callback with current tick', () => {
    const transport = createTransport(120, scheduler)
    const onTick = vi.fn()

    transport.setOnTick(onTick)
    transport.play()
    scheduler.pending[0]?.()
    scheduler.pending[0]?.()

    expect(onTick).toHaveBeenCalledTimes(2)
    expect(onTick).toHaveBeenLastCalledWith({ currentTick: 2 })
  })

  it('setBpm restarts the timer with new interval when playing', () => {
    const transport = createTransport(120, scheduler)

    transport.play()
    transport.setBpm(140)

    expect(transport.bpm).toBe(140)
    expect(scheduler.setInterval).toHaveBeenCalledTimes(2)
  })

  it('setBpm updates BPM without restarting timer when stopped', () => {
    const transport = createTransport(120, scheduler)

    transport.setBpm(90)

    expect(transport.bpm).toBe(90)
    expect(scheduler.setInterval).not.toHaveBeenCalled()
  })

  it('destroy stops timer and clears callback', () => {
    const transport = createTransport(120, scheduler)
    const onTick = vi.fn()

    transport.setOnTick(onTick)
    transport.play()
    transport.destroy()

    expect(scheduler.clearInterval).toHaveBeenCalled()
  })

  it('pause is a no-op when not playing', () => {
    const transport = createTransport(120, scheduler)

    transport.pause()

    expect(transport.state).toBe('stopped')
    expect(scheduler.clearInterval).not.toHaveBeenCalled()
  })
})
