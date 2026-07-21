// @vitest-environment node
// The AudioWorklet adapter driven headlessly: the worklet global surface
// is shimmed, the module registers its processor, and the class is driven
// with Float32Array blocks like Chromium's audio thread would.

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultMasterBusState } from '../masterbus/presets'
import type { MasterBusMeterSnapshot } from '../masterbus/dsp/core'

interface ProcessorLike {
  port: {
    postMessage: (value: unknown) => void
    onmessage: ((event: { data: unknown }) => void) | null
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}

type ProcessorCtor = new (options?: unknown) => ProcessorLike

let Processor: ProcessorCtor

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>
  const captured: ProcessorCtor[] = []
  g.registerProcessor = (_name: string, ctor: ProcessorCtor): void => {
    captured.push(ctor)
  }
  g.AudioWorkletProcessor = class {
    port = { postMessage: (): void => {}, onmessage: null }
  }
  g.sampleRate = 48000
  await import('./master-bus.worklet')
  Processor = captured[0]
})

function makeProcessor(
  state = defaultMasterBusState(),
  { meters = true }: { meters?: boolean } = {}
): { processor: ProcessorLike; snapshots: MasterBusMeterSnapshot[] } {
  const processor = new Processor({ processorOptions: { state, metersEnabled: meters } })
  const snapshots: MasterBusMeterSnapshot[] = []
  processor.port.postMessage = (value) => {
    snapshots.push(value as MasterBusMeterSnapshot)
  }
  return { processor, snapshots }
}

function runBlocks(processor: ProcessorLike, blocks: number, amplitude = 0.1): Float32Array {
  const inL = new Float32Array(128)
  const inR = new Float32Array(128)
  const outL = new Float32Array(128)
  const outR = new Float32Array(128)
  const tail = new Float32Array(128)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < 128; i++) {
      const t = (b * 128 + i) / 48000
      inL[i] = amplitude * Math.sin(2 * Math.PI * 997 * t)
      inR[i] = inL[i]
    }
    expect(processor.process([[inL, inR]], [[outL, outR]])).toBe(true)
    tail.set(outL)
  }
  return tail
}

describe('master-bus worklet adapter', () => {
  it('registers and processes audio through the chain', () => {
    const { processor, snapshots } = makeProcessor()
    const tail = runBlocks(processor, 40)
    // The default chain is engaged: output differs from silence.
    expect(tail.some((v) => v !== 0)).toBe(true)
    // Snapshots publish at ~30 Hz: 40 blocks (~107 ms) yields several.
    expect(snapshots.length).toBeGreaterThanOrEqual(2)
    expect(snapshots[0].latencySamples).toBeGreaterThan(0)
    expect(Number.isFinite(snapshots[0].vuDb)).toBe(true)
  })

  it('posts no snapshots until meters are enabled, and stops when disabled', () => {
    const { processor, snapshots } = makeProcessor(defaultMasterBusState(), { meters: false })
    runBlocks(processor, 40)
    expect(snapshots.length).toBe(0)

    processor.port.onmessage?.({ data: { type: 'meters', enabled: true } })
    runBlocks(processor, 40)
    expect(snapshots.length).toBeGreaterThanOrEqual(2)

    processor.port.onmessage?.({ data: { type: 'meters', enabled: false } })
    snapshots.length = 0
    runBlocks(processor, 40)
    expect(snapshots.length).toBe(0)
  })

  it('outputs silence and stays alive when the input is disconnected', () => {
    const { processor } = makeProcessor()
    const outL = new Float32Array(128)
    const outR = new Float32Array(128)
    outL.fill(0.5)
    expect(processor.process([], [[outL, outR]])).toBe(true)
    expect(outL.every((v) => v === 0)).toBe(true)
  })

  it('applies param, topology, state, and reset messages', () => {
    const { processor, snapshots } = makeProcessor()
    const post = (data: unknown): void => processor.port.onmessage?.({ data })
    post({ type: 'param', id: 'gain.trim', value: 12 })
    const state = defaultMasterBusState()
    state.power.lim = false
    post({ type: 'topology', order: state.order, power: state.power })
    runBlocks(processor, 40)
    const afterTopology = snapshots[snapshots.length - 1]
    // Limiter bypassed: reported latency drops by the 120-sample lookahead.
    expect(afterTopology.latencySamples).toBe(42 * 3 + 31)

    const bypassAll = defaultMasterBusState()
    for (const id of Object.keys(bypassAll.power)) bypassAll.power[id as keyof typeof bypassAll.power] = false
    post({ type: 'state', state: bypassAll })
    post({ type: 'reset' })
    snapshots.length = 0
    runBlocks(processor, 40)
    expect(snapshots[snapshots.length - 1].latencySamples).toBe(0)
  })

  // Vite's `?worker&url` query only resolves a URL, but toolchains that ignore
  // it (tsx, plain node) import this module for real. The AudioWorklet globals
  // are absent there and an `extends` clause runs at load time, so the module
  // must stay inert instead of throwing.
  it('is inert when imported outside an AudioWorklet global scope', async () => {
    const g = globalThis as Record<string, unknown>
    const savedBase = g.AudioWorkletProcessor
    const savedRegister = g.registerProcessor
    let registered = 0
    g.registerProcessor = (): void => { registered += 1 }
    delete g.AudioWorkletProcessor

    try {
      vi.resetModules()
      await expect(import('./master-bus.worklet')).resolves.toBeDefined()
      expect(registered).toBe(0)
    } finally {
      g.AudioWorkletProcessor = savedBase
      g.registerProcessor = savedRegister
      vi.resetModules()
    }
  })
})
