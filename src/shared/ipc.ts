// IPC surface of the Electron host. Everything data-related lives in the
// renderer-side backend; the shell provides native host capabilities only.

export const SHELL_IPC_CHANNELS = {
  appGetVersion: 'app:get-version',
  windowResizePlayer: 'window:resize-player',
  windowResizeHome: 'window:resize-home',
  shellOpenUrl: 'shell:open-url'
} as const

/** Native host capabilities exposed by the Electron preload as window.shellAPI. */
export interface ShellAPI {
  getVersion: () => Promise<string>
  resizeToPlayer: () => Promise<void>
  resizeToHome: () => Promise<void>
  openExternal: (url: string) => Promise<void>
}
