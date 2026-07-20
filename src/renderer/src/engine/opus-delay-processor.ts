import opusDelayProcessorUrl from './worklets/opus-delay.worklet.ts?worker&url'
import type { OpusDelayModule, ReturnModuleProcessor } from './return-effects'
import type { OpusDelayState } from './opus-delay-types'

const PROCESSOR_NAME = 'opus-delay-processor'

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

function toState(module: OpusDelayModule): OpusDelayState {
  return {
    mode: module.mode,
    divisionL: module.divisionL,
    divisionR: module.divisionR,
    timeMsL: module.timeMsL,
    timeMsR: module.timeMsR,
    link: module.link,
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
    mix: module.mix,
    outputDb: module.outputDb,
    freeze: module.freeze,
    bypass: module.bypass
  }
}

/** Register the custom processor before a Return graph needs to instantiate it. */
export function prepareOpusDelayWorklet(context: BaseAudioContext): Promise<boolean> {
  if (readyContexts.has(context)) return Promise.resolve(true)
  const existing = registrations.get(context)
  if (existing) return existing
  const worklet = (context as AudioContext).audioWorklet
  if (!worklet?.addModule) return Promise.resolve(false)
  const registration = worklet.addModule(opusDelayProcessorUrl)
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

/** Create the worklet-backed black-box processor for the Opus Delay module. */
export function createOpusDelayProcessor(
  context: BaseAudioContext,
  module: OpusDelayModule,
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
      if (next.type !== 'opus-delay') return
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
