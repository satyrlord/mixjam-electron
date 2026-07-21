// @vitest-environment node
// Per-module unit tests for the pinned Gain Stage and ten downstream processors:
// latency-compensated null tests at neutral settings, THD profiles for the
// saturators, compressor static curve and timing, limiter true-peak
// ceiling, and metering behavior.

import { describe, expect, it } from 'vitest'
import type { MasterBusParamId } from '../params'
import { defaultParamValues } from '../params'
import { LinkwitzRiley4Allpass, StereoBiquad } from './biquad'
import { InputVuMeter } from './meters'
import type { BusModule } from './module'
import { AdditiveEqModule, SubtractiveEqModule } from './modules/eq'
import { BusCompressorModule, LimiterModule, MultibandCompModule } from './modules/dynamics'
import { GainStageModule } from './modules/gain'
import { StereoImagingModule } from './modules/imaging'
import { MaximizerModule, SoftClipModule, TapeSaturationModule, TubeSaturationModule } from './modules/saturators'
import {
  TEST_SAMPLE_RATE,
  nullDepthDb,
  peakDb,
  processBlocks,
  rmsDb,
  seededNoise,
  sine,
  toneAmplitude,
  truePeakDb8x,
} from './test-support'

const FS = TEST_SAMPLE_RATE
const MAX_BLOCK = 128

type Overrides = Partial<Record<MasterBusParamId, number>>

/** Wraps a module so each block pulls parameters like the core does. */
function withParams(module: BusModule, overrides: Overrides): { process: (l: Float32Array, r: Float32Array, n: number) => void } {
  const values = { ...defaultParamValues(), ...overrides }
  const read = (id: MasterBusParamId): number => values[id]
  return {
    process(l, r, n) {
      module.updateParams(read)
      module.process(l, r, n)
    },
  }
}

describe('GainStageModule', () => {
  it('applies trim in dB', () => {
    const input = sine(997, 0.3, 0.1)
    const out = processBlocks(withParams(new GainStageModule(), { 'gain.trim': 6 }), input, input)
    const gain = rmsDb(out.l, 8192) - rmsDb(input, 8192)
    expect(Math.abs(gain - 6)).toBeLessThan(0.1)
  })

  it('nulls at 0 dB trim', () => {
    const input = sine(997, 0.2, 0.5)
    const out = processBlocks(withParams(new GainStageModule(), {}), input, input)
    expect(nullDepthDb(input, out.l, 0)).toBe(-240)
  })
})

describe('SoftClipModule', () => {
  it('nulls bit-exactly at Amount 0 (latency compensated)', () => {
    const module = new SoftClipModule(FS, MAX_BLOCK)
    const input = sine(997, 0.3, 0.5)
    const out = processBlocks(withParams(module, { 'clip.amount': 0 }), input, input)
    expect(nullDepthDb(input, out.l, module.latencySamples)).toBe(-240)
  })

  it('reduces a hot transient by roughly Amount dB', () => {
    const module = new SoftClipModule(FS, MAX_BLOCK)
    // Program: quiet bed with -1 dBFS transient bursts.
    const input = sine(997, 0.5, 0.05)
    const burst = sine(997, 0.5, Math.pow(10, -1 / 20))
    for (let i = 12000; i < 13000; i++) input[i] = burst[i]
    const out = processBlocks(withParams(module, { 'clip.amount': 3 }), input, input)
    const inPeak = peakDb(input, 12000, 13000)
    const outPeak = peakDb(out.l, 12000 + module.latencySamples, 13000 + module.latencySamples)
    const reduction = inPeak - outPeak
    expect(reduction).toBeGreaterThan(1.5)
    expect(reduction).toBeLessThan(4.5)
  })

  it('small signals pass the engaged path unchanged (identity below knee)', () => {
    const module = new SoftClipModule(FS, MAX_BLOCK)
    const input = sine(997, 0.4, 0.05)
    const out = processBlocks(withParams(module, { 'clip.amount': 1.5 }), input, input)
    // -26 dBFS signal times 1.5 dB drive stays under the knee.
    expect(nullDepthDb(input, out.l, module.latencySamples, 8192)).toBeLessThan(-80)
  })
})

