import type { EchoformDelayState } from '../echoform-delay-types'

export interface EchoformDelayProcessorOptions {
  state?: EchoformDelayState
  bpm?: number
}

export type EchoformDelayWorkletMessage =
  | { type: 'state'; state: EchoformDelayState; bpm: number }
  | { type: 'reset' }

export function echoformDelayStateMessage(
  state: EchoformDelayState,
  bpm: number
): EchoformDelayWorkletMessage {
  return { type: 'state', state, bpm }
}
