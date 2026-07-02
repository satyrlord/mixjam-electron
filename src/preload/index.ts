import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, IPC_SCAN_PROGRESS, IPC_SCAN_DONE, type ElectronAPI } from '../shared/ipc'

const api: ElectronAPI = {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion),
  resizeToTracker: () => ipcRenderer.invoke(IPC_CHANNELS.windowResizeTracker),
  resizeToHome: () => ipcRenderer.invoke(IPC_CHANNELS.windowResizeHome),
  openFilePicker: () => ipcRenderer.invoke(IPC_CHANNELS.dialogOpenFile),
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
  validateFolder: (path, role) => ipcRenderer.invoke(IPC_CHANNELS.folderValidate, path, role),
  startScan: (sampleFolder) => ipcRenderer.invoke(IPC_CHANNELS.libraryStartScan, sampleFolder),
  getScanProgress: () => ipcRenderer.invoke(IPC_CHANNELS.libraryGetProgress),
  querySamples: (req) => ipcRenderer.invoke(IPC_CHANNELS.libraryQuerySamples, req),
  listTags: () => ipcRenderer.invoke(IPC_CHANNELS.libraryListTags),
  createTag: (name, color) => ipcRenderer.invoke(IPC_CHANNELS.libraryCreateTag, name, color),
  renameTag: (id, name) => ipcRenderer.invoke(IPC_CHANNELS.libraryRenameTag, id, name),
  deleteTag: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryDeleteTag, id),
  assignTag: (sampleId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.libraryAssignTag, sampleId, tagId),
  unassignTag: (sampleId, tagId) =>
    ipcRenderer.invoke(IPC_CHANNELS.libraryUnassignTag, sampleId, tagId),
  listCategories: () => ipcRenderer.invoke(IPC_CHANNELS.libraryListCategories),
  createCategory: (name, parentId) =>
    ipcRenderer.invoke(IPC_CHANNELS.libraryCreateCategory, name, parentId),
  deleteCategory: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryDeleteCategory, id),
  listLibraries: () => ipcRenderer.invoke(IPC_CHANNELS.libraryListLibraries),
  saveLibrary: (name, ruleJson) =>
    ipcRenderer.invoke(IPC_CHANNELS.librarySaveLibrary, name, ruleJson),
  deleteLibrary: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryDeleteLibrary, id),
  hasSamples: () => ipcRenderer.invoke(IPC_CHANNELS.libraryHasSamples),
  readSampleBytes: (sampleFolder, filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.sampleReadBytes, sampleFolder, filePath),
  onScanProgress: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) =>
      cb(progress as Parameters<typeof cb>[0])
    ipcRenderer.on(IPC_SCAN_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_SCAN_PROGRESS, listener)
  },
  onScanDone: (cb) => {
    const listener = () => cb()
    ipcRenderer.on(IPC_SCAN_DONE, listener)
    return () => ipcRenderer.removeListener(IPC_SCAN_DONE, listener)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