describe('TubeSaturationModule', () => {
  it('nulls bit-exactly at Drive 0', () => {
    const module = new TubeSaturationModule(FS, MAX_BLOCK)
    const input = sine(997, 0.3, 0.5)
    const out = processBlocks(withParams(module, { 'tube.drive': 0 }), input, input)
    expect(nullDepthDb(input, out.l, module.latencySamples)).toBe(-240)
  })

  it('produces predominantly even harmonics', () => {
    const module = new TubeSaturationModule(FS, MAX_BLOCK)
    const freq = 200
    const input = sine(freq, 1, Math.pow(10, -12 / 20))
    const out = processBlocks(withParams(module, { 'tube.drive': 5 }), input, input)
    const settle = 16384
    const h2 = toneAmplitude(out.l, freq * 2, settle, out.l.length)
    const h3 = toneAmplitude(out.l, freq * 3, settle, out.l.length)
    expect(h2).toBeGreaterThan(0)
    expect(h2 / Math.max(h3, 1e-12)).toBeGreaterThan(2)
  })

  it('holds loudness approximately constant across Drive', () => {
    const noise = seededNoise(FS, Math.pow(10, -18 / 20) * Math.SQRT2)
    const reference = rmsDb(noise, 8192)
    for (const drive of [1, 4, 8, 10]) {
      const module = new TubeSaturationModule(FS, MAX_BLOCK)
      const out = processBlocks(withParams(module, { 'tube.drive': drive }), noise, noise)
      const level = rmsDb(out.l, 8192)
      expect(Math.abs(level - reference), `drive ${drive}`).toBeLessThan(1.5)
    }
  })

  it('removes DC introduced by the asymmetric transfer', () => {
    const module = new TubeSaturationModule(FS, MAX_BLOCK)
    const input = sine(100, 1, 0.4)
    const out = processBlocks(withParams(module, { 'tube.drive': 8 }), input, input)
    let mean = 0
    for (let i = 24000; i < out.l.length; i++) mean += out.l[i]
    mean /= out.l.length - 24000
    expect(Math.abs(mean)).toBeLessThan(0.002)
  })

  it('Mix 0 returns the aligned dry signal', () => {
    const module = new TubeSaturationModule(FS, MAX_BLOCK)
    const input = sine(997, 0.3, 0.4)
    const out = processBlocks(withParams(module, { 'tube.drive': 8, 'tube.mix': 0 }), input, input)
    expect(nullDepthDb(input, out.l, module.latencySamples, 8192)).toBeLessThan(-100)
  })
})

describe('SubtractiveEqModule', () => {
  it('at zero cuts matches the bare high-pass reference exactly', () => {
    const module = new SubtractiveEqModule(FS)
    const input = sine(997, 0.3, 0.5)
    const out = processBlocks(withParams(module, { 'subeq.mud': 0, 'subeq.harsh': 0 }), input, input)
    const ref = new StereoBiquad()
    ref.highpass(FS, 20, Math.SQRT1_2)
    const refL = Float32Array.from(input)
    const refR = Float32Array.from(input)
    ref.process(refL, refR, refL.length)
    expect(nullDepthDb(refL, out.l, 0)).toBeLessThan(-160)
  })

  it('cuts 250 Hz by the Mud amount', () => {
    const module = new SubtractiveEqModule(FS)
    const input = sine(250, 0.5, 0.25)
    const out = processBlocks(withParams(module, { 'subeq.mud': -3 }), input, input)
    const settle = 16384
    const gain = 20 * Math.log10(toneAmplitude(out.l, 250, settle, out.l.length) / toneAmplitude(input, 250, settle, input.length))
    expect(Math.abs(gain - -3)).toBeLessThan(0.5)
  })
})

