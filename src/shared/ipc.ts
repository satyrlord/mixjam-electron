export const IPC_CHANNELS = {
  appGetVersion: 'app:get-version',
  windowResizeTracker: 'window:resize-tracker',
  windowResizeHome: 'window:resize-home',
  dialogOpenFile: 'dialog:open-file',
  dialogOpenFolder: 'dialog:open-folder',
  shellOpenUrl: 'shell:open-url',
  sessionLoad: 'session:load',
  sessionSave: 'session:save',
  folderPick: 'folder:pick',
  folderValidate: 'folder:validate'
} as const

export type FolderRole = 'user' | 'sample'

export interface SessionPaths {
  userFolder: string | null
  sampleFolder: string | null
}

export interface ElectronAPI {
  getVersion: () => Promise<string>
  resizeToTracker: () => Promise<void>
  resizeToHome: () => Promise<void>
  openFilePicker: () => Promise<string | null>
  openFolderPicker: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  loadSession: () => Promise<SessionPaths>
  saveSession: (paths: SessionPaths) => Promise<void>
  pickFolder: (role: FolderRole) => Promise<string | null>
  validateFolder: (path: string, role: FolderRole) => Promise<boolean>
}
