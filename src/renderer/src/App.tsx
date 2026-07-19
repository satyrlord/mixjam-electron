import { useCallback, useLayoutEffect, useState } from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import PlayerView from './components/PlayerView'
import { TooltipProvider } from './components/ui/Tooltip'
import { useAppState } from './hooks/useAppState'
import { useFolderSetup } from './hooks/useFolderSetup'
import { createPlayerViewModel } from './hooks/playerViewModel'
import { selectTheme } from './theme/themes'
import MixJamGeneratorDialog from './components/MixJamGeneratorDialog'
import { useMixJamGenerator } from './hooks/useMixJamGenerator'
import { applyUiSize, loadUiSize, saveUiSize, UiSizeProvider } from './ui-size'

export default function App() {
  const { userFolder, sampleFolder, canStart, pickUser, pickSample, restoreUser, restoreSample } =
    useFolderSetup(window.backendAPI)

  const resolvedUserFolder = userFolder.status === 'set' ? userFolder.ref : null
  const resolvedSampleFolder = sampleFolder.status === 'set' ? sampleFolder.ref : null

  const app = useAppState(window.backendAPI, resolvedUserFolder, resolvedSampleFolder)
  const player = createPlayerViewModel(app)
  const generator = useMixJamGenerator(app, window.backendAPI, resolvedSampleFolder)

  const [activeTheme, setActiveTheme] = useState('emerald')
  const [uiSize, setUiSize] = useState(loadUiSize)

  useLayoutEffect(() => {
    applyUiSize(document.documentElement, uiSize)
  }, [uiSize])

  const handleUiSizeChange = useCallback((size: typeof uiSize) => {
    setUiSize(size)
    saveUiSize(size)
  }, [])

  const handleThemeChange = useCallback((requestedThemeKey: string) => {
    setActiveTheme(selectTheme(requestedThemeKey))
  }, [])

  return (
    <UiSizeProvider size={uiSize}>
      <TooltipProvider>
        <div className="app" data-ui-size={uiSize}>
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
            onOpenGenerator={generator.openNew}
            generatorReadiness={generator.readiness}
          />
        ) : (
          <PlayerView
            mixJamFiles={app.mixJamFiles}
            browser={player.browser}
            arrangement={player.arrangement}
            transport={player.transport}
            mixer={player.mixer}
            project={{
              ...player.project,
              onRegenerateExact: generator.openRegenerateExact,
              onRegenerateCurrent: generator.openRegenerateCurrent
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
        uiSize={uiSize}
        onUiSizeChange={handleUiSizeChange}
          />
          <MixJamGeneratorDialog
        open={generator.open}
        readiness={generator.readiness}
        initialParameters={generator.initialParameters}
        generating={generator.generating}
        saving={generator.saving}
        progress={generator.progress}
        result={generator.result}
        error={generator.error}
        onClose={generator.close}
        onGenerate={generator.onGenerate}
        onOpenResult={generator.onOpenResult}
          />
        </div>
      </TooltipProvider>
    </UiSizeProvider>
  )
}