describe('BusCompressorModule', () => {
  it('nulls when the program sits under the threshold', () => {
    const module = new BusCompressorModule(FS)
    const input = sine(997, 0.3, 0.05)
    const out = processBlocks(withParams(module, { 'comp.thr': 0, 'comp.ratio': 1.5 }), input, input)
    expect(nullDepthDb(input, out.l, 0, 8192)).toBeLessThan(-100)
  })

  it('follows the soft-knee static curve within 1 dB', () => {
    // Steady sine at several drive levels; detector reads the sine RMS.
    for (const [levelDb, thr, ratio] of [
      [-6, -16, 2],
      [-10, -16, 4],
      [-2, -12, 10],
    ]) {
      const module = new BusCompressorModule(FS)
      const amplitude = Math.pow(10, levelDb / 20)
      const input = sine(997, 1, amplitude)
      const out = processBlocks(withParams(module, { 'comp.thr': thr, 'comp.ratio': ratio, 'comp.att': 0.5, 'comp.rel': 60 }), input, input)
      const settle = 24000
      const outLevel = rmsDb(out.l, settle)
      const inLevel = rmsDb(input, settle)
      const detectorDb = inLevel // sine RMS is what the detector converges to
      const over = detectorDb - thr
      const slope = 1 - 1 / ratio
      let expectedGr = 0
      if (over >= 3) expectedGr = slope * over
      else if (over > -3) expectedGr = (slope * (over + 3) * (over + 3)) / 12
      expect(Math.abs(inLevel - outLevel - expectedGr), `level ${levelDb} thr ${thr} ratio ${ratio}`).toBeLessThan(1)
    }
  })

  it('attack and release track their time constants', () => {
    const module = new BusCompressorModule(FS)
    const quiet = sine(997, 0.5, 0.05)
    const loud = sine(997, 0.5, 0.7)
    const input = new Float32Array(FS * 1.5)
    input.set(quiet, 0)
    input.set(loud, quiet.length)
    input.set(sine(997, 0.5, 0.05), quiet.length + loud.length)
    const wrapped = withParams(new BusCompressorModule(FS), { 'comp.thr': -20, 'comp.ratio': 4, 'comp.att': 5, 'comp.rel': 100 })
    void module
    const out = processBlocks(wrapped, input, input)
    // After the loud step, gain reduction must be mostly settled within a
    // few attack constants; measure output envelope early vs late.
    const stepAt = quiet.length
    const early = rmsDb(out.l, stepAt + 480, stepAt + 960) // ~10-20 ms after step
    const late = rmsDb(out.l, stepAt + 9600, stepAt + 14400) // ~200-300 ms
    expect(early).toBeGreaterThan(late - 1)
    // Release: after the loud section ends, level recovers toward unity.
    const releaseAt = stepAt + loud.length
    const justAfter = rmsDb(out.l, releaseAt + 480, releaseAt + 960)
    const recovered = rmsDb(out.l, releaseAt + 19200, releaseAt + 24000)
    expect(recovered).toBeGreaterThan(justAfter)
  })

  it('exposes gain reduction for the UI', () => {
    const module = new BusCompressorModule(FS)
    const input = sine(997, 0.5, 0.7)
    processBlocks(withParams(module, { 'comp.thr': -20, 'comp.ratio': 4 }), input, input)
    expect(module.grDb).toBeGreaterThan(1)
  })
})

describe('MaximizerModule', () => {
  it('nulls bit-exactly at Boost 0', () => {
    const module = new MaximizerModule(FS, MAX_BLOCK)
    const input = sine(997, 0.3, 0.5)
    const out = processBlocks(withParams(module, { 'max.boost': 0 }), input, input)
    expect(nullDepthDb(input, out.l, module.latencySamples)).toBe(-240)
  })

  it('raises loudness while holding the -1 dBFS ceiling', () => {
    const input = seededNoise(FS, 0.35)
    const reference = rmsDb(input, 8192)
    const module = new MaximizerModule(FS, MAX_BLOCK)
    const out = processBlocks(withParams(module, { 'max.boost': 10 }), input, input)
    const level = rmsDb(out.l, 8192)
    expect(level - reference).toBeGreaterThan(2)
    expect(peakDb(out.l, 8192)).toBeLessThanOrEqual(-1 + 0.1)
  })
})

