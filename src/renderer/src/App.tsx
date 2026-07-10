import { useCallback, useState } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import TrackerView from './components/TrackerView'
import ScanOverlay from './components/ScanOverlay'
import { useAppState } from './hooks/useAppState'
import { useFolderSession } from './hooks/useFolderSession'
import { createTrackerViewModel } from './hooks/trackerViewModel'
import { selectTheme } from './theme/themes'

export default function App() {
  const { userFolder, sampleFolder, canStart, pickUser, pickSample, restoreUser, restoreSample } =
    useFolderSession(window.backendAPI)

  const resolvedUserFolder = userFolder.status === 'set' ? userFolder.ref : null
  const resolvedSampleFolder = sampleFolder.status === 'set' ? sampleFolder.ref : null

  const app = useAppState(window.backendAPI, resolvedUserFolder, resolvedSampleFolder)
  const tracker = createTrackerViewModel(app)

  const [activeTheme, setActiveTheme] = useState('emerald')

  const handleThemeChange = useCallback((requestedThemeKey: string) => {
    setActiveTheme(selectTheme(requestedThemeKey))
  }, [])

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
            browser={tracker.browser}
            arrangement={tracker.arrangement}
            transport={tracker.transport}
            mixer={tracker.mixer}
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
