import { OpusDelayCore } from '../opus-delay-core'
import type { OpusDelayState } from '../opus-delay-types'

declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: unknown)
}

interface ProcessorOptions {
  processorOptions?: {
    state?: OpusDelayState
    bpm?: number
  }
}

type OpusDelayWorkletMessage =
  | { type: 'state'; state: OpusDelayState; bpm: number }
  | { type: 'reset' }

class OpusDelayProcessor extends AudioWorkletProcessor {
  private readonly core: OpusDelayCore

  constructor(options?: ProcessorOptions) {
    super(options)
    const state = options?.processorOptions?.state
    if (!state) throw new Error('Opus Delay worklet requires initial state')
    this.core = new OpusDelayCore(sampleRate, state, options?.processorOptions?.bpm ?? 120)
    this.port.onmessage = (event: MessageEvent<OpusDelayWorkletMessage>) => {
      const message = event.data
      if (message.type === 'state') this.core.update(message.state, message.bpm)
      else this.core.reset()
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]
    if (!output || output.length === 0) return true
    const outputL = output[0]
    const outputR = output[1] ?? outputL
    if (!outputL || !outputR) return true
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      outputL.fill(0)
      outputR.fill(0)
      return true
    }
    const inputL = input[0]
    const inputR = input[1] ?? inputL
    this.core.process(inputL, inputR, outputL, outputR)
    return true
  }
}

registerProcessor('opus-delay-processor', OpusDelayProcessor)
