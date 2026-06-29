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
    sampleRows,
    sampleSearchQuery,
    sampleBrowserLoading,
    sampleBrowserError,
    selectedSampleDetail,
    setSelectedSampleDetail,
    setSampleSearchQuery,
    rescanSampleBrowser,
    lanes,
    placeSampleDetailOnLane,
    moveClipOnLane,
    removeClipFromLane,
    setLanePan,
    previewSample,
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
    goToTracker,
    goToHome,
    handleLoadMixJam,
    openFolderPicker,
    openRepo,
    scanProgress,
    dbSamples,
    dbSampleTotal,
    dbSearchQuery,
    setDbSearchQuery,
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
    createCategory,
    deleteCategory,
    saveLibrary,
    deleteLibrary
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
            onPickUser={pickUser}
            onPickSample={pickSample}
            onStart={goToTracker}
            onLoad={handleLoadMixJam}
          />
        ) : (
          <TrackerView
            recentProjects={recentProjects}
            sampleRows={sampleRows}
            sampleSearchQuery={sampleSearchQuery}
            sampleBrowserLoading={sampleBrowserLoading}
            sampleBrowserError={sampleBrowserError}
            selectedSamplePath={selectedSampleDetail?.path ?? null}
            lanes={lanes}
            laneShouldDim={laneShouldDim}
            transportState={transportState}
            currentTick={currentTick}
            bpm={bpm}
            masterGain={masterGain}
            masterLevelDb={masterLevelDb}
            onSetBpm={setBpm}
            onSetMasterGain={setMasterGain}
            onSelectSampleDetail={setSelectedSampleDetail}
            onSampleSearchChange={setSampleSearchQuery}
            onSampleRescan={rescanSampleBrowser}
            onPlaceSampleDetailOnLane={placeSampleDetailOnLane}
            onMoveClipOnLane={moveClipOnLane}
            onRemoveClipFromLane={removeClipFromLane}
            onSetLanePan={setLanePan}
            onPreviewSample={previewSample}
            onToggleLaneMute={toggleLaneMute}
            onToggleLaneSolo={toggleLaneSolo}
            onTransportPlay={transportPlay}
            onTransportPause={transportPause}
            onTransportStop={transportStop}
            onTransportSkipBack={transportSkipBack}
            scanProgress={scanProgress}
            dbSamples={dbSamples}
            dbSampleTotal={dbSampleTotal}
            dbSearchQuery={dbSearchQuery}
            selectedCategoryId={selectedCategoryId}
            selectedTagIds={selectedTagIds}
            sortBy={sortBy}
            sortDir={sortDir}
            tags={tags}
            categories={categories}
            libraries={libraries}
            onDbSearchChange={setDbSearchQuery}
            onSelectCategory={setSelectedCategoryId}
            onToggleTagFilter={handleToggleTagFilter}
            onSortChange={handleSortChange}
            onStartScan={startLibraryScan}
            onCreateTag={createTag}
            onRenameTag={renameTag}
            onDeleteTag={deleteTag}
            onCreateCategory={createCategory}
            onDeleteCategory={deleteCategory}
            onSaveLibrary={saveLibrary}
            onDeleteLibrary={deleteLibrary}
          />
        )}
      </main>
      <Footer
        view={view}
        version={version}
        sampleDetail={selectedSampleDetail}
        onSelectFolder={openFolderPicker}
        onOpenRepo={openRepo}
      />
      <ScanOverlay progress={scanProgress} />
    </div>
  )
}
