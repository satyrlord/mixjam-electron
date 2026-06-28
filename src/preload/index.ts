import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ElectronAPI } from '../shared/ipc'

const api: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion),
  resizeToTracker: () => ipcRenderer.invoke(IPC_CHANNELS.windowResizeTracker),
  resizeToHome: () => ipcRenderer.invoke(IPC_CHANNELS.windowResizeHome),
  openFilePicker: () => ipcRenderer.invoke(IPC_CHANNELS.dialogOpenFile),
  openFolderPicker: () => ipcRenderer.invoke(IPC_CHANNELS.dialogOpenFolder),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.shellOpenUrl, url)
}

contextBridge.exposeInMainWorld('electronAPI', api)
