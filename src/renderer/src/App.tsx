import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MINIMUM_VIEWPORT, supportsApplicationViewport } from '../../shared/viewport'
import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import PlayerView from './components/PlayerView'
import SettingsModal from './components/SettingsModal'
import { TooltipProvider } from './components/ui/Tooltip'
import { useAppState } from './hooks/useAppState'
import { useFolderSetup } from './hooks/useFolderSetup'
import { selectTheme } from './theme/themes'
import MixJamGeneratorDialog from './components/MixJamGeneratorDialog'
import { useMixJamGenerator } from './hooks/useMixJamGenerator'
import { applyUiSize, loadUiSize, saveUiSize, UiSizeProvider } from './ui-size'
import { usePlayerViewModel } from './app-state/usePlayerViewModel'

interface ViewportSize {
  width: number
  height: number
}

function readViewportSize(): ViewportSize {
  return { width: window.innerWidth, height: window.innerHeight }
}

export default function App() {
  const [viewport, setViewport] = useState(readViewportSize)

  useEffect(() => {
    const handleResize = () => setViewport(readViewportSize())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (supportsApplicationViewport(viewport.width, viewport.height)) return <SupportedApp />

  return (
    <main className="minimum-viewport-notice" role="alert" aria-live="assertive">
      <div className="minimum-viewport-notice-panel">
        <h1>Display resolution not supported</h1>
        <p>
          MixJam requires a viewport of at least {MINIMUM_VIEWPORT.width} ×{' '}
          {MINIMUM_VIEWPORT.height} pixels.
        </p>
        <p>
          Current viewport: {viewport.width} × {viewport.height} pixels.
        </p>
      </div>
    </main>
  )
}

function SupportedApp() {
  const { userFolder, sampleFolder, canStart, pickUser, pickSample, restoreUser, restoreSample } =
    useFolderSetup(window.backendAPI)

  const resolvedUserFolder = userFolder.status === 'set' ? userFolder.ref : null
  const resolvedSampleFolder = sampleFolder.status === 'set' ? sampleFolder.ref : null

  const app = useAppState(window.backendAPI, resolvedUserFolder, resolvedSampleFolder)
  const generator = useMixJamGenerator({
    bpm: app.transport.bpm,
    librarySyncState: app.library.librarySyncState,
    projectGenerator: app.project.projectGenerator,
    saveGeneratedProject: app.project.saveGeneratedProject,
    openProjectPath: app.project.openProjectPath
  }, window.backendAPI, resolvedSampleFolder)

  const [activeTheme, setActiveTheme] = useState('emerald')
  const [uiSize, setUiSize] = useState(loadUiSize)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const generatorRestoreFocusTargetRef = useRef<HTMLElement | null>(null)

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

  const handleOpenGenerator = useCallback(() => {
    generatorRestoreFocusTargetRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    generator.openNew()
  }, [generator])

  const handleRegenerateExact = useCallback((opener?: HTMLElement) => {
    generatorRestoreFocusTargetRef.current = opener ?? null
    generator.openRegenerateExact()
  }, [generator])

  const handleRegenerateCurrent = useCallback((opener?: HTMLElement) => {
    generatorRestoreFocusTargetRef.current = opener ?? null
    generator.openRegenerateCurrent()
  }, [generator])
  const player = usePlayerViewModel(app, {
    onRegenerateExact: handleRegenerateExact,
    onRegenerateCurrent: handleRegenerateCurrent
  })

  return (
    <UiSizeProvider size={uiSize}>
      <TooltipProvider>
        <div className="app" data-ui-size={uiSize}>
          <Header
        view={app.transport.view}
        elapsedMsStore={app.transport.elapsedMsStore}
        theme={activeTheme}
        onHome={app.navigation.goToHome}
        onThemeChange={handleThemeChange}
          />
          {(app.project.projectError || app.project.projectWarning) && (
        <div
          className={`project-notice${app.project.projectError ? ' project-notice-error' : ''}`}
          role="alert"
        >
          <span>{app.project.projectError ?? app.project.projectWarning}</span>
          <button
            type="button"
            aria-label="Dismiss project message"
            onClick={app.project.clearProjectNotice}
          >
            ×
          </button>
        </div>
          )}
          <main className="content">
        {app.transport.view === 'home' ? (
          <HomeScreen
            userFolder={userFolder}
            sampleFolder={sampleFolder}
            librarySyncState={app.library.librarySyncState}
            canStart={canStart}
            mixJamFiles={app.project.mixJamFiles}
            projectBusy={app.project.projectBusy}
            onPickUser={pickUser}
            onPickSample={pickSample}
            onRestoreUser={restoreUser}
            onRestoreSample={restoreSample}
            onRetryLibrarySync={() => void app.library.retryLibrarySync()}
            onCancelLibrarySync={() => void app.library.cancelLibrarySync()}
            onStart={app.navigation.startNewProject}
            onLoad={app.project.openProjectPicker}
            onOpenProject={app.project.openProjectPath}
            onOpenGenerator={handleOpenGenerator}
            generatorReadiness={generator.readiness}
          />
        ) : (
          <PlayerView {...player} />
        )}
          </main>
          <Footer
            view={app.transport.view}
            version={app.project.version}
            sampleDetail={app.library.selectedSampleDetail}
            onOpenSettings={() => setSettingsOpen(true)}
            settingsButtonRef={settingsButtonRef}
            onOpenRepo={app.navigation.openRepo}
            getSampleBuffer={app.transport.getSampleBuffer}
          />
          {settingsOpen && app.transport.view === 'player' && (
            <SettingsModal
              userFolder={userFolder}
              uiSize={uiSize}
              clipEdgeMicroFades={app.transport.clipEdgeMicroFades}
              onSelectUserFolder={pickUser}
              onUiSizeChange={handleUiSizeChange}
              onSetClipEdgeMicroFades={app.transport.setClipEdgeMicroFades}
              onClose={() => setSettingsOpen(false)}
              onRestoreFocus={() => settingsButtonRef.current?.focus()}
            />
          )}
          <MixJamGeneratorDialog
            open={generator.open}
            readiness={generator.readiness}
            initialParameters={generator.initialParameters}
            generating={generator.generating}
            saving={generator.saving}
            progress={generator.progress}
            result={generator.result}
            error={generator.error}
            restoreFocus={() => generatorRestoreFocusTargetRef.current?.focus()}
            onClose={generator.close}
            onGenerate={generator.onGenerate}
            onOpenResult={generator.onOpenResult}
          />
        </div>
      </TooltipProvider>
    </UiSizeProvider>
  )
}
