import { useCallback } from 'react'
import type { BackendAPI, FolderRef } from '../../../shared/backend-api'
import { useLibraryData, type LibraryData } from './useLibraryData'
import { useTransportEngine, type TransportEngine } from './useTransportEngine'
import { useMixer, type Mixer } from './useMixer'

const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

export type AppState = LibraryData & TransportEngine & Mixer & {
  goToPlayer: () => Promise<void>
  goToHome: () => Promise<void>
  openRepo: () => Promise<void>
}

/**
 * Orchestrator hook that wires the library-data and transport-engine hooks
 * together, handling the cross-cutting navigation and sample-placement flows.
 *
 * Project load (Load MixJam / opening a MixJam file) is intentionally
 * absent: .mixjam persistence is spec-011, and until it ships the UI gates
 * those affordances instead of promising a load that discards its result.
 */
export function useAppState(
  backendAPI: BackendAPI,
  userFolder: FolderRef | null,
  sampleFolder: FolderRef | null
): AppState {
  const lib = useLibraryData(backendAPI, userFolder, sampleFolder)
  const engine = useTransportEngine(backendAPI, sampleFolder)
  const mixer = useMixer(engine.playbackEngineRef, engine.view)

  const { setView } = engine
  const { setSelectedSampleDetail, startLibraryScan, scanProgress, dbIndexed } = lib

  const goToPlayer = useCallback(async () => {
    await backendAPI.resizeToPlayer()
    setView('player')
    // Auto-scan on FIRST entry only: the sample folder is set, no scan is
    // running, and this folder has never been indexed. Re-entering the Player
    // with an indexed library must not re-walk the whole folder — the user
    // triggers that explicitly with Re-scan.
    if (sampleFolder && scanProgress.status === 'idle' && !dbIndexed) {
      void startLibraryScan()
    }
  }, [backendAPI, setView, sampleFolder, scanProgress.status, dbIndexed, startLibraryScan])

  const goToHome = useCallback(async () => {
    await backendAPI.resizeToHome()
    setSelectedSampleDetail(null)
    setView('home')
  }, [backendAPI, setSelectedSampleDetail, setView])

  const openRepo = useCallback(async () => {
    await backendAPI.openExternal(GITHUB_URL)
  }, [backendAPI])

  return {
    ...lib,
    ...engine,
    ...mixer,
    goToPlayer,
    goToHome,
    openRepo
  }
}
