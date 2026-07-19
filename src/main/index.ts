// Electron host. The backend (SQLite, indexing, app state, folder access)
// stays in the sandboxed renderer. This process owns the native window, the
// stable app:// origin, File System Access permissions, and allowlisted
// external navigation.

import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, protocol, session, shell } from 'electron'
import { join, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { SHELL_IPC_CHANNELS } from '../shared/ipc'
import {
  buildAppIconPath,
  buildPreloadPath,
  createMainWindowOptions,
  enforceMinimumContentSize,
  resizeWindowToHome,
  resizeWindowToPlayer
} from '../shared/window-config'

let mainWindow: BrowserWindow | null = null
const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'www.github.com'])

// app.getVersion() returns Electron's own version in an unpackaged run rather
// than this app's. __APP_VERSION__ is inlined from package.json at build time
// (see electron.vite.config.ts).
declare const __APP_VERSION__: string | undefined
function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : app.getVersion()
}

// The renderer is served from a custom privileged scheme instead of file://
// because OPFS, IndexedDB, and File System Access permission persistence all
// key off a stable, secure origin — file:// origins get opaque/partitioned
// storage that would lose the library and folder grants on every launch.
const APP_SCHEME = 'app'
const APP_ORIGIN = `${APP_SCHEME}://bundle`

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true
    }
  }
])

function registerAppProtocol(): void {
  const rendererRoot = join(__dirname, '../renderer')
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url)
    const pathname = decodeURIComponent(url.pathname)
    const target = normalize(join(rendererRoot, pathname === '/' ? 'index.html' : pathname))
    // Containment: never serve files outside the renderer bundle.
    if (target !== rendererRoot && !target.startsWith(rendererRoot + sep)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}

// Desktop UX parity: users never see Chromium permission prompts. The shell
// grants File System Access outright — the pickers themselves still require a
// user gesture, so this only skips the "let this site see files?" dialogs.
function installPermissionHandlers(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'fileSystem')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'fileSystem'
  })
  session.defaultSession.on('file-system-access-restricted', (_event, _details, callback) => {
    callback('allow')
  })
}

function createWindow(): void {
  Menu.setApplicationMenu(null)

  const icon = nativeImage.createFromPath(buildAppIconPath(__dirname))
  const window = new BrowserWindow(createMainWindowOptions(buildPreloadPath(__dirname), icon))
  enforceMinimumContentSize(window)
  mainWindow = window

  window.once('ready-to-show', () => {
    window.show()
  })

  // The renderer must never open new windows or navigate away; external links
  // go through the allowlisted shell:open-url IPC channel instead.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // Drop the reference on close so IPC handlers never touch a destroyed window
  // (macOS keeps the app alive after the last window closes until 'activate').
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadURL(`${APP_ORIGIN}/index.html`)
  }
}

app.whenReady().then(() => {
  registerAppProtocol()
  installPermissionHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.handle(SHELL_IPC_CHANNELS.appGetVersion, () => appVersion())

ipcMain.handle(SHELL_IPC_CHANNELS.windowResizePlayer, () => {
  if (!mainWindow) return
  resizeWindowToPlayer(mainWindow)
})

ipcMain.handle(SHELL_IPC_CHANNELS.windowResizeHome, () => {
  if (!mainWindow) return
  resizeWindowToHome(mainWindow)
})

ipcMain.handle(SHELL_IPC_CHANNELS.shellOpenUrl, async (_event, rawUrl: unknown) => {
  if (typeof rawUrl !== 'string') return

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return
  }

  if (parsedUrl.protocol !== 'https:') return
  if (!ALLOWED_EXTERNAL_HOSTS.has(parsedUrl.hostname.toLowerCase())) return

  await shell.openExternal(parsedUrl.toString())
})
