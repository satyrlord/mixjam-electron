// @vitest-environment node
// The Return-effect worklet shell driven headlessly, the way Chromium's audio
// thread drives it: the worklet global surface is shimmed, the effect module
// registers its processor, and the class is stepped with Float32Array blocks.
//
// The disposal cases are the regression guard for the consecutive-project-load
// leak: `AudioEngine.replaceReturnBuses` rebuilds every Return processor on each
// project load, and a disconnected AudioWorkletNode that keeps returning `true`
// from process() stays in the render graph — the audio thread runs its DSP for
// the rest of the session and the node is never collected. Four loads meant four
// delays and four reverbs all rendering at once, which is what made playback
// choppy. Ending active processing is the only way to retire the node.

import { beforeAll, describe, expect, it } from 'vitest'
import { createDefaultAetherformReverbReturnModule } from '../return-effects'
import { WORKLET_DISPOSE } from './worklet-dispose-protocol'

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
  await import('./aetherform-reverb.worklet')
  Processor = captured[0]!
})

/** The serialized state the host sends: the module's audio fields, no identity. */
function reverbState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const module: Record<string, unknown> = { ...createDefaultAetherformReverbReturnModule('fx-1') }
  delete module.id
  delete module.type
  return { ...module, ...overrides }
}

function makeProcessor(): ProcessorLike {
  return new Processor({ processorOptions: { state: reverbState() } })
}

function step(processor: ProcessorLike, amplitude = 0.2): boolean {
  const inL = new Float32Array(128)
  const inR = new Float32Array(128)
  for (let i = 0; i < 128; i++) {
    inL[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / 48000)
    inR[i] = inL[i]
  }
  return processor.process([[inL, inR]], [[new Float32Array(128), new Float32Array(128)]])
}

function send(processor: ProcessorLike, data: unknown): void {
  processor.port.onmessage?.({ data })
}

describe('Return-effect worklet shell', () => {
  it('keeps processing until the host disposes it', () => {
    const processor = makeProcessor()
    for (let block = 0; block < 8; block++) expect(step(processor)).toBe(true)
  })

  it('ends active processing after a dispose message so the node is retired', () => {
    const processor = makeProcessor()
    expect(step(processor)).toBe(true)

    send(processor, WORKLET_DISPOSE)

    // `false` removes the node from the render graph: no more DSP, and the
    // node becomes collectible.
    expect(step(processor)).toBe(false)
    expect(step(processor)).toBe(false)
  })

  it('still routes ordinary state messages to the effect core', () => {
    const processor = makeProcessor()
    expect(() => send(processor, {
      type: 'state',
      state: reverbState({ decaySeconds: 6 })
    })).not.toThrow()
    expect(step(processor)).toBe(true)
  })
})
