import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ElectronAPI } from '../shared/ipc'

const api: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion),
  resizeToTracker: () => ipcRenderer.invoke(IPC_CHANNELS.windowResizeTracker),
  resizeToHome: () => ipcRenderer.invoke(IPC_CHANNELS.windowResizeHome),
  openFilePicker: () => ipcRenderer.invoke(IPC_CHANNELS.dialogOpenFile),
  openFolderPicker: () => ipcRenderer.invoke(IPC_CHANNELS.dialogOpenFolder),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.shellOpenUrl, url),
  loadSession: () => ipcRenderer.invoke(IPC_CHANNELS.sessionLoad),
  saveSession: (paths) => ipcRenderer.invoke(IPC_CHANNELS.sessionSave, paths),
  loadRecentProjects: (userFolder) =>
    ipcRenderer.invoke(IPC_CHANNELS.recentProjectsList, userFolder),
  recordRecentProject: (projectPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.recentProjectsRecord, projectPath),
  querySampleBrowser: (sampleFolder, searchQuery, forceRescan = false) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.sampleBrowserQuery,
      sampleFolder,
      searchQuery,
      forceRescan
    ),
  pickFolder: (role) => ipcRenderer.invoke(IPC_CHANNELS.folderPick, role),
  validateFolder: (path, role) => ipcRenderer.invoke(IPC_CHANNELS.folderValidate, path, role)
}

contextBridge.exposeInMainWorld('electronAPI', api)
