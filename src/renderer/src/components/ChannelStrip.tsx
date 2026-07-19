import { nextPanCycle } from '../lib/sample-utils'
import { VerticalFader } from './VerticalControls'
import { RotaryControl, RotaryDial } from './RotaryField'
import { Tooltip } from './ui/Tooltip'

interface ChannelStripProps {
  laneId: string
  channelIndex: number
  label: string
  gain: number
  pan: number
  sends: readonly [number, number, number, number]
  sendModuleNames: readonly [string, string, string, string]
  muted?: boolean
  solo?: boolean
  levelDb: number
  peakDb: number
  selected?: boolean
  onSetGain: (channelIndex: number, gain: number) => void
  onSetPan: (channelIndex: number, pan: number) => void
  onSetSend: (channelIndex: number, sendIndex: number, value: number) => void
  onSelect: (laneId: string) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}

function panValueText(pan: number): string {
  const pct = Math.round(Math.abs(pan) * 100)
  if (pct === 0) return 'Center'
  return pan < 0 ? `${pct}% left` : `${pct}% right`
}

export default function ChannelStrip({
  laneId,
  channelIndex,
  label,
  gain,
  pan,
  sends,
  sendModuleNames,
  muted,
  levelDb,
  peakDb,
  selected = false,
  onSetGain,
  onSetPan,
  onSetSend,
  onSelect,
  onGestureStart,
  onGestureEnd
}: ChannelStripProps) {
  return (
    <div className={`mixer-channel-strip${muted ? ' mixer-channel-strip-muted' : ''}${selected ? ' mixer-channel-strip-selected' : ''}`}>
      <div className="mixer-channel-label">
        <Tooltip content={label}>
          <button type="button" className="mixer-channel-select" aria-pressed={selected} onClick={() => onSelect(laneId)}>
            <span>{label}</span>
          </button>
        </Tooltip>
      </div>

      <div className="mixer-channel-sends" role="group" aria-label={`${label} Sends`}>
        {[1, 2, 3, 4].map((slot) => {
          const index = slot - 1
          const value = sends[index] ?? 0
          const valueText = `${Math.round(value * 100)}%`
          return (
            <Tooltip key={slot} content={`${sendModuleNames[index] ?? 'Empty'}, Send ${slot}: ${valueText}`}>
              <span className="mixer-send-tooltip-trigger">
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

      <Tooltip content="EQ controls are not available">
        <div className="mixer-channel-eq" aria-label="EQ controls are not available">
          <button type="button" disabled tabIndex={-1} aria-label="EQ Power unavailable">EQ</button>
          <button type="button" disabled tabIndex={-1} aria-label="Treble unavailable">T</button>
          <button type="button" disabled tabIndex={-1} aria-label="Bass unavailable">B</button>
        </div>
      </Tooltip>

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
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
        onChange={(value) => onSetPan(channelIndex, value)}
        onContextMenu={(event) => {
          event.preventDefault()
          onSetPan(channelIndex, nextPanCycle(pan))
        }}
      >
        <RotaryDial
          className="mixer-pan-rotary"
          value={(pan + 1) / 2}
          defaultValue={0.5}
          mode="bipolar"
        />
      </RotaryControl>

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
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
        onChange={(value) => onSetGain(channelIndex, value / 100)}
      />
    </div>
  )
}
