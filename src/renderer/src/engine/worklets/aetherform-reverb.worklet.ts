import { AetherformReverbCore } from '../aetherform-reverb-core'
import type { AetherformReverbState } from '../aetherform-reverb-types'
import { registerReturnWorklet } from './return-worklet-class'
import type {
  AetherformReverbProcessorOptions,
  AetherformReverbWorkletMessage
} from '../return-effects/aetherform-reverb-protocol'

registerReturnWorklet<AetherformReverbState, AetherformReverbCore, AetherformReverbProcessorOptions>({
  name: 'aetherform-reverb-processor',
  // A silent or inactive upstream must not cut the tail: the network keeps
  // ringing after input stops, so process silence instead.
  processSilentInput: true,
  createCore: (sampleRate, state) => new AetherformReverbCore(sampleRate, state),
  onMessage: (core, data) => {
    const message = data as AetherformReverbWorkletMessage
    if (message.type === 'state') core.update(message.state)
    else if (message.type === 'clear-tail') core.clearTail()
    else core.reset()
  }
})
