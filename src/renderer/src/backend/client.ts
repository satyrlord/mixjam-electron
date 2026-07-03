// Main-thread BackendAPI facade. DB/scan calls go promise-per-message to the
// backend worker; folder access, session, and recent projects run on the main
// thread (they need user gestures and the DOM); host capabilities (resize,
// openExternal, version) delegate to the Electron shellAPI when present and
// fall back to browser behaviour otherwise.

import type { BackendAPI, ScanProgress, SessionPaths } from '../../../shared/backend-api'
import type { ShellAPI } from '../../../shared/ipc'
import type { BackendCalls, BackendOp, WorkerMessage } from './protocol'
import {
  pickFolder,
  readSampleBytes,
  requestFolderAccess,
  validateFolder
} from './folder-access'
import {
  listRecentProjects,
  loadSession,
  recordRecentProject,
  saveSession,
  writeSessionConfig
} from './session'

// Inlined from package.json/git at build time (see electron.vite.config.ts).
declare const __APP_VERSION__: string | undefined

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

export function createBackendAPI(shell: ShellAPI | null): BackendAPI {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

  let nextSeq = 1
  const pending = new Map<number, Pending>()
  const progressListeners = new Set<(progress: ScanProgress) => void>()
  const doneListeners = new Set<() => void>()

  // Cache the app version for the session lifetime so saveSession does not
  // round-trip to IPC on every folder pick.
  let cachedVersion: string | null = null
  async function getVersionCached(): Promise<string> {
    if (cachedVersion !== null) return cachedVersion
    cachedVersion = shell ? await shell.getVersion() : appVersion()
    return cachedVersion
  }

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data
    if (message.type === 'response') {
      const entry = pending.get(message.seq)
      if (!entry) return
      pending.delete(message.seq)
      if (message.ok) entry.resolve(message.result)
      else entry.reject(new Error(message.error))
      return
    }
    if (message.type === 'scan-progress') {
      for (const listener of progressListeners) listener(message.progress)
      return
    }
    for (const listener of doneListeners) listener()
  }

  worker.onerror = (event) => {
    console.error('Backend worker error:', event.message)
  }

  function call<Op extends BackendOp>(
    op: Op,
    ...args: Parameters<BackendCalls[Op]>
  ): Promise<ReturnType<BackendCalls[Op]>> {
    return new Promise((resolve, reject) => {
      const seq = nextSeq++
      pending.set(seq, { resolve: resolve as (value: unknown) => void, reject })
      worker.postMessage({ seq, op, args })
    })
  }

  // Ask the browser to protect OPFS/IndexedDB from storage-pressure eviction.
  // Fire-and-forget on first scan: that is the moment the index starts being
  // worth keeping (it stays rebuildable by rescan regardless).
  let persistRequested = false
  function requestStoragePersistence(): void {
    if (persistRequested) return
    persistRequested = true
    void navigator.storage?.persist?.().catch(() => {})
  }

  return {
    getVersion: () => getVersionCached(),
    resizeToTracker: () => shell?.resizeToTracker() ?? Promise.resolve(),
    resizeToHome: () => shell?.resizeToHome() ?? Promise.resolve(),
    openExternal: (url) => {
      if (shell) return shell.openExternal(url)
      window.open(url, '_blank', 'noopener,noreferrer')
      return Promise.resolve()
    },

    loadSession: () => Promise.resolve(loadSession()),
    saveSession: async (paths: SessionPaths) => {
      saveSession(paths)
      try {
        await writeSessionConfig(paths, await getVersionCached())
      } catch (error) {
        console.error('Failed to write mixjam.json:', error)
      }
    },
    loadRecentProjects: (userFolder) => listRecentProjects(userFolder),
    recordRecentProject: (projectRelpath) => {
      recordRecentProject(projectRelpath)
      return Promise.resolve()
    },

    pickFolder,
    validateFolder,
    requestFolderAccess,

    startScan: async (sampleFolder) => {
      requestStoragePersistence()
      await call('startScan', sampleFolder.id)
    },
    cancelScan: () => call('cancelScan'),
    getScanProgress: () => call('getScanProgress'),
    querySamples: (req) => call('querySamples', req),
    listTags: () => call('listTags'),
    createTag: (name, color) => call('createTag', name, color),
    renameTag: (id, name) => call('renameTag', id, name),
    deleteTag: (id) => call('deleteTag', id),
    assignTag: (sampleId, tagId) => call('assignTag', sampleId, tagId),
    unassignTag: (sampleId, tagId) => call('unassignTag', sampleId, tagId),
    listCategories: () => call('listCategories'),
    createCategory: (name, parentId) => call('createCategory', name, parentId),
    deleteCategory: (id) => call('deleteCategory', id),
    listLibraries: () => call('listLibraries'),
    saveLibrary: (name, ruleJson) => call('saveLibrary', name, ruleJson),
    deleteLibrary: (id) => call('deleteLibrary', id),
    hasSamples: (sampleFolder) => call('hasSamples', sampleFolder.id),

    readSampleBytes,

    onScanProgress: (cb) => {
      progressListeners.add(cb)
      return () => progressListeners.delete(cb)
    },
    onScanDone: (cb) => {
      doneListeners.add(cb)
      return () => doneListeners.delete(cb)
    }
  }
}
