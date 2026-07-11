import SongControlsMain from './SongControlsMain'
import MixerColumn from './MixerColumn'
import type { ChannelState } from '../hooks/useMixer'

interface SongControlsRailProps {
  bpm: number
  masterGain: number
  masterLevelDb: number
  onSetBpm: (bpm: number) => void
  onSetMasterGain: (value: number) => void
  mixerChannels: ChannelState[]
  mixerChannelLevels: ReadonlyMap<number, number>
  mixerChannelPeaks: ReadonlyMap<number, number>
  canRestoreChannel: boolean
  selectedChannelIndex: number | null
  onSetChannelGain: (channelIndex: number, gain: number) => void
  onSetChannelPan: (channelIndex: number, pan: number) => void
  onToggleChannelMute: (channelIndex: number) => void
  onToggleChannelSolo: (channelIndex: number) => void
  onRemoveChannel: (channelIndex: number) => void
  onRestoreChannel: () => void
  onSelectChannel: (channelIndex: number) => void
  onOpenChannelEffects: (channelIndex: number) => void
}

export default function SongControlsRail({
  bpm,
  masterGain,
  masterLevelDb,
  onSetBpm,
  onSetMasterGain,
  mixerChannels,
  mixerChannelLevels,
  mixerChannelPeaks,
  canRestoreChannel,
  selectedChannelIndex,
  onSetChannelGain,
  onSetChannelPan,
  onToggleChannelMute,
  onToggleChannelSolo,
  onRemoveChannel,
  onRestoreChannel,
  onSelectChannel,
  onOpenChannelEffects
}: SongControlsRailProps) {
  return (
    <aside className="tracker-zone song-controls-rail">
      <SongControlsMain
        bpm={bpm}
        masterGain={masterGain}
        masterLevelDb={masterLevelDb}
        onSetBpm={onSetBpm}
        onSetMasterGain={onSetMasterGain}
      />
      <MixerColumn
        channels={mixerChannels}
        channelLevels={mixerChannelLevels}
        channelPeaks={mixerChannelPeaks}
        canRestoreChannel={canRestoreChannel}
        selectedChannelIndex={selectedChannelIndex}
        onSetChannelGain={onSetChannelGain}
        onSetChannelPan={onSetChannelPan}
        onToggleChannelMute={onToggleChannelMute}
        onToggleChannelSolo={onToggleChannelSolo}
        onRemoveChannel={onRemoveChannel}
        onRestoreChannel={onRestoreChannel}
        onSelectChannel={onSelectChannel}
        onOpenChannelEffects={onOpenChannelEffects}
      />
    </aside>
  )
}
