import { useCallback, useState } from 'react'
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
            browser={{
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
            }}
            arrangement={{
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
            }}
            transport={{
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
            }}
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
      <ScanOverlay progress={app.scanProgress} />
    </div>
  )
}
