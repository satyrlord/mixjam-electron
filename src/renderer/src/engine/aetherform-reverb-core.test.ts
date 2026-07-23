// @vitest-environment node
// Headless DSP unit tests for the Aetherform Reverb core. The core has no Web
// Audio dependency, so process() is driven directly with sample buffers.

import { describe, expect, it } from 'vitest'
import {
  AetherformReverbCore,
  aetherformLineSeconds,
  aetherformModDepthMs,
  aetherformRt60Gain,
  aetherformShimmerRatio,
  aetherformShimmerSend,
  aetherformSizeFactor
} from './aetherform-reverb-core'
import type { AetherformReverbState } from './aetherform-reverb-types'

const FS = 48_000

function baseState(overrides: Partial<AetherformReverbState> = {}): AetherformReverbState {
  return {
    spaceModel: 'chamber',
    preDelayMs: 0,
    decaySeconds: 1.2,
    sizePercent: 68,
    character: 'natural',
    drivePercent: 0,
    widthPercent: 100,
    lateBalancePercent: 100,
    lowCutHz: 20,
    highCutHz: 20000,
    diffusionPercent: 78,
    densityPercent: 84,
    earlyReflectionsEnabled: true,
    modRateHz: 0.05,
    modDepthPercent: 0,
    shimmerEnabled: false,
    shimmerAmountPercent: 0,
    shimmerIntervalSemitones: 12,
    duckAmountPercent: 0,
    duckReleaseMs: 200,
    outputDb: 0,
    freeze: false,
    bypass: false,
    ...overrides
  }
}

interface StereoRender { left: Float32Array; right: Float32Array }

/** Drive the core with a caller-provided input generator, block by block. */
function render(
  core: AetherformReverbCore,
  seconds: number,
  fill: (index: number) => number,
  sampleRate = FS,
  block = 128
): StereoRender {
  const total = Math.ceil(seconds * sampleRate)
  const left = new Float32Array(total)
  const right = new Float32Array(total)
  const inL = new Float32Array(block)
  const inR = new Float32Array(block)
  const outL = new Float32Array(block)
  const outR = new Float32Array(block)
  let written = 0
  while (written < total) {
    const n = Math.min(block, total - written)
    for (let i = 0; i < n; i += 1) {
      const value = fill(written + i)
      inL[i] = value
      inR[i] = value
    }
    outL.fill(0); outR.fill(0)
    core.process(inL.subarray(0, n), inR.subarray(0, n), outL.subarray(0, n), outR.subarray(0, n))
    left.set(outL.subarray(0, n), written)
    right.set(outR.subarray(0, n), written)
    written += n
  }
  return { left, right }
}

const impulse = (index: number): number => (index === 0 ? 1 : 0)
const silence = (): number => 0
const tone = (freq: number, amplitude = 0.5, sampleRate = FS) =>
  (index: number): number => amplitude * Math.sin((2 * Math.PI * freq * index) / sampleRate)

function renderImpulse(core: AetherformReverbCore, seconds: number, sampleRate = FS): StereoRender {
  return render(core, seconds, impulse, sampleRate)
}

function rms(buffer: Float32Array, from = 0, to = buffer.length): number {
  let sum = 0
  for (let i = from; i < to; i += 1) sum += buffer[i]! * buffer[i]!
  return Math.sqrt(sum / Math.max(1, to - from))
}

function rmsDb(buffer: Float32Array, from = 0, to = buffer.length): number {
  const value = rms(buffer, from, to)
  return value > 1e-12 ? 20 * Math.log10(value) : -240
}

function peak(buffer: Float32Array): number {
  let best = 0
  for (const value of buffer) {
    const abs = Math.abs(value)
    if (abs > best) best = abs
  }
  return best
}

function allFinite(buffer: Float32Array): boolean {
  for (const value of buffer) if (!Number.isFinite(value)) return false
  return true
}

/** Goertzel magnitude (amplitude of the sine component) at freq. */
function toneAmplitude(buffer: Float32Array, freq: number, from: number, to: number, sampleRate = FS): number {
  const w = (2 * Math.PI * freq) / sampleRate
  let re = 0
  let im = 0
  for (let i = from; i < to; i += 1) {
    re += buffer[i]! * Math.cos(w * (i - from))
    im += buffer[i]! * Math.sin(w * (i - from))
  }
  return (2 * Math.sqrt(re * re + im * im)) / (to - from)
}

/** Normalized cross-difference: 0 = identical, ~1 = unrelated. */
function diffRatio(a: Float32Array, b: Float32Array): number {
  let diff = 0
  let scale = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    diff += Math.abs(a[i]! - b[i]!)
    scale += Math.abs(a[i]!) + Math.abs(b[i]!)
  }
  return scale > 1e-9 ? diff / scale : 0
}

