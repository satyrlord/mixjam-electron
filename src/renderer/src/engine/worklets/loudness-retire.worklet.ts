// Gives the bundled loudness-worklet processor the same "retire on dispose"
// contract every MixJam-owned worklet has (see worklet-dispose-protocol.ts).
//
// The vendored processor returns true from process() forever and defines no
// reset message, so MasterMeter can only clear its accumulators by building a
// new node. Without a way to end the old node's active processing, every
// replacement stays in the render graph for the rest of the session, holding
// its momentary/short-term energy ring buffers (~1.3 MB per instance at
// 48 kHz stereo). MasterMeter.reset() runs on every seek, every play-from-stop,
// and every project load, so that is an unbounded leak.
//
// This module is added to the worklet scope immediately before the vendor
// module and wraps the single registration it makes. Vendor code is untouched,
// so upgrading the package needs no re-patching.

import { isWorkletDisposeMessage } from './worklet-dispose-protocol'

const VENDOR_PROCESSOR_NAME = 'loudness-processor'

interface ProcessorLike {
  readonly port: MessagePort
  process(...args: unknown[]): boolean
}

type ProcessorConstructor = new (options?: unknown) => ProcessorLike
type RegisterProcessor = (name: string, processorCtor: ProcessorConstructor) => void

const scope = globalThis as typeof globalThis & {
  registerProcessor?: RegisterProcessor
}

const register = scope.registerProcessor
// Absent outside a real AudioWorkletGlobalScope (tsx, node, unit tests), where
// there is nothing to wrap.
if (register) {
  scope.registerProcessor = function registerRetirableProcessor(
    name: string,
    processorCtor: ProcessorConstructor
  ): void {
    if (name !== VENDOR_PROCESSOR_NAME) {
      register.call(scope, name, processorCtor)
      return
    }
    // One-shot: restore the original so MixJam's own worklets, which already
    // implement the contract, register unwrapped.
    scope.registerProcessor = register

    class RetirableLoudnessProcessor extends processorCtor {
      private retired = false

      constructor(options?: unknown) {
        super(options)
        // The vendor processor never reads its port, so this handler is free.
        this.port.onmessage = (event: MessageEvent): void => {
          if (isWorkletDisposeMessage(event.data)) this.retired = true
        }
      }

      process(...args: unknown[]): boolean {
        if (this.retired) return false
        return super.process(...args)
      }
    }

    register.call(scope, name, RetirableLoudnessProcessor)
  }
}
