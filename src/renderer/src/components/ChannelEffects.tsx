import type { EffectSlot } from '../engine/effects'

interface ChannelEffectsProps {
  channelIndex: number
  effects: readonly EffectSlot[]
  onOpen: (channelIndex: number) => void
}

/** Compact entry point only; the complete chain editor lives in the FX dock. */
export default function ChannelEffects({ channelIndex, effects, onOpen }: ChannelEffectsProps) {
  const allBypassed = effects.length > 0 && effects.every((effect) => effect.bypassed)
  return (
    <button
      type="button"
      className={`channel-fx-button${allBypassed ? ' channel-fx-button-bypassed' : ''}`}
      aria-label={`Open channel ${channelIndex + 1} effects, ${effects.length} of 4 used`}
      onClick={() => onOpen(channelIndex)}
    >
      <span>FX</span>
      <span className="channel-fx-count" aria-hidden="true">{effects.length}</span>
    </button>
  )
}
