// @vitest-environment node
// Master bus DSP primitives: oversampler reconstruction and latency,
// delay line, true-peak upsampler, biquad responses, LR4 crossover.

import { describe, expect, it } from 'vitest'
import { LinkwitzRiley4, LinkwitzRiley4Allpass, StereoBiquad } from './biquad'
import { DelayLine, OVERSAMPLE_2X_LATENCY, OVERSAMPLE_4X_LATENCY, OversampledStage, TRUE_PEAK_UPSAMPLER_LAG, TruePeakUpsampler } from './oversampler'
import { TEST_SAMPLE_RATE, nullDepthDb, sine, toneAmplitude } from './test-support'

const FS = TEST_SAMPLE_RATE

function identityShaper(data: Float32Array, len: number): void {
  void data
  void len
}

describe('OversampledStage', () => {
  it('reports integer latencies', () => {
    expect(Number.isInteger(OVERSAMPLE_2X_LATENCY)).toBe(true)
    expect(Number.isInteger(OVERSAMPLE_4X_LATENCY)).toBe(true)
    expect(new OversampledStage(2, 128).latencySamples).toBe(OVERSAMPLE_2X_LATENCY)
    expect(new OversampledStage(4, 128).latencySamples).toBe(OVERSAMPLE_4X_LATENCY)
  })

  it.each([2, 4] as const)('%dx round trip reconstructs within the FIR floor', (factor) => {
    const stage = new OversampledStage(factor, 128)
    const input = sine(1000, 0.25, 0.5)
    const l = Float32Array.from(input)
    const r = Float32Array.from(input)
    let processedEnd = 0
    for (let start = 0; start + 128 <= l.length; start += 128) {
      stage.process(l.subarray(start, start + 128), r.subarray(start, start + 128), 128, identityShaper)
      processedEnd = start + 128
    }
    const depth = nullDepthDb(input, l, stage.latencySamples, 4096, processedEnd)
    expect(depth).toBeLessThan(-80)
  })

  it('4x oversampled cubic keeps aliases below -70 dB', () => {
    const stage = new OversampledStage(4, 128)
    // 15 kHz drive: 3rd harmonic (45 kHz) folds to 3 kHz without
    // oversampling; with 4x it is filtered instead.
    const freq = 15000
    const input = sine(freq, 0.5, 0.9)
    const l = Float32Array.from(input)
    const r = Float32Array.from(input)
    const cubic = (data: Float32Array, len: number): void => {
      for (let i = 0; i < len; i++) {
        const x = data[i]
        data[i] = x - (x * x * x) / 3
      }
    }
    for (let start = 0; start + 128 <= l.length; start += 128) {
      stage.process(l.subarray(start, start + 128), r.subarray(start, start + 128), 128, cubic)
    }
    const aliasFreq = 3 * freq - FS
    const fundamental = toneAmplitude(l, freq, 8192, l.length)
    const alias = toneAmplitude(l, aliasFreq, 8192, l.length)
    expect(20 * Math.log10(alias / fundamental)).toBeLessThan(-70)
  })
})

describe('DelayLine', () => {
  it('delays by exactly its length', () => {
    const delay = new DelayLine(7)
    const data = new Float32Array(32)
    data[0] = 1
    delay.process(data, 32)
    expect(data[7]).toBe(1)
    expect(data.filter((v) => v !== 0)).toHaveLength(1)
  })
})

describe('TruePeakUpsampler', () => {
  it('has the documented integer lag', () => {
    expect(Number.isInteger(TRUE_PEAK_UPSAMPLER_LAG)).toBe(true)
    expect(new TruePeakUpsampler(128).lagSamples).toBe(TRUE_PEAK_UPSAMPLER_LAG)
  })

  it('reveals inter-sample peaks a sample-peak meter misses', () => {
    // Quarter-rate sine with 45 degree phase: sample peaks sit ~0.707 of
    // the true peak.
    const input = sine(FS / 4, 0.2, 0.9, FS, Math.PI / 4)
    let samplePeak = 0
    for (const v of input) samplePeak = Math.max(samplePeak, Math.abs(v))
    const up = new TruePeakUpsampler(128)
    const out = new Float32Array(128 * 4)
    let truePeak = 0
    for (let start = 0; start + 128 <= input.length; start += 128) {
      up.process(input.subarray(start, start + 128), 128, out)
      for (const v of out) truePeak = Math.max(truePeak, Math.abs(v))
    }
    expect(samplePeak).toBeLessThan(0.75 * 0.9 * 1.05)
    expect(truePeak).toBeGreaterThan(0.9 * 0.97)
    expect(truePeak).toBeLessThan(0.9 * 1.03)
  })
})

