import aetherformReverbProcessorUrl from './worklets/aetherform-reverb.worklet.ts?worker&url'
import {
  createReturnWorkletProcessor,
  prepareReturnWorklet,
  type WorkletFactory
} from './return-worklet-processor'
import type { AetherformReverbModule, ReturnModuleProcessor } from './return-effects'
import type { AetherformReverbState } from './aetherform-reverb-types'

const PROCESSOR_NAME = 'aetherform-reverb-processor'

function toState(module: AetherformReverbModule): AetherformReverbState {
  return {
    spaceModel: module.spaceModel,
    preDelayMs: module.preDelayMs,
    decaySeconds: module.decaySeconds,
    sizePercent: module.sizePercent,
    character: module.character,
    drivePercent: module.drivePercent,
    widthPercent: module.widthPercent,
    lateBalancePercent: module.lateBalancePercent,
    lowCutHz: module.lowCutHz,
    highCutHz: module.highCutHz,
    diffusionPercent: module.diffusionPercent,
    densityPercent: module.densityPercent,
    earlyReflectionsEnabled: module.earlyReflectionsEnabled,
    modRateHz: module.modRateHz,
    modDepthPercent: module.modDepthPercent,
    shimmerEnabled: module.shimmerEnabled,
    shimmerAmountPercent: module.shimmerAmountPercent,
    shimmerIntervalSemitones: module.shimmerIntervalSemitones,
    duckAmountPercent: module.duckAmountPercent,
    duckReleaseMs: module.duckReleaseMs,
    outputDb: module.outputDb,
    freeze: module.freeze,
    bypass: module.bypass
  }
}

/** Register the Aetherform Reverb worklet before a Return graph instantiates it. */
export function prepareAetherformReverbWorklet(context: BaseAudioContext): Promise<boolean> {
  return prepareReturnWorklet(context, PROCESSOR_NAME, aetherformReverbProcessorUrl)
}

/** Create the worklet-backed black-box processor for the Aetherform Reverb module. */
export function createAetherformReverbProcessor(
  context: BaseAudioContext,
  module: AetherformReverbModule,
  createNode?: WorkletFactory
): ReturnModuleProcessor {
  // Reverb ignores tempo; pass a neutral BPM so the shared factory signature
  // stays uniform across effects.
  return createReturnWorkletProcessor(context, module, 120, {
    name: PROCESSOR_NAME,
    url: aetherformReverbProcessorUrl,
    type: 'aetherform-reverb',
    toState,
    commands: {
      clearTail: (port) => port.postMessage({ type: 'clear-tail' })
    }
  }, createNode)
}
