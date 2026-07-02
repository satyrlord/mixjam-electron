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
  const { userFolder, sampleFolder, canStart, pickUser, pickSample } = useFolderSession(
    window.electronAPI
  )

  const resolvedUserFolder = userFolder.status === 'set' ? userFolder.path : null
  const resolvedSampleFolder = sampleFolder.status === 'set' ? sampleFolder.path : null

  const {
    view,
    version,
    timerText,
    recentProjects,
    samples,
    searchQuery,
    loading,
    error,
    totalCount,
    hasMoreSamples,
    loadMoreSamples,
    selectedSampleDetail,
    setSelectedSampleDetail,
    setSearchQuery,
    lanes,
    placeSampleDetailOnLane,
    moveClipOnLane,
    duplicateClipOnLane,
    moveClipGroup,
    duplicateClipGroup,
    removeClipFromLane,
    removeClips,
    undo,
    redo,
    canUndo,
    canRedo,
    setLanePan,
    previewSample,
    getSampleBuffer,
    toggleLaneMute,
    toggleLaneSolo,
    laneShouldDim,
    transportState,
    currentTick,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    bpm,
    setBpm,
    masterGain,
    setMasterGain,
    masterLevelDb,
    currentProjectName,
    goToTracker,
    goToHome,
    handleLoadMixJam,
    openRecentProject,
    openRepo,
    scanProgress,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedTagIds,
    setSelectedTagIds,
    sortBy,
    sortDir,
    handleSortChange,
    tags,
    categories,
    libraries,
    startLibraryScan,
    createTag,
    renameTag,
    deleteTag,
    assignTagToSample,
    unassignTagFromSample,
    createCategory,
    deleteCategory,
    saveLibrary,
    deleteLibrary,
    applyLibrary
  } = useAppState(window.electronAPI, resolvedUserFolder, resolvedSampleFolder)

  const [activeTheme, setActiveTheme] = useState('emerald')

  const handleThemeChange = useCallback((requestedThemeKey: string) => {
    setActiveTheme(selectTheme(requestedThemeKey))
  }, [])

  const handleToggleTagFilter = useCallback((id: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]
    )
  }, [setSelectedTagIds])

  return (
    <div className="app">
      <Header
        view={view}
        timer={timerText}
        theme={activeTheme}
        onHome={goToHome}
        onThemeChange={handleThemeChange}
      />
      <main className="content">
        {view === 'home' ? (
          <HomeScreen
            userFolder={userFolder}
            sampleFolder={sampleFolder}
            canStart={canStart}
            recentProjects={recentProjects}
            activeTheme={activeTheme}
            onThemeChange={handleThemeChange}
            onOpenRecentProject={openRecentProject}
            onPickUser={pickUser}
            onPickSample={pickSample}
            onStart={goToTracker}
            onLoad={handleLoadMixJam}
          />
        ) : (
          <TrackerView
            recentProjects={recentProjects}
            samples={samples}
            searchQuery={searchQuery}
            loading={loading}
            error={error}
            selectedSamplePath={selectedSampleDetail?.filepath ?? null}
            lanes={lanes}
            laneShouldDim={laneShouldDim}
            transportState={transportState}
            currentTick={currentTick}
            bpm={bpm}
            masterGain={masterGain}
            masterLevelDb={masterLevelDb}
            totalCount={totalCount}
            hasMoreSamples={hasMoreSamples}
            onLoadMoreSamples={loadMoreSamples}
            onSetBpm={setBpm}
            onSetMasterGain={setMasterGain}
            onSelectSampleDetail={setSelectedSampleDetail}
            onSearchChange={setSearchQuery}
            onPlaceSampleDetailOnLane={placeSampleDetailOnLane}
            onMoveClipOnLane={moveClipOnLane}
            onDuplicateClipOnLane={duplicateClipOnLane}
            onMoveClipGroup={moveClipGroup}
            onDuplicateClipGroup={duplicateClipGroup}
            onRemoveClipFromLane={removeClipFromLane}
            onRemoveClips={removeClips}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            projectName={currentProjectName}
            onOpenRecentProject={openRecentProject}
            onSetLanePan={setLanePan}
            onPreviewSample={previewSample}
            onToggleLaneMute={toggleLaneMute}
            onToggleLaneSolo={toggleLaneSolo}
            onTransportPlay={transportPlay}
            onTransportPause={transportPause}
            onTransportStop={transportStop}
            onTransportSkipBack={transportSkipBack}
            scanProgress={scanProgress}
            selectedCategoryId={selectedCategoryId}
            selectedTagIds={selectedTagIds}
            sortBy={sortBy}
            sortDir={sortDir}
            tags={tags}
            categories={categories}
            libraries={libraries}
            onSelectCategory={setSelectedCategoryId}
            onToggleTagFilter={handleToggleTagFilter}
            onSortChange={handleSortChange}
            onStartScan={startLibraryScan}
            onCreateTag={createTag}
            onRenameTag={renameTag}
            onDeleteTag={deleteTag}
            onAssignTagToSample={assignTagToSample}
            onUnassignTagFromSample={unassignTagFromSample}
            onCreateCategory={createCategory}
            onDeleteCategory={deleteCategory}
            onSaveLibrary={saveLibrary}
            onDeleteLibrary={deleteLibrary}
            onApplyLibrary={applyLibrary}
          />
        )}
      </main>
      <Footer
        view={view}
        version={version}
        sampleDetail={selectedSampleDetail}
        onSelectFolder={pickUser}
        onOpenRepo={openRepo}
        getSampleBuffer={getSampleBuffer}
      />
      <ScanOverlay progress={scanProgress} />
    </div>
  )
}
