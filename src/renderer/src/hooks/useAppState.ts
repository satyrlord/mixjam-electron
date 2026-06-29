import { useCallback } from 'react'
import type { ElectronAPI } from '../../../shared/ipc'
import { useLibraryData, type LibraryData } from './useLibraryData'
import { useTransportEngine, type TransportEngine } from './useTransportEngine'

const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

export type AppState = LibraryData & TransportEngine & {
  goToTracker: () => Promise<void>
  goToHome: () => Promise<void>
  handleLoadMixJam: () => Promise<void>
  openFolderPicker: () => Promise<void>
  openRepo: () => Promise<void>
}

/**
 * Orchestrator hook that wires the library-data and transport-engine hooks
 * together, handling the cross-cutting navigation and sample-placement flows.
 */
export function useAppState(
  electronAPI: ElectronAPI,
  userFolder: string | null,
  sampleFolder: string | null
): AppState {
  const lib = useLibraryData(electronAPI, userFolder, sampleFolder)
  const engine = useTransportEngine(electronAPI, sampleFolder)

  const { setView } = engine
  const { setSelectedSampleDetail, reloadRecentProjects, startLibraryScan, scanProgress } = lib

  const goToTracker = useCallback(async () => {
    await electronAPI.resizeToTracker()
    setView('tracker')
    // Auto-scan on first entry if sample folder is set and never scanned
    if (sampleFolder && scanProgress.status === 'idle') {
      void startLibraryScan()
    }
  }, [electronAPI, setView, sampleFolder, scanProgress.status, startLibraryScan])

  const goToHome = useCallback(async () => {
    await electronAPI.resizeToHome()
    setSelectedSampleDetail(null)
    setView('home')
  }, [electronAPI, setSelectedSampleDetail, setView])

  const handleLoadMixJam = useCallback(async () => {
    const file = await electronAPI.openFilePicker()
    if (file !== null) {
      try {
        await electronAPI.recordRecentProject(file)
        await reloadRecentProjects()
      } catch (error) {
        console.error('Failed to record recent project:', error)
      }
      await goToTracker()
    }
  }, [electronAPI, reloadRecentProjects, goToTracker])

  const openFolderPicker = useCallback(async () => {
    await electronAPI.openFolderPicker()
  }, [electronAPI])

  const openRepo = useCallback(async () => {
    await electronAPI.openExternal(GITHUB_URL)
  }, [electronAPI])

  return {
    ...lib,
    ...engine,
    goToTracker,
    goToHome,
    handleLoadMixJam,
    openFolderPicker,
    openRepo
  }
}
