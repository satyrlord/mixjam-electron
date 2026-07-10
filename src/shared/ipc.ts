// IPC surface of the thin Electron shell. Everything data-related lives in the
// renderer-side backend (src/shared/backend-api.ts); the shell only provides
// the host capabilities a plain browser cannot.

export const SHELL_IPC_CHANNELS = {
  appGetVersion: 'app:get-version',
  windowResizePlayer: 'window:resize-player',
  windowResizeHome: 'window:resize-home',
  shellOpenUrl: 'shell:open-url'
} as const

/** Host capabilities exposed by the Electron preload as window.shellAPI.
 *  Absent in the plain browser, where the backend substitutes fallbacks. */
export interface ShellAPI {
  getVersion: () => Promise<string>
  resizeToPlayer: () => Promise<void>
  resizeToHome: () => Promise<void>
  openExternal: (url: string) => Promise<void>
}
