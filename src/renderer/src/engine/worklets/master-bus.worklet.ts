// AudioWorklet entry for the Master Bus Strip (spec-012). A thin adapter:
// all DSP lives in the pure TypeScript core (engine/masterbus/dsp), which
// the node test suite drives directly. Bundled by Vite via `?worker&url`
// so the emitted asset is a self-contained same-origin ES module that
// satisfies the strict `worker-src 'self'` CSP (no blob: URLs).

import type { MasterBusParamId, ProcessorId } from '../masterbus/params'
import type { MasterBusState } from '../masterbus/presets'
import { defaultMasterBusState } from '../masterbus/presets'
import { MasterBusCore } from '../masterbus/dsp/core'
import { registerWorkletProcessor, type WorkletProcessorFactory } from './register-processor'

// AudioWorkletGlobalScope ambients (this file never runs on the UI thread).
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: unknown)
}

export type MasterBusWorkletMessage =
  | { type: 'param'; id: MasterBusParamId; value: number }
  | { type: 'topology'; order: ProcessorId[]; power: Record<ProcessorId, boolean> }
  | { type: 'state'; state: MasterBusState }
  | { type: 'reset' }
  | { type: 'meters'; enabled: boolean }

const QUANTUM = 128
// Meter snapshots at >= 30 Hz (spec-012 Metering and UI Data).
const SNAPSHOT_HZ = 30

interface ProcessorOptions {
  processorOptions?: { state?: MasterBusState; metersEnabled?: boolean }
}

function createMasterBusProcessor() {
  class MasterBusProcessor extends AudioWorkletProcessor {
    private readonly core: MasterBusCore
    private readonly blocksPerSnapshot: number
    private blockCounter = 0
    // Snapshots stream only while the Master tab is watching them. Off by
    // default so the audio thread never pays the 30 Hz postMessage +
    // allocation cost for meters nobody can see. Settable at construction
    // because a port message can race a short offline render.
    private metersEnabled: boolean

    constructor(options?: ProcessorOptions) {
      super(options)
      const state = options?.processorOptions?.state ?? defaultMasterBusState()
      this.metersEnabled = options?.processorOptions?.metersEnabled ?? false
      this.core = new MasterBusCore(sampleRate, QUANTUM, state)
      this.blocksPerSnapshot = Math.max(1, Math.floor(sampleRate / SNAPSHOT_HZ / QUANTUM))
      this.port.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data as MasterBusWorkletMessage)
      }
    }

    private handleMessage(message: MasterBusWorkletMessage): void {
      switch (message.type) {
        case 'param':
          this.core.setParam(message.id, message.value)
          break
        case 'topology':
          this.core.setTopology(message.order, message.power)
          break
        case 'state':
          this.core.snapState(message.state)
          break
        case 'reset':
          this.core.reset()
          break
        case 'meters':
          this.metersEnabled = message.enabled
          // Post promptly on enable so the strip shows live values without
          // waiting out a full snapshot period.
          if (message.enabled) this.blockCounter = this.blocksPerSnapshot
          break
      }
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const input = inputs[0]
      const output = outputs[0]
      if (!output || output.length === 0) return true
      const outL = output[0]
      const outR = output[1] ?? output[0]
      if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
        // Disconnected input: silence, but stay alive for reconnection.
        outL.fill(0)
        outR.fill(0)
      } else {
        outL.set(input[0])
        outR.set(input[1] ?? input[0])
        this.core.process(outL, outR, outL.length)
      }
      if (this.metersEnabled && ++this.blockCounter >= this.blocksPerSnapshot) {
        this.blockCounter = 0
        this.port.postMessage(this.core.meterSnapshot())
      }
      return true
    }
  }

  return MasterBusProcessor
}

registerWorkletProcessor('master-bus-processor', createMasterBusProcessor as WorkletProcessorFactory)
