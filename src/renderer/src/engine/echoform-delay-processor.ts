import echoformDelayProcessorUrl from './worklets/echoform-delay.worklet.ts?worker&url'
import type { EchoformDelayModule, ReturnModuleProcessor } from './return-effects'
import type { EchoformDelayState } from './echoform-delay-types'

const PROCESSOR_NAME = 'echoform-delay-processor'

type WorkletFactory = (
  context: BaseAudioContext,
  name: string,
  options: AudioWorkletNodeOptions
) => AudioWorkletNode

const readyContexts = new WeakSet<BaseAudioContext>()
const registrations = new WeakMap<BaseAudioContext, Promise<boolean>>()

function defaultCreateNode(
  context: BaseAudioContext,
  name: string,
  options: AudioWorkletNodeOptions
): AudioWorkletNode {
  return new AudioWorkletNode(context, name, options)
}

function toState(module: EchoformDelayModule): EchoformDelayState {
  return {
    mode: module.mode,
    divisionL: module.divisionL,
    divisionR: module.divisionR,
    timeMsL: module.timeMsL,
    timeMsR: module.timeMsR,
    feedback: module.feedback,
    pingPong: module.pingPong,
    width: module.width,
    lowCut: module.lowCut,
    highCut: module.highCut,
    modRate: module.modRate,
    modDepth: module.modDepth,
    character: module.character,
    duckAmount: module.duckAmount,
    duckRelease: module.duckRelease,
    outputDb: module.outputDb,
    freeze: module.freeze,
    bypass: module.bypass
  }
}

/** Register the custom processor before a Return graph needs to instantiate it. */
export function prepareEchoformDelayWorklet(context: BaseAudioContext): Promise<boolean> {
  if (readyContexts.has(context)) return Promise.resolve(true)
  const existing = registrations.get(context)
  if (existing) return existing
  const worklet = (context as AudioContext).audioWorklet
  if (!worklet?.addModule) return Promise.resolve(false)
  const registration = worklet.addModule(echoformDelayProcessorUrl)
    .then(() => {
      readyContexts.add(context)
      return true
    })
    .catch(() => false)
  registrations.set(context, registration)
  return registration
}

function disconnect(node: AudioNode): void {
  try { node.disconnect() } catch { /* already disconnected */ }
}

function createIdentityFallback(
  input: GainNode,
  output: GainNode
): ReturnModuleProcessor {
  input.connect(output)
  return {
    input,
    output,
    update(): void {},
    dispose(): void {
      disconnect(input)
      disconnect(output)
    }
  }
}

/** Create the worklet-backed black-box processor for the Echoform Delay module. */
export function createEchoformDelayProcessor(
  context: BaseAudioContext,
  module: EchoformDelayModule,
  bpm: number,
  createNode: WorkletFactory = defaultCreateNode
): ReturnModuleProcessor {
  const input = context.createGain()
  const output = context.createGain()
  if (!readyContexts.has(context)) return createIdentityFallback(input, output)

  let node: AudioWorkletNode
  try {
    node = createNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { state: toState(module), bpm }
    })
  } catch {
    return createIdentityFallback(input, output)
  }

  input.connect(node)
  node.connect(output)
  return {
    input,
    output,
    update(next, nextBpm): void {
      if (next.type !== 'echoform-delay') return
      node.port.postMessage({ type: 'state', state: toState(next), bpm: nextBpm })
    },
    dispose(): void {
      disconnect(input)
      disconnect(node)
      disconnect(output)
      node.port.close()
    }
  }
}
