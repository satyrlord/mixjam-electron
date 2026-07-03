import { useCallback } from 'react'
import type { ElectronAPI } from '../../../shared/ipc'
import { useLibraryData, type LibraryData } from './useLibraryData'
import { useTransportEngine, type TransportEngine } from './useTransportEngine'

const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

export type AppState = LibraryData & TransportEngine & {
  goToTracker: () => Promise<void>
  goToHome: () => Promise<void>
  openRepo: () => Promise<void>
}

/**
 * Orchestrator hook that wires the library-data and transport-engine hooks
 * together, handling the cross-cutting navigation and sample-placement flows.
 *
 * Project load (Load MixJam / opening a recent project) is intentionally
 * absent: .mixjam persistence is spec-011, and until it ships the UI gates
 * those affordances instead of promising a load that discards its result.
 */
export function useAppState(
  electronAPI: ElectronAPI,
  userFolder: string | null,
  sampleFolder: string | null
): AppState {
  const lib = useLibraryData(electronAPI, userFolder, sampleFolder)
  const engine = useTransportEngine(electronAPI, sampleFolder)

  const { setView } = engine
  const { setSelectedSampleDetail, startLibraryScan, scanProgress, dbIndexed } = lib

  const goToTracker = useCallback(async () => {
    await electronAPI.resizeToTracker()
    setView('tracker')
    // Auto-scan on FIRST entry only: the sample folder is set, no scan is
    // running, and this folder has never been indexed. Re-entering the tracker
    // with an indexed library must not re-walk the whole folder — the user
    // triggers that explicitly with Re-scan.
    if (sampleFolder && scanProgress.status === 'idle' && !dbIndexed) {
      void startLibraryScan()
    }
  }, [electronAPI, setView, sampleFolder, scanProgress.status, dbIndexed, startLibraryScan])

  const goToHome = useCallback(async () => {
    await electronAPI.resizeToHome()
    setSelectedSampleDetail(null)
    setView('home')
  }, [electronAPI, setSelectedSampleDetail, setView])

  const openRepo = useCallback(async () => {
    await electronAPI.openExternal(GITHUB_URL)
  }, [electronAPI])

  return {
    ...lib,
    ...engine,
    goToTracker,
    goToHome,
    openRepo
  }
}
