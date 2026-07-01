import { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage } from 'electron'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { promises as fs } from 'node:fs'
import { canonicalizePath } from './path-utils'
import { IPC_CHANNELS, normalizeSampleQueryRequest, type SessionPaths } from '../shared/ipc'
import {
  buildAppIconPath,
  buildPreloadPath,
  createMainWindowOptions,
  resizeWindowToHome,
  resizeWindowToTracker
} from '../shared/window-config'
import {
  SESSION_FILE_NAME,
  RECENT_PROJECTS_FILE_NAME,
  defaultUserFolderPath,
  isFolderRole,
  listRecentProjects,
  normalizeSession,
  recordRecentProject,
  readSession,
  validateFolder,
  writeSession,
  writeSessionConfig
} from './session'
import { querySampleBrowser, type SampleBrowserCache } from './sample-browser'
import { openDatabase, type DB } from './db'
import {
  ensureUnsortedCategory,
  hasSamples,
  listTags,
  createTag,
  renameTag,
  deleteTag,
  assignTag,
  unassignTag,
  listCategories,
  createCategory,
  deleteCategory,
  listLibraries,
  saveLibrary,
  deleteLibrary,
  querySamples
} from './library'
import { IndexerHost } from './indexer-host'

let mainWindow: BrowserWindow | null = null
let lastSession: SessionPaths = { userFolder: null, sampleFolder: null }
const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'www.github.com'])
const sampleBrowserCache: SampleBrowserCache = new Map()
let db: DB | null = null
const indexerHost = new IndexerHost()

// app.getVersion() returns Electron's own version in an unpackaged run rather
// than this app's. __APP_VERSION__ is inlined from package.json at build time
// (see electron.vite.config.ts) so the footer and mixjam.json always report the
// app version (e.g. 0.5.0) in every environment.
declare const __APP_VERSION__: string | undefined
function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : app.getVersion()
}

function sessionFilePath(): string {
  return join(app.getPath('userData'), SESSION_FILE_NAME)
}

function recentProjectsFilePath(): string {
  return join(app.getPath('userData'), RECENT_PROJECTS_FILE_NAME)
}

function dbFilePath(): string {
  return join(app.getPath('userData'), 'library.db')
}

function getDb(): DB {
  if (!db) {
    db = openDatabase(dbFilePath())
    ensureUnsortedCategory(db)
    if (mainWindow) {
      indexerHost.attach(mainWindow, dbFilePath())
    }
  }
  return db
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
  indexerHost.destroy()
  db?.close()
  void writeSessionConfig(lastSession, appVersion()).catch((error: unknown) => {
    console.error('Failed to write mixjam.json on quit:', error)
  })
})

ipcMain.handle(IPC_CHANNELS.appGetVersion, () => appVersion())

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
    filters: [{ name: 'MixJam Project', extensions: ['mixjam'] }]
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
    await writeSessionConfig(lastSession, appVersion())
  } catch (error) {
    console.error('Failed to write mixjam.json:', error)
  }
})

ipcMain.handle(IPC_CHANNELS.recentProjectsList, async (_event, rawUserFolder: unknown) => {
  const userFolder = typeof rawUserFolder === 'string' ? rawUserFolder : null
  return listRecentProjects(recentProjectsFilePath(), userFolder)
})

ipcMain.handle(IPC_CHANNELS.recentProjectsRecord, async (_event, rawProjectPath: unknown) => {
  if (typeof rawProjectPath !== 'string') return
  await recordRecentProject(recentProjectsFilePath(), rawProjectPath)
})

ipcMain.handle(
  IPC_CHANNELS.sampleBrowserQuery,
  async (_event, rawSampleFolder: unknown, rawSearchQuery: unknown, rawForceRescan: unknown) => {
    const sampleFolder = typeof rawSampleFolder === 'string' ? rawSampleFolder : null
    const searchQuery = typeof rawSearchQuery === 'string' ? rawSearchQuery : ''
    const forceRescan = rawForceRescan === true

    return querySampleBrowser(sampleBrowserCache, sampleFolder, searchQuery, forceRescan)
  }
)

