import { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS, type SessionPaths } from '../shared/ipc'
import {
  buildAppIconPath,
  buildPreloadPath,
  createMainWindowOptions,
  resizeWindowToHome,
  resizeWindowToTracker
} from '../shared/window-config'
import {
  SESSION_FILE_NAME,
  isFolderRole,
  normalizeSession,
  readSession,
  validateFolder,
  writeSession,
  writeSessionConfig
} from './session'

let mainWindow: BrowserWindow | null = null
let lastSession: SessionPaths = { userFolder: null, sampleFolder: null }
const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'www.github.com'])

function sessionFilePath(): string {
  return join(app.getPath('userData'), SESSION_FILE_NAME)
}

function createWindow(): void {
  Menu.setApplicationMenu(null)

  const iconPath = buildAppIconPath(__dirname)
  const icon = nativeImage.createFromPath(iconPath)
  const preloadPath = buildPreloadPath(__dirname)

  mainWindow = new BrowserWindow(createMainWindowOptions(preloadPath, icon))

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  void writeSessionConfig(lastSession, app.getVersion()).catch((error: unknown) => {
    console.error('Failed to write mixjam.json on quit:', error)
  })
})

ipcMain.handle(IPC_CHANNELS.appGetVersion, () => app.getVersion())

ipcMain.handle(IPC_CHANNELS.windowResizeTracker, () => {
  if (!mainWindow) return
  resizeWindowToTracker(mainWindow)
})

ipcMain.handle(IPC_CHANNELS.windowResizeHome, () => {
  if (!mainWindow) return
  resizeWindowToHome(mainWindow)
})

ipcMain.handle(IPC_CHANNELS.dialogOpenFile, async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'MixJam Project', extensions: ['mjam'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(IPC_CHANNELS.dialogOpenFolder, async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(IPC_CHANNELS.sessionLoad, async () => {
  lastSession = await readSession(sessionFilePath())
  return lastSession
})

ipcMain.handle(IPC_CHANNELS.sessionSave, async (_event, payload: unknown) => {
  lastSession = normalizeSession(payload)
  await writeSession(sessionFilePath(), lastSession)
  try {
    await writeSessionConfig(lastSession, app.getVersion())
  } catch (error) {
    console.error('Failed to write mixjam.json:', error)
  }
})

ipcMain.handle(IPC_CHANNELS.folderPick, async (_event, rawRole: unknown) => {
  if (!mainWindow || !isFolderRole(rawRole)) return null
  const title = rawRole === 'user' ? 'Select User Folder' : 'Select Sample Folder'
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(IPC_CHANNELS.folderValidate, async (_event, rawPath: unknown, rawRole: unknown) => {
  if (typeof rawPath !== 'string' || !isFolderRole(rawRole)) return false
  return validateFolder(rawPath, rawRole)
})

ipcMain.handle(IPC_CHANNELS.shellOpenUrl, async (_event, rawUrl: unknown) => {
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
