import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { MINIMUM_VIEWPORT, supportsApplicationViewport } from '../../shared/viewport'
import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import PlayerView from './components/PlayerView'
import { TooltipProvider } from './components/ui/Tooltip'
import { useAppState } from './hooks/useAppState'
import { useFolderSetup } from './hooks/useFolderSetup'
import { supportsExactGeneratorRegeneration } from './project/generator-support'
import { selectTheme } from './theme/themes'
import MixJamGeneratorDialog from './components/MixJamGeneratorDialog'
import { useMixJamGenerator } from './hooks/useMixJamGenerator'
import { applyUiSize, loadUiSize, saveUiSize, UiSizeProvider } from './ui-size'

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
            browser={{
              samples: app.samples, searchQuery: app.searchQuery, loading: app.loading, error: app.error,
              totalCount: app.totalCount, hasMoreSamples: app.hasMoreSamples,
              selectedSamplePath: app.selectedSampleDetail?.relpath ?? null,
              selectedCategoryId: app.selectedCategoryId, selectedTagIds: app.selectedTagIds,
              sortBy: app.sortBy, sortDir: app.sortDir, tags: app.tags, categories: app.categories,
              libraries: app.libraries, librarySyncState: app.librarySyncState,
              onSearchChange: app.setSearchQuery, onLoadMoreSamples: app.loadMoreSamples,
              onSelectSampleDetail: app.setSelectedSampleDetail, onPreviewSample: app.previewSample,
              onSelectCategory: app.setSelectedCategoryId,
              onToggleTagFilter: (id) => app.setSelectedTagIds((current) => current.includes(id)
                ? current.filter((tagId) => tagId !== id) : [...current, id]),
              onSortChange: app.handleSortChange, onRescanLibrary: app.rescanLibrary,
              onRetryLibrarySync: app.retryLibrarySync, onCancelLibrarySync: app.cancelLibrarySync,
              onCreateTag: app.createTag, onRenameTag: app.renameTag, onSetTagColor: app.setTagColor,
              onDeleteTag: app.deleteTag, onAssignTagToSample: app.assignTagToSample,
              onUnassignTagFromSample: app.unassignTagFromSample,
              onUpdateSampleAnalysis: app.updateSampleAnalysis, onReanalyzeSample: app.reanalyzeSample,
              onCreateCategory: app.createCategory, onDeleteCategory: app.deleteCategory,
              onSaveLibrary: app.saveLibrary, onDeleteLibrary: app.deleteLibrary, onApplyLibrary: app.applyLibrary
            }}
            arrangement={{
              lanes: app.lanes, laneShouldDim: app.laneShouldDim, currentTick: app.currentTick,
              missingSamplePaths: app.missingSamplePaths, onPlaceSampleDetailOnLane: app.placeSampleDetailOnLane,
              onMovePlacement: app.movePlacement, onDuplicatePlacement: app.duplicatePlacement,
              onMovePlacementGroup: app.movePlacementGroup, onDuplicatePlacementGroup: app.duplicatePlacementGroup,
              onRemovePlacementFromLane: app.removePlacementFromLane, onRemovePlacements: app.removePlacements,
              onSetLanePan: app.setLanePan, onRenameLane: app.renameLane,
              onToggleLaneMute: app.toggleLaneMute, onToggleLaneSolo: app.toggleLaneSolo,
              onAddLane: app.addLane, onDeleteLane: app.deleteLane, onDeleteEmptyLanes: app.deleteEmptyLanes
            }}
            transport={{
              transportState: app.transportState, songEndTick: app.songEndTick, bpm: app.bpm,
              masterGain: app.masterGain, clipEdgeMicroFades: app.clipEdgeMicroFades,
              masterMeter: app.masterMeter, canUndo: app.canUndo, canRedo: app.canRedo,
              onSetBpm: app.setBpm, onSetMasterGain: app.setMasterGain,
              onSetClipEdgeMicroFades: app.setClipEdgeMicroFades, onResetMasterMeter: app.resetMasterMeter,
              onUndo: app.undo, onRedo: app.redo, onTransportPlay: app.transportPlay,
              onTransportPause: app.transportPause, onTransportStop: app.transportStop,
              onTransportSkipBack: app.transportSkipBack, onTransportJumpToEnd: app.transportJumpToEnd,
              onTransportSeek: app.transportSeek
            }}
            mixer={{
              returnBuses: app.returnBuses, channelLevels: app.channelLevels, channelPeaks: app.channelPeaks,
              onSetVisualTelemetryActive: app.setVisualTelemetryActive,
              onBeginMixerGesture: app.beginMixerGesture, onCommitMixerGesture: app.commitMixerGesture,
              onSetChannelGain: app.setChannelGain, onSetChannelPan: app.setChannelPan,
              onSetChannelSend: app.setChannelSend, onSetReturnBus: app.setReturnBus,
              onPreviewReturnBus: app.previewReturnBus
            }}
            project={{
              name: app.projectName, dirty: app.projectDirty, busy: app.projectBusy,
              canRegenerate: app.projectGenerator != null && supportsExactGeneratorRegeneration(app.projectGenerator),
              onNew: app.startNewProject, onOpen: app.openProjectPicker, onOpenPath: app.openProjectPath,
              onSave: app.saveProject, onSaveAs: app.saveProjectAs,
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
