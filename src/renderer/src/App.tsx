import { useCallback, useState } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import PlayerView from './components/PlayerView'
import { TooltipProvider } from './components/ui/Tooltip'
import { useAppState } from './hooks/useAppState'
import { useFolderSetup } from './hooks/useFolderSetup'
import { createPlayerViewModel } from './hooks/playerViewModel'
import { selectTheme } from './theme/themes'

export default function App() {
  const { userFolder, sampleFolder, canStart, pickUser, pickSample, restoreUser, restoreSample } =
    useFolderSetup(window.backendAPI)

  const resolvedUserFolder = userFolder.status === 'set' ? userFolder.ref : null
  const resolvedSampleFolder = sampleFolder.status === 'set' ? sampleFolder.ref : null

  const app = useAppState(window.backendAPI, resolvedUserFolder, resolvedSampleFolder)
  const player = createPlayerViewModel(app)

  const [activeTheme, setActiveTheme] = useState('emerald')

  const handleThemeChange = useCallback((requestedThemeKey: string) => {
    setActiveTheme(selectTheme(requestedThemeKey))
  }, [])

  return (
    <TooltipProvider>
      <div className="app">
      <Header
        view={app.view}
        timer={app.timerText}
        theme={activeTheme}
        onHome={app.goToHome}
        onThemeChange={handleThemeChange}
      />
      {(app.projectError || app.projectWarning) && (
        <div
          className={`project-notice${app.projectError ? ' project-notice-error' : ''}`}
          role="alert"
        >
          <span>{app.projectError ?? app.projectWarning}</span>
          <button
            type="button"
            aria-label="Dismiss project message"
            onClick={app.clearProjectNotice}
          >
            ×
          </button>
        </div>
      )}
      <main className="content">
        {app.view === 'home' ? (
          <HomeScreen
            userFolder={userFolder}
            sampleFolder={sampleFolder}
            librarySyncState={app.librarySyncState}
            canStart={canStart}
            mixJamFiles={app.mixJamFiles}
            projectBusy={app.projectBusy}
            activeTheme={activeTheme}
            onThemeChange={handleThemeChange}
            onPickUser={pickUser}
            onPickSample={pickSample}
            onRestoreUser={restoreUser}
            onRestoreSample={restoreSample}
            onRetryLibrarySync={() => void app.retryLibrarySync()}
            onCancelLibrarySync={() => void app.cancelLibrarySync()}
            onStart={app.startNewProject}
            onLoad={app.openProjectPicker}
            onOpenProject={app.openProjectPath}
          />
        ) : (
          <PlayerView
            mixJamFiles={app.mixJamFiles}
            browser={player.browser}
            arrangement={player.arrangement}
            transport={player.transport}
            mixer={player.mixer}
            project={player.project}
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
      </div>
    </TooltipProvider>
  )
}
