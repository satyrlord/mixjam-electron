import { join } from 'path'
import type { BrowserWindowConstructorOptions, NativeImage } from 'electron'
import { MINIMUM_VIEWPORT } from './viewport'

/** Minimum window size for all views — 1080p (1920 x 1080). */
const MIN_WINDOW_SIZE = MINIMUM_VIEWPORT

/** Both application views use the same 1080p minimum. */
export const HOME_WINDOW_SIZE = MIN_WINDOW_SIZE
export const PLAYER_WINDOW_SIZE = MIN_WINDOW_SIZE

export interface WindowFrameControls {
  setResizable(value: boolean): void
  setMaximizable(value: boolean): void
  setSize(width: number, height: number): void
  setContentSize?(width: number, height: number): void
  setMinimumSize?(width: number, height: number): void
  getBounds?(): { width: number; height: number }
  getContentBounds?(): { width: number; height: number }
  center(): void
  maximize?(): void
  unmaximize?(): void
  isMaximized?(): boolean
  once?(event: 'unmaximize', listener: () => void): void
}

/** BrowserWindow minimum sizes use native-frame bounds. Convert the renderer
 * content contract to the matching outer size for the current platform. */
export function enforceMinimumContentSize(window: WindowFrameControls): void {
  if (!window.setMinimumSize) return
  const bounds = window.getBounds?.()
  const content = window.getContentBounds?.()
  const frameWidth = bounds && content ? Math.max(0, bounds.width - content.width) : 0
  const frameHeight = bounds && content ? Math.max(0, bounds.height - content.height) : 0
  window.setMinimumSize(
    MIN_WINDOW_SIZE.width + frameWidth,
    MIN_WINDOW_SIZE.height + frameHeight
  )
}

export function buildAppIconPath(baseDir: string, platform = process.platform): string {
  const filename = platform === 'win32' ? 'app-icon.ico' : 'app-icon-512.png'
  return join(baseDir, '../../public', filename)
}

export function buildPreloadPath(baseDir: string): string {
  return join(baseDir, '../preload/index.js')
}

export function createMainWindowOptions(preloadPath: string, icon: NativeImage): BrowserWindowConstructorOptions {
  return {
    ...MIN_WINDOW_SIZE,
    useContentSize: true,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    center: true,
    resizable: true,
    maximizable: true,
    icon,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The note scheduler is a 25 ms window.setInterval on the renderer main
      // thread with a 100 ms lookahead. Chromium clamps background timers to
      // >= 1 s, which would shred playback; the audio-playback exemption that
      // covers this today is an undocumented implementation detail, so opt out
      // explicitly rather than depend on it.
      backgroundThrottling: false
    }
  }
}

export function resizeWindowToPlayer(window: WindowFrameControls): void {
  if (window.setContentSize) {
    window.setContentSize(PLAYER_WINDOW_SIZE.width, PLAYER_WINDOW_SIZE.height)
  } else {
    window.setSize(PLAYER_WINDOW_SIZE.width, PLAYER_WINDOW_SIZE.height)
  }
  enforceMinimumContentSize(window)
  window.center()
  window.maximize?.()
}

function applyHomeSize(window: WindowFrameControls): void {
  if (window.setContentSize) {
    window.setContentSize(HOME_WINDOW_SIZE.width, HOME_WINDOW_SIZE.height)
  } else {
    window.setSize(HOME_WINDOW_SIZE.width, HOME_WINDOW_SIZE.height)
  }
  enforceMinimumContentSize(window)
  window.center()
}

export function resizeWindowToHome(window: WindowFrameControls): void {
  const wasMaximized = window.isMaximized?.() ?? false
  const deferOperationsUntilUnmaximized = wasMaximized && Boolean(window.once)
  if (deferOperationsUntilUnmaximized) {
    // On Windows, calling setContentSize while maximized triggers an immediate
    // unmaximize via SetWindowPos, which fires the 'unmaximize' event before the
    // deferred SC_RESTORE is processed. That SC_RESTORE then moves the window to
    // a non-centered restore position, overwriting the center() call. Set the
    // minimum size constraints first so Windows can enforce them during the
    // restore transition, then defer setContentSize and center until after the
    // native unmaximize completes.
    enforceMinimumContentSize(window)
    window.once?.('unmaximize', () => {
      queueMicrotask(() => applyHomeSize(window))
    })
    window.unmaximize?.()
  } else {
    window.unmaximize?.()
    applyHomeSize(window)
  }
}
