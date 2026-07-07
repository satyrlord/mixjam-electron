import ChannelStrip from './ChannelStrip'
import type { ChannelState } from '../hooks/useMixer'

interface MixerColumnProps {
  channels: ChannelState[]
  channelLevels: ReadonlyMap<number, number>
  channelPeaks: ReadonlyMap<number, number>
  canRestoreChannel: boolean
  onSetChannelGain: (channelIndex: number, gain: number) => void
  onSetChannelPan: (channelIndex: number, pan: number) => void
  onToggleChannelMute: (channelIndex: number) => void
  onToggleChannelSolo: (channelIndex: number) => void
  onRemoveChannel: (channelIndex: number) => void
  onRestoreChannel: () => void
}

/** Scrollable column of channel strips inside the SongControlsRail. */
export default function MixerColumn({
  channels,
  channelLevels,
  channelPeaks,
  canRestoreChannel,
  onSetChannelGain,
  onSetChannelPan,
  onToggleChannelMute,
  onToggleChannelSolo,
  onRemoveChannel,
  onRestoreChannel
}: MixerColumnProps) {
  return (
    <div className="mixer-column">
      <div className="mixer-column-head">
        <h2 className="tracker-zone-title mixer-column-title">Mixer</h2>
        {canRestoreChannel && (
          <button
            type="button"
            className="mixer-restore"
            aria-label="Restore removed channel"
            onClick={onRestoreChannel}
          >
            +
          </button>
        )}
      </div>
      {channels.length === 0 ? (
        <div className="mixer-strips mixer-strips-empty">
          <span className="mixer-empty-text">No channels</span>
        </div>
      ) : (
        <div className="mixer-strips">
          {channels.map((ch) => (
            <ChannelStrip
              key={ch.channelIndex}
              channelIndex={ch.channelIndex}
              label={`${ch.channelIndex + 1}`}
              gain={ch.gain}
              pan={ch.pan}
              muted={ch.muted}
              solo={ch.solo}
              levelDb={channelLevels.get(ch.channelIndex) ?? -100}
              peakDb={channelPeaks.get(ch.channelIndex) ?? -100}
              onSetGain={onSetChannelGain}
              onSetPan={onSetChannelPan}
              onToggleMute={onToggleChannelMute}
              onToggleSolo={onToggleChannelSolo}
              onRemove={onRemoveChannel}
            />
          ))}
        </div>
      )}
    </div>
  )
}
