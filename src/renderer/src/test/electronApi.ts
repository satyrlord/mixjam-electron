import { vi } from 'vitest'
import type { ElectronAPI } from '../../../shared/ipc'

const DEFAULT_SESSION = { userFolder: 'C:/Users/test/MixJam', sampleFolder: 'C:/Samples' }

export function createElectronAPI(): ElectronAPI {
  return {
    getVersion: vi.fn().mockResolvedValue('v0.test.0'),
    resizeToTracker: vi.fn().mockResolvedValue(undefined),
    resizeToHome: vi.fn().mockResolvedValue(undefined),
    openFilePicker: vi.fn().mockResolvedValue(null),
    openFolderPicker: vi.fn().mockResolvedValue(null),
    openExternal: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(DEFAULT_SESSION),
    saveSession: vi.fn().mockResolvedValue(undefined),
    pickFolder: vi.fn().mockResolvedValue(null),
    validateFolder: vi.fn().mockResolvedValue(true)
  }
}
