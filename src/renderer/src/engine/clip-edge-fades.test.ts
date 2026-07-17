import { describe, expect, it } from 'vitest'
import {
  clipEdgeGainAtSample,
  createClipEdgeFadePlan,
  fadeMillisecondsToSamples,
  normalizeClipEdgeMicroFades
} from './clip-edge-fades'

describe('clip-edge micro-fade planning', () => {
  it('converts the default durations with the active render sample rate', () => {
    expect(fadeMillisecondsToSamples(44_100, 2)).toBe(88)
    expect(fadeMillisecondsToSamples(44_100, 4)).toBe(176)
    expect(fadeMillisecondsToSamples(48_000, 2)).toBe(96)
    expect(fadeMillisecondsToSamples(48_000, 4)).toBe(192)
  })

  it('supports fractional millisecond fades for percussive material', () => {
    expect(fadeMillisecondsToSamples(48_000, 0.5)).toBe(24)
    expect(fadeMillisecondsToSamples(48_000, 1)).toBe(48)
  })

  it('shrinks both fades proportionally without overlap', () => {
    const plan = createClipEdgeFadePlan({
      sampleRate: 1000,
      clipDurationSeconds: 0.003,
      fadeInMs: 2,
      fadeOutMs: 4
    })

    expect(plan).toMatchObject({
      clipSamples: 3,
      fadeInSamples: 1,
      fadeOutSamples: 2
    })
    expect(plan.fadeInSamples + plan.fadeOutSamples).toBeLessThanOrEqual(plan.clipSamples)
  })

  it('keeps exact linear endpoints for multi-sample fades', () => {
    const plan = createClipEdgeFadePlan({
      sampleRate: 1000,
      clipDurationSeconds: 0.01,
      fadeInMs: 3,
      fadeOutMs: 4
    })

    expect(clipEdgeGainAtSample(plan, 0)).toBe(0)
    expect(clipEdgeGainAtSample(plan, 1)).toBe(0.5)
    expect(clipEdgeGainAtSample(plan, 2)).toBe(1)
    expect(clipEdgeGainAtSample(plan, 6)).toBe(1)
    expect(clipEdgeGainAtSample(plan, 9)).toBe(0)
  })

  it('silences a one-frame placement without NaN or division by zero', () => {
    const plan = createClipEdgeFadePlan({
      sampleRate: 48_000,
      clipDurationSeconds: 1 / 48_000,
      fadeInMs: 2,
      fadeOutMs: 4
    })

    expect(plan.fadeInSamples + plan.fadeOutSamples).toBe(1)
    expect(clipEdgeGainAtSample(plan, 0)).toBe(0)
    expect(Number.isFinite(clipEdgeGainAtSample(plan, 0))).toBe(true)
  })

  it('returns a no-op finite plan for zero or invalid durations', () => {
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const plan = createClipEdgeFadePlan({
        sampleRate: 44_100,
        clipDurationSeconds: duration,
        fadeInMs: 2,
        fadeOutMs: 4
      })
      expect(plan.clipSamples).toBe(0)
      expect(plan.fadeInSamples).toBe(0)
      expect(plan.fadeOutSamples).toBe(0)
      expect(clipEdgeGainAtSample(plan, 0)).toBe(1)
    }
  })

  it('clamps project settings to the supported 0-20 ms range', () => {
    expect(normalizeClipEdgeMicroFades({
      enabled: false,
      fadeInMs: -4,
      fadeOutMs: 25
    })).toEqual({
      enabled: false,
      fadeInMs: 0,
      fadeOutMs: 20
    })
  })
})
