import SongControlsMain from './SongControlsMain'
import MixerColumn from './MixerColumn'
import type { ChannelState } from '../hooks/useMixer'
import type { EffectSlot, EffectType } from '../engine/effects'

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
  onSetChannelGain: (channelIndex: number, gain: number) => void
  onSetChannelPan: (channelIndex: number, pan: number) => void
  onToggleChannelMute: (channelIndex: number) => void
  onToggleChannelSolo: (channelIndex: number) => void
  onRemoveChannel: (channelIndex: number) => void
  onRestoreChannel: () => void
  onAddChannelEffect: (channelIndex: number, type: EffectType) => void
  onUpdateChannelEffect: (channelIndex: number, effect: EffectSlot) => void
  onToggleChannelEffectBypass: (channelIndex: number, effectId: string) => void
  onRemoveChannelEffect: (channelIndex: number, effectId: string) => void
  onMoveChannelEffect: (channelIndex: number, effectId: string, toIndex: number) => void
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
  onSetChannelGain,
  onSetChannelPan,
  onToggleChannelMute,
  onToggleChannelSolo,
  onRemoveChannel,
  onRestoreChannel,
  onAddChannelEffect,
  onUpdateChannelEffect,
  onToggleChannelEffectBypass,
  onRemoveChannelEffect,
  onMoveChannelEffect
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
        onSetChannelGain={onSetChannelGain}
        onSetChannelPan={onSetChannelPan}
        onToggleChannelMute={onToggleChannelMute}
        onToggleChannelSolo={onToggleChannelSolo}
        onRemoveChannel={onRemoveChannel}
        onRestoreChannel={onRestoreChannel}
        onAddChannelEffect={onAddChannelEffect}
        onUpdateChannelEffect={onUpdateChannelEffect}
        onToggleChannelEffectBypass={onToggleChannelEffectBypass}
        onRemoveChannelEffect={onRemoveChannelEffect}
        onMoveChannelEffect={onMoveChannelEffect}
      />
    </aside>
  )
}
