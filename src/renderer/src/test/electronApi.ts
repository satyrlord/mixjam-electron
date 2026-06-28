import { vi } from 'vitest'
import type { ElectronAPI } from '../../../shared/ipc'

/**
 * Single source of truth for a mocked {@link ElectronAPI}. Typed against the
 * shared contract so adding a channel breaks this factory until it is wired —
 * the same guarantee the real preload now provides.
 */
export function createElectronAPI(): ElectronAPI {
  return {
    getVersion: vi.fn().mockResolvedValue('v0.test.0'),
    resizeToTracker: vi.fn().mockResolvedValue(undefined),
    resizeToHome: vi.fn().mockResolvedValue(undefined),
    openFilePicker: vi.fn().mockResolvedValue(null),
    openFolderPicker: vi.fn().mockResolvedValue(null),
    openExternal: vi.fn().mockResolvedValue(undefined)
  }
}
