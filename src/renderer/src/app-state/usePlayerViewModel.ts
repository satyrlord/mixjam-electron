import { useCallback, useMemo } from 'react'
import { supportsExactGeneratorRegeneration } from '../project/generator-support'
import type { AppState } from '../hooks/useAppState'
import type {
  PlayerBrowserProps,
  PlayerMasterBusProps,
  PlayerMixerProps,
  PlayerProjectProps,
  PlayerTransportProps,
  PlayerViewModel,
  TrackerArrangementProps
} from '../components/playerProps'

interface GeneratorCommands {
  onRegenerateExact: (opener?: HTMLElement) => void
  onRegenerateCurrent: (opener?: HTMLElement) => void
}

/** Adapts the owning app-state modules to the stable surfaces consumed by PlayerView. */
export function usePlayerViewModel(
  app: AppState,
  generatorCommands: GeneratorCommands
): PlayerViewModel {
  const { library, mixer, navigation, project, transport } = app
  const { setSelectedTagIds } = library
  const handleToggleTagFilter = useCallback((id: number) => {
    setSelectedTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]
    )
  }, [setSelectedTagIds])

  const missingSamplePaths = useMemo(() => new Set([
    ...library.missingSamplePaths,
    ...project.projectMissingSamplePaths
  ]), [library.missingSamplePaths, project.projectMissingSamplePaths])

  const browser = useMemo<PlayerBrowserProps>(() => ({
    samples: library.samples,
    searchQuery: library.searchQuery,
    loading: library.loading,
    error: library.error,
    totalCount: library.totalCount,
    hasMoreSamples: library.hasMoreSamples,
    selectedSamplePath: library.selectedSampleDetail?.relpath ?? null,
    selectedTagIds: library.selectedTagIds,
    sortBy: library.sortBy,
    sortDir: library.sortDir,
    tags: library.tags,
    libraries: library.libraries,
    librarySyncState: library.librarySyncState,
    onSearchChange: library.setSearchQuery,
    onLoadMoreSamples: library.loadMoreSamples,
    onSelectSampleDetail: library.setSelectedSampleDetail,
    onPreviewSample: transport.previewSample,
    onToggleTagFilter: handleToggleTagFilter,
    onSortChange: library.handleSortChange,
    onRescanLibrary: library.rescanLibrary,
    onRetryLibrarySync: library.retryLibrarySync,
    onCancelLibrarySync: library.cancelLibrarySync,
    onCreateTag: library.createTag,
    onRenameTag: library.renameTag,
    onSetTagColor: library.setTagColor,
    onDeleteTag: library.deleteTag,
    onAssignTagToSample: library.assignTagToSample,
    onUnassignTagFromSample: library.unassignTagFromSample,
    onUpdateSampleAnalysis: library.updateSampleAnalysis,
    onReanalyzeSample: library.reanalyzeSample,
    onSaveLibrary: library.saveLibrary,
    onDeleteLibrary: library.deleteLibrary,
    onApplyLibrary: library.applyLibrary
  }), [
    handleToggleTagFilter, library.applyLibrary, library.assignTagToSample,
    library.cancelLibrarySync, library.createTag, library.deleteLibrary, library.deleteTag,
    library.error, library.handleSortChange, library.hasMoreSamples, library.libraries,
    library.librarySyncState, library.loadMoreSamples, library.loading, library.reanalyzeSample,
    library.renameTag, library.rescanLibrary, library.retryLibrarySync, library.samples,
    library.saveLibrary, library.searchQuery, library.selectedSampleDetail, library.selectedTagIds,
    library.setSearchQuery, library.setSelectedSampleDetail, library.setTagColor, library.sortBy,
    library.sortDir, library.tags, library.totalCount, library.unassignTagFromSample,
    library.updateSampleAnalysis, transport.previewSample
  ])

  const arrangement = useMemo<TrackerArrangementProps>(() => ({
    lanes: transport.lanes,
    laneShouldDim: transport.laneShouldDim,
    tickStore: transport.tickStore,
    missingSamplePaths,
    onPlaceSampleDetailOnLane: transport.placeSampleDetailOnLane,
    onMovePlacement: transport.movePlacement,
    onDuplicatePlacement: transport.duplicatePlacement,
    onMovePlacementGroup: transport.movePlacementGroup,
    onDuplicatePlacementGroup: transport.duplicatePlacementGroup,
    onRemovePlacementFromLane: transport.removePlacementFromLane,
    onRemovePlacements: transport.removePlacements,
    onSetLanePan: transport.setLanePan,
    onRenameLane: transport.renameLane,
    onToggleLaneMute: transport.toggleLaneMute,
    onToggleLaneSolo: transport.toggleLaneSolo,
    onAddLane: transport.addLane,
    onDeleteLane: transport.deleteLane,
    onDeleteEmptyLanes: transport.deleteEmptyLanes
  }), [
    missingSamplePaths, transport.addLane, transport.deleteEmptyLanes, transport.deleteLane,
    transport.duplicatePlacement, transport.duplicatePlacementGroup, transport.laneShouldDim,
    transport.lanes, transport.movePlacement, transport.movePlacementGroup,
    transport.placeSampleDetailOnLane, transport.removePlacementFromLane,
    transport.removePlacements, transport.renameLane, transport.setLanePan, transport.tickStore,
    transport.toggleLaneMute, transport.toggleLaneSolo
  ])

  const playerTransport = useMemo<PlayerTransportProps>(() => ({
    transportState: transport.transportState,
    songEndTick: transport.songEndTick,
    bpm: transport.bpm,
    masterGain: transport.masterGain,
    masterMeterStore: transport.masterMeterStore,
    canUndo: transport.canUndo,
    canRedo: transport.canRedo,
    onSetBpm: transport.setBpm,
    onUndo: transport.undo,
    onRedo: transport.redo,
    onTransportPlay: transport.transportPlay,
    onTransportPause: transport.transportPause,
    onTransportStop: transport.transportStop,
    onTransportSkipBack: transport.transportSkipBack,
    onTransportJumpToEnd: transport.transportJumpToEnd,
    onTransportSeek: transport.transportSeek
  }), [
    transport.bpm, transport.canRedo, transport.canUndo, transport.masterGain,
    transport.masterMeterStore, transport.redo, transport.setBpm, transport.songEndTick,
    transport.transportJumpToEnd, transport.transportPause, transport.transportPlay,
    transport.transportSeek, transport.transportSkipBack, transport.transportState,
    transport.transportStop, transport.undo
  ])

  const masterBus = useMemo<PlayerMasterBusProps>(() => ({
    state: transport.masterBus,
    getMeterSnapshot: transport.getMasterBusMeterSnapshot,
    onSetMetersActive: transport.setMasterBusMetersActive,
    onSetParam: transport.setMasterBusParam,
    onTogglePower: transport.toggleMasterBusPower,
    onReorder: transport.reorderMasterBus,
    onApplyPreset: transport.applyMasterBusPreset
  }), [
    transport.applyMasterBusPreset, transport.getMasterBusMeterSnapshot, transport.masterBus,
    transport.reorderMasterBus, transport.setMasterBusMetersActive, transport.setMasterBusParam,
    transport.toggleMasterBusPower
  ])

  const playerMixer = useMemo<PlayerMixerProps>(() => ({
    returnBuses: mixer.returnBuses,
    channelMetersStore: mixer.channelMetersStore,
    onSetVisualTelemetryActive: mixer.setVisualTelemetryActive,
    onBeginMixerGesture: transport.beginMixerGesture,
    onCommitMixerGesture: transport.commitMixerGesture,
    onSetChannelGain: transport.setLaneGain,
    onSetChannelSend: transport.setLaneSend,
    onSetReturnBus: transport.setReturnBus,
    onPreviewReturnBus: mixer.previewReturnBus,
    onClearReturnTail: mixer.clearReturnTail
  }), [
    mixer.channelMetersStore, mixer.clearReturnTail, mixer.previewReturnBus, mixer.returnBuses,
    mixer.setVisualTelemetryActive, transport.beginMixerGesture, transport.commitMixerGesture,
    transport.setLaneGain, transport.setLaneSend, transport.setReturnBus
  ])

  const playerProject = useMemo<PlayerProjectProps>(() => ({
    name: project.projectName,
    dirty: project.projectDirty,
    busy: project.projectBusy,
    canRegenerate: project.projectGenerator != null &&
      supportsExactGeneratorRegeneration(project.projectGenerator),
    onNew: navigation.startNewProject,
    onOpen: project.openProjectPicker,
    onOpenPath: project.openProjectPath,
    onSave: project.saveProject,
    onSaveAs: project.saveProjectAs,
    onRegenerateExact: generatorCommands.onRegenerateExact,
    onRegenerateCurrent: generatorCommands.onRegenerateCurrent
  }), [
    generatorCommands.onRegenerateCurrent, generatorCommands.onRegenerateExact,
    navigation.startNewProject, project.openProjectPath, project.openProjectPicker,
    project.projectBusy, project.projectDirty, project.projectGenerator, project.projectName,
    project.saveProject, project.saveProjectAs
  ])

  return useMemo(() => ({
    mixJamFiles: project.mixJamFiles,
    browser,
    arrangement,
    transport: playerTransport,
    masterBus,
    mixer: playerMixer,
    project: playerProject
  }), [arrangement, browser, masterBus, playerMixer, playerProject, playerTransport, project.mixJamFiles])
}
