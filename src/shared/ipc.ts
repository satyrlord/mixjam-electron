export const IPC_CHANNELS = {
  appGetVersion: 'app:get-version',
  windowResizeTracker: 'window:resize-tracker',
  windowResizeHome: 'window:resize-home',
  dialogOpenFile: 'dialog:open-file',
  dialogOpenFolder: 'dialog:open-folder',
  shellOpenUrl: 'shell:open-url'
} as const

export interface ElectronAPI {
  getVersion: () => Promise<string>
  resizeToTracker: () => Promise<void>
  resizeToHome: () => Promise<void>
  openFilePicker: () => Promise<string | null>
  openFolderPicker: () => Promise<string | null>
  openExternal: (url: string) => Promise<void>
}
