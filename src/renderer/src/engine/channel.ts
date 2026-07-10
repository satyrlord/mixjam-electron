// A mixer channel: a reusable GainNode -> StereoPannerNode chain that all voices
// routed through it share. Channels feed the engine's master bus.
//
// Engine boundary: pure TypeScript over the Web Audio API. No React, no DOM.

import { clamp } from '../lib/sample-utils'
import { createEffectProcessor, type EffectProcessor, type EffectSlot } from './effects'

function hasSameValues(left: EffectSlot, right: EffectSlot): boolean {
  const leftValues = left as unknown as Record<string, unknown>
  const rightValues = right as unknown as Record<string, unknown>
  const keys = Object.keys(leftValues)
  return keys.length === Object.keys(rightValues).length &&
    keys.every((key) => leftValues[key] === rightValues[key])
}

export interface Channel {
  readonly index: number
  // The node a voice connects into. Audio flows: voice -> input -> pan -> output.
  readonly input: AudioNode
  // The last node in the channel strip (StereoPannerNode). The engine inserts
  // an AnalyserNode after this before connecting to the master bus.
  readonly output: AudioNode
  readonly gain: number
  readonly pan: number
  readonly effects: readonly EffectSlot[]
  setGain(value: number): void
  setPan(value: number): void
  setEffects(effects: readonly EffectSlot[], bpm: number): void
  /** Update tempo-dependent processor parameters (e.g. delay time) without
   *  rebuilding the effect chain. No-op when no effects are tempo-synced. */
  setBpm(bpm: number): void
  disconnect(): void
}

export function createChannel(context: BaseAudioContext, index: number): Channel {
  const gainNode = context.createGain()
  const panNode = context.createStereoPanner()
  const outputNode = context.createGain()

  gainNode.connect(panNode)
  panNode.connect(outputNode)

  let gainValue = gainNode.gain.value
  let panValue = panNode.pan.value
  let effectState: readonly EffectSlot[] = []
  let processors: EffectProcessor[] = []

  return {
    index,
    input: gainNode,
    output: outputNode,

    get gain() {
      return gainValue
    },

    get pan() {
      return panValue
    },

    get effects() {
      return effectState
    },

    setGain(value: number): void {
      gainValue = clamp(value, 0, 1)
      gainNode.gain.value = gainValue
    },

    setPan(value: number): void {
      panValue = clamp(value, -1, 1)
      panNode.pan.value = panValue
    },

    setEffects(effects: readonly EffectSlot[], bpm: number): void {
      // When the effect chain structure is unchanged, update parameters in
      // place. Ping-pong changes a delay from one delay line to a dual-delay
      // stereo graph, so it is structural rather than a live parameter.
      const structureMatches = effectState.length === effects.length &&
        effectState.every((effect, index) => {
          const next = effects[index]!
          if (effect.id !== next.id || effect.type !== next.type || effect.bypassed !== next.bypassed) return false
          return effect.type !== 'delay' || (next.type === 'delay' && effect.pingPong === next.pingPong)
        })
      const canUpdateInPlace = structureMatches && effectState.every((effect, index) =>
        hasSameValues(effect, effects[index]!) || processors[index]?.updateParams !== undefined
      )
      if (canUpdateInPlace) {
        for (let i = 0; i < processors.length; i++) {
          processors[i]?.updateParams?.(effects[i]!, bpm)
        }
        effectState = effects.map((effect) => ({ ...effect }))
        return
      }
      panNode.disconnect()
      for (const processor of processors) processor.dispose()
      processors = effects.map((effect) => createEffectProcessor(context, effect, bpm))
      let tail: AudioNode = panNode
      for (const processor of processors) {
        tail.connect(processor.input)
        tail = processor.output
      }
      tail.connect(outputNode)
      effectState = effects.map((effect) => ({ ...effect }))
    },

    setBpm(bpm: number): void {
      for (let i = 0; i < processors.length; i++) {
        const effect = effectState[i]
        if (effect) processors[i]?.updateParams?.(effect, bpm)
      }
    },

    disconnect(): void {
      gainNode.disconnect()
      panNode.disconnect()
      for (const processor of processors) processor.dispose()
      outputNode.disconnect()
    }
  }
}
