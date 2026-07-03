import { useCallback, useMemo, useState } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import TrackerView from './components/TrackerView'
import ScanOverlay from './components/ScanOverlay'
import { useAppState } from './hooks/useAppState'
import { useFolderSession } from './hooks/useFolderSession'
import { selectTheme } from './theme/themes'

export default function App() {
  const { userFolder, sampleFolder, canStart, pickUser, pickSample, restoreUser, restoreSample } =
    useFolderSession(window.backendAPI)

  const resolvedUserFolder = userFolder.status === 'set' ? userFolder.ref : null
  const resolvedSampleFolder = sampleFolder.status === 'set' ? sampleFolder.ref : null

  const app = useAppState(window.backendAPI, resolvedUserFolder, resolvedSampleFolder)

  const [activeTheme, setActiveTheme] = useState('emerald')

  const handleThemeChange = useCallback((requestedThemeKey: string) => {
    setActiveTheme(selectTheme(requestedThemeKey))
  }, [])

  const { setSelectedTagIds } = app
  const handleToggleTagFilter = useCallback((id: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]
    )
  }, [setSelectedTagIds])

  const browserProps = useMemo(() => ({
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
    onSearchChange: app.setSearchQuery,
    onLoadMoreSamples: app.loadMoreSamples,
    onSelectSampleDetail: app.setSelectedSampleDetail,
    onPreviewSample: app.previewSample,
    onSelectCategory: app.setSelectedCategoryId,
    onToggleTagFilter: handleToggleTagFilter,
    onSortChange: app.handleSortChange,
    onStartScan: app.startLibraryScan,
    onCancelScan: app.cancelLibraryScan,
    onCreateTag: app.createTag,
    onRenameTag: app.renameTag,
    onDeleteTag: app.deleteTag,
    onAssignTagToSample: app.assignTagToSample,
    onUnassignTagFromSample: app.unassignTagFromSample,
    onCreateCategory: app.createCategory,
    onDeleteCategory: app.deleteCategory,
    onSaveLibrary: app.saveLibrary,
    onDeleteLibrary: app.deleteLibrary,
    onApplyLibrary: app.applyLibrary
  }), [
    app.samples, app.searchQuery, app.loading, app.error,
    app.totalCount, app.hasMoreSamples, app.selectedSampleDetail,
    app.selectedCategoryId, app.selectedTagIds, app.sortBy, app.sortDir,
    app.tags, app.categories, app.libraries, app.scanProgress,
    app.setSearchQuery, app.loadMoreSamples, app.setSelectedSampleDetail,
    app.previewSample, app.setSelectedCategoryId, handleToggleTagFilter,
    app.handleSortChange, app.startLibraryScan, app.cancelLibraryScan,
    app.createTag, app.renameTag, app.deleteTag,
    app.assignTagToSample, app.unassignTagFromSample,
    app.createCategory, app.deleteCategory,
    app.saveLibrary, app.deleteLibrary, app.applyLibrary
  ])

  const arrangementProps = useMemo(() => ({
    lanes: app.lanes,
    laneShouldDim: app.laneShouldDim,
    currentTick: app.currentTick,
    onPlaceSampleDetailOnLane: app.placeSampleDetailOnLane,
    onMoveClipOnLane: app.moveClipOnLane,
    onDuplicateClipOnLane: app.duplicateClipOnLane,
    onMoveClipGroup: app.moveClipGroup,
    onDuplicateClipGroup: app.duplicateClipGroup,
    onRemoveClipFromLane: app.removeClipFromLane,
    onRemoveClips: app.removeClips,
    onSetLanePan: app.setLanePan,
    onToggleLaneMute: app.toggleLaneMute,
    onToggleLaneSolo: app.toggleLaneSolo
  }), [
    app.lanes, app.laneShouldDim, app.currentTick,
    app.placeSampleDetailOnLane, app.moveClipOnLane,
    app.duplicateClipOnLane, app.moveClipGroup, app.duplicateClipGroup,
    app.removeClipFromLane, app.removeClips, app.setLanePan,
    app.toggleLaneMute, app.toggleLaneSolo
  ])

  const transportProps = useMemo(() => ({
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
    onTransportSkipBack: app.transportSkipBack
  }), [
    app.transportState, app.bpm, app.masterGain, app.masterLevelDb,
    app.canUndo, app.canRedo, app.setBpm, app.setMasterGain,
    app.undo, app.redo, app.transportPlay, app.transportPause,
    app.transportStop, app.transportSkipBack
  ])

  const mixerProps = useMemo(() => ({
    channels: app.channels,
    channelLevels: app.channelLevels,
    channelPeaks: app.channelPeaks,
    onSetChannelGain: app.setChannelGain,
    onSetChannelPan: app.setChannelPan,
    onToggleChannelMute: app.toggleChannelMute,
    onToggleChannelSolo: app.toggleChannelSolo,
    onRemoveChannel: app.removeChannel
  }), [
    app.channels, app.channelLevels, app.channelPeaks,
    app.setChannelGain, app.setChannelPan,
    app.toggleChannelMute, app.toggleChannelSolo, app.removeChannel
  ])

  return (
    <div className="app">
      <Header
        view={app.view}
        timer={app.timerText}
        theme={activeTheme}
        onHome={app.goToHome}
        onThemeChange={handleThemeChange}
      />
      <main className="content">
        {app.view === 'home' ? (
          <HomeScreen
            userFolder={userFolder}
            sampleFolder={sampleFolder}
            canStart={canStart}
            recentProjects={app.recentProjects}
            activeTheme={activeTheme}
            onThemeChange={handleThemeChange}
            onPickUser={pickUser}
            onPickSample={pickSample}
            onRestoreUser={restoreUser}
            onRestoreSample={restoreSample}
            onStart={app.goToTracker}
          />
        ) : (
          <TrackerView
            recentProjects={app.recentProjects}
            browser={browserProps}
            arrangement={arrangementProps}
            transport={transportProps}
            mixer={mixerProps}
          />
        )}
      </main>
      <Footer
        view={app.view}
        version={app.version}
        sampleDetail={app.selectedSampleDetail}
        onSelectFolder={pickUser}
        onOpenRepo={app.openRepo}
        getSampleBuffer={app.getSampleBuffer}
      />
      {!app.dbIndexed && <ScanOverlay progress={app.scanProgress} />}
    </div>
  )
}
