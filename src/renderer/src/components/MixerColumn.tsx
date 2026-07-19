import type { LaneState } from '../project/project-state'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import ChannelStrip from './ChannelStrip'
import MixerFxSlot from './MixerFxSlot'

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
          <section className="mixer-fx-grid" aria-label="FX and Returns">
            {returnBuses.map((bus) => (
              <MixerFxSlot
                key={bus.index}
                bus={bus}
                onSet={onSetReturnBus}
                onPreview={onPreviewReturnBus}
                onGestureStart={onGestureStart}
                onGestureEnd={onGestureEnd}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