function onsetIndex(buffer: Float32Array, threshold = 1e-3): number {
  for (let i = 0; i < buffer.length; i += 1) {
    if (Math.abs(buffer[i]!) > threshold) return i
  }
  return -1
}

const at = (seconds: number, sampleRate = FS): number => Math.round(seconds * sampleRate)

describe('mapping helpers', () => {
  it('computes RT60 feedback gains targeting -60 dB after the decay time', () => {
    expect(aetherformRt60Gain(0.1, 2)).toBeCloseTo(10 ** (-0.3 / 2), 6)
    expect(aetherformRt60Gain(0.05, 30)).toBeCloseTo(10 ** (-0.15 / 30), 6)
    expect(aetherformRt60Gain(0.1, 0.2)).toBeCloseTo(10 ** -1.5, 6)
    // -60 dB after one circulation when the line time equals the decay.
    expect(aetherformRt60Gain(1, 1)).toBeCloseTo(0.001, 9)
  })

  it('computes shimmer pitch ratios as 2^(semitones/12)', () => {
    expect(aetherformShimmerRatio(7)).toBeCloseTo(2 ** (7 / 12), 6)
    expect(aetherformShimmerRatio(12)).toBeCloseTo(2, 9)
    expect(aetherformShimmerRatio(19)).toBeCloseTo(2 ** (19 / 12), 6)
    expect(aetherformShimmerRatio(24)).toBeCloseTo(4, 9)
  })

  it('maps size nonlinearly without collapsing small values', () => {
    expect(aetherformSizeFactor(100)).toBeCloseTo(1, 6)
    expect(aetherformSizeFactor(5)).toBeGreaterThan(0.2)
    expect(aetherformSizeFactor(50)).toBeGreaterThan(aetherformSizeFactor(20))
  })

  it('keeps modulation depth subtle through the first half of the range', () => {
    expect(aetherformModDepthMs(0)).toBe(0)
    expect(aetherformModDepthMs(50)).toBeLessThan(1.01)
    expect(aetherformModDepthMs(100)).toBeLessThanOrEqual(4)
  })

  it('maps shimmer amount nonlinearly with a bounded maximum send', () => {
    expect(aetherformShimmerSend(0)).toBe(0)
    expect(aetherformShimmerSend(50)).toBeLessThan(0.2)
    expect(aetherformShimmerSend(100)).toBeCloseTo(0.55, 6)
  })

  it('scales late line lengths with model and size without dropping below 5 ms', () => {
    expect(aetherformLineSeconds('hall', 100, 7)).toBeCloseTo(0.127, 4)
    expect(aetherformLineSeconds('plate', 5, 0)).toBeGreaterThanOrEqual(0.005)
    expect(aetherformLineSeconds('room', 68, 3)).toBeLessThan(aetherformLineSeconds('hall', 68, 3))
  })
})

describe('pre-delay', () => {
  it('shifts the early onset by the pre-delay time at 0, 120, and 250 ms', () => {
    const early = { lateBalancePercent: 0, spaceModel: 'room' as const }
    const zero = renderImpulse(new AetherformReverbCore(FS, baseState({ ...early, preDelayMs: 0 })), 0.5)
    const mid = renderImpulse(new AetherformReverbCore(FS, baseState({ ...early, preDelayMs: 120 })), 0.5)
    const max = renderImpulse(new AetherformReverbCore(FS, baseState({ ...early, preDelayMs: 250 })), 0.5)
    const zeroOnset = onsetIndex(zero.left)
    const midOnset = onsetIndex(mid.left)
    const maxOnset = onsetIndex(max.left)
    expect(zeroOnset).toBeGreaterThanOrEqual(0)
    expect(midOnset - zeroOnset).toBeGreaterThan(at(0.118))
    expect(midOnset - zeroOnset).toBeLessThan(at(0.123))
    expect(maxOnset - zeroOnset).toBeGreaterThan(at(0.248))
    expect(maxOnset - zeroOnset).toBeLessThan(at(0.253))
  })
})

