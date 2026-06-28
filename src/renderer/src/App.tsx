import { useCallback, useState } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import TrackerView from './components/TrackerView'
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
    placeSampleOnLane,
    toggleLaneMute,
    toggleLaneSolo,
    laneShouldDim,
    transportState,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    goToTracker,
    goToHome,
    handleLoadMixJam,
    openFolderPicker,
    openRepo
  } = useAppState(window.electronAPI, resolvedUserFolder, resolvedSampleFolder)

  // Theme is bootstrap-applied synchronously in main.tsx before React mounts
  // (spec-002 AC-001). Only Emerald is implemented; all selections collapse to
  // the default per AC-006.
  const [activeTheme, setActiveTheme] = useState('emerald')

  const handleThemeChange = useCallback((requestedThemeKey: string) => {
    setActiveTheme(selectTheme(requestedThemeKey))
  }, [])

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
            onSelectSampleDetail={setSelectedSampleDetail}
            onSampleSearchChange={setSampleSearchQuery}
            onSampleRescan={rescanSampleBrowser}
            onPlaceSampleOnLane={placeSampleOnLane}
            onToggleLaneMute={toggleLaneMute}
            onToggleLaneSolo={toggleLaneSolo}
            onTransportPlay={transportPlay}
            onTransportPause={transportPause}
            onTransportStop={transportStop}
            onTransportSkipBack={transportSkipBack}
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
    </div>
  )
}
