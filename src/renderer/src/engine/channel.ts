// A mixer channel: a reusable GainNode -> StereoPannerNode chain that all voices
// routed through it share. Channels feed the engine's master bus.
//
// Engine boundary: pure TypeScript over the Web Audio API. No React, no DOM.

export interface Channel {
  readonly index: number
  // The node a voice connects into. Audio flows: voice -> input -> pan -> output.
  readonly input: AudioNode
  // The node that connects to the master bus.
  readonly output: AudioNode
  readonly gain: number
  readonly pan: number
  setGain(value: number): void
  setPan(value: number): void
  disconnect(): void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createChannel(context: BaseAudioContext, index: number): Channel {
  const gainNode = context.createGain()
  const panNode = context.createStereoPanner()

  gainNode.connect(panNode)

  let gainValue = gainNode.gain.value
  let panValue = panNode.pan.value

  return {
    index,
    input: gainNode,
    output: panNode,

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

    disconnect(): void {
      gainNode.disconnect()
      panNode.disconnect()
    }
  }
}
