import ChannelStrip from './ChannelStrip'
import type { ChannelState } from '../hooks/useMixer'

interface MixerColumnProps {
  channels: ChannelState[]
  channelLevels: ReadonlyMap<number, number>
  channelPeaks: ReadonlyMap<number, number>
  onSetChannelGain: (channelIndex: number, gain: number) => void
  onSetChannelPan: (channelIndex: number, pan: number) => void
  onToggleChannelMute: (channelIndex: number) => void
  onToggleChannelSolo: (channelIndex: number) => void
  onRemoveChannel: (channelIndex: number) => void
}

/** Scrollable column of channel strips inside the SongControlsRail. */
export default function MixerColumn({
  channels,
  channelLevels,
  channelPeaks,
  onSetChannelGain,
  onSetChannelPan,
  onToggleChannelMute,
  onToggleChannelSolo,
  onRemoveChannel
}: MixerColumnProps) {
  if (channels.length === 0) {
    return (
      <div className="mixer-column mixer-column-empty">
        <span className="mixer-empty-text">No channels</span>
      </div>
    )
  }

  return (
    <div className="mixer-column">
      <h2 className="tracker-zone-title mixer-column-title">Mixer</h2>
      <div className="mixer-strips">
        {channels.map((ch, i) => (
          <ChannelStrip
            key={ch.channelIndex}
            channelIndex={ch.channelIndex}
            label={`${i + 1}`}
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
    </div>
  )
}
