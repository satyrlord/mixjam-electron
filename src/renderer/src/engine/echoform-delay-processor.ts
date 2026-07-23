import echoformDelayProcessorUrl from './worklets/echoform-delay.worklet.ts?worker&url'
import {
  createReturnWorkletProcessor,
  prepareReturnWorklet,
  type WorkletFactory
} from './return-worklet-processor'
import type { EchoformDelayModule, ReturnModuleProcessor } from './return-effects'
import type { EchoformDelayState } from './echoform-delay-types'

const PROCESSOR_NAME = 'echoform-delay-processor'

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
    drive: module.drive,
    duckAmount: module.duckAmount,
    duckRelease: module.duckRelease,
    outputDb: module.outputDb,
    freeze: module.freeze,
    bypass: module.bypass
  }
}

/** Register the Echoform Delay worklet before a Return graph instantiates it. */
export function prepareEchoformDelayWorklet(context: BaseAudioContext): Promise<boolean> {
  return prepareReturnWorklet(context, PROCESSOR_NAME, echoformDelayProcessorUrl)
}

/** Create the worklet-backed black-box processor for the Echoform Delay module. */
export function createEchoformDelayProcessor(
  context: BaseAudioContext,
  module: EchoformDelayModule,
  bpm: number,
  createNode?: WorkletFactory
): ReturnModuleProcessor {
  return createReturnWorkletProcessor(context, module, bpm, {
    name: PROCESSOR_NAME,
    url: echoformDelayProcessorUrl,
    type: 'echoform-delay',
    tempoAware: true,
    toState
  }, createNode)
}