describe('decay', () => {
  it('produces a midband tail decay in the neighborhood of the RT60 target', () => {
    const core = new AetherformReverbCore(FS, baseState({ decaySeconds: 1.2 }))
    const { left } = renderImpulse(core, 1.4)
    const dropDb = rmsDb(left, at(0.4), at(0.6)) - rmsDb(left, at(0.9), at(1.1))
    // Expected: 60 dB / 1.2 s * 0.5 s = 25 dB. Allow a wide diffuse-field band.
    expect(dropDb).toBeGreaterThan(12)
    expect(dropDb).toBeLessThan(38)
  })

  it('extends the tail as the decay target grows', () => {
    const short = renderImpulse(new AetherformReverbCore(FS, baseState({ decaySeconds: 0.4 })), 1.6)
    const long = renderImpulse(new AetherformReverbCore(FS, baseState({ decaySeconds: 6 })), 1.6)
    const shortDb = rmsDb(short.left, at(1.2), at(1.5))
    const longDb = rmsDb(long.left, at(1.2), at(1.5))
    expect(longDb - shortDb).toBeGreaterThan(20)
  })
})

describe('space models', () => {
  it('produces measurably different impulse responses per model', () => {
    const renderModel = (spaceModel: AetherformReverbState['spaceModel']): Float32Array =>
      renderImpulse(new AetherformReverbCore(FS, baseState({ spaceModel, lateBalancePercent: 60 })), 0.6).left
    const room = renderModel('room')
    const hall = renderModel('hall')
    const plate = renderModel('plate')
    const chamber = renderModel('chamber')
    const pairs: Array<[Float32Array, Float32Array]> = [
      [room, hall], [room, plate], [room, chamber], [hall, plate], [hall, chamber], [plate, chamber]
    ]
    for (const [a, b] of pairs) expect(diffRatio(a, b)).toBeGreaterThan(0.1)
  })

  it('stays finite and bounded across a live model change', () => {
    const core = new AetherformReverbCore(FS, baseState({ spaceModel: 'chamber' }))
    const first = render(core, 0.4, tone(220, 0.4))
    core.update(baseState({ spaceModel: 'hall' }))
    const second = render(core, 0.4, tone(220, 0.4))
    expect(allFinite(first.left)).toBe(true)
    expect(allFinite(second.left)).toBe(true)
    expect(peak(second.left)).toBeLessThan(4)
  })
})

describe('size', () => {
  it('changes reflection timing without changing the displayed decay target', () => {
    const small = renderImpulse(new AetherformReverbCore(FS, baseState({ sizePercent: 30 })), 1.4)
    const large = renderImpulse(new AetherformReverbCore(FS, baseState({ sizePercent: 95 })), 1.4)
    expect(diffRatio(small.left, large.left)).toBeGreaterThan(0.1)
    const drop = (buffer: Float32Array): number =>
      rmsDb(buffer, at(0.4), at(0.6)) - rmsDb(buffer, at(0.9), at(1.1))
    expect(Math.abs(drop(small.left) - drop(large.left))).toBeLessThan(10)
  })

  it('remains click-free when size changes while audio is running', () => {
    const core = new AetherformReverbCore(FS, baseState({ sizePercent: 20 }))
    render(core, 0.3, tone(330, 0.4))
    core.update(baseState({ sizePercent: 100 }))
    const after = render(core, 0.4, tone(330, 0.4))
    expect(allFinite(after.left)).toBe(true)
    expect(peak(after.left)).toBeLessThan(4)
  })
})

describe('early reflections', () => {
  it('silences the early path when disabled without touching the late tail', () => {
    const earlyOnly = renderImpulse(
      new AetherformReverbCore(FS, baseState({ lateBalancePercent: 0 })), 0.4)
    expect(rms(earlyOnly.left, 0, at(0.25))).toBeGreaterThan(1e-4)
    const earlyOff = renderImpulse(
      new AetherformReverbCore(FS, baseState({ lateBalancePercent: 0, earlyReflectionsEnabled: false })), 0.4)
    expect(rms(earlyOff.left)).toBeLessThan(1e-5)

    // Disabling early mid-flight keeps the running late tail alive.
    const core = new AetherformReverbCore(FS, baseState({ lateBalancePercent: 50, decaySeconds: 3 }))
    renderImpulse(core, 0.3)
    core.update(baseState({ lateBalancePercent: 50, decaySeconds: 3, earlyReflectionsEnabled: false }))
    const after = render(core, 0.4, silence)
    expect(rms(after.left, at(0.2), at(0.4))).toBeGreaterThan(1e-5)
  })
})

describe('early/late balance', () => {
  it('is early-only at 0, blended at 50, and late-only at 100', () => {
    const renderBalance = (lateBalancePercent: number): Float32Array =>
      renderImpulse(new AetherformReverbCore(FS, baseState({ lateBalancePercent, decaySeconds: 2.5 })), 1.0).left
    const earlyOnly = renderBalance(0)
    const blended = renderBalance(50)
    const lateOnly = renderBalance(100)
    // Early-only: essentially no energy left late in the buffer.
    expect(rmsDb(earlyOnly, at(0.6), at(0.9))).toBeLessThan(rmsDb(lateOnly, at(0.6), at(0.9)) - 20)
    // Blended: both the early window and the late window carry energy.
    expect(rms(blended, 0, at(0.1))).toBeGreaterThan(1e-5)
    expect(rms(blended, at(0.6), at(0.9))).toBeGreaterThan(1e-6)
  })
})

