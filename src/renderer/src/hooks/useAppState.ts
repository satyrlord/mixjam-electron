import { useCallback, useEffect, useMemo } from 'react'
import type { BackendAPI, FolderRef } from '../../../shared/backend-api'
import { useLibraryData, type LibraryData } from './useLibraryData'
import { useTransportEngine, type TransportEngine } from './useTransportEngine'
import { useMixer, type Mixer } from './useMixer'
import { useProjectPersistence, type ProjectPersistence } from './useProjectPersistence'

const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

export type AppState = LibraryData & TransportEngine & Mixer & ProjectPersistence & {
  startNewProject: () => Promise<void>
  goToPlayer: () => Promise<void>
  goToHome: () => Promise<void>
  openRepo: () => Promise<void>
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
  const lib = useLibraryData(backendAPI, userFolder, sampleFolder)
  const engine = useTransportEngine(backendAPI, sampleFolder)
  const mixer = useMixer(engine.playbackEngineRef, engine.view)
  const project = useProjectPersistence({
    backendAPI,
    userFolder,
    sampleFolder,
    lanes: engine.lanes,
    bpm: engine.bpm,
    masterGain: engine.masterGain,
    channels: mixer.channels,
    replaceTransportProject: engine.replaceProjectState,
    replaceChannels: mixer.replaceChannels,
    reloadMixJamFiles: lib.reloadMixJamFiles
  })

  const { resolvePendingPlacementBpms, setView } = engine
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

  const missingSamplePaths = useMemo(() => new Set([
    ...lib.missingSamplePaths,
    ...project.projectMissingSamplePaths
  ]), [lib.missingSamplePaths, project.projectMissingSamplePaths])

  return {
    ...lib,
    ...engine,
    ...mixer,
    ...project,
    missingSamplePaths,
    startNewProject,
    openProjectPicker,
    openProjectPath,
    goToPlayer,
    goToHome,
    openRepo
  }
}
