import { useMemo } from 'react'
import type { LaneState } from '../project/project-state'
import type { PlaybackReturnSnapshot } from '../engine/playback-engine'
import { getReturnEffect } from '../engine/return-effects'
import type { ChannelMeterFrame } from '../hooks/useMixer'
import { deriveStore, type ReadableStore } from '../lib/value-store'
import ChannelStrip, { type ChannelMeterValue } from './ChannelStrip'
import MixerFxSlot from './MixerFxSlot'

const SILENCE_DB = -100

function channelMeterEquals(a: ChannelMeterValue, b: ChannelMeterValue): boolean {
  return a.levelDb === b.levelDb && a.peakDb === b.peakDb
}

interface MixerColumnProps {
  lanes: LaneState[]
  returnBuses: readonly [PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot]
  channelMetersStore: ReadableStore<ChannelMeterFrame>
  selectedLaneId: string | null
  /** Current project tempo, so synced FX show and use the real BPM. */
  bpm?: number
  /** Established tempo command; the delay editor's Tap Tempo routes through it. */
  onSetBpm?: (bpm: number) => void
  onSetChannelGain: (channelIndex: number, gain: number) => void
  onSetChannelPan: (channelIndex: number, pan: number) => void
  onSetChannelSend: (channelIndex: number, sendIndex: number, value: number) => void
  onSelectLane: (laneId: string) => void
  onGestureStart: () => void
  onGestureEnd: () => void
  onSetReturnBus: (bus: PlaybackReturnSnapshot) => void
  onPreviewReturnBus: (bus: PlaybackReturnSnapshot) => void
  /**
   * Momentary Clear Tail command for a Return bus. Always supplied by the host;
   * whether an editor exposes it is governed by the effect descriptor's
   * `supportsClearTail`, matching the required `PlayerMixerProps` contract.
   */
  onClearReturnTail: (index: number) => void
}

// Labels come from the effect registry, so a new effect needs no edit here and
// the strip send labels never drift from the slot header. (See MixerFxSlot's
// moduleDisplayName, which does the same lookup.)
function returnModuleName(bus: PlaybackReturnSnapshot): string {
  return getReturnEffect(bus.module.type)?.label ?? 'Empty'
}

/** Full-width, horizontally scrollable Mixer workspace derived from lanes. */
export default function MixerColumn({
  lanes,
  returnBuses,
  channelMetersStore,
  selectedLaneId,
  bpm = 120,
  onSetBpm,
  onSetChannelGain,
  onSetChannelPan,
  onSetChannelSend,
  onSelectLane,
  onGestureStart,
  onGestureEnd,
  onSetReturnBus,
  onPreviewReturnBus,
  onClearReturnTail
}: MixerColumnProps) {
  // One derived view per channel: RAF-cadence frames fan out so each meter
  // leaf re-renders only when its own channel's numbers change.
  const meterStores = useMemo(() => {
    const stores = new Map<number, ReadableStore<ChannelMeterValue>>()
    for (const lane of lanes) {
      stores.set(
        lane.index,
        deriveStore(
          channelMetersStore,
          (frame) => ({
            levelDb: frame.levels.get(lane.index) ?? SILENCE_DB,
            peakDb: frame.peaks.get(lane.index) ?? SILENCE_DB
          }),
          channelMeterEquals
        )
      )
    }
    return stores
  }, [channelMetersStore, lanes])
  const silentMeterStore = useMemo(
    () =>
      deriveStore(channelMetersStore, () => ({ levelDb: SILENCE_DB, peakDb: SILENCE_DB }), channelMeterEquals),
    [channelMetersStore]
  )
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
          <aside className="mixer-panel" aria-label="Channels">
            <div className="mixer-panel-header" aria-hidden="true">
              <span>{lanes.length} × Channels</span>
              <span className="mixer-panel-header-right">
                <span className="mixer-status-led" />
                <span>4 Sends</span>
              </span>
            </div>
            <div className="mixer-panel-channels">
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
                    meterStore={meterStores.get(lane.index) ?? silentMeterStore}
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
            </div>
          </aside>
          <section className="mixer-fx-bank" aria-label="FX and Returns">
            <div className="mixer-panel-header" aria-hidden="true">
              <span>4 × FX Slots</span>
              <span className="mixer-panel-header-right">
                <span className="mixer-status-led" />
                <span>Active</span>
              </span>
            </div>
            <div className="mixer-fx-grid">
              {returnBuses.map((bus) => (
                <MixerFxSlot
                  key={bus.index}
                  bus={bus}
                  bpm={bpm}
                  onSetBpm={onSetBpm}
                  onSet={onSetReturnBus}
                  onPreview={onPreviewReturnBus}
                  onClearTail={onClearReturnTail}
                  onGestureStart={onGestureStart}
                  onGestureEnd={onGestureEnd}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