describe('texture', () => {
  it('diffusion changes the impulse-response structure', () => {
    const sparse = renderImpulse(new AetherformReverbCore(FS, baseState({ diffusionPercent: 5 })), 0.6)
    const smooth = renderImpulse(new AetherformReverbCore(FS, baseState({ diffusionPercent: 95 })), 0.6)
    expect(diffRatio(sparse.left, smooth.left)).toBeGreaterThan(0.12)
  })

  it('density changes buildup smoothly without topology instability', () => {
    const thin = renderImpulse(new AetherformReverbCore(FS, baseState({ densityPercent: 5 })), 0.6)
    const full = renderImpulse(new AetherformReverbCore(FS, baseState({ densityPercent: 100 })), 0.6)
    expect(diffRatio(thin.left, full.left)).toBeGreaterThan(0.08)

    const core = new AetherformReverbCore(FS, baseState({ densityPercent: 0 }))
    render(core, 0.3, tone(220, 0.4))
    core.update(baseState({ densityPercent: 100 }))
    const after = render(core, 0.3, tone(220, 0.4))
    expect(allFinite(after.left)).toBe(true)
    expect(peak(after.left)).toBeLessThan(4)
  })
})

describe('tone', () => {
  it('high-cut damping accumulates through the late tail', () => {
    const bright = renderImpulse(new AetherformReverbCore(FS, baseState({ decaySeconds: 3 })), 0.8)
    const dark = renderImpulse(
      new AetherformReverbCore(FS, baseState({ decaySeconds: 3, highCutHz: 3000 })), 0.8)
    const brightHf = toneAmplitude(bright.left, 6000, at(0.3), at(0.6))
    const darkHf = toneAmplitude(dark.left, 6000, at(0.3), at(0.6))
    expect(20 * Math.log10(brightHf / Math.max(darkHf, 1e-12))).toBeGreaterThan(12)
  })

  it('low-cut removes low content from the tail', () => {
    const full = renderImpulse(new AetherformReverbCore(FS, baseState({ decaySeconds: 3 })), 0.8)
    const thin = renderImpulse(
      new AetherformReverbCore(FS, baseState({ decaySeconds: 3, lowCutHz: 800 })), 0.8)
    const fullLow = toneAmplitude(full.left, 100, at(0.3), at(0.6))
    const thinLow = toneAmplitude(thin.left, 100, at(0.3), at(0.6))
    expect(20 * Math.log10(fullLow / Math.max(thinLow, 1e-12))).toBeGreaterThan(10)
  })
})

describe('character', () => {
  it('produces measurably different late behavior per character', () => {
    const renderCharacter = (character: AetherformReverbState['character']): Float32Array =>
      renderImpulse(new AetherformReverbCore(FS, baseState({ character, decaySeconds: 3 })), 0.8).left
    const natural = renderCharacter('natural')
    const vintage = renderCharacter('vintage')
    const bloom = renderCharacter('bloom')
    expect(diffRatio(natural, vintage)).toBeGreaterThan(0.08)
    expect(diffRatio(natural, bloom)).toBeGreaterThan(0.08)
    expect(diffRatio(vintage, bloom)).toBeGreaterThan(0.08)
    // Vintage darkens the tail relative to Natural.
    const naturalHf = toneAmplitude(natural, 8000, at(0.3), at(0.6))
    const vintageHf = toneAmplitude(vintage, 8000, at(0.3), at(0.6))
    expect(vintageHf).toBeLessThan(naturalHf)
  })

  it('stays finite and bounded across a live character change', () => {
    const core = new AetherformReverbCore(FS, baseState({ character: 'natural' }))
    render(core, 0.3, tone(220, 0.4))
    core.update(baseState({ character: 'bloom' }))
    const after = render(core, 0.4, tone(220, 0.4))
    expect(allFinite(after.left)).toBe(true)
    expect(peak(after.left)).toBeLessThan(4)
  })
})

