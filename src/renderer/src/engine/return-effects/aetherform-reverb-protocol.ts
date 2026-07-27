import type { AetherformReverbState } from '../aetherform-reverb-types'

export interface AetherformReverbProcessorOptions {
  state?: AetherformReverbState
}

export type AetherformReverbWorkletMessage =
  | { type: 'state'; state: AetherformReverbState }
  | { type: 'clear-tail' }
  | { type: 'reset' }

export const AETHERFORM_CLEAR_TAIL: AetherformReverbWorkletMessage = { type: 'clear-tail' }

export function aetherformReverbStateMessage(
  state: AetherformReverbState
): AetherformReverbWorkletMessage {
  return { type: 'state', state }
}
