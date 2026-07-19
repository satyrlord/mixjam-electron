import type { LaneState } from '../lib/arrangement'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import { RETURN_BUS_COUNT } from '../engine/return-effects'
import ChannelStrip from './ChannelStrip'
import MixerFxSlot from './MixerFxSlot'
import { RotaryControl } from './RotaryField'
import { Tooltip } from './ui/Tooltip'

interface MixerColumnProps {
  lanes: LaneState[]
  returnBuses: readonly [PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot]
  channelLevels: ReadonlyMap<number, number>
  channelPeaks: ReadonlyMap<number, number>
  selectedLaneId: string | null
  onSetChannelGain: (channelIndex: number, gain: number) => void
  onSetChannelPan: (channelIndex: number, pan: number) => void
  onSetChannelSend: (channelIndex: number, sendIndex: number, value: number) => void
  onSelectLane: (laneId: string) => void
  onGestureStart: () => void
  onGestureEnd: () => void
  onSetReturnBus: (bus: PlaybackReturnSnapshot) => void
  onPreviewReturnBus: (bus: PlaybackReturnSnapshot) => void
}

function returnModuleName(bus: PlaybackReturnSnapshot): string {
  return bus.module.type === 'delay' ? 'Delay' : 'Empty'
}

const LIMITER_TOOLTIP = 'Limiter\nCaps this FX Return at −1 dBFS using stereo-linked peak limiting. Enabled by default. Click to bypass. This does not limit the Master output.'

/** Full-width, horizontally scrollable Mixer workspace derived from lanes. */
export default function MixerColumn({
  lanes,
  returnBuses,
  channelLevels,
  channelPeaks,
  selectedLaneId,
  onSetChannelGain,
  onSetChannelPan,
  onSetChannelSend,
  onSelectLane,
  onGestureStart,
  onGestureEnd,
  onSetReturnBus,
  onPreviewReturnBus
}: MixerColumnProps) {
  return (
    <div className="mixer-column mixer-column-scroll">
      <div className="mixer-column-head">
        <h2 className="tracker-zone-title mixer-column-title">Mixer</h2>
      </div>
      <div
        className="mixer-strips"
        role="region"
        aria-label="Mixer channels and returns"
        tabIndex={0}
        onWheel={(event) => {
          if (!event.shiftKey || event.deltaY === 0) return
          event.preventDefault()
          event.currentTarget.scrollLeft += event.deltaY
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          event.currentTarget.scrollLeft += event.key === 'ArrowLeft' ? -80 : 80
        }}
      >
        <div className="mixer-strips-row">
          {lanes.map((lane) => {
            return (
              <ChannelStrip
                key={lane.id}
                laneId={lane.id}
                channelIndex={lane.index}
                label={lane.name}
                gain={lane.gain}
                pan={lane.pan}
                sends={lane.sends}
                sendModuleNames={[
                  returnModuleName(returnBuses[0]),
                  returnModuleName(returnBuses[1]),
                  returnModuleName(returnBuses[2]),
                  returnModuleName(returnBuses[3])
                ]}
                muted={lane.muted}
                solo={lane.solo}
                levelDb={channelLevels.get(lane.index) ?? -100}
                peakDb={channelPeaks.get(lane.index) ?? -100}
                selected={selectedLaneId === lane.id}
                onSetGain={onSetChannelGain}
                onSetPan={onSetChannelPan}
                onSetSend={onSetChannelSend}
                onSelect={onSelectLane}
                onGestureStart={onGestureStart}
                onGestureEnd={onGestureEnd}
              />
            )
          })}
          <ReturnSection
            buses={returnBuses}
            onSet={onSetReturnBus}
            onGestureStart={onGestureStart}
            onGestureEnd={onGestureEnd}
          />
          <section className="mixer-fx-grid" aria-label="FX slots">
            {Array.from({ length: RETURN_BUS_COUNT }, (_, index) => (
              <MixerFxSlot
                key={index}
                slot={index + 1}
                bus={returnBuses[index]!}
                onSet={onSetReturnBus}
                onPreview={onPreviewReturnBus}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}

function ReturnSection({
  buses,
  onSet,
  onGestureStart,
  onGestureEnd
}: {
  buses: readonly [PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot]
  onSet: (bus: PlaybackReturnSnapshot) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}) {
  return (
    <section className="mixer-return-section" aria-label="FX Returns">
      <h3>RETURN</h3>
      {Array.from({ length: RETURN_BUS_COUNT }, (_, index) => {
        const slot = index + 1
        const bus = buses[index]!
        const returnLevel = bus.returnLevel
        const moduleName = returnModuleName(bus)
        return (
          <div className="mixer-return-row" key={slot}>
            <span>{slot}</span>
            <Tooltip content={`${moduleName}, Return ${slot}: ${Math.round(returnLevel * 100)}%`}>
              <span className="mixer-return-level-wrap">
                <RotaryControl
                  className="mixer-return-level"
                  label={`FX Return ${slot} level`}
                  value={returnLevel}
                  min={0}
                  max={1}
                  step={0.01}
                  valueText={`${Math.round(returnLevel * 100)}%`}
                  defaultValue={1}
                  ariaMultiplier={100}
                  onGestureStart={onGestureStart}
                  onGestureEnd={onGestureEnd}
                  style={{ '--mixer-rotary-value': returnLevel } as React.CSSProperties}
                  onChange={(value) => onSet({ ...bus, returnLevel: value })}
                >
                  <span className="mixer-compact-rotary" aria-hidden="true" />
                  <span className="mixer-return-name" aria-hidden="true">{moduleName}</span>
                </RotaryControl>
              </span>
            </Tooltip>
            <Tooltip content={<span className="mixer-limiter-tooltip">{LIMITER_TOOLTIP}</span>}>
              <button
                type="button"
                className="mixer-limiter-toggle"
                aria-label={`Limiter for FX Return ${slot}`}
                aria-pressed={bus.limiterEnabled}
                onClick={() => onSet({ ...bus, limiterEnabled: !bus.limiterEnabled })}
              >L</button>
            </Tooltip>
          </div>
        )
      })}
    </section>
  )
}
