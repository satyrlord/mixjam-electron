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

export function buildAppIconPath(baseDir: string): string {
  return join(baseDir, '../../public/app-icon.ico')
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
      sandbox: true
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

export function resizeWindowToHome(window: WindowFrameControls): void {
  window.unmaximize?.()
  if (window.setContentSize) {
    window.setContentSize(HOME_WINDOW_SIZE.width, HOME_WINDOW_SIZE.height)
  } else {
    window.setSize(HOME_WINDOW_SIZE.width, HOME_WINDOW_SIZE.height)
  }
  window.center()
}
