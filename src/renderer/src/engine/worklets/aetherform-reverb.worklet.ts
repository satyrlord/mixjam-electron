import { AetherformReverbCore } from '../aetherform-reverb-core'
import type { AetherformReverbState } from '../aetherform-reverb-types'
import { registerReturnWorklet } from './return-worklet-class'

type AetherformReverbWorkletMessage =
  | { type: 'state'; state: AetherformReverbState }
  | { type: 'clear-tail' }
  | { type: 'reset' }

registerReturnWorklet<AetherformReverbState, AetherformReverbCore>({
  name: 'aetherform-reverb-processor',
  // A silent or inactive upstream must not cut the tail: the network keeps
  // ringing (and Freeze keeps sustaining), so process silence instead.
  processSilentInput: true,
  createCore: (sampleRate, state) => new AetherformReverbCore(sampleRate, state),
  onMessage: (core, data) => {
    const message = data as AetherformReverbWorkletMessage
    if (message.type === 'state') core.update(message.state)
    else if (message.type === 'clear-tail') core.clearTail()
    else core.reset()
  }
})
