import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MINIMUM_VIEWPORT, supportsApplicationViewport } from '../../shared/viewport'
import Header from './components/Header'
import Footer from './components/Footer'
import HomeScreen from './components/HomeScreen'
import PlayerView from './components/PlayerView'
import SettingsModal from './components/SettingsModal'
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

  const handleToggleTagFilter = useCallback((id: number) => {
    app.setSelectedTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]
    )
  }, [app])

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

  const browserProps = useMemo(() => ({
    samples: app.samples, searchQuery: app.searchQuery, loading: app.loading, error: app.error,
    totalCount: app.totalCount, hasMoreSamples: app.hasMoreSamples,
    selectedSamplePath: app.selectedSampleDetail?.relpath ?? null,
    selectedCategoryId: app.selectedCategoryId, selectedTagIds: app.selectedTagIds,
    sortBy: app.sortBy, sortDir: app.sortDir, tags: app.tags, categories: app.categories,
    libraries: app.libraries, librarySyncState: app.librarySyncState,
    onSearchChange: app.setSearchQuery, onLoadMoreSamples: app.loadMoreSamples,
    onSelectSampleDetail: app.setSelectedSampleDetail, onPreviewSample: app.previewSample,
    onSelectCategory: app.setSelectedCategoryId, onToggleTagFilter: handleToggleTagFilter,
    onSortChange: app.handleSortChange, onRescanLibrary: app.rescanLibrary,
    onRetryLibrarySync: app.retryLibrarySync, onCancelLibrarySync: app.cancelLibrarySync,
    onCreateTag: app.createTag, onRenameTag: app.renameTag, onSetTagColor: app.setTagColor,
    onDeleteTag: app.deleteTag, onAssignTagToSample: app.assignTagToSample,
    onUnassignTagFromSample: app.unassignTagFromSample,
    onUpdateSampleAnalysis: app.updateSampleAnalysis, onReanalyzeSample: app.reanalyzeSample,
    onCreateCategory: app.createCategory, onDeleteCategory: app.deleteCategory,
    onSaveLibrary: app.saveLibrary, onDeleteLibrary: app.deleteLibrary, onApplyLibrary: app.applyLibrary
  }), [
    app.samples, app.searchQuery, app.loading, app.error, app.totalCount, app.hasMoreSamples,
    app.selectedSampleDetail, app.selectedCategoryId, app.selectedTagIds, app.sortBy, app.sortDir,
    app.tags, app.categories, app.libraries, app.librarySyncState,
    app.setSearchQuery, app.loadMoreSamples, app.setSelectedSampleDetail, app.previewSample,
    app.setSelectedCategoryId, handleToggleTagFilter, app.handleSortChange, app.rescanLibrary,
    app.retryLibrarySync, app.cancelLibrarySync, app.createTag, app.renameTag, app.setTagColor,
    app.deleteTag, app.assignTagToSample, app.unassignTagFromSample, app.updateSampleAnalysis,
    app.reanalyzeSample, app.createCategory, app.deleteCategory, app.saveLibrary, app.deleteLibrary,
    app.applyLibrary
  ])

  const arrangementProps = useMemo(() => ({
    lanes: app.lanes, laneShouldDim: app.laneShouldDim, tickStore: app.tickStore,
    missingSamplePaths: app.missingSamplePaths, onPlaceSampleDetailOnLane: app.placeSampleDetailOnLane,
    onMovePlacement: app.movePlacement, onDuplicatePlacement: app.duplicatePlacement,
    onMovePlacementGroup: app.movePlacementGroup, onDuplicatePlacementGroup: app.duplicatePlacementGroup,
    onRemovePlacementFromLane: app.removePlacementFromLane, onRemovePlacements: app.removePlacements,
    onSetLanePan: app.setLanePan, onRenameLane: app.renameLane,
    onToggleLaneMute: app.toggleLaneMute, onToggleLaneSolo: app.toggleLaneSolo,
    onAddLane: app.addLane, onDeleteLane: app.deleteLane, onDeleteEmptyLanes: app.deleteEmptyLanes
  }), [
    app.lanes, app.laneShouldDim, app.tickStore, app.missingSamplePaths,
    app.placeSampleDetailOnLane, app.movePlacement, app.duplicatePlacement,
    app.movePlacementGroup, app.duplicatePlacementGroup, app.removePlacementFromLane,
    app.removePlacements, app.setLanePan, app.renameLane, app.toggleLaneMute,
    app.toggleLaneSolo, app.addLane, app.deleteLane, app.deleteEmptyLanes
  ])

  const transportProps = useMemo(() => ({
    transportState: app.transportState, songEndTick: app.songEndTick, bpm: app.bpm,
    masterGain: app.masterGain,
    masterMeterStore: app.masterMeterStore, canUndo: app.canUndo, canRedo: app.canRedo,
    onSetBpm: app.setBpm,
    onUndo: app.undo, onRedo: app.redo, onTransportPlay: app.transportPlay,
    onTransportPause: app.transportPause, onTransportStop: app.transportStop,
    onTransportSkipBack: app.transportSkipBack, onTransportJumpToEnd: app.transportJumpToEnd,
    onTransportSeek: app.transportSeek
  }), [
    app.transportState, app.songEndTick, app.bpm, app.masterGain, app.masterMeterStore,
    app.canUndo, app.canRedo, app.setBpm, app.undo, app.redo, app.transportPlay,
    app.transportPause, app.transportStop, app.transportSkipBack, app.transportJumpToEnd,
    app.transportSeek
  ])

  const masterBusProps = useMemo(() => ({
    state: app.masterBus,
    getMeterSnapshot: app.getMasterBusMeterSnapshot,
    onSetMetersActive: app.setMasterBusMetersActive,
    onSetParam: app.setMasterBusParam,
    onTogglePower: app.toggleMasterBusPower,
    onReorder: app.reorderMasterBus,
    onApplyPreset: app.applyMasterBusPreset
  }), [
    app.masterBus, app.getMasterBusMeterSnapshot, app.setMasterBusMetersActive,
    app.setMasterBusParam, app.toggleMasterBusPower, app.reorderMasterBus, app.applyMasterBusPreset
  ])

  const mixerProps = useMemo(() => ({
    returnBuses: app.returnBuses, channelMetersStore: app.channelMetersStore,
    onSetVisualTelemetryActive: app.setVisualTelemetryActive,
    onBeginMixerGesture: app.beginMixerGesture, onCommitMixerGesture: app.commitMixerGesture,
    onSetChannelGain: app.setChannelGain, onSetChannelPan: app.setChannelPan,
    onSetChannelSend: app.setChannelSend, onSetReturnBus: app.setReturnBus,
    onPreviewReturnBus: app.previewReturnBus
  }), [
    app.returnBuses, app.channelMetersStore, app.setVisualTelemetryActive,
    app.beginMixerGesture, app.commitMixerGesture, app.setChannelGain, app.setChannelPan,
    app.setChannelSend, app.setReturnBus, app.previewReturnBus
  ])

  const projectProps = useMemo(() => ({
    name: app.projectName, dirty: app.projectDirty, busy: app.projectBusy,
    canRegenerate: app.projectGenerator != null && supportsExactGeneratorRegeneration(app.projectGenerator),
    onNew: app.startNewProject, onOpen: app.openProjectPicker, onOpenPath: app.openProjectPath,
    onSave: app.saveProject, onSaveAs: app.saveProjectAs,
    onRegenerateExact: handleRegenerateExact,
    onRegenerateCurrent: handleRegenerateCurrent
  }), [
    app.projectName, app.projectDirty, app.projectBusy, app.projectGenerator,
    app.startNewProject, app.openProjectPicker, app.openProjectPath, app.saveProject,
    app.saveProjectAs, handleRegenerateExact, handleRegenerateCurrent
  ])

  return (
    <UiSizeProvider size={uiSize}>
      <TooltipProvider>
        <div className="app" data-ui-size={uiSize}>
          <Header
        view={app.view}
        elapsedMsStore={app.elapsedMsStore}
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
            onPickUser={pickUser}
            onPickSample={pickSample}
            onRestoreUser={restoreUser}
            onRestoreSample={restoreSample}
            onRetryLibrarySync={() => void app.retryLibrarySync()}
            onCancelLibrarySync={() => void app.cancelLibrarySync()}
            onStart={app.startNewProject}
            onLoad={app.openProjectPicker}
            onOpenProject={app.openProjectPath}
            onOpenGenerator={handleOpenGenerator}
            generatorReadiness={generator.readiness}
          />
        ) : (
          <PlayerView
            mixJamFiles={app.mixJamFiles}
            browser={browserProps}
            arrangement={arrangementProps}
            transport={transportProps}
            masterBus={masterBusProps}
            mixer={mixerProps}
            project={projectProps}
          />
        )}
          </main>
          <Footer
            view={app.view}
            version={app.version}
            sampleDetail={app.selectedSampleDetail}
            onOpenSettings={() => setSettingsOpen(true)}
            settingsButtonRef={settingsButtonRef}
            onOpenRepo={app.openRepo}
            getSampleBuffer={app.getSampleBuffer}
          />
          {settingsOpen && app.view === 'player' && (
            <SettingsModal
              userFolder={userFolder}
              uiSize={uiSize}
              clipEdgeMicroFades={app.clipEdgeMicroFades}
              onSelectUserFolder={pickUser}
              onUiSizeChange={handleUiSizeChange}
              onSetClipEdgeMicroFades={app.setClipEdgeMicroFades}
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