describe('modulation', () => {
  it('is fully deterministic and produces no movement at zero depth', () => {
    const a = renderImpulse(new AetherformReverbCore(FS, baseState()), 0.6)
    const b = renderImpulse(new AetherformReverbCore(FS, baseState()), 0.6)
    expect(Array.from(a.left)).toEqual(Array.from(b.left))

    const modulated = renderImpulse(
      new AetherformReverbCore(FS, baseState({ modDepthPercent: 60, modRateHz: 2 })), 0.6)
    expect(diffRatio(a.left, modulated.left)).toBeGreaterThan(0.02)
  })

  it('remains deterministic with modulation and character wander active', () => {
    const state = baseState({ modDepthPercent: 45, modRateHz: 1.5, character: 'vintage' })
    const a = renderImpulse(new AetherformReverbCore(FS, state), 0.6)
    const b = renderImpulse(new AetherformReverbCore(FS, state), 0.6)
    expect(Array.from(a.left)).toEqual(Array.from(b.left))
  })

  it('never reads out of bounds at maximum modulation on the smallest space', () => {
    const core = new AetherformReverbCore(FS, baseState({
      spaceModel: 'plate', sizePercent: 5, modDepthPercent: 100, modRateHz: 3, decaySeconds: 8
    }))
    const out = render(core, 1.0, tone(440, 0.5))
    expect(allFinite(out.left)).toBe(true)
    expect(allFinite(out.right)).toBe(true)
    expect(peak(out.left)).toBeLessThan(4)
  })
})

describe('drive', () => {
  it('is an exact bypass at drive 0', () => {
    const a = renderImpulse(new AetherformReverbCore(FS, baseState({ decaySeconds: 2, drivePercent: 0 })), 0.5)
    const b = renderImpulse(new AetherformReverbCore(FS, baseState({ decaySeconds: 2 })), 0.5)
    for (let i = 0; i < a.left.length; i += 1) {
      expect(a.left[i]).toBeCloseTo(b.left[i]!, 10)
    }
  })

  it('measurably alters the driven signal vs clean (drive is active)', () => {
    // The saturation curve itself is proven by the shared crest-factor test in
    // the Echoform suite (both cores call the same driveInput). Here we only
    // confirm the reverb actually routes the input through it: a heavily driven
    // render must differ from the clean render by more than numerical noise.
    const base = { decaySeconds: 1.5, sizePercent: 40 } as const
    const clean = render(new AetherformReverbCore(FS, baseState({ ...base, drivePercent: 0 })), 0.5, tone(220, 0.8))
    const driven = render(new AetherformReverbCore(FS, baseState({ ...base, drivePercent: 80 })), 0.5, tone(220, 0.8))
    let diff = 0
    for (let i = at(0.1); i < clean.left.length; i += 1) diff += Math.abs(driven.left[i]! - clean.left[i]!)
    expect(diff / clean.left.length).toBeGreaterThan(1e-4)
  })

  it('stays finite under maximum drive and a long decay', () => {
    const core = new AetherformReverbCore(FS, baseState({ decaySeconds: 12, drivePercent: 100 }))
    const out = render(core, 0.8, tone(220, 0.9))
    expect(allFinite(out.left)).toBe(true)
    expect(allFinite(out.right)).toBe(true)
    expect(peak(out.left)).toBeLessThan(4)
  })
})

describe('stereo width', () => {
  it('collapses to mono at 0% and scales the side signal at 200%', () => {
    const mono = renderImpulse(new AetherformReverbCore(FS, baseState({ widthPercent: 0 })), 0.5)
    for (let i = 0; i < mono.left.length; i += 1) {
      expect(Math.abs(mono.left[i]! - mono.right[i]!)).toBeLessThan(1e-6)
    }
    const sideRms = ({ left, right }: StereoRender): number => {
      const side = new Float32Array(left.length)
      for (let i = 0; i < left.length; i += 1) side[i] = (left[i]! - right[i]!) * 0.5
      return rms(side)
    }
    const normal = renderImpulse(new AetherformReverbCore(FS, baseState({ widthPercent: 100 })), 0.5)
    const wide = renderImpulse(new AetherformReverbCore(FS, baseState({ widthPercent: 200 })), 0.5)
    const ratio = sideRms(wide) / Math.max(sideRms(normal), 1e-12)
    expect(ratio).toBeGreaterThan(1.5)
    expect(ratio).toBeLessThan(2.5)
    expect(allFinite(wide.left)).toBe(true)
  })
})