describe('AdditiveEqModule', () => {
  it('nulls bit-exactly at zero shelf gains', () => {
    const module = new AdditiveEqModule(FS)
    const input = sine(997, 0.3, 0.5)
    const out = processBlocks(withParams(module, { 'addeq.low': 0, 'addeq.air': 0 }), input, input)
    expect(nullDepthDb(input, out.l, 0)).toBe(-240)
  })

  it('boosts lows and air by the shelf amounts', () => {
    const module = new AdditiveEqModule(FS)
    const low = sine(50, 0.5, 0.2)
    const outLow = processBlocks(withParams(module, { 'addeq.low': 2, 'addeq.air': 0 }), low, low)
    const settle = 16384
    const lowGain = 20 * Math.log10(toneAmplitude(outLow.l, 50, settle, outLow.l.length) / toneAmplitude(low, 50, settle, low.length))
    expect(Math.abs(lowGain - 2)).toBeLessThan(0.5)
  })
})

describe('TapeSaturationModule', () => {
  it('nulls bit-exactly at Drive 0', () => {
    const module = new TapeSaturationModule(FS, MAX_BLOCK)
    const input = sine(997, 0.3, 0.5)
    const out = processBlocks(withParams(module, { 'tape.drive': 0 }), input, input)
    expect(nullDepthDb(input, out.l, module.latencySamples)).toBe(-240)
  })

  it('leans on odd harmonics', () => {
    const module = new TapeSaturationModule(FS, MAX_BLOCK)
    const freq = 200
    const input = sine(freq, 1, Math.pow(10, -9 / 20))
    const out = processBlocks(withParams(module, { 'tape.drive': 6 }), input, input)
    const settle = 16384
    const h2 = toneAmplitude(out.l, freq * 2, settle, out.l.length)
    const h3 = toneAmplitude(out.l, freq * 3, settle, out.l.length)
    expect(h3).toBeGreaterThan(0)
    expect(h3 / Math.max(h2, 1e-12)).toBeGreaterThan(3)
  })

  it('moves the head bump with the speed switch', () => {
    const measure = (ips: number, freq: number): number => {
      const module = new TapeSaturationModule(FS, MAX_BLOCK)
      const input = sine(freq, 0.75, 0.1)
      const out = processBlocks(withParams(module, { 'tape.drive': 10, 'tape.ips': ips }), input, input)
      const settle = 16384
      return 20 * Math.log10(toneAmplitude(out.l, freq, settle, out.l.length) / toneAmplitude(input, freq, settle, input.length))
    }
    // 30 IPS bumps ~35 Hz; 15 IPS bumps ~55 Hz.
    expect(measure(1, 35)).toBeGreaterThan(measure(0, 35) - 0.05)
    expect(measure(0, 55)).toBeGreaterThan(measure(1, 55) - 0.05)
    expect(measure(1, 35)).toBeGreaterThan(0.5)
    expect(measure(0, 55)).toBeGreaterThan(0.5)
  })

  it('rolls off highs harder at 15 IPS', () => {
    const measure = (ips: number): number => {
      const module = new TapeSaturationModule(FS, MAX_BLOCK)
      const input = sine(15000, 0.5, 0.1)
      const out = processBlocks(withParams(module, { 'tape.drive': 10, 'tape.ips': ips }), input, input)
      const settle = 12288
      return 20 * Math.log10(toneAmplitude(out.l, 15000, settle, out.l.length) / toneAmplitude(input, 15000, settle, input.length))
    }
    expect(measure(0)).toBeLessThan(measure(1) - 0.3)
  })
})

