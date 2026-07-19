// A mixer channel: a reusable GainNode -> StereoPannerNode chain that all voices
// routed through it share. Channels feed the engine's master bus.
//
// Engine boundary: pure TypeScript over the Web Audio API. No React, no DOM.

import { clamp } from '../lib/sample-utils'
import { RETURN_BUS_COUNT } from './return-effects'

export interface Channel {
  readonly index: number
  // The node a voice connects into. Audio flows: voice -> input -> pan -> output.
  readonly input: AudioNode
  // The last node in the channel strip (StereoPannerNode). The engine inserts
  // an AnalyserNode after this before connecting to the master bus.
  readonly output: AudioNode
  readonly gain: number
  readonly pan: number
  readonly sendOutputs: readonly GainNode[]
  setGain(value: number): void
  setPan(value: number): void
  setSend(index: number, value: number): void
  disconnect(): void
}

export function createChannel(context: BaseAudioContext, index: number): Channel {
  const gainNode = context.createGain()
  const panNode = context.createStereoPanner()
  const outputNode = context.createGain()
  // Sends are eager by design: every lane has a stable output for each fixed
  // Return bus, while AudioEngine defers connecting them until sends are used.
  const sendNodes = Array.from({ length: RETURN_BUS_COUNT }, () => context.createGain())

  gainNode.connect(panNode)
  panNode.connect(outputNode)
  for (const sendNode of sendNodes) outputNode.connect(sendNode)

  let gainValue = gainNode.gain.value
  let panValue = panNode.pan.value

  return {
    index,
    input: gainNode,
    output: outputNode,
    sendOutputs: sendNodes,

    get gain() {
      return gainValue
    },

    get pan() {
      return panValue
    },

    setGain(value: number): void {
      gainValue = clamp(value, 0, 1)
      gainNode.gain.value = gainValue
    },

    setPan(value: number): void {
      panValue = clamp(value, -1, 1)
      panNode.pan.value = panValue
    },

    setSend(index: number, value: number): void {
      if (index < 0 || index >= sendNodes.length) return
      sendNodes[index]!.gain.value = clamp(value, 0, 1)
    },

    disconnect(): void {
      gainNode.disconnect()
      panNode.disconnect()
      outputNode.disconnect()
      for (const sendNode of sendNodes) sendNode.disconnect()
    }
  }
}
