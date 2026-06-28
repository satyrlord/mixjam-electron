import { join } from 'path'
import type { BrowserWindowConstructorOptions, NativeImage } from 'electron'

export const HOME_WINDOW_SIZE = Object.freeze({ width: 1280, height: 720 })
export const TRACKER_WINDOW_SIZE = Object.freeze({ width: 1920, height: 1080 })

export interface WindowFrameControls {
  setResizable(value: boolean): void
  setMaximizable(value: boolean): void
  setSize(width: number, height: number): void
  center(): void
}

export function buildAppIconPath(baseDir: string): string {
  return join(baseDir, '../../public/app-icon.ico')
}

export function buildPreloadPath(baseDir: string): string {
  return join(baseDir, '../preload/index.js')
}

export function createMainWindowOptions(preloadPath: string, icon: NativeImage): BrowserWindowConstructorOptions {
  return {
    ...HOME_WINDOW_SIZE,
    center: true,
    resizable: false,
    maximizable: false,
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

export function resizeWindowToTracker(window: WindowFrameControls): void {
  window.setResizable(true)
  window.setMaximizable(true)
  window.setSize(TRACKER_WINDOW_SIZE.width, TRACKER_WINDOW_SIZE.height)
  window.center()
}

export function resizeWindowToHome(window: WindowFrameControls): void {
  // setSize must come before setResizable(false) — on Windows, a non-resizable
  // window ignores setSize calls.
  window.setResizable(true)
  window.setSize(HOME_WINDOW_SIZE.width, HOME_WINDOW_SIZE.height)
  window.center()
  window.setResizable(false)
  window.setMaximizable(false)
}