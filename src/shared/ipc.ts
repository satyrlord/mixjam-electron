export const IPC_CHANNELS = {
  appGetVersion: 'app:get-version',
  windowResizeTracker: 'window:resize-tracker',
  windowResizeHome: 'window:resize-home',
  dialogOpenFile: 'dialog:open-file',
  dialogOpenFolder: 'dialog:open-folder',
  shellOpenUrl: 'shell:open-url',
  sessionLoad: 'session:load',
  sessionSave: 'session:save',
  recentProjectsList: 'recent-projects:list',
  recentProjectsRecord: 'recent-projects:record',
  sampleBrowserQuery: 'sample-browser:query',
  folderPick: 'folder:pick',
  folderValidate: 'folder:validate'
} as const

export type FolderRole = 'user' | 'sample'

export interface SessionPaths {
  userFolder: string | null
  sampleFolder: string | null
}

export interface RecentProjectItem {
  path: string
  displayName: string
  lastOpened: string | null
}

export interface SampleBrowserItem {
  id: string
  name: string
  path: string
  category: string
  duration: string
  metadata: string[]
  tags: string[]
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
  loadRecentProjects: (userFolder: string | null) => Promise<RecentProjectItem[]>
  recordRecentProject: (projectPath: string) => Promise<void>
  querySampleBrowser: (
    sampleFolder: string | null,
    searchQuery: string,
    forceRescan?: boolean
  ) => Promise<SampleBrowserItem[]>
  pickFolder: (role: FolderRole) => Promise<string | null>
  validateFolder: (path: string, role: FolderRole) => Promise<boolean>
}