describe('ducking', () => {
  it('attenuates only while the dry input is hot', () => {
    const loud = tone(220, 0.5)
    const open = render(new AetherformReverbCore(FS, baseState({ decaySeconds: 3 })), 1.0, loud)
    const ducked = render(
      new AetherformReverbCore(FS, baseState({ decaySeconds: 3, duckAmountPercent: 100 })), 1.0, loud)
    const openRms = rms(open.left, at(0.5), at(1.0))
    const duckedRms = rms(ducked.left, at(0.5), at(1.0))
    expect(duckedRms / openRms).toBeLessThan(0.3)
  })

  it('recovers at the selected release time', () => {
    const burst = (index: number): number => (index < at(0.5) ? 0.5 * Math.sin((2 * Math.PI * 220 * index) / FS) : 0)
    const makeState = (duckReleaseMs: number): AetherformReverbState =>
      baseState({ decaySeconds: 4, duckAmountPercent: 100, duckReleaseMs })
    const fast = render(new AetherformReverbCore(FS, makeState(50)), 1.2, burst)
    const slow = render(new AetherformReverbCore(FS, makeState(2500)), 1.2, burst)
    const fastRms = rms(fast.left, at(0.8), at(1.0))
    const slowRms = rms(slow.left, at(0.8), at(1.0))
    // The fast release restores the wet tail well before the slow release does.
    expect(fastRms).toBeGreaterThan(slowRms * 1.5)
  })
})

describe('freeze', () => {
  it('holds the frozen tail flat over a long hold, not fading', () => {
    // Freeze must be a true hold. Before the in-loop filter bypass, the
    // always-active low/high-cut and vintage damping shaved energy every
    // circulation, so a "frozen" reverb decayed ~3 dB/s. Prime with a tone,
    // freeze, then hold on silence and confirm the level barely drifts between
    // the start and end of the hold. (30 s stability was verified separately;
    // 7 s keeps the permanent test fast while still spanning the settle.)
    const state = baseState({ decaySeconds: 3 })
    const core = new AetherformReverbCore(FS, state)
    render(core, 1.5, tone(220, 0.5))
    core.update({ ...state, freeze: true })
    const held = render(core, 7, silence)
    // ~1.5 s averaging windows so the held field's ripple cancels. The FDN
    // energy redistributes for the first ~2 s after freeze engages, so measure
    // the drift AFTER that settle (second 2-3.5 vs second 5.5-7).
    const startDb = rmsDb(held.left, at(2.0), at(3.5))
    const endDb = rmsDb(held.left, at(5.5), at(7.0))
    expect(startDb).toBeGreaterThan(-60)
    // A real hold: under ~2 dB drift across ~9 s (was a ~30 dB drop before fix).
    expect(Math.abs(endDb - startDb)).toBeLessThan(2)
    expect(allFinite(held.left)).toBe(true)
  })

  it('blocks new injection while frozen', () => {
    const state = baseState({ decaySeconds: 1.5 })
    const core = new AetherformReverbCore(FS, state)
    renderImpulse(core, 0.3)
    core.update({ ...state, freeze: true })
    const held = render(core, 2.0, silence)
    const start = rms(held.left, at(0.2), at(0.4))
    expect(start).toBeGreaterThan(1e-5)
    // New input while frozen must not grow the field.
    const fed = render(core, 1.0, tone(330, 0.5))
    expect(rms(fed.left, at(0.7), at(1.0))).toBeLessThan(start * 3)
    expect(allFinite(fed.left)).toBe(true)
  })

  it('restores decay-derived feedback smoothly on release', () => {
    const state = baseState({ decaySeconds: 0.5 })
    const core = new AetherformReverbCore(FS, state)
    renderImpulse(core, 0.3)
    core.update({ ...state, freeze: true })
    render(core, 0.5, silence)
    const heldRms = rms(render(core, 0.1, silence).left)
    core.update({ ...state, freeze: false })
    const released = render(core, 1.5, silence)
    expect(allFinite(released.left)).toBe(true)
    expect(rms(released.left, at(1.2), at(1.4))).toBeLessThan(Math.max(heldRms, 1e-9) * 0.2)
  })
})

describe('clear tail', () => {
  it('flushes all reverb history click-free without touching parameters', () => {
    const core = new AetherformReverbCore(FS, baseState({ decaySeconds: 6 }))
    renderImpulse(core, 0.4)
    core.clearTail()
    const cleared = render(core, 0.3, silence)
    expect(allFinite(cleared.left)).toBe(true)
    expect(rms(cleared.left, at(0.2), at(0.3))).toBeLessThan(1e-5)

    // Processing resumes normally after the flush.
    const again = renderImpulse(core, 0.4)
    expect(rms(again.left, at(0.05), at(0.3))).toBeGreaterThan(1e-5)
  })

  it('also flushes shimmer history', () => {
    const core = new AetherformReverbCore(FS, baseState({
      decaySeconds: 8, shimmerEnabled: true, shimmerAmountPercent: 100
    }))
    render(core, 0.8, tone(440, 0.5))
    core.clearTail()
    const cleared = render(core, 0.3, silence)
    expect(rms(cleared.left, at(0.2), at(0.3))).toBeLessThan(1e-5)
  })
})

