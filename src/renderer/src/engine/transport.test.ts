import { describe, expect, it } from 'vitest'
import { createTransport, tickDurationSeconds, TICKS_PER_BEAT } from '../engine/transport'

describe('createTransport', () => {
  it('starts in stopped state with default BPM 120', () => {
    const transport = createTransport(120)

    expect(transport.state).toBe('stopped')
    expect(transport.bpm).toBe(120)
  })

  it('transitions to playing on play()', () => {
    const transport = createTransport(120)

    transport.play()

    expect(transport.state).toBe('playing')
  })

  it('play() is idempotent', () => {
    const transport = createTransport(120)

    transport.play()
    transport.play()

    expect(transport.state).toBe('playing')
  })

  it('pauses from playing', () => {
    const transport = createTransport(120)

    transport.play()
    transport.pause()

    expect(transport.state).toBe('paused')
  })

  it('pause is a no-op when not playing', () => {
    const transport = createTransport(120)

    transport.pause()

    expect(transport.state).toBe('stopped')
  })

  it('stop resets to stopped state', () => {
    const transport = createTransport(120)

    transport.play()
    transport.stop()

    expect(transport.state).toBe('stopped')
  })

  it('skipBack does not change playback state', () => {
    const transport = createTransport(120)

    transport.play()
    transport.skipBack()

    expect(transport.state).toBe('playing')
  })

  it('setBpm updates the tempo', () => {
    const transport = createTransport(120)

    transport.setBpm(140)

    expect(transport.bpm).toBe(140)
  })

  it('tickDurationSeconds reflects the current BPM', () => {
    const transport = createTransport(120)

    // 120 BPM, 8 ticks/beat -> 0.0625s per tick.
    expect(transport.tickDurationSeconds()).toBeCloseTo(0.0625, 6)

    transport.setBpm(60)
    expect(transport.tickDurationSeconds()).toBeCloseTo(0.125, 6)
  })

  it('tickToTime projects a future tick onto the audio clock', () => {
    const transport = createTransport(120) // 0.0625s per tick

    // 8 ticks ahead of reference tick 0 at audio time 1.0 -> 1.0 + 8*0.0625
    expect(transport.tickToTime(8, 0, 1.0)).toBeCloseTo(1.5, 6)
  })

  it('exposes the shared tick grid constants', () => {
    expect(TICKS_PER_BEAT).toBe(8)
    expect(tickDurationSeconds(120)).toBeCloseTo(0.0625, 6)
  })
})
