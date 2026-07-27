import { useCallback, useEffect, useMemo } from 'react'
import type { BackendAPI, FolderRef } from '../../../shared/backend-api'
import { useLibraryData, type LibraryData } from './useLibraryData'
import { useTransportEngine, type TransportEngine } from './useTransportEngine'
import { useMixer, type Mixer } from './useMixer'
import { useProjectPersistence, type ProjectPersistence } from './useProjectPersistence'
import { useMediaSessionControls } from './useMediaSessionControls'

const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

export interface AppNavigation {
  startNewProject: () => Promise<void>
  goToPlayer: () => Promise<void>
  goToHome: () => Promise<void>
  openRepo: () => Promise<void>
}

export interface AppState {
  library: LibraryData
  transport: TransportEngine
  mixer: Mixer
  project: ProjectPersistence
  navigation: AppNavigation
}

/**
 * Orchestrator hook that wires the library-data and transport-engine hooks
 * together, handling the cross-cutting navigation and sample-placement flows.
 *
 * Project persistence stays on the renderer main thread because File System
 * Access pickers require user activation. The backend facade supplies only
 * contained User/Sample Folder file operations; this hook coordinates those
 * operations with the transport and mixer state owners.
 */
export function useAppState(
  backendAPI: BackendAPI,
  userFolder: FolderRef | null,
  sampleFolder: FolderRef | null
): AppState {
  const lib = useLibraryData(backendAPI, sampleFolder)
  const engine = useTransportEngine(backendAPI, sampleFolder)
  const mixer = useMixer(engine.playbackEngineRef, engine.lanes, engine.fxBuses)
  const activeProject = useMemo(() => ({
    song: engine.song,
    lanes: engine.lanes,
    fxBuses: engine.fxBuses,
    masterBus: engine.masterBus
  }), [engine.fxBuses, engine.lanes, engine.masterBus, engine.song])
  const project = useProjectPersistence({
    backendAPI,
    userFolder,
    sampleFolder,
    project: activeProject,
    replaceProject: engine.replaceProjectState
  })

  const {
    resolvePendingPlacementBpms,
    setView,
    transportPlay,
    transportPause,
    transportSkipBack,
    transportJumpToEnd
  } = engine
  useMediaSessionControls({ transportPlay, transportPause, transportSkipBack, transportJumpToEnd })
  const { setSelectedSampleDetail } = lib
  const {
    beginNewProject,
    openProjectPicker: openProjectFromPicker,
    openProjectPath: openProjectFromPath
  } = project

  useEffect(() => {
    const sampleBpms = new Map<string, number>()
    for (const sample of lib.samples) {
      if (sample.bpm !== null && Number.isFinite(sample.bpm) && sample.bpm > 0) {
        sampleBpms.set(sample.relpath, sample.bpm)
      }
    }
    if (sampleBpms.size > 0) resolvePendingPlacementBpms(sampleBpms)
  }, [lib.samples, resolvePendingPlacementBpms])

  const goToPlayer = useCallback(async () => {
    await backendAPI.resizeToPlayer()
    setView('player')
  }, [backendAPI, setView])

  const startNewProject = useCallback(async () => {
    beginNewProject()
    await goToPlayer()
  }, [beginNewProject, goToPlayer])

  const openProjectPicker = useCallback(async () => {
    const opened = await openProjectFromPicker()
    if (opened) await goToPlayer()
    return opened
  }, [goToPlayer, openProjectFromPicker])

  const openProjectPath = useCallback(async (projectRelpath: string) => {
    const opened = await openProjectFromPath(projectRelpath)
    if (opened) await goToPlayer()
    return opened
  }, [goToPlayer, openProjectFromPath])

  const goToHome = useCallback(async () => {
    await backendAPI.resizeToHome()
    setSelectedSampleDetail(null)
    setView('home')
  }, [backendAPI, setSelectedSampleDetail, setView])

  const openRepo = useCallback(async () => {
    await backendAPI.openExternal(GITHUB_URL)
  }, [backendAPI])

  const navigation = useMemo<AppNavigation>(() => ({
    startNewProject,
    goToPlayer,
    goToHome,
    openRepo
  }), [goToHome, goToPlayer, openRepo, startNewProject])

  return {
    library: lib,
    transport: engine,
    mixer,
    project: {
      ...project,
      openProjectPicker,
      openProjectPath
    },
    navigation
  }
}
