import { contextBridge, ipcRenderer } from 'electron'
import { SHELL_IPC_CHANNELS, type ShellAPI } from '../shared/ipc'

// Host capabilities only — everything data-related lives in the renderer-side
// backend (see src/shared/backend-api.ts). The renderer detects this API to
// know it is running inside the Electron shell.
const api: ShellAPI = {
  getVersion: () => ipcRenderer.invoke(SHELL_IPC_CHANNELS.appGetVersion),
  resizeToPlayer: () => ipcRenderer.invoke(SHELL_IPC_CHANNELS.windowResizePlayer),
  resizeToHome: () => ipcRenderer.invoke(SHELL_IPC_CHANNELS.windowResizeHome),
  openExternal: (url) => ipcRenderer.invoke(SHELL_IPC_CHANNELS.shellOpenUrl, url)
}

contextBridge.exposeInMainWorld('shellAPI', api)