describe('bypass', () => {
  it('mutes the return without clearing the tail', () => {
    const state = baseState({ decaySeconds: 4 })
    const core = new AetherformReverbCore(FS, state)
    renderImpulse(core, 0.3)
    core.update({ ...state, bypass: true })
    const muted = render(core, 0.4, silence)
    expect(rms(muted.left, at(0.3), at(0.4))).toBeLessThan(1e-5)
    core.update({ ...state, bypass: false })
    const restored = render(core, 0.4, silence)
    expect(rms(restored.left, at(0.2), at(0.4))).toBeGreaterThan(1e-6)
  })
})

describe('output level', () => {
  it('applies the standard dB conversion to the wet output', () => {
    const unity = renderImpulse(new AetherformReverbCore(FS, baseState()), 0.6)
    const trimmed = renderImpulse(new AetherformReverbCore(FS, baseState({ outputDb: -12 })), 0.6)
    const diffDb = rmsDb(unity.left, at(0.1), at(0.5)) - rmsDb(trimmed.left, at(0.1), at(0.5))
    expect(diffDb).toBeGreaterThan(10)
    expect(diffDb).toBeLessThan(14)
  })
})

describe('stability and safety', () => {
  it('survives the extreme corner: 30 s decay, max density/diffusion/width, +24 shimmer, freeze', () => {
    const state = baseState({
      decaySeconds: 30,
      diffusionPercent: 100,
      densityPercent: 100,
      widthPercent: 200,
      modDepthPercent: 100,
      modRateHz: 3,
      shimmerEnabled: true,
      shimmerAmountPercent: 100,
      shimmerIntervalSemitones: 24,
      duckAmountPercent: 0
    })
    const core = new AetherformReverbCore(FS, state)
    render(core, 1.0, tone(440, 0.6))
    core.update({ ...state, freeze: true })
    const frozen = render(core, 3.0, tone(330, 0.5))
    expect(allFinite(frozen.left)).toBe(true)
    expect(allFinite(frozen.right)).toBe(true)
    expect(peak(frozen.left)).toBeLessThan(8)
    expect(peak(frozen.right)).toBeLessThan(8)
  })

  it('ignores non-finite input samples', () => {
    const core = new AetherformReverbCore(FS, baseState())
    const inL = new Float32Array(128)
    const inR = new Float32Array(128)
    const outL = new Float32Array(128)
    const outR = new Float32Array(128)
    inL[0] = Number.NaN
    inL[1] = Number.POSITIVE_INFINITY
    inR[2] = Number.NEGATIVE_INFINITY
    core.process(inL, inR, outL, outR)
    expect(allFinite(outL)).toBe(true)
    expect(allFinite(outR)).toBe(true)
  })

  it('operates correctly at other sample rates', () => {
    const rate = 96_000
    const early = { lateBalancePercent: 0, spaceModel: 'room' as const }
    const zero = render(
      new AetherformReverbCore(rate, baseState({ ...early, preDelayMs: 0 })), 0.5, impulse, rate)
    const shifted = render(
      new AetherformReverbCore(rate, baseState({ ...early, preDelayMs: 100 })), 0.5, impulse, rate)
    const delta = onsetIndex(shifted.left) - onsetIndex(zero.left)
    expect(delta).toBeGreaterThan(at(0.098, rate))
    expect(delta).toBeLessThan(at(0.103, rate))
    expect(allFinite(shifted.left)).toBe(true)
  })

  it('supports reset back to the initial silent state', () => {
    const core = new AetherformReverbCore(FS, baseState({ decaySeconds: 8 }))
    renderImpulse(core, 0.3)
    core.reset()
    const after = render(core, 0.2, silence)
    expect(rms(after.left)).toBeLessThan(1e-6)
  })
})

