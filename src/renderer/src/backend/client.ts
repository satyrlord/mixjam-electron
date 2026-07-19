// Main-thread BackendAPI facade. DB/scan calls go promise-per-message to the
// backend worker; folder access, app state, and project discovery run on the main
// thread (they need user gestures and the DOM); host capabilities (resize,
// openExternal, version) delegate to the required Electron shellAPI.

import type { BackendAPI, FolderSelections } from '../../../shared/backend-api'
import type { ShellAPI } from '../../../shared/ipc'
import { createWorkerProxy } from './worker-proxy'
import {
  pickFolder,
  readSampleBytes,
  requestFolderAccess,
  validateFolder
} from './folder-access'
import {
  loadFolderSelections,
  saveFolderSelections,
  writeAppConfig
} from './app-state'
import { listMixJamFiles, recordRecentProject } from './project-catalog'
import {
  createGeneratedMixJamFile,
  findMissingSampleFiles,
  openMixJamFile,
  readMixJamFile,
  saveMixJamFileAs,
  writeMixJamFile
} from './project-files'

export function createBackendAPI(shell: ShellAPI): BackendAPI {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const workerProxy = createWorkerProxy(worker)

  // Cache the app version for the app runtime so saveFolderSelections does not
  // round-trip to IPC on every folder pick.
  let cachedVersion: string | null = null
  async function getVersionCached(): Promise<string> {
    if (cachedVersion !== null) return cachedVersion
    cachedVersion = await shell.getVersion()
    return cachedVersion
  }

  const call = workerProxy.call

  // Ask Chromium to protect OPFS/IndexedDB from storage-pressure eviction.
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
    resizeToPlayer: () => shell.resizeToPlayer(),
    resizeToHome: () => shell.resizeToHome(),
    openExternal: (url) => shell.openExternal(url),

    loadFolderSelections: () => Promise.resolve(loadFolderSelections()),
    saveFolderSelections: async (selections: FolderSelections) => {
      saveFolderSelections(selections)
      try {
        await writeAppConfig(selections, await getVersionCached())
      } catch (error) {
        console.error('Failed to write mixjam.json:', error)
      }
    },
    loadMixJamFiles: (userFolder) => listMixJamFiles(userFolder),
    recordRecentProject: (projectRelpath) => {
      recordRecentProject(projectRelpath)
      return Promise.resolve()
    },
    openMixJamFile,
    readMixJamFile,
    saveMixJamFileAs,
    createGeneratedMixJamFile,
    writeMixJamFile,
    findMissingSampleFiles,

    pickFolder,
    validateFolder,
    requestFolderAccess,

    startLibrarySync: async (sampleFolder, trigger) => {
      requestStoragePersistence()
      return call('startLibrarySync', sampleFolder.id, trigger)
    },
    cancelLibrarySync: (jobId) => call('cancelLibrarySync', jobId),
    getLibraryRootState: (sampleFolder) => call('getLibraryRootState', sampleFolder.id),
    getScanProgress: () => call('getScanProgress'),
    getAnalysisProgress: () => call('getAnalysisProgress'),
    querySamples: (req) => call('querySamples', req),
    getGeneratorReadiness: (sampleFolder) => call('getGeneratorReadiness', sampleFolder.id),
    planMixJam: (sampleFolder, jobId, parameters, expectedFingerprint) =>
      call('planMixJam', sampleFolder.id, jobId, parameters, expectedFingerprint),
    cancelMixJamPlanning: (jobId) => call('cancelMixJamPlanning', jobId),
    getGeneratorProgress: () => call('getGeneratorProgress'),
    listTags: () => call('listTags'),
    createTag: (name, color) => call('createTag', name, color),
    renameTag: (id, name) => call('renameTag', id, name),
    setTagColor: (id, color) => call('setTagColor', id, color),
    deleteTag: (id) => call('deleteTag', id),
    assignTag: (sampleId, tagId) => call('assignTag', sampleId, tagId),
    unassignTag: (sampleId, tagId) => call('unassignTag', sampleId, tagId),
    updateSampleAnalysis: (sampleId, patch) => call('updateSampleAnalysis', sampleId, patch),
    reanalyzeSample: (sampleFolder, sampleId, relpath) =>
      call('reanalyzeSample', sampleFolder.id, sampleId, relpath),
    listCategories: () => call('listCategories'),
    createCategory: (name, parentId) => call('createCategory', name, parentId),
    deleteCategory: (id) => call('deleteCategory', id),
    listLibraries: () => call('listLibraries'),
    saveLibrary: (name, ruleJson) => call('saveLibrary', name, ruleJson),
    deleteLibrary: (id) => call('deleteLibrary', id),
    listMissingRelpaths: (sampleFolder) => call('listMissingRelpaths', sampleFolder.id),

    readSampleBytes,

    onScanProgress: (cb) => {
      return workerProxy.onScanProgress(cb)
    },
    onScanDone: (cb) => {
      return workerProxy.onScanDone(cb)
    },
    onAnalysisProgress: (cb) => {
      return workerProxy.onAnalysisProgress(cb)
    },
    onAnalysisDone: (cb) => {
      return workerProxy.onAnalysisDone(cb)
    },
    onGeneratorProgress: (cb) => {
      return workerProxy.onGeneratorProgress(cb)
    }
  }
}
