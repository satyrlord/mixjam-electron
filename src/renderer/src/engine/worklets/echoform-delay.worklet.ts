import { EchoformDelayCore } from '../echoform-delay-core'
import type { EchoformDelayState } from '../echoform-delay-types'
import { registerReturnWorklet } from './return-worklet-class'

type EchoformDelayWorkletMessage =
  | { type: 'state'; state: EchoformDelayState; bpm: number }
  | { type: 'reset' }

registerReturnWorklet<EchoformDelayState, EchoformDelayCore, { state?: EchoformDelayState; bpm?: number }>({
  name: 'echoform-delay-processor',
  // The delay tail is a host-graph concern: when the node is fully
  // disconnected there is nothing to ring, so output silence rather than
  // spinning the feedback loop on a synthetic silence buffer.
  processSilentInput: false,
  // BPM rides in processorOptions alongside state; default to 120 if absent.
  createCore: (sampleRate, state, options) => new EchoformDelayCore(sampleRate, state, options.bpm ?? 120),
  onMessage: (core, data) => {
    const message = data as EchoformDelayWorkletMessage
    if (message.type === 'state') core.update(message.state, message.bpm)
    else core.reset()
  }
})
