import type { BackendAPI } from '../../shared/backend-api'
import type { ShellAPI } from '../../shared/ipc'

declare global {
  interface Window {
    /** Installed by main.tsx (real backend) or test/setup.ts (mock). */
    backendAPI: BackendAPI
    /** Present only inside the Electron shell (exposed by the preload). */
    shellAPI?: ShellAPI
  }
}

export {}
