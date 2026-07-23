import { registerWorkletProcessor, type WorkletProcessorFactory } from './register-processor'

/**
 * Shared worklet-side shell for every Return effect.
 *
 * The input/output channel extraction, the stereo fallback (mono duplicated to
 * both sides), and the `port.onmessage` wiring are identical contract code
 * across effects. Each effect supplies only its core (built from the initial
 * processor state) and how it maps port messages onto that core. See spec-010
 * "Module Registration Contract".
 */

// The AudioWorklet globals are ambient inside a real AudioWorkletGlobalScope
// but absent from the TS lib and from tsx/node, so they are declared here once
// for every effect worklet that builds on this helper.
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: unknown)
}

/** AudioWorklet render quantum; inputs and outputs are always this long. */
const RENDER_QUANTUM = 128

/** The minimal DSP surface the shell drives every render quantum. */
export interface ReturnWorkletCore {
  process(inputL: Float32Array, inputR: Float32Array, outputL: Float32Array, outputR: Float32Array): void
}

export interface ReturnWorkletClassConfig<S, C extends ReturnWorkletCore, O = unknown> {
  /** Registered processor name (must match the host's `prepareReturnWorklet`). */
  readonly name: string
  /**
   * Build the effect core from the initial state and sample rate. `options` is
   * the raw `processorOptions` bag, so effects that ship extra construction
   * data (for example the delay's `bpm` sibling of `state`) can read it.
   */
  readonly createCore: (sampleRate: number, state: S, options: O) => C
  /** Apply a port message to the live core (state updates, momentary commands). */
  readonly onMessage: (core: C, message: unknown) => void
  /**
   * Silent-input policy. `true` (default) processes a silence buffer so a
   * ringing tail (delay repeats, reverb decay, Freeze) keeps sounding when the
   * upstream goes quiet. `false` writes silence and returns — for effects with
   * no self-sustaining tail.
   */
  readonly processSilentInput?: boolean
}

interface ProcessorOptions<O> {
  processorOptions?: O
}

/**
 * Register a Return effect's worklet processor from its config. Call once at
 * module scope in the effect's `*.worklet.ts` entry.
 */
export function registerReturnWorklet<S, C extends ReturnWorkletCore, O extends { state?: S } = { state?: S }>(
  config: ReturnWorkletClassConfig<S, C, O>
): void {
  const processSilentInput = config.processSilentInput ?? true

  function createProcessorClass() {
    class ReturnEffectProcessor extends AudioWorkletProcessor {
      private readonly core: C
      private readonly silence = new Float32Array(RENDER_QUANTUM)

      constructor(options?: ProcessorOptions<O>) {
        super(options)
        const processorOptions = options?.processorOptions
        const state = processorOptions?.state
        if (!state) throw new Error(`${config.name} worklet requires initial state`)
        this.core = config.createCore(sampleRate, state, processorOptions as O)
        this.port.onmessage = (event: MessageEvent) => config.onMessage(this.core, event.data)
      }

      process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        const output = outputs[0]
        if (!output || output.length === 0) return true
        const outputL = output[0]
        const outputR = output[1] ?? outputL
        if (!outputL || !outputR) return true

        const input = inputs[0]
        const hasInput = Boolean(input && input.length > 0 && input[0] && input[0].length > 0)
        if (!hasInput && !processSilentInput) {
          outputL.fill(0)
          outputR.fill(0)
          return true
        }
        const inputL = hasInput && input![0]!.length === outputL.length ? input![0]! : this.silence
        const inputR = hasInput && input![1] && input![1]!.length === outputL.length ? input![1]! : inputL
        this.core.process(inputL, inputR, outputL, outputR)
        return true
      }
    }

    return ReturnEffectProcessor
  }

  registerWorkletProcessor(config.name, createProcessorClass as WorkletProcessorFactory)
}