describe('StereoImagingModule', () => {
  it('passes mono content bit-exactly at any width', () => {
    const module = new StereoImagingModule(FS, MAX_BLOCK)
    const input = sine(997, 0.3, 0.5)
    const out = processBlocks(withParams(module, { 'width.width': 140, 'width.mono': 300 }), input, input)
    expect(nullDepthDb(input, out.l, 0)).toBe(-240)
    expect(nullDepthDb(input, out.r, 0)).toBe(-240)
  })

  it('keeps the mono sum identical to the input sum (mono compatibility)', () => {
    const module = new StereoImagingModule(FS, MAX_BLOCK)
    const l = sine(300, 0.4, 0.4)
    const r = sine(700, 0.4, 0.4)
    const monoIn = new Float32Array(l.length)
    for (let i = 0; i < l.length; i++) monoIn[i] = (l[i] + r[i]) * 0.5
    const wrapped = withParams(module, { 'width.width': 140, 'width.mono': 120 })
    const outL = Float32Array.from(l)
    const outR = Float32Array.from(r)
    for (let start = 0; start + MAX_BLOCK <= outL.length; start += MAX_BLOCK) {
      wrapped.process(outL.subarray(start, start + MAX_BLOCK), outR.subarray(start, start + MAX_BLOCK), MAX_BLOCK)
    }
    const end = Math.floor(outL.length / MAX_BLOCK) * MAX_BLOCK
    const monoOut = new Float32Array(end)
    for (let i = 0; i < end; i++) monoOut[i] = (outL[i] + outR[i]) * 0.5
    expect(nullDepthDb(monoIn, monoOut, 0, 4096, end)).toBeLessThan(-140)
  })

  it('sums the side signal to mono below the crossover and widens above', () => {
    const sideLow = sine(60, 0.6, 0.3)
    const sideHigh = sine(2000, 0.6, 0.3)
    const l = new Float32Array(sideLow.length)
    const r = new Float32Array(sideLow.length)
    for (let i = 0; i < l.length; i++) {
      l[i] = sideLow[i] + sideHigh[i]
      r[i] = -sideLow[i] - sideHigh[i]
    }
    const module = new StereoImagingModule(FS, MAX_BLOCK)
    const wrapped = withParams(module, { 'width.width': 140, 'width.mono': 240 })
    for (let start = 0; start + MAX_BLOCK <= l.length; start += MAX_BLOCK) {
      wrapped.process(l.subarray(start, start + MAX_BLOCK), r.subarray(start, start + MAX_BLOCK), MAX_BLOCK)
    }
    const settle = 12288
    const end = Math.floor(l.length / MAX_BLOCK) * MAX_BLOCK
    const side = new Float32Array(end)
    for (let i = 0; i < end; i++) side[i] = (l[i] - r[i]) * 0.5
    const lowSide = toneAmplitude(side, 60, settle, end)
    const highSide = toneAmplitude(side, 2000, settle, end)
    expect(20 * Math.log10(lowSide / 0.3)).toBeLessThan(-30)
    expect(highSide / 0.3).toBeGreaterThan(1.3)
    expect(highSide / 0.3).toBeLessThan(1.5)
  })
})

describe('MultibandCompModule', () => {
  it('nulls against the crossover allpass reference at zero amounts', () => {
    const module = new MultibandCompModule(FS, MAX_BLOCK)
    const input = seededNoise(FS / 2, 0.2)
    const out = processBlocks(withParams(module, { 'mbc.lo': 0, 'mbc.mid': 0, 'mbc.hi': 0 }), input, input)
    const ap120 = new LinkwitzRiley4Allpass()
    ap120.configure(FS, 120)
    const ap2k = new LinkwitzRiley4Allpass()
    ap2k.configure(FS, 2000)
    const refL = Float32Array.from(input)
    const refR = Float32Array.from(input)
    ap120.process(refL, refR, refL.length)
    ap2k.process(refL, refR, refL.length)
    expect(nullDepthDb(refL, out.l, 0, 8192)).toBeLessThan(-100)
  })

  it('compresses a hot band without touching quiet bands', () => {
    const bass = sine(60, 1, 0.6)
    const mid = sine(1000, 1, 0.02)
    const input = new Float32Array(bass.length)
    for (let i = 0; i < input.length; i++) input[i] = bass[i] + mid[i]
    const module = new MultibandCompModule(FS, MAX_BLOCK)
    const out = processBlocks(withParams(module, { 'mbc.lo': 100, 'mbc.mid': 0, 'mbc.hi': 0 }), input, input)
    const settle = 24000
    const bassGain = 20 * Math.log10(toneAmplitude(out.l, 60, settle, out.l.length) / toneAmplitude(input, 60, settle, input.length))
    const midGain = 20 * Math.log10(toneAmplitude(out.l, 1000, settle, out.l.length) / toneAmplitude(input, 1000, settle, input.length))
    expect(bassGain).toBeLessThan(-1.5)
    expect(Math.abs(midGain)).toBeLessThan(0.3)
  })
})

