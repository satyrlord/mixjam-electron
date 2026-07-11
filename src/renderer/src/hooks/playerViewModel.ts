import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMixerProps,
  PlayerTransportProps
} from '../components/playerProps'
import type { AppState } from './useAppState'

export interface PlayerViewModel {
  browser: PlayerBrowserProps
  arrangement: TrackerArrangementProps
  transport: PlayerTransportProps
  mixer: PlayerMixerProps
}

export function createPlayerViewModel(app: AppState): PlayerViewModel {
  return {
    browser: {
      samples: app.samples,
      searchQuery: app.searchQuery,
      loading: app.loading,
      error: app.error,
      totalCount: app.totalCount,
      hasMoreSamples: app.hasMoreSamples,
      selectedSamplePath: app.selectedSampleDetail?.relpath ?? null,
      selectedCategoryId: app.selectedCategoryId,
      selectedTagIds: app.selectedTagIds,
      sortBy: app.sortBy,
      sortDir: app.sortDir,
      tags: app.tags,
      categories: app.categories,
      libraries: app.libraries,
      scanProgress: app.scanProgress,
      analysisProgress: app.analysisProgress,
      onSearchChange: app.setSearchQuery,
      onLoadMoreSamples: app.loadMoreSamples,
      onSelectSampleDetail: app.setSelectedSampleDetail,
      onPreviewSample: app.previewSample,
      onSelectCategory: app.setSelectedCategoryId,
      onToggleTagFilter: (id) => {
        app.setSelectedTagIds((current) =>
          current.includes(id)
            ? current.filter((tagId) => tagId !== id)
            : [...current, id]
        )
      },
      onSortChange: app.handleSortChange,
      onStartScan: app.startLibraryScan,
      onCancelScan: app.cancelLibraryScan,
      onCreateTag: app.createTag,
      onRenameTag: app.renameTag,
      onDeleteTag: app.deleteTag,
      onAssignTagToSample: app.assignTagToSample,
      onUnassignTagFromSample: app.unassignTagFromSample,
      onUpdateSampleAnalysis: app.updateSampleAnalysis,
      onReanalyzeSample: app.reanalyzeSample,
      onCreateCategory: app.createCategory,
      onDeleteCategory: app.deleteCategory,
      onSaveLibrary: app.saveLibrary,
      onDeleteLibrary: app.deleteLibrary,
      onApplyLibrary: app.applyLibrary
    },
    arrangement: {
      lanes: app.lanes,
      laneShouldDim: app.laneShouldDim,
      currentTick: app.currentTick,
      missingSamplePaths: app.missingSamplePaths,
      onPlaceSampleDetailOnLane: app.placeSampleDetailOnLane,
      onMovePlacement: app.movePlacement,
      onDuplicatePlacement: app.duplicatePlacement,
      onMovePlacementGroup: app.movePlacementGroup,
      onDuplicatePlacementGroup: app.duplicatePlacementGroup,
      onRemovePlacementFromLane: app.removePlacementFromLane,
      onRemovePlacements: app.removePlacements,
      onSetLanePan: app.setLanePan,
      onSetLaneNativeBpm: app.setLaneNativeBpm,
      onToggleLaneMute: app.toggleLaneMute,
      onToggleLaneSolo: app.toggleLaneSolo
    },
    transport: {
      transportState: app.transportState,
      bpm: app.bpm,
      masterGain: app.masterGain,
      masterLevelDb: app.masterLevelDb,
      canUndo: app.canUndo,
      canRedo: app.canRedo,
      onSetBpm: app.setBpm,
      onSetMasterGain: app.setMasterGain,
      onUndo: app.undo,
      onRedo: app.redo,
      onTransportPlay: app.transportPlay,
      onTransportPause: app.transportPause,
      onTransportStop: app.transportStop,
      onTransportSkipBack: app.transportSkipBack,
      onTransportSeek: app.transportSeek
    },
    mixer: {
      channels: app.channels,
      channelLevels: app.channelLevels,
      channelPeaks: app.channelPeaks,
      effectReductions: app.effectReductions,
      canRestoreChannel: app.canRestoreChannel,
      onSetChannelGain: app.setChannelGain,
      onSetChannelPan: app.setChannelPan,
      onToggleChannelMute: app.toggleChannelMute,
      onToggleChannelSolo: app.toggleChannelSolo,
      onRemoveChannel: app.removeChannel,
      onRestoreChannel: app.restoreChannel,
      onAddChannelEffect: app.addChannelEffect,
      onUpdateChannelEffect: app.updateChannelEffect,
      onToggleChannelEffectBypass: app.toggleChannelEffectBypass,
      onRemoveChannelEffect: app.removeChannelEffect,
      onRestoreChannelEffect: app.restoreChannelEffect,
      onMoveChannelEffect: app.moveChannelEffect
    }
  }
}
