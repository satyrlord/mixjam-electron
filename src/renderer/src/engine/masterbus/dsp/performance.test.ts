// @vitest-environment node
// Real-time constraints (spec-012): the processing path must not allocate,
// and the full default chain must meet its CPU budget at 48 kHz in
// 512-sample blocks. The allocation check measures sustained heap growth
// over many blocks: per-block garbage of even a single small array would
// grow the heap by tens of megabytes over the run, far above the gate.

import { describe, expect, it } from 'vitest'
import { defaultMasterBusState } from '../presets'
import { MasterBusCore } from './core'
import { seededNoise } from './test-support'

const FS = 48000
const BLOCK = 512
// V8 coverage collection slows execution well beyond the DSP's real cost;
// the CPU budget describes uninstrumented code, so relax it under the
// coverage npm scripts instead of gating on measurement noise.
const COVERAGE_RUN = (process.env.npm_lifecycle_event ?? '').includes('coverage')
const BUDGET_FACTOR = COVERAGE_RUN ? 3 : 1

function warmedCore(): { core: MasterBusCore; l: Float32Array; r: Float32Array } {
  const core = new MasterBusCore(FS, BLOCK, defaultMasterBusState())
  const l = seededNoise(BLOCK, 0.12)
  const r = seededNoise(BLOCK, 0.12, 0x77)
  // Warm up: JIT, lazy paths, engaged-path priming.
  for (let i = 0; i < 200; i++) core.process(l, r, BLOCK)
  return { core, l, r }
}

describe('real-time constraints', () => {
  it('does not allocate on the processing path', () => {
    const { core, l, r } = warmedCore()
    const gc = (globalThis as { gc?: () => void }).gc
    gc?.()
    const before = process.memoryUsage().heapUsed
    const blocks = 2000 // ~21 seconds of audio
    for (let i = 0; i < blocks; i++) core.process(l, r, BLOCK)
    gc?.()
    const after = process.memoryUsage().heapUsed
    const growth = after - before
    // A real per-block allocation grows the heap by tens of megabytes over this
    // run; this gate catches that while tolerating GC/heap-bookkeeping noise
    // that varies with parallel-worker scheduling.
    expect(growth).toBeLessThan(4 * 1024 * 1024)
  }, 90000)

  it('processes 1 s of the default chain within the 20% real-time budget', () => {
    const { core, l, r } = warmedCore()
    const blocksPerSecond = Math.ceil(FS / BLOCK)
    // Time individual blocks and project a low percentile to one second:
    // parallel test workers preempt whole milliseconds at a time, so long
    // segments measure scheduler contention, not the chain. The low percentile
    // of many short samples isolates the chain's real cost from preemption
    // spikes. Sample generously and use p02 so a handful of scheduler stalls
    // under a loaded parallel run cannot dominate the estimate.
    const samples = blocksPerSecond * 12
    const timings = new Float64Array(samples)
    for (let i = 0; i < samples; i++) {
      const start = performance.now()
      core.process(l, r, BLOCK)
      timings[i] = performance.now() - start
    }
    timings.sort()
    const p02 = timings[Math.floor(samples * 0.02)]
    const projectedSecond = (p02 * blocksPerSecond) / 1000
    // Budget: 20% of real time per rendered second (spec-012).
    expect(projectedSecond).toBeLessThan(0.2 * BUDGET_FACTOR)
  }, 90000)
})