ipcMain.handle(IPC_CHANNELS.folderPick, async (_event, rawRole: unknown) => {
  if (!mainWindow || !isFolderRole(rawRole)) return null
  const title = rawRole === 'user' ? 'Select User Folder' : 'Select Sample Folder'
  const defaultPath = rawRole === 'user' ? defaultUserFolderPath(homedir()) : undefined
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openDirectory'],
    ...(defaultPath !== undefined ? { defaultPath } : {})
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

ipcMain.handle(IPC_CHANNELS.libraryStartScan, (_event, rawSampleFolder: unknown) => {
  if (typeof rawSampleFolder !== 'string') return
  if (!mainWindow) return

  getDb()
  indexerHost.attach(mainWindow, dbFilePath())
  indexerHost.startScan(rawSampleFolder)
})

ipcMain.handle(IPC_CHANNELS.libraryGetProgress, () => indexerHost.currentProgress)

ipcMain.handle(IPC_CHANNELS.libraryQuerySamples, (_event, rawReq: unknown) => {
  return querySamples(getDb(), normalizeSampleQueryRequest(rawReq))
})

ipcMain.handle(IPC_CHANNELS.libraryHasSamples, () => hasSamples(getDb()))

ipcMain.handle(IPC_CHANNELS.libraryListTags, () => listTags(getDb()))

ipcMain.handle(IPC_CHANNELS.libraryCreateTag, (_event, rawName: unknown, rawColor: unknown) => {
  // The channel is typed to resolve to a TagItem, so reject invalid input rather
  // than returning null (which the renderer would dereference and crash on).
  if (typeof rawName !== 'string') throw new TypeError('createTag: name must be a string')
  const color = typeof rawColor === 'string' ? rawColor : undefined
  return createTag(getDb(), rawName, color)
})

ipcMain.handle(IPC_CHANNELS.libraryRenameTag, (_event, rawId: unknown, rawName: unknown) => {
  if (typeof rawId !== 'number' || typeof rawName !== 'string') return
  renameTag(getDb(), rawId, rawName)
})

ipcMain.handle(IPC_CHANNELS.libraryDeleteTag, (_event, rawId: unknown) => {
  if (typeof rawId !== 'number') return
  deleteTag(getDb(), rawId)
})

ipcMain.handle(
  IPC_CHANNELS.libraryAssignTag,
  (_event, rawSampleId: unknown, rawTagId: unknown) => {
    if (typeof rawSampleId !== 'number' || typeof rawTagId !== 'number') return
    assignTag(getDb(), rawSampleId, rawTagId)
  }
)

ipcMain.handle(
  IPC_CHANNELS.libraryUnassignTag,
  (_event, rawSampleId: unknown, rawTagId: unknown) => {
    if (typeof rawSampleId !== 'number' || typeof rawTagId !== 'number') return
    unassignTag(getDb(), rawSampleId, rawTagId)
  }
)

ipcMain.handle(IPC_CHANNELS.libraryListCategories, () => listCategories(getDb()))

ipcMain.handle(
  IPC_CHANNELS.libraryCreateCategory,
  (_event, rawName: unknown, rawParentId: unknown) => {
    // Typed to resolve to a CategoryItem — reject invalid input instead of
    // returning null (which the renderer would dereference and crash on).
    if (typeof rawName !== 'string') throw new TypeError('createCategory: name must be a string')
    const parentId = typeof rawParentId === 'number' ? rawParentId : undefined
    return createCategory(getDb(), rawName, parentId)
  }
)

ipcMain.handle(IPC_CHANNELS.libraryDeleteCategory, (_event, rawId: unknown) => {
  if (typeof rawId !== 'number') return
  deleteCategory(getDb(), rawId)
})

ipcMain.handle(IPC_CHANNELS.libraryListLibraries, () => listLibraries(getDb()))

ipcMain.handle(
  IPC_CHANNELS.librarySaveLibrary,
  (_event, rawName: unknown, rawRuleJson: unknown) => {
    if (typeof rawName !== 'string' || typeof rawRuleJson !== 'string') return null
    return saveLibrary(getDb(), rawName, rawRuleJson)
  }
)

ipcMain.handle(IPC_CHANNELS.libraryDeleteLibrary, (_event, rawId: unknown) => {
  if (typeof rawId !== 'number') return
  deleteLibrary(getDb(), rawId)
})

ipcMain.handle(
  IPC_CHANNELS.sampleReadBytes,
  async (_event, rawSampleFolder: unknown, rawFilePath: unknown) => {
    if (typeof rawSampleFolder !== 'string' || typeof rawFilePath !== 'string') return null

    // The sample browser identifies samples by a portable path relative to the
    // Sample Folder, so resolve the request against the folder before reading.
    // An already-absolute path is left untouched by resolve(); a relative one is
    // anchored to the folder rather than the process cwd.
    const resolvedFile = resolve(rawSampleFolder, rawFilePath)

    // Containment check: only files inside the active Sample Folder may be read.
    // The renderer can request arbitrary paths, so confine reads to the folder
    // the user explicitly selected. Checked after resolution so `..` segments
    // cannot escape the folder.
    const folder = canonicalizePath(rawSampleFolder)
    const file = canonicalizePath(resolvedFile)
    const folderPrefix = folder.endsWith('\\') || folder.endsWith('/') ? folder : `${folder}\\`
    if (file !== folder && !file.startsWith(folderPrefix) && !file.startsWith(`${folder}/`)) {
      return null
    }

    try {
      const buffer = await fs.readFile(resolvedFile)
      // Return an ArrayBuffer (transferable over IPC); slice to the exact view.
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    } catch (error) {
      console.error('Failed to read sample bytes:', error)
      return null
    }
  }
)