describe('LimiterModule', () => {
  it('nulls under the ceiling (pure lookahead delay)', () => {
    const module = new LimiterModule(FS, MAX_BLOCK)
    const input = sine(997, 0.3, 0.25)
    const out = processBlocks(withParams(module, { 'lim.gain': 0, 'lim.ceil': 0 }), input, input)
    expect(nullDepthDb(input, out.l, module.latencySamples, 8192)).toBeLessThan(-100)
  })

  it('reports the documented lookahead latency', () => {
    const module = new LimiterModule(FS, MAX_BLOCK)
    expect(module.latencySamples).toBe(Math.round(0.0025 * FS))
  })

  it('never exceeds the ceiling in true peak across a torture set', () => {
    const torture: Array<{ name: string; signal: Float32Array; gain: number }> = []
    torture.push({ name: 'isp sine', signal: sine(FS / 4, 0.5, 0.99, FS, Math.PI / 4), gain: 6 })
    const square = new Float32Array(FS / 2)
    for (let i = 0; i < square.length; i++) square[i] = Math.sign(Math.sin((2 * Math.PI * 997 * i) / FS)) * 0.99
    torture.push({ name: 'square', signal: square, gain: 12 })
    const impulses = new Float32Array(FS / 2)
    for (let i = 4000; i < impulses.length; i += 4800) {
      impulses[i] = 1
      impulses[i + 1] = -1
    }
    torture.push({ name: 'impulse train', signal: impulses, gain: 12 })
    const clipped = sine(60, 0.5, 1.4)
    for (let i = 0; i < clipped.length; i++) clipped[i] = Math.max(-0.99, Math.min(0.99, clipped[i]))
    torture.push({ name: 'clipped bass', signal: clipped, gain: 9 })

    for (const { name, signal, gain } of torture) {
      const module = new LimiterModule(FS, MAX_BLOCK)
      const out = processBlocks(withParams(module, { 'lim.gain': gain, 'lim.ceil': -1 }), signal, signal)
      const end = Math.floor(out.l.length / MAX_BLOCK) * MAX_BLOCK
      const tp = truePeakDb8x(out.l, 2048, end)
      expect(tp, `true peak for ${name}`).toBeLessThanOrEqual(-0.95)
      expect(module.grDb, `gain reduction for ${name}`).toBeGreaterThan(0.5)
    }
  })
})

describe('InputVuMeter', () => {
  it('reads a -18 dBFS RMS program near -18 with VU ballistics', () => {
    const meter = new InputVuMeter(FS)
    const amplitude = Math.pow(10, -18 / 20) * Math.SQRT2
    const input = sine(997, 1, amplitude)
    meter.process(input, input, input.length)
    expect(Math.abs(meter.vuDb - -18)).toBeLessThan(1)
    expect(meter.peakL).toBe(false)
    expect(meter.peakR).toBe(false)
  })

  it('latches peak lamps on hot samples and releases after the hold', () => {
    const meter = new InputVuMeter(FS)
    const hot = sine(997, 0.05, 0.9)
    meter.process(hot, hot, hot.length)
    expect(meter.peakL).toBe(true)
    expect(meter.peakR).toBe(true)
    const quiet = new Float32Array(FS * 2)
    meter.process(quiet, quiet, quiet.length)
    expect(meter.peakL).toBe(false)
  })
})
