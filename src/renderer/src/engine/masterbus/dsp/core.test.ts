// @vitest-environment node
// MasterBusCore integration: parameter smoothing (no zipper), click-free
// topology crossfades under a reorder/bypass storm, NaN fault isolation,
// latency reporting, meter snapshots, and preset state application.

import { describe, expect, it } from 'vitest'
import type { ProcessorId } from '../params'
import { DEFAULT_PROCESSOR_ORDER } from '../params'
import { applyPreset, defaultMasterBusState } from '../presets'
import { MasterBusCore } from './core'
import { OVERSAMPLE_2X_LATENCY, OVERSAMPLE_4X_LATENCY } from './oversampler'
import { maxSlewDb, seededNoise, sine } from './test-support'

const FS = 48000
const BLOCK = 128

function makeCore(state = defaultMasterBusState()): MasterBusCore {
  return new MasterBusCore(FS, BLOCK, state)
}

function runBlocks(core: MasterBusCore, l: Float32Array, r: Float32Array, onBlock?: (blockIndex: number) => void): void {
  for (let start = 0, b = 0; start + BLOCK <= l.length; start += BLOCK, b++) {
    onBlock?.(b)
    core.process(l.subarray(start, start + BLOCK), r.subarray(start, start + BLOCK), BLOCK)
  }
}

function musicLike(seconds: number): Float32Array {
  const n = Math.round(seconds * FS)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / FS
    out[i] =
      0.14 * Math.sin(2 * Math.PI * 60 * t) +
      0.09 * Math.sin(2 * Math.PI * 251 * t) +
      0.07 * Math.sin(2 * Math.PI * 1187 * t) +
      0.04 * Math.sin(2 * Math.PI * 4903 * t)
  }
  return out
}

describe('MasterBusCore', () => {
  it('reports the default chain latency as the sum of engaged stages', () => {
    const core = makeCore()
    expect(core.latencySamples).toBe(OVERSAMPLE_4X_LATENCY * 3 + OVERSAMPLE_2X_LATENCY + 120)
  })

  it('drops reported latency when a stage is bypassed (after the fade)', () => {
    const core = makeCore()
    const state = defaultMasterBusState()
    state.power.lim = false
    core.setTopology(state.order, state.power)
    const silence = new Float32Array(FS)
    runBlocks(core, silence, new Float32Array(FS))
    expect(core.latencySamples).toBe(OVERSAMPLE_4X_LATENCY * 3 + OVERSAMPLE_2X_LATENCY)
  })

  it('coalesces topology changes arriving during a fade', () => {
    const core = makeCore()
    const first = defaultMasterBusState()
    first.power.lim = false
    core.setTopology(first.order, first.power)
    const second = defaultMasterBusState()
    second.power.lim = false
    second.power.tape = false
    core.setTopology(second.order, second.power)
    const silence = new Float32Array(FS)
    runBlocks(core, silence, new Float32Array(FS))
    expect(core.latencySamples).toBe(OVERSAMPLE_4X_LATENCY * 3)
  })

  it('smooths a full-range trim jump without zipper steps', () => {
    const state = defaultMasterBusState()
    // Isolate the gain stage: bypass everything else.
    for (const id of DEFAULT_PROCESSOR_ORDER) state.power[id] = id === 'gain'
    const core = makeCore(state)
    core.snapState(state)
    const input = sine(30, 1, 0.25)
    const l = Float32Array.from(input)
    const r = Float32Array.from(input)
    let jumped = false
    runBlocks(core, l, r, (b) => {
      if (b === 100 && !jumped) {
        jumped = true
        core.setParam('gain.trim', 24)
      }
    })
    // Signal slew at 30 Hz/0.25 amp is ~0.001/sample; a hard x15.8 gain
    // step would slew ~3.7. The 20 ms smoother must keep steps tiny.
    const jumpRegion = 100 * BLOCK
    const slew = maxSlewDb(l, jumpRegion, jumpRegion + FS / 2)
    expect(slew).toBeLessThan(20 * Math.log10(0.03))
    // And the gain must actually arrive.
    let peak = 0
    for (let i = l.length - 4800; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]))
    expect(peak).toBeGreaterThan(0.25 * 10)
  })

  it('keeps a reorder and bypass storm free of clicks', { timeout: 90000 }, () => {
    const program = musicLike(6)
    const reference = makeCore()
    const refL = Float32Array.from(program)
    const refR = Float32Array.from(program)
    runBlocks(reference, refL, refR)
    const settle = FS
    const referenceSlew = maxSlewDb(refL, settle)

    const core = makeCore()
    const l = Float32Array.from(program)
    const r = Float32Array.from(program)
    const order: ProcessorId[] = [...DEFAULT_PROCESSOR_ORDER]
    const power = { ...defaultMasterBusState().power }
    let step = 0
    runBlocks(core, l, r, (b) => {
      if (b < 400 || b % 40 !== 0) return
      step++
      if (step % 3 === 0) {
        // Swap two adjacent processors.
        const i = step % (order.length - 1)
        const tmp = order[i]
        order[i] = order[i + 1]
        order[i + 1] = tmp
      } else {
        // Toggle a processor's power.
        const id = order[step % order.length]
        power[id] = !power[id]
      }
      core.setTopology(order, power)
    })
    const stormSlew = maxSlewDb(l, settle)
    // Crossfading two decorrelated chain outputs can at most sum their
    // slews (+6 dB over one chain), plus a margin for the level difference
    // between topologies. A hard switch would step near full scale
    // (~-1 dBFS, 14+ dB above the reference slew); the gate sits well
    // below that.
    expect(stormSlew).toBeLessThan(referenceSlew + 8)
    expect(stormSlew).toBeLessThan(-6)
  })

  it('isolates a NaN-poisoned block instead of taking down the bus', () => {
    const core = makeCore()
    const l = seededNoise(FS / 2, 0.2)
    const r = seededNoise(FS / 2, 0.2, 0x99)
    l[1000] = Number.NaN
    r[2000] = Number.POSITIVE_INFINITY
    runBlocks(core, l, r)
    for (let i = 0; i < l.length - (l.length % BLOCK); i++) {
      expect(Number.isFinite(l[i])).toBe(true)
      expect(Number.isFinite(r[i])).toBe(true)
    }
    expect(core.meterSnapshot().faultCount).toBeGreaterThan(0)
  })

  it('publishes VU, peak lamps, and GR in the meter snapshot', { timeout: 90000 }, () => {
    const core = makeCore()
    const amplitude = Math.pow(10, -18 / 20) * Math.SQRT2
    const input = sine(997, 2, amplitude)
    runBlocks(core, Float32Array.from(input), Float32Array.from(input))
    const snap = core.meterSnapshot()
    expect(Math.abs(snap.vuDb - -18)).toBeLessThan(1.5)
    expect(snap.peakL).toBe(false)
    expect(snap.limGrDb).toBeGreaterThanOrEqual(0)
    expect(snap.latencySamples).toBe(core.latencySamples)
  })

  it('snapState applies a preset without fading', () => {
    const core = makeCore()
    const bypassed = applyPreset('Bypass All', [...DEFAULT_PROCESSOR_ORDER])
    core.snapState(bypassed)
    expect(core.latencySamples).toBe(0)
    const input = sine(997, 0.25, 0.4)
    const l = Float32Array.from(input)
    const r = Float32Array.from(input)
    runBlocks(core, l, r)
    const end = Math.floor(l.length / BLOCK) * BLOCK
    for (let i = 0; i < end; i++) {
      expect(l[i]).toBe(input[i])
    }
  })
})
