import { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from '../shared/ipc'

let mainWindow: BrowserWindow | null = null
const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'www.github.com'])

function createWindow(): void {
  Menu.setApplicationMenu(null)

  const iconPath = join(__dirname, '../../public/app-icon.ico')
  const icon = nativeImage.createFromPath(iconPath)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    center: true,
    resizable: false,
    maximizable: false,
    icon,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

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

ipcMain.handle(IPC_CHANNELS.appGetVersion, () => app.getVersion())

ipcMain.handle(IPC_CHANNELS.windowResizeTracker, () => {
  if (!mainWindow) return
  mainWindow.setResizable(true)
  mainWindow.setMaximizable(true)
  mainWindow.setSize(1920, 1080)
  mainWindow.center()
})

ipcMain.handle(IPC_CHANNELS.windowResizeHome, () => {
  if (!mainWindow) return
  // setSize must come before setResizable(false) — on Windows, a non-resizable
  // window ignores setSize calls.
  mainWindow.setResizable(true)
  mainWindow.setSize(1280, 720)
  mainWindow.center()
  mainWindow.setResizable(false)
  mainWindow.setMaximizable(false)
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
