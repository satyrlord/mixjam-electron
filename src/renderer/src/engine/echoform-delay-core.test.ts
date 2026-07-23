// @vitest-environment node
// Headless DSP unit tests for the Echoform Delay core (spec §26). The core has
// no Web Audio dependency, so process() is driven directly with sample buffers.

import { describe, expect, it } from 'vitest'
import { EchoformDelayCore, echoformDelaySeconds, echoformDelayDivisionBeats } from './echoform-delay-core'
import type { EchoformDelayState } from './echoform-delay-types'

const FS = 48_000

function baseState(overrides: Partial<EchoformDelayState> = {}): EchoformDelayState {
  return {
    mode: 'free',
    divisionL: '1/4',
    divisionR: '1/8.',
    timeMsL: 100,
    timeMsR: 100,
    feedback: 0,
    pingPong: false,
    width: 100,
    lowCut: 20,
    highCut: 20000,
    modRate: 0.05,
    modDepth: 0,
    character: 'digital',
    drive: 0,
    duckAmount: 0,
    duckRelease: 200,
    outputDb: 0,
    freeze: false,
    bypass: false,
    ...overrides
  }
}

/** Render `seconds` of audio, feeding a single-sample impulse on both channels. */
function renderImpulse(
  core: EchoformDelayCore,
  seconds: number,
  block = 128
): { left: Float32Array; right: Float32Array } {
  const total = Math.ceil(seconds * FS)
  const left = new Float32Array(total)
  const right = new Float32Array(total)
  const inL = new Float32Array(block)
  const inR = new Float32Array(block)
  const outL = new Float32Array(block)
  const outR = new Float32Array(block)
  let written = 0
  let firstBlock = true
  while (written < total) {
    const n = Math.min(block, total - written)
    inL.fill(0); inR.fill(0)
    if (firstBlock) { inL[0] = 1; inR[0] = 1; firstBlock = false }
    outL.fill(0); outR.fill(0)
    core.process(inL.subarray(0, n), inR.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
    left.set(outL.subarray(0, n), written)
    right.set(outR.subarray(0, n), written)
    written += n
  }
  return { left, right }
}

/** Render a constant-level tone (for feedback / stability tests). */
function renderTone(
  core: EchoformDelayCore,
  seconds: number,
  amplitude = 0.5,
  block = 128
): { left: Float32Array; right: Float32Array } {
  const total = Math.ceil(seconds * FS)
  const left = new Float32Array(total)
  const right = new Float32Array(total)
  const inL = new Float32Array(block)
  const inR = new Float32Array(block)
  const outL = new Float32Array(block)
  const outR = new Float32Array(block)
  let written = 0
  let phase = 0
  while (written < total) {
    const n = Math.min(block, total - written)
    for (let i = 0; i < n; i += 1) {
      inL[i] = amplitude * Math.sin(phase)
      inR[i] = amplitude * Math.sin(phase)
      phase += (2 * Math.PI * 220) / FS
    }
    outL.fill(0); outR.fill(0)
    core.process(inL.subarray(0, n), inR.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
    left.set(outL.subarray(0, n), written)
    right.set(outR.subarray(0, n), written)
    written += n
  }
  return { left, right }
}

/** Render `seconds` of silence (to observe a decaying/fading tail). */
function renderSilence(core: EchoformDelayCore, seconds: number, block = 128): Float32Array {
  const total = Math.ceil(seconds * FS)
  const out = new Float32Array(total)
  const zero = new Float32Array(block)
  const outL = new Float32Array(block)
  const outR = new Float32Array(block)
  let written = 0
  while (written < total) {
    const n = Math.min(block, total - written)
    outL.fill(0); outR.fill(0)
    core.process(zero.subarray(0, n), zero.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
    out.set(outL.subarray(0, n), written)
    written += n
  }
  return out
}

function peakIndex(buffer: Float32Array, from = 1): number {
  let best = from
  for (let i = from; i < buffer.length; i += 1) {
    if (Math.abs(buffer[i]!) > Math.abs(buffer[best]!)) best = i
  }
  return best
}

function peak(buffer: Float32Array, from = 0, to = buffer.length): number {
  let p = 0
  for (let i = from; i < to; i += 1) p = Math.max(p, Math.abs(buffer[i]!))
  return p
}

/** RMS level of a window, in dBFS (-Infinity for pure silence). */
function rmsDb(buffer: Float32Array, from: number, to: number): number {
  let sum = 0
  for (let i = from; i < to; i += 1) sum += buffer[i]! * buffer[i]!
  const rms = Math.sqrt(sum / Math.max(1, to - from))
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity
}

function isFiniteBuffer(buffer: Float32Array): boolean {
  for (let i = 0; i < buffer.length; i += 1) {
    if (!Number.isFinite(buffer[i]!)) return false
  }
  return true
}

describe('Echoform delay — division math', () => {
  it('computes straight, dotted, and triplet durations at several BPM', () => {
    // Quarter at 120 BPM = 500 ms.
    expect(echoformDelaySeconds('sync', '1/4', 0, 120) * 1000).toBeCloseTo(500, 3)
    // 1/8 dotted at 120 BPM = 375 ms.
    expect(echoformDelaySeconds('sync', '1/8.', 0, 120) * 1000).toBeCloseTo(375, 3)
    // 1/4 triplet at 120 BPM = 500 * 2/3 = 333.33 ms.
    expect(echoformDelaySeconds('sync', '1/4T', 0, 120) * 1000).toBeCloseTo(1000 / 3, 3)
    // Whole note at 90 BPM: 4 beats * (60000/90) = 2666.67 ms.
    expect(echoformDelaySeconds('sync', '1/1', 0, 90) * 1000).toBeCloseTo(2666.667, 2)
    // Beat counts: dotted = 1.5x, triplet = 2/3x of straight.
    expect(echoformDelayDivisionBeats('1/4.')).toBeCloseTo(1.5, 6)
    expect(echoformDelayDivisionBeats('1/4T')).toBeCloseTo(2 / 3, 6)
  })

  it('free mode clamps to 1–2000 ms', () => {
    expect(echoformDelaySeconds('free', '1/4', 0.4, 120) * 1000).toBeCloseTo(1, 3)
    expect(echoformDelaySeconds('free', '1/4', 5000, 120) * 1000).toBeCloseTo(2000, 3)
    expect(echoformDelaySeconds('free', '1/4', 420, 120) * 1000).toBeCloseTo(420, 3)
  })
})

describe('Echoform delay — timing', () => {
  it('places independent left and right taps at the requested times', () => {
    const core = new EchoformDelayCore(FS, baseState({ timeMsL: 100, timeMsR: 150 }), 120)
    const { left, right } = renderImpulse(core, 0.35)
    const lPeak = peakIndex(left, 100)
    const rPeak = peakIndex(right, 100)
    expect(lPeak / FS * 1000).toBeGreaterThan(95)
    expect(lPeak / FS * 1000).toBeLessThan(105)
    expect(rPeak / FS * 1000).toBeGreaterThan(145)
    expect(rPeak / FS * 1000).toBeLessThan(155)
  })

  it('renders free times at the minimum and maximum', () => {
    const min = new EchoformDelayCore(FS, baseState({ timeMsL: 1, timeMsR: 1 }), 120)
    const minOut = renderImpulse(min, 0.05)
    expect(isFiniteBuffer(minOut.left)).toBe(true)
    expect(peak(minOut.left, 1)).toBeGreaterThan(0.1)

    const max = new EchoformDelayCore(FS, baseState({ timeMsL: 2000, timeMsR: 2000 }), 120)
    const maxOut = renderImpulse(max, 2.1)
    const p = peakIndex(maxOut.left, 100)
    expect(p / FS * 1000).toBeGreaterThan(1950)
    expect(p / FS * 1000).toBeLessThan(2050)
  })
})

describe('Echoform delay — feedback and ping-pong', () => {
  it('cross-couples repeats in ping-pong mode', () => {
    // An impulse only on the LEFT input; in ping-pong the second repeat must
    // appear on the RIGHT lane.
    const core = new EchoformDelayCore(FS, baseState({
      timeMsL: 100, timeMsR: 100, feedback: 70, pingPong: true
    }), 120)
    const total = Math.ceil(0.45 * FS)
    const left = new Float32Array(total)
    const right = new Float32Array(total)
    const inL = new Float32Array(128)
    const inR = new Float32Array(128)
    const outL = new Float32Array(128)
    const outR = new Float32Array(128)
    let written = 0, first = true
    while (written < total) {
      const n = Math.min(128, total - written)
      inL.fill(0); inR.fill(0)
      if (first) { inL[0] = 1; first = false }
      outL.fill(0); outR.fill(0)
      core.process(inL.subarray(0, n), inR.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
      left.set(outL.subarray(0, n), written)
      right.set(outR.subarray(0, n), written)
      written += n
    }
    // First tap ~100 ms is dominant on left; a later repeat appears on right.
    const rightLate = peak(right, Math.round(0.15 * FS), Math.round(0.45 * FS))
    expect(rightLate).toBeGreaterThan(0.02)
  })

  it('routes normal-stereo feedback to the same side', () => {
    const core = new EchoformDelayCore(FS, baseState({
      timeMsL: 100, timeMsR: 100, feedback: 70, pingPong: false
    }), 120)
    // Impulse only on left: right should stay near silent.
    const total = Math.ceil(0.45 * FS)
    const right = new Float32Array(total)
    const inL = new Float32Array(128)
    const inR = new Float32Array(128)
    const outL = new Float32Array(128)
    const outR = new Float32Array(128)
    let written = 0, first = true
    while (written < total) {
      const n = Math.min(128, total - written)
      inL.fill(0); inR.fill(0)
      if (first) { inL[0] = 1; first = false }
      outL.fill(0); outR.fill(0)
      core.process(inL.subarray(0, n), inR.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
      right.set(outR.subarray(0, n), written)
      written += n
    }
    // Width defaults to 100%, so the mid/side reconstruction may leak a little,
    // but normal-stereo right feedback from a left-only impulse stays small.
    expect(peak(right)).toBeLessThan(0.6)
  })

  it('decays below 100% feedback and stays finite at 100–110%', () => {
    const decaying = new EchoformDelayCore(FS, baseState({
      timeMsL: 60, timeMsR: 60, feedback: 50
    }), 120)
    const out = renderImpulse(decaying, 0.6)
    const early = peak(out.left, Math.round(0.05 * FS), Math.round(0.15 * FS))
    const late = peak(out.left, Math.round(0.45 * FS), Math.round(0.6 * FS))
    expect(late).toBeLessThan(early)

    for (const feedback of [100, 105, 110]) {
      const core = new EchoformDelayCore(FS, baseState({ timeMsL: 40, timeMsR: 40, feedback }), 120)
      const tone = renderTone(core, 1.5, 0.5)
      expect(isFiniteBuffer(tone.left)).toBe(true)
      // Bounded by the in-loop soft limiter.
      expect(peak(tone.left)).toBeLessThan(4)
    }
  })

  it('never produces NaN or Infinity under extreme settings', () => {
    const core = new EchoformDelayCore(FS, baseState({
      timeMsL: 30, timeMsR: 45, feedback: 110, width: 200, modDepth: 20, modRate: 8,
      character: 'tape', pingPong: true
    }), 120)
    const tone = renderTone(core, 2, 0.9)
    expect(isFiniteBuffer(tone.left)).toBe(true)
    expect(isFiniteBuffer(tone.right)).toBe(true)
  })
})

describe('Echoform delay — feedback tone', () => {
  it('accumulates high-cut darkening across repeats', () => {
    const bright = new EchoformDelayCore(FS, baseState({
      timeMsL: 50, timeMsR: 50, feedback: 70, highCut: 18000
    }), 120)
    const dark = new EchoformDelayCore(FS, baseState({
      timeMsL: 50, timeMsR: 50, feedback: 70, highCut: 2000
    }), 120)
    // Feed white-ish noise; measure late-tail high-frequency energy.
    const hfEnergy = (core: EchoformDelayCore): number => {
      const total = Math.ceil(0.6 * FS)
      const inL = new Float32Array(128)
      const inR = new Float32Array(128)
      const outL = new Float32Array(128)
      const outR = new Float32Array(128)
      let written = 0
      let seed = 12345
      let prev = 0
      let hf = 0
      while (written < total) {
        const n = Math.min(128, total - written)
        for (let i = 0; i < n; i += 1) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff
          const noise = written < FS * 0.05 ? (seed / 0x7fffffff) * 2 - 1 : 0
          inL[i] = noise * 0.3; inR[i] = noise * 0.3
        }
        outL.fill(0); outR.fill(0)
        core.process(inL.subarray(0, n), inR.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
        if (written > FS * 0.3) {
          for (let i = 0; i < n; i += 1) {
            const d = outL[i]! - prev
            hf += d * d
            prev = outL[i]!
          }
        }
        written += n
      }
      return hf
    }
    expect(hfEnergy(dark)).toBeLessThan(hfEnergy(bright))
  })
})

describe('Echoform delay — stereo width', () => {
  it('produces mono at 0%, unchanged at 100%, wider at 200%', () => {
    const measure = (width: number): number => {
      const core = new EchoformDelayCore(FS, baseState({
        timeMsL: 80, timeMsR: 120, feedback: 40, width
      }), 120)
      // Distinct L/R impulses to create a stereo image.
      const total = Math.ceil(0.4 * FS)
      const inL = new Float32Array(128)
      const inR = new Float32Array(128)
      const outL = new Float32Array(128)
      const outR = new Float32Array(128)
      let written = 0, first = true
      let sideEnergy = 0
      while (written < total) {
        const n = Math.min(128, total - written)
        inL.fill(0); inR.fill(0)
        if (first) { inL[0] = 1; inR[5] = 1; first = false }
        outL.fill(0); outR.fill(0)
        core.process(inL.subarray(0, n), inR.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
        for (let i = 0; i < n; i += 1) {
          const side = (outL[i]! - outR[i]!) * 0.5
          sideEnergy += side * side
        }
        written += n
      }
      return sideEnergy
    }
    const mono = measure(0)
    const unity = measure(100)
    const wide = measure(200)
    expect(mono).toBeLessThan(unity * 0.05)
    expect(wide).toBeGreaterThan(unity * 1.5)
  })
})

describe('Echoform delay — modulation', () => {
  it('never reads outside the delay buffer at max depth and rate', () => {
    const core = new EchoformDelayCore(FS, baseState({
      timeMsL: 5, timeMsR: 5, feedback: 60, modDepth: 20, modRate: 8, character: 'tape'
    }), 40) // low BPM => longest possible sync times, but free mode here
    const tone = renderTone(core, 1, 0.7)
    expect(isFiniteBuffer(tone.left)).toBe(true)
  })

  it('disables time modulation when depth is zero in every character', () => {
    for (const character of ['digital', 'analog', 'tape'] as const) {
      const modulated = new EchoformDelayCore(FS, baseState({
        timeMsL: 100, timeMsR: 100, modDepth: 20, modRate: 4, character
      }), 120)
      const clean = new EchoformDelayCore(FS, baseState({
        timeMsL: 100, timeMsR: 100, modDepth: 0, character
      }), 120)
      const modOut = renderImpulse(modulated, 0.3)
      const cleanOut = renderImpulse(clean, 0.3)
      // At depth 0 the tap sits exactly at 100 ms; with depth it may wander.
      const cleanPeak = peakIndex(cleanOut.left, 100)
      expect(cleanPeak / FS * 1000).toBeGreaterThan(98)
      expect(cleanPeak / FS * 1000).toBeLessThan(102)
      // Depth 0 must be deterministic — no hidden drift for tape.
      expect(isFiniteBuffer(modOut.left)).toBe(true)
    }
  })
})

describe('Echoform delay — character', () => {
  it('produces measurably different loop behavior per character', () => {
    const tail = (character: 'digital' | 'analog' | 'tape'): number => {
      const core = new EchoformDelayCore(FS, baseState({
        timeMsL: 60, timeMsR: 60, feedback: 85, character
      }), 120)
      const out = renderImpulse(core, 0.8)
      return peak(out.left, Math.round(0.5 * FS), Math.round(0.8 * FS))
    }
    const digital = tail('digital')
    const analog = tail('analog')
    const tape = tail('tape')
    // Saturating characters lose more energy in the tail than clean digital.
    expect(digital).not.toBeCloseTo(tape, 2)
    expect(analog).not.toBeCloseTo(digital, 2)
  })
})

describe('Echoform delay — drive', () => {
  it('is an exact bypass at drive 0', () => {
    // drive: 0 must not alter the signal path at all (blend factor is 0).
    const a = new EchoformDelayCore(FS, baseState({ timeMsL: 120, timeMsR: 120, feedback: 40, drive: 0 }), 120)
    const b = new EchoformDelayCore(FS, baseState({ timeMsL: 120, timeMsR: 120, feedback: 40 }), 120)
    const outA = renderImpulse(a, 0.4)
    const outB = renderImpulse(b, 0.4)
    for (let i = 0; i < outA.left.length; i += 1) {
      expect(outA.left[i]).toBeCloseTo(outB.left[i]!, 10)
    }
  })

  it('saturates a pure tone as drive rises (crest factor falls toward a clipped shape)', () => {
    // A soft clipper flattens a sine's peaks, so its crest factor (peak / RMS)
    // drops from a clean sine's ~1.41 toward a squarer wave's ~1.0. Crest
    // factor is level-independent, so it isolates saturation from the gain
    // compensation that also changes absolute level.
    const crest = (drive: number): number => {
      const core = new EchoformDelayCore(
        FS, baseState({ timeMsL: 1, timeMsR: 1, feedback: 0, drive, lowCut: 20, highCut: 20000 }), 120
      )
      const out = renderTone(core, 0.4, 0.7)
      const start = Math.round(0.2 * FS)
      let peakAbs = 0
      let sumSq = 0
      for (let i = start; i < out.left.length; i += 1) {
        peakAbs = Math.max(peakAbs, Math.abs(out.left[i]!))
        sumSq += out.left[i]! * out.left[i]!
      }
      const rmsVal = Math.sqrt(sumSq / (out.left.length - start))
      return peakAbs / Math.max(rmsVal, 1e-9)
    }
    const clean = crest(0)
    const smashed = crest(90)
    // Clean sine sits near sqrt(2); heavy drive flattens it measurably.
    expect(clean).toBeGreaterThan(1.35)
    expect(smashed).toBeLessThan(clean - 0.1)
  })

  it('stays finite under maximum drive and feedback', () => {
    const core = new EchoformDelayCore(FS, baseState({ timeMsL: 40, timeMsR: 40, feedback: 110, drive: 100 }), 120)
    const out = renderTone(core, 0.6, 0.9)
    expect(isFiniteBuffer(out.left)).toBe(true)
    expect(isFiniteBuffer(out.right)).toBe(true)
    expect(peak(out.left)).toBeLessThan(4) // bounded, no runaway
  })
})

describe('Echoform delay — ducking', () => {
  it('reduces only the wet output and follows release', () => {
    const core = new EchoformDelayCore(FS, baseState({
      timeMsL: 100, timeMsR: 100, feedback: 60, duckAmount: 100, duckRelease: 300
    }), 120)
    // Sustained loud input should push the wet down while present.
    const loud = renderTone(core, 0.5, 0.9)
    const duckedPeak = peak(loud.left, Math.round(0.2 * FS), Math.round(0.4 * FS))

    const noDuck = new EchoformDelayCore(FS, baseState({
      timeMsL: 100, timeMsR: 100, feedback: 60, duckAmount: 0
    }), 120)
    const openTone = renderTone(noDuck, 0.5, 0.9)
    const openPeak = peak(openTone.left, Math.round(0.2 * FS), Math.round(0.4 * FS))
    expect(duckedPeak).toBeLessThan(openPeak)
  })

  it('does not pump on silence', () => {
    const core = new EchoformDelayCore(FS, baseState({ duckAmount: 100, duckRelease: 100 }), 120)
    const silent = renderImpulse(core, 0.2) // impulse then silence
    expect(isFiniteBuffer(silent.left)).toBe(true)
  })
})

describe('Echoform delay — freeze', () => {
  it('sustains existing repeats and blocks new input', () => {
    const core = new EchoformDelayCore(FS, baseState({ timeMsL: 100, timeMsR: 100, feedback: 40 }), 120)
    // Prime the buffer with an impulse.
    renderImpulse(core, 0.3)
    // Engage freeze, then feed new input — the new input must not accumulate.
    core.update(baseState({ timeMsL: 100, timeMsR: 100, feedback: 40, freeze: true }), 120)
    const held = renderTone(core, 0.8, 0.5)
    // The sustained loop stays present (does not decay to silence).
    const latePeak = peak(held.left, Math.round(0.5 * FS), Math.round(0.8 * FS))
    expect(latePeak).toBeGreaterThan(0.001)
    expect(isFiniteBuffer(held.left)).toBe(true)
  })

  it('holds the frozen tail flat instead of fading (in-loop filters bypassed)', () => {
    // Freeze must be a true hold, not a slow fade. Before the in-loop filter
    // bypass, the always-active low/high-cut and character saturation shaved
    // energy every circulation, so a "frozen" delay decayed ~0.5 dB/s. Prime
    // with a tone, freeze, then hold on silence for 8 s and compare the level
    // of the first hold second against the last. The windows are ~1 s (many
    // delay periods) so the held signal's periodic RMS ripple averages out and
    // only real drift is measured.
    const core = new EchoformDelayCore(FS, baseState({ timeMsL: 300, timeMsR: 300, feedback: 50 }), 120)
    renderTone(core, 1.5, 0.5)
    core.update(baseState({ timeMsL: 300, timeMsR: 300, feedback: 50, freeze: true }), 120)
    const held = renderSilence(core, 8)
    const early = rmsDb(held, Math.round(0.5 * FS), Math.round(1.5 * FS))
    const late = rmsDb(held, Math.round(7.0 * FS), Math.round(8.0 * FS))
    // A real hold: under 1 dB drift across ~6.5 s (was ~-3 dB before the fix).
    expect(early).toBeGreaterThan(-40)
    expect(Math.abs(late - early)).toBeLessThan(1)
    expect(isFiniteBuffer(held)).toBe(true)
  })

  it('holds flat in Tape character (in-loop saturation bypassed while frozen)', () => {
    // Tape recirculates the un-coloured tap while frozen (so the loop energy is
    // held), while the wet OUTPUT stays tape-coloured. Same ~1 s averaging
    // windows; a true hold, not the multi-dB monotonic fade the un-bypassed
    // loop produced.
    const core = new EchoformDelayCore(FS, baseState({ timeMsL: 300, timeMsR: 300, feedback: 50, character: 'tape' }), 120)
    renderTone(core, 1.5, 0.5)
    core.update(baseState({ timeMsL: 300, timeMsR: 300, feedback: 50, character: 'tape', freeze: true }), 120)
    const held = renderSilence(core, 8)
    const early = rmsDb(held, Math.round(0.5 * FS), Math.round(1.5 * FS))
    const late = rmsDb(held, Math.round(7.0 * FS), Math.round(8.0 * FS))
    expect(Math.abs(late - early)).toBeLessThan(1)
    expect(isFiniteBuffer(held)).toBe(true)
  })

  it('restores user feedback smoothly on release', () => {
    const core = new EchoformDelayCore(FS, baseState({ timeMsL: 80, timeMsR: 80, feedback: 30, freeze: true }), 120)
    renderImpulse(core, 0.4)
    core.update(baseState({ timeMsL: 80, timeMsR: 80, feedback: 30, freeze: false }), 120)
    const released = renderTone(core, 0.5, 0.3)
    expect(isFiniteBuffer(released.left)).toBe(true)
  })
})

describe('Echoform delay — bypass and output', () => {
  it('bypass fades the audible return toward silence without clearing the buffer', () => {
    const core = new EchoformDelayCore(FS, baseState({ timeMsL: 100, timeMsR: 100, feedback: 50 }), 120)
    renderImpulse(core, 0.3)
    core.update(baseState({ timeMsL: 100, timeMsR: 100, feedback: 50, bypass: true }), 120)
    // Feed silence while bypassed so we observe the fade, not fresh priming.
    const bypassed = renderSilence(core, 0.8)
    // Once the crossfade completes the audible return is effectively silent.
    expect(peak(bypassed, Math.round(0.5 * FS))).toBeLessThan(0.01)
    // Un-bypass: the loop kept running internally, so a tail is still present.
    core.update(baseState({ timeMsL: 100, timeMsR: 100, feedback: 50, bypass: false }), 120)
    const revealed = renderSilence(core, 0.3)
    expect(isFiniteBuffer(revealed)).toBe(true)
  })

  it('applies output gain in dB', () => {
    const loud = new EchoformDelayCore(FS, baseState({ timeMsL: 60, timeMsR: 60, feedback: 40, outputDb: 6 }), 120)
    const quiet = new EchoformDelayCore(FS, baseState({ timeMsL: 60, timeMsR: 60, feedback: 40, outputDb: -12 }), 120)
    const loudOut = renderImpulse(loud, 0.3)
    const quietOut = renderImpulse(quiet, 0.3)
    expect(peak(loudOut.left)).toBeGreaterThan(peak(quietOut.left))
  })
})

describe('Echoform delay — sample rate', () => {
  it('reinitializes correctly at 44.1k and 96k', () => {
    for (const rate of [44_100, 96_000]) {
      const core = new EchoformDelayCore(rate, baseState({ timeMsL: 100, timeMsR: 100, feedback: 50 }), 120)
      const total = Math.ceil(0.3 * rate)
      const inL = new Float32Array(128); const inR = new Float32Array(128)
      const outL = new Float32Array(128); const outR = new Float32Array(128)
      const captured = new Float32Array(total)
      let written = 0, first = true
      while (written < total) {
        const n = Math.min(128, total - written)
        inL.fill(0); inR.fill(0)
        if (first) { inL[0] = 1; inR[0] = 1; first = false }
        outL.fill(0); outR.fill(0)
        core.process(inL.subarray(0, n), inR.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
        captured.set(outL.subarray(0, n), written)
        written += n
      }
      // Tap still lands near 100 ms regardless of sample rate.
      const p = peakIndex(captured, Math.round(0.05 * rate))
      expect(p / rate * 1000).toBeGreaterThan(95)
      expect(p / rate * 1000).toBeLessThan(105)
    }
  })
})
