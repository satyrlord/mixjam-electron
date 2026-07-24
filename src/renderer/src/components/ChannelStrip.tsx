import type { CSSProperties } from 'react'
import type { ReadableStore } from '../lib/value-store'
import { VerticalFader } from './VerticalControls'
import { RotaryControl, RotaryDial } from './RotaryField'
import { Tooltip } from './ui/Tooltip'

/** RMS level and peak-hold in dBFS for one channel's meter. */
export interface ChannelMeterValue {
  levelDb: number
  peakDb: number
}

interface ChannelStripProps {
  laneId: string
  channelIndex: number
  label: string
  gain: number
  sends: readonly [number, number, number, number]
  sendModuleNames: readonly [string, string, string, string]
  muted?: boolean
  meterStore: ReadableStore<ChannelMeterValue>
  selected?: boolean
  onSetGain: (channelIndex: number, gain: number) => void
  onSetSend: (channelIndex: number, sendIndex: number, value: number) => void
  onSelect: (laneId: string) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}

/** Fader-position readout in dB, e.g. 80% -> "-2 dB"; 0% -> "-inf dB" glyph. */
function gainDbText(gain: number): string {
  if (gain <= 0) return '−∞ dB'
  return `${Math.round(20 * Math.log10(gain))} dB`
}

function slotAccentStyle(slot: number): CSSProperties {
  return { '--fx-slot-accent': `var(--fx-accent-${slot}, var(--accent))` } as CSSProperties
}

export default function ChannelStrip({
  laneId,
  channelIndex,
  label,
  gain,
  sends,
  sendModuleNames,
  muted,
  meterStore,
  selected = false,
  onSetGain,
  onSetSend,
  onSelect,
  onGestureStart,
  onGestureEnd
}: ChannelStripProps) {
  const channelNumber = String(channelIndex + 1).padStart(2, '0')
  const channelLabel = `${label}, channel ${channelIndex + 1}`
  return (
    <div className={`mixer-channel-strip${muted ? ' mixer-channel-strip-muted' : ''}${selected ? ' mixer-channel-strip-selected' : ''}`}>
      <Tooltip content={`${label} · Channel ${channelIndex + 1}`}>
        <button
          type="button"
          className="mixer-channel-select"
          aria-label={channelLabel}
          aria-pressed={selected}
          onClick={() => onSelect(laneId)}
        >
          <span aria-hidden="true">{channelNumber}</span>
        </button>
      </Tooltip>

      <div className="mixer-channel-sends" role="group" aria-label={`${label} Sends`}>
        {[1, 2, 3, 4].map((slot) => {
          const index = slot - 1
          const value = sends[index] ?? 0
          const valueText = `${Math.round(value * 100)}%`
          return (
            <Tooltip key={slot} content={`${sendModuleNames[index] ?? 'Empty'}, Send ${slot}: ${valueText}`}>
              <span className="mixer-send-tooltip-trigger" style={slotAccentStyle(slot)}>
                <RotaryControl
                  className="mixer-send-control"
                  label={`${label} Send ${slot}`}
                  value={value}
                  min={0}
                  max={1}
                  step={0.01}
                  valueText={valueText}
                  defaultValue={0}
                  ariaMultiplier={100}
                  onGestureStart={onGestureStart}
                  onGestureEnd={onGestureEnd}
                  onChange={(next) => onSetSend(channelIndex, index, next)}
                >
                  <RotaryDial className="mixer-compact-rotary" value={value} />
                  <span className="mixer-send-label" aria-hidden="true">{slot}</span>
                </RotaryControl>
              </span>
            </Tooltip>
          )
        })}
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
        meterStore={meterStore}
        meterPosition="side"
        showDragValue
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
        onChange={(value) => onSetGain(channelIndex, value / 100)}
      />

      <span className="mixer-channel-db">{gainDbText(gain)}</span>
    </div>
  )
}