describe('StereoBiquad', () => {
  function measureGainDb(configure: (b: StereoBiquad) => void, freq: number): number {
    const b = new StereoBiquad()
    configure(b)
    const input = sine(freq, 0.5, 0.25)
    const l = Float32Array.from(input)
    const r = Float32Array.from(input)
    b.process(l, r, l.length)
    const settle = Math.floor(l.length / 2)
    const out = toneAmplitude(l, freq, settle, l.length)
    const inn = toneAmplitude(input, freq, settle, input.length)
    return 20 * Math.log10(out / inn)
  }

  it('peaking cut matches its design gain at center within 0.5 dB', () => {
    const gain = measureGainDb((b) => b.peaking(FS, 250, 3, -1.5), 250)
    expect(gain).toBeGreaterThan(-2)
    expect(gain).toBeLessThan(-1)
  })

  it('peaking at 0 dB is exact identity', () => {
    const b = new StereoBiquad()
    b.peaking(FS, 250, 3, 0)
    const input = sine(997, 0.1, 0.5)
    const l = Float32Array.from(input)
    const r = Float32Array.from(input)
    b.process(l, r, l.length)
    expect(nullDepthDb(input, l, 0, 0)).toBe(-240)
  })

  it('shelves at 0 dB are exact identity', () => {
    for (const kind of ['low', 'high'] as const) {
      const b = new StereoBiquad()
      if (kind === 'low') b.lowShelf(FS, 90, 0.6, 0)
      else b.highShelf(FS, 12000, 0.6, 0)
      const input = sine(997, 0.1, 0.5)
      const l = Float32Array.from(input)
      const r = Float32Array.from(input)
      b.process(l, r, l.length)
      expect(nullDepthDb(input, l, 0, 0)).toBe(-240)
    }
  })

  it('high shelf reaches its gain in the top octave within 0.5 dB', () => {
    const gain = measureGainDb((b) => b.highShelf(FS, 12000, 0.6, 2), 20000)
    expect(Math.abs(gain - 2)).toBeLessThan(0.5)
  })

  it('12 dB/oct highpass attenuates an octave below cutoff by ~12 dB', () => {
    const atCutoffHalf = measureGainDb((b) => b.highpass(FS, 40, Math.SQRT1_2), 20)
    expect(atCutoffHalf).toBeLessThan(-10)
    expect(atCutoffHalf).toBeGreaterThan(-15)
  })
})

describe('LinkwitzRiley4', () => {
  it('LP + HP legs sum to the LR4 allpass (flat magnitude)', () => {
    const lp = new LinkwitzRiley4()
    const hp = new LinkwitzRiley4()
    lp.configure('lowpass', FS, 120)
    hp.configure('highpass', FS, 120)
    const ap = new LinkwitzRiley4Allpass()
    ap.configure(FS, 120)
    for (const freq of [40, 120, 350, 1000, 8000]) {
      const input = sine(freq, 0.5, 0.25)
      const lowL = Float32Array.from(input)
      const lowR = Float32Array.from(input)
      const highL = Float32Array.from(input)
      const highR = Float32Array.from(input)
      lp.reset()
      hp.reset()
      lp.process(lowL, lowR, lowL.length)
      hp.process(highL, highR, highL.length)
      const sum = new Float32Array(input.length)
      for (let i = 0; i < sum.length; i++) sum[i] = lowL[i] + highL[i]
      const refL = Float32Array.from(input)
      const refR = Float32Array.from(input)
      ap.reset()
      ap.process(refL, refR, refL.length)
      const depth = nullDepthDb(refL, sum, 0)
      expect(depth, `crossover null at ${freq} Hz`).toBeLessThan(-100)
    }
  })
})
