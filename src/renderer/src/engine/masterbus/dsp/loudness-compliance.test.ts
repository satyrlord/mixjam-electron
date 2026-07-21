// @vitest-environment node
// Loudness compliance (spec-012 §Testing): the production BS.1770 meter is
// validated against EBU Tech 3341-style test signals — steady stereo tones
// at defined levels, the relative-gating sequence, and a true-peak
// inter-sample case. Signal definitions follow Tech 3341; tone durations
// are shortened where the measurement is time-invariant.
//
// Calibration identity used throughout: a stereo 997 Hz sine whose PEAK
// amplitude is A dBFS reads A LUFS (the +3.01 dB stereo sum and the
// -3.01 dB sine RMS cancel, and the -0.691 offset cancels the K-weighting
// gain at 997 Hz).

import { describe, expect, it } from 'vitest'
import { measureLoudness } from './loudness-harness'
import { sine } from './test-support'

const FS = 48000

function stereoTone(peakDbfs: number, seconds: number): { l: Float32Array; r: Float32Array } {
  const amplitude = Math.pow(10, peakDbfs / 20)
  const tone = sine(997, seconds, amplitude, FS)
  return { l: tone, r: Float32Array.from(tone) }
}

describe('EBU Tech 3341 style compliance (production loudness meter)', () => {
  it('case 1: -23 dBFS stereo tone reads -23.0 LUFS M/S/I within 0.1 LU', { timeout: 90000 }, async () => {
    const { l, r } = stereoTone(-23, 20)
    const result = await measureLoudness(l, r, FS)
    expect(Math.abs(result.integratedLufs - -23)).toBeLessThan(0.1)
    expect(Math.abs(result.maxMomentaryLufs - -23)).toBeLessThan(0.1)
    expect(Math.abs(result.maxShortTermLufs - -23)).toBeLessThan(0.1)
  })

  it('case 2: -33 dBFS stereo tone reads -33.0 LUFS within 0.1 LU', { timeout: 90000 }, async () => {
    const { l, r } = stereoTone(-33, 20)
    const result = await measureLoudness(l, r, FS)
    expect(Math.abs(result.integratedLufs - -33)).toBeLessThan(0.1)
  })

  it('gating: quiet -36 dBFS flanks are gated out of the integrated value', { timeout: 90000 }, async () => {
    const quietA = stereoTone(-36, 10)
    const loud = stereoTone(-23, 20)
    const quietB = stereoTone(-36, 10)
    const total = quietA.l.length + loud.l.length + quietB.l.length
    const l = new Float32Array(total)
    const r = new Float32Array(total)
    l.set(quietA.l, 0)
    r.set(quietA.r, 0)
    l.set(loud.l, quietA.l.length)
    r.set(loud.r, quietA.l.length)
    l.set(quietB.l, quietA.l.length + loud.l.length)
    r.set(quietB.r, quietA.l.length + loud.l.length)
    const result = await measureLoudness(l, r, FS)
    // The -10 LU relative gate excludes the -36 dBFS sections.
    expect(Math.abs(result.integratedLufs - -23)).toBeLessThan(0.15)
  })

  it('silence: non-finite readings are dropped rather than folded into the maxima', { timeout: 90000 }, async () => {
    // A digitally silent program leaves short-term loudness and true peak at
    // -Infinity. Those readings must be filtered out of the trails, not
    // propagated as if they were measurements.
    const n = FS * 2
    const result = await measureLoudness(new Float32Array(n), new Float32Array(n), FS)
    expect(result.integratedLufs).toBe(Number.NEGATIVE_INFINITY)
    expect(result.maxShortTermLufs).toBe(Number.NEGATIVE_INFINITY)
    expect(result.maxTruePeakDbtp).toBe(Number.NEGATIVE_INFINITY)
    expect(result.shortTermTrail).toHaveLength(0)
    // Momentary loudness does resolve to a finite floor, so its trail fills.
    expect(result.momentaryTrail.length).toBeGreaterThan(0)
    expect(result.momentaryTrail.every((v) => Number.isFinite(v))).toBe(true)
    expect(result.maxMomentaryLufs).toBeLessThan(-100)
  })

  it('short program: a sub-window burst yields no finite loudness readings', { timeout: 90000 }, async () => {
    // Shorter than the 400 ms momentary window, so no gating block ever
    // completes: every loudness reading stays -Infinity and both trails are
    // empty rather than carrying a placeholder value.
    const { l, r } = stereoTone(-20, 0.05)
    const result = await measureLoudness(l, r, FS)
    expect(result.maxMomentaryLufs).toBe(Number.NEGATIVE_INFINITY)
    expect(result.maxShortTermLufs).toBe(Number.NEGATIVE_INFINITY)
    expect(result.momentaryTrail).toHaveLength(0)
    expect(result.shortTermTrail).toHaveLength(0)
  })

  it('true peak: a phase-shifted fs/4 tone reveals its inter-sample peak', { timeout: 90000 }, async () => {
    // Peak amplitude -6.02 dBFS but sample peaks near -9 dBFS: only an
    // oversampled meter sees the true level. BS.1770 conformance allows
    // +0.2/-0.4 dB.
    const amplitude = 0.5
    const tone = sine(FS / 4, 5, amplitude, FS, Math.PI / 4)
    const result = await measureLoudness(tone, Float32Array.from(tone), FS)
    const expected = 20 * Math.log10(amplitude)
    expect(result.maxTruePeakDbtp).toBeGreaterThan(expected - 0.4)
    expect(result.maxTruePeakDbtp).toBeLessThan(expected + 0.2)
  })
})
