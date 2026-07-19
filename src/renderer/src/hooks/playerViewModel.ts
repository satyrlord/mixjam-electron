import type {
  TrackerArrangementProps,
  PlayerBrowserProps,
  PlayerMixerProps,
  PlayerProjectProps,
  PlayerTransportProps
} from '../components/playerProps'
import type { AppState } from './useAppState'
import { supportsExactGeneratorRegeneration } from '../project/generator-support'

export interface PlayerViewModel {
  browser: PlayerBrowserProps
  arrangement: TrackerArrangementProps
  transport: PlayerTransportProps
  mixer: PlayerMixerProps
  project: PlayerProjectProps
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
      librarySyncState: app.librarySyncState,
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
      onRescanLibrary: app.rescanLibrary,
      onRetryLibrarySync: app.retryLibrarySync,
      onCancelLibrarySync: app.cancelLibrarySync,
      onCreateTag: app.createTag,
      onRenameTag: app.renameTag,
      onSetTagColor: app.setTagColor,
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
      onRenameLane: app.renameLane,
      onToggleLaneMute: app.toggleLaneMute,
      onToggleLaneSolo: app.toggleLaneSolo
      ,onAddLane: app.addLane
      ,onDeleteLane: app.deleteLane
      ,onDeleteEmptyLanes: app.deleteEmptyLanes
    },
    transport: {
      transportState: app.transportState,
      songEndTick: app.songEndTick,
      bpm: app.bpm,
      masterGain: app.masterGain,
      clipEdgeMicroFades: app.clipEdgeMicroFades,
      masterMeter: app.masterMeter,
      canUndo: app.canUndo,
      canRedo: app.canRedo,
      onSetBpm: app.setBpm,
      onSetMasterGain: app.setMasterGain,
      onSetClipEdgeMicroFades: app.setClipEdgeMicroFades,
      onResetMasterMeter: app.resetMasterMeter,
      onUndo: app.undo,
      onRedo: app.redo,
      onTransportPlay: app.transportPlay,
      onTransportPause: app.transportPause,
      onTransportStop: app.transportStop,
      onTransportSkipBack: app.transportSkipBack,
      onTransportJumpToEnd: app.transportJumpToEnd,
      onTransportSeek: app.transportSeek
    },
    mixer: {
      returnBuses: app.returnBuses,
      channelLevels: app.channelLevels,
      channelPeaks: app.channelPeaks,
      onSetVisualTelemetryActive: app.setVisualTelemetryActive,
      onBeginMixerGesture: app.beginMixerGesture,
      onCommitMixerGesture: app.commitMixerGesture,
      onSetChannelGain: app.setChannelGain,
      onSetChannelPan: app.setChannelPan,
      onSetChannelSend: app.setChannelSend,
      onSetReturnBus: app.setReturnBus,
      onPreviewReturnBus: app.previewReturnBus
    },
    project: {
      name: app.projectName,
      dirty: app.projectDirty,
      busy: app.projectBusy,
      canRegenerate: app.projectGenerator !== null &&
        supportsExactGeneratorRegeneration(app.projectGenerator),
      onNew: app.startNewProject,
      onOpen: app.openProjectPicker,
      onOpenPath: app.openProjectPath,
      onSave: app.saveProject,
      onSaveAs: app.saveProjectAs,
      onRegenerateExact: () => {},
      onRegenerateCurrent: () => {}
    }
  }
}
