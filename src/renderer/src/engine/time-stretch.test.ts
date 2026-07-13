import { describe, expect, it } from 'vitest'
import { stretchRatio, stretchRatioForDuration } from './time-stretch'

describe('stretchRatio', () => {
  it('uses project BPM divided by native BPM for preview playback rate', () => {
    expect(stretchRatio(100, 120)).toBe(1.2)
    expect(stretchRatio(140, 120)).toBeCloseTo(120 / 140)
  })

  it('returns null when preview has no native BPM', () => {
    expect(stretchRatio(null, 120)).toBeNull()
    expect(stretchRatio(undefined, 120)).toBeNull()
  })

  it('rejects non-positive and non-finite BPM values', () => {
    expect(() => stretchRatio(0, 120)).toThrow(RangeError)
    expect(() => stretchRatio(120, Number.NaN)).toThrow(RangeError)
  })
})

describe('stretchRatioForDuration', () => {
  it('derives playback rate from source seconds and the placement musical span', () => {
    expect(stretchRatioForDuration(6.857142857142857, 128, 111)).toBeCloseTo(111 / 140)
    expect(stretchRatioForDuration(1, 8, 120)).toBe(2)
  })

  it('rejects invalid source and placement durations', () => {
    expect(() => stretchRatioForDuration(0, 8, 120)).toThrow(RangeError)
    expect(() => stretchRatioForDuration(1, 0, 120)).toThrow(RangeError)
  })
})