describe('shimmer', () => {
  const shimmerState = (overrides: Partial<AetherformReverbState> = {}): AetherformReverbState =>
    baseState({
      decaySeconds: 5,
      shimmerEnabled: true,
      shimmerAmountPercent: 100,
      shimmerIntervalSemitones: 12,
      ...overrides
    })

  /** Feed a 440 Hz tone, then measure the ringing tail in silence. */
  function shimmerTail(state: AetherformReverbState): StereoRender {
    const core = new AetherformReverbCore(FS, state)
    render(core, 1.5, tone(440, 0.4))
    return render(core, 1.0, silence)
  }

  it('adds octave-shifted energy to the late tail at +12', () => {
    const withShimmer = shimmerTail(shimmerState())
    const withoutShimmer = shimmerTail(shimmerState({ shimmerEnabled: false }))
    const shifted = toneAmplitude(withShimmer.left, 880, at(0.2), at(0.8))
    const unshifted = toneAmplitude(withoutShimmer.left, 880, at(0.2), at(0.8))
    expect(shifted / Math.max(unshifted, 1e-12)).toBeGreaterThan(3)
    // The root, unshifted tail remains audible at 100% shimmer amount.
    const root = toneAmplitude(withShimmer.left, 440, at(0.2), at(0.8))
    expect(root).toBeGreaterThan(shifted * 0.1)
  })

  it('adds two-octave energy at +24', () => {
    const withShimmer = shimmerTail(shimmerState({ shimmerIntervalSemitones: 24 }))
    const withoutShimmer = shimmerTail(shimmerState({ shimmerEnabled: false }))
    const shifted = toneAmplitude(withShimmer.left, 1760, at(0.2), at(0.8))
    const unshifted = toneAmplitude(withoutShimmer.left, 1760, at(0.2), at(0.8))
    expect(shifted / Math.max(unshifted, 1e-12)).toBeGreaterThan(3)
  })

  it('contributes nothing at 0% amount or when disabled', () => {
    const zeroAmount = shimmerTail(shimmerState({ shimmerAmountPercent: 0 }))
    const disabled = shimmerTail(shimmerState({ shimmerEnabled: false, shimmerAmountPercent: 0 }))
    for (let i = 0; i < zeroAmount.left.length; i += 4) {
      expect(Math.abs(zeroAmount.left[i]! - disabled.left[i]!)).toBeLessThan(1e-5)
    }
  })

  it('does not pitch-shift the early reflections', () => {
    const earlyOnly = shimmerTail(shimmerState({ lateBalancePercent: 0 }))
    const earlyNoShimmer = shimmerTail(shimmerState({ lateBalancePercent: 0, shimmerEnabled: false }))
    const shifted = toneAmplitude(earlyOnly.left, 880, at(0.2), at(0.8))
    const reference = toneAmplitude(earlyNoShimmer.left, 880, at(0.2), at(0.8))
    expect(shifted).toBeLessThan(Math.max(reference, 1e-9) * 3 + 1e-9)
  })

  it('is click-free across enable, disable, and interval changes', () => {
    const core = new AetherformReverbCore(FS, shimmerState({ shimmerEnabled: false }))
    render(core, 0.4, tone(440, 0.4))
    core.update(shimmerState())
    const enabled = render(core, 0.4, tone(440, 0.4))
    core.update(shimmerState({ shimmerIntervalSemitones: 19 }))
    const retuned = render(core, 0.4, tone(440, 0.4))
    core.update(shimmerState({ shimmerEnabled: false }))
    const disabled = render(core, 0.4, tone(440, 0.4))
    for (const out of [enabled, retuned, disabled]) {
      expect(allFinite(out.left)).toBe(true)
      expect(peak(out.left)).toBeLessThan(4)
    }
  })

  it('band-limits high intervals so aliased energy stays below the root', () => {
    // 8 kHz shifted by +24 would land at 32 kHz and alias; the pre-shift
    // band-limit (~5.4 kHz at 48 kHz for 4x) must keep that energy small.
    const core = new AetherformReverbCore(FS, shimmerState({ shimmerIntervalSemitones: 24 }))
    render(core, 1.5, tone(8000, 0.4))
    const tail = render(core, 1.0, silence)
    const alias = toneAmplitude(tail.left, 16000, at(0.1), at(0.8))
    const root = toneAmplitude(tail.left, 8000, at(0.1), at(0.8))
    expect(alias).toBeLessThan(Math.max(root, 1e-9))
  })

  it('remains acceptable when summed to mono', () => {
    const out = shimmerTail(shimmerState())
    const mono = new Float32Array(out.left.length)
    for (let i = 0; i < mono.length; i += 1) mono[i] = (out.left[i]! + out.right[i]!) * 0.5
    const sidesAverage = (rms(out.left, at(0.1), at(0.8)) + rms(out.right, at(0.1), at(0.8))) / 2
    expect(rms(mono, at(0.1), at(0.8))).toBeGreaterThan(sidesAverage * 0.3)
  })

  it('stays bounded with a 30-second decay', () => {
    const core = new AetherformReverbCore(FS, shimmerState({ decaySeconds: 30 }))
    const out = render(core, 3.0, tone(440, 0.5))
    expect(allFinite(out.left)).toBe(true)
    expect(peak(out.left)).toBeLessThan(8)
  })
})
