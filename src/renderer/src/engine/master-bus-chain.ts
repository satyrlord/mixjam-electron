// Renderer-side controller for the Master Bus Strip worklet (spec-012).
// Owns registration, insertion into the master path, the message protocol
// to the DSP core, and the latest meter snapshot. If the worklet fails to
// load, the master path stays untouched (upstream feeds downstream
// directly) and meters report null — the strip degrades, playback never
// breaks.

import type { MasterBusMeterSnapshot } from './masterbus/dsp/core'
import type { MasterBusParamId, ProcessorId } from './masterbus/params'
import type { MasterBusState } from './masterbus/presets'
import { defaultMasterBusState } from './masterbus/presets'
import masterBusProcessorUrl from './worklets/master-bus.worklet.ts?worker&url'

const PROCESSOR_NAME = 'master-bus-processor'

type WorkletNodeFactory = (
  context: BaseAudioContext,
  name: string,
  options: AudioWorkletNodeOptions
) => AudioWorkletNode

export interface MasterBusChainOptions {
  processorUrl?: string
  createNode?: WorkletNodeFactory
  warn?: (message: string, cause?: unknown) => void
}

function defaultCreateNode(
  context: BaseAudioContext,
  name: string,
  options: AudioWorkletNodeOptions
): AudioWorkletNode {
  return new AudioWorkletNode(context, name, options)
}

function defaultWarn(message: string, cause?: unknown): void {
  console.warn(message, cause)
}

function isMeterSnapshot(value: unknown): value is MasterBusMeterSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as MasterBusMeterSnapshot).vuDb === 'number' &&
    typeof (value as MasterBusMeterSnapshot).latencySamples === 'number'
  )
}

function cloneState(state: MasterBusState): MasterBusState {
  return {
    order: [...state.order],
    power: { ...state.power },
    params: { ...state.params },
    preset: state.preset,
  }
}

export class MasterBusChain {
  private readonly processorUrl: string
  private readonly createNode: WorkletNodeFactory
  private readonly warn: (message: string, cause?: unknown) => void
  private initialization: Promise<boolean> | null = null
  private context: AudioContext | null = null
  private upstream: AudioNode | null = null
  private downstream: AudioNode | null = null
  private node: AudioWorkletNode | null = null
  private latest: MasterBusMeterSnapshot | null = null
  // The chain's current complete state; re-sent on (re)attachment so a
  // late worklet load cannot miss edits that happened before it was ready.
  private state: MasterBusState = defaultMasterBusState()
  private warned = false
  private closed = false

  constructor(options: MasterBusChainOptions = {}) {
    this.processorUrl = options.processorUrl ?? masterBusProcessorUrl
    this.createNode = options.createNode ?? defaultCreateNode
    this.warn = options.warn ?? defaultWarn
  }

  /** The post-chain node, or null while the strip is not in the path. */
  get output(): AudioNode | null {
    return this.node
  }

  initialize(context: AudioContext, upstream: AudioNode, downstream: AudioNode): Promise<boolean> {
    this.context = context
    this.upstream = upstream
    this.downstream = downstream
    if (this.initialization) return this.initialization
    if (!context.audioWorklet?.addModule) {
      this.initialization = Promise.resolve(false)
      return this.initialization
    }

    this.initialization = context.audioWorklet
      .addModule(this.processorUrl)
      .then(() => {
        if (this.closed) return false
        this.attachNode()
        return this.node !== null
      })
      .catch((cause: unknown) => {
        if (!this.warned) {
          this.warned = true
          this.warn('Master bus strip failed to load; audio passes through unprocessed.', cause)
        }
        return false
      })
    return this.initialization
  }

  applyState(state: MasterBusState): void {
    this.state = cloneState(state)
    this.node?.port.postMessage({ type: 'state', state: this.state })
  }

  /**
   * Applies a project snapshot with minimal messages: a topology message
   * when order or power changed (the worklet crossfades), and one param
   * message per changed value (the worklet smooths). Used by routine graph
   * reconciliation; project replacement uses applyState instead.
   */
  reconcile(state: MasterBusState): void {
    const current = this.state
    const orderChanged =
      state.order.length !== current.order.length ||
      state.order.some((id, index) => id !== current.order[index]) ||
      state.order.some((id) => state.power[id] !== current.power[id])
    if (orderChanged) this.setTopology(state.order, state.power)
    for (const key of Object.keys(state.params) as Array<keyof MasterBusState['params']>) {
      if (state.params[key] !== current.params[key]) this.setParam(key, state.params[key])
    }
    this.state.preset = state.preset
  }

  setParam(id: MasterBusParamId, value: number): void {
    this.state.params[id] = value
    this.state.preset = null
    this.node?.port.postMessage({ type: 'param', id, value })
  }

  setTopology(order: readonly ProcessorId[], power: Readonly<Record<ProcessorId, boolean>>): void {
    this.state.order = [...order]
    this.state.power = { ...power }
    this.node?.port.postMessage({ type: 'topology', order: this.state.order, power: this.state.power })
  }

  /** Latest meter snapshot; null until the worklet has produced one. */
  getMeterSnapshot(): MasterBusMeterSnapshot | null {
    return this.latest
  }

  close(): void {
    this.closed = true
    this.detachNode()
    this.context = null
    this.upstream = null
    this.downstream = null
  }

  private attachNode(): void {
    const { context, upstream, downstream } = this
    if (!context || !upstream || !downstream || this.node) return
    let node: AudioWorkletNode
    try {
      node = this.createNode(context, PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { state: this.state },
      })
    } catch (cause) {
      if (!this.warned) {
        this.warned = true
        this.warn('Master bus strip node could not be created; audio passes through unprocessed.', cause)
      }
      return
    }
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (isMeterSnapshot(event.data)) this.latest = event.data
    }
    this.node = node
    try {
      upstream.disconnect(downstream)
    } catch {
      // The direct route may not exist yet; insertion still proceeds.
    }
    upstream.connect(node)
    node.connect(downstream)
  }

  private detachNode(): void {
    const { upstream, downstream, node } = this
    if (!node) return
    node.port.onmessage = null
    node.port.close()
    try {
      upstream?.disconnect(node)
    } catch {
      // Already disconnected during teardown.
    }
    node.disconnect()
    // Restore the direct route so audio keeps flowing without the strip.
    if (upstream && downstream) {
      try {
        upstream.connect(downstream)
      } catch {
        // Context may already be closed.
      }
    }
    this.node = null
    this.latest = null
  }
}
