import { nextPanCycle } from '../lib/sample-utils'
import ChannelEffects from './ChannelEffects'
import type { EffectSlot } from '../engine/effects'
import { VerticalFader } from './VerticalControls'
import { RotaryControl } from './RotaryField'

interface ChannelStripProps {
  channelIndex: number
  label: string
  gain: number
  pan: number
  muted: boolean
  solo: boolean
  levelDb: number
  peakDb: number
  effects: EffectSlot[]
  selected?: boolean
  onSetGain: (channelIndex: number, gain: number) => void
  onSetPan: (channelIndex: number, pan: number) => void
  onToggleMute: (channelIndex: number) => void
  onToggleSolo: (channelIndex: number) => void
  onRemove: (channelIndex: number) => void
  onSelect?: (channelIndex: number) => void
  onOpenEffects?: (channelIndex: number) => void
}

function panValueText(pan: number): string {
  const pct = Math.round(Math.abs(pan) * 100)
  if (pct === 0) return 'Center'
  return pan < 0 ? `${pct}% left` : `${pct}% right`
}

export default function ChannelStrip({
  channelIndex,
  label,
  gain,
  pan,
  muted,
  solo,
  levelDb,
  peakDb,
  effects,
  selected = false,
  onSetGain,
  onSetPan,
  onToggleMute,
  onToggleSolo,
  onRemove,
  onSelect = () => undefined,
  onOpenEffects = () => undefined
}: ChannelStripProps) {
  return (
    <div className={`mixer-channel-strip${muted ? ' mixer-channel-strip-muted' : ''}${selected ? ' mixer-channel-strip-selected' : ''}`}>
      <div className="mixer-channel-label">
        <span>{label}</span>
        <button type="button" className="mixer-channel-select" aria-label={`Select channel ${channelIndex + 1}`} aria-pressed={selected} onClick={() => onSelect(channelIndex)} />
        <button
          type="button"
          className="mixer-channel-remove"
          aria-label={`Remove channel ${channelIndex + 1}`}
          onClick={() => onRemove(channelIndex)}
        >
          ×
        </button>
      </div>

      <VerticalFader
        className="mixer-channel-vol-wrap"
        inputClassName="mixer-channel-vol"
        readoutClassName="mixer-channel-vol-readout"
        unityClassName="mixer-channel-unity-tick"
        meterFillClassName="mixer-channel-meter-fill"
        meterPeakClassName="mixer-channel-meter-peak"
        ariaLabel={`Channel ${channelIndex + 1} Volume`}
        value={Math.round(gain * 100)}
        min={0}
        max={100}
        step={1}
        valueText={`${Math.round(gain * 100)}%`}
        unityValue={100}
        meterDb={levelDb}
        peakDb={peakDb}
        showDragValue
        onChange={(value) => onSetGain(channelIndex, value / 100)}
      />

      <RotaryControl
        className="mixer-channel-pan"
        label={`Channel ${channelIndex + 1} Pan`}
        value={pan}
        min={-1}
        max={1}
        step={0.05}
        valueText={panValueText(pan)}
        defaultValue={0}
        homeValue={0}
        dragAxis="horizontal"
        style={{ '--pan-angle': `${pan * 135}deg` } as React.CSSProperties}
        onChange={(value) => onSetPan(channelIndex, value)}
        onContextMenu={(event) => {
          event.preventDefault()
          onSetPan(channelIndex, nextPanCycle(pan))
        }}
      />

      <div className="mixer-channel-buttons">
        <button
          type="button"
          className={`mixer-channel-m ${muted ? 'mixer-channel-m-active' : ''}`}
          aria-label={`Mute channel ${channelIndex + 1}`}
          aria-pressed={muted}
          onClick={() => onToggleMute(channelIndex)}
        >
          M
        </button>
        <button
          type="button"
          className={`mixer-channel-s ${solo ? 'mixer-channel-s-active' : ''}`}
          aria-label={`Solo channel ${channelIndex + 1}`}
          aria-pressed={solo}
          onClick={() => onToggleSolo(channelIndex)}
        >
          S
        </button>
      </div>
      <ChannelEffects
        channelIndex={channelIndex}
        effects={effects}
        onOpen={onOpenEffects}
      />
    </div>
  )
}
