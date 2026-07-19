// Host-local folder-selection persistence and the User Folder config file.
// Project catalog state has its own owner in project-catalog.ts.

import type { FolderRef, FolderSelections } from '../../../shared/backend-api'
import { openFolderForAutomaticAccess } from './folder-access'

export const FOLDER_SELECTIONS_STORAGE_KEY = 'mixjam.session' // persisted compatibility key
const CONFIG_FILE_NAME = 'mixjam.json'

function isFolderRefLike(value: unknown): value is FolderRef {
  const record = value as Record<string, unknown>
  return !!record && typeof record.id === 'string' && typeof record.name === 'string'
}

export function normalizeFolderSelections(value: unknown): FolderSelections {
  const record = (value ?? {}) as Record<string, unknown>
  return {
    userFolder: isFolderRefLike(record.userFolder)
      ? { id: record.userFolder.id, name: record.userFolder.name }
      : null,
    sampleFolder: isFolderRefLike(record.sampleFolder)
      ? { id: record.sampleFolder.id, name: record.sampleFolder.name }
      : null
  }
}

export function loadFolderSelections(storage: Storage = localStorage): FolderSelections {
  try {
    return normalizeFolderSelections(JSON.parse(storage.getItem(FOLDER_SELECTIONS_STORAGE_KEY) ?? ''))
  } catch {
    return { userFolder: null, sampleFolder: null }
  }
}

export function saveFolderSelections(selections: FolderSelections, storage: Storage = localStorage): void {
  storage.setItem(FOLDER_SELECTIONS_STORAGE_KEY, JSON.stringify(normalizeFolderSelections(selections)))
}

// ---------------------------------------------------------------------------
// mixjam.json
// ---------------------------------------------------------------------------

export interface AppConfig {
  appVersion: string
  userFolder: string
  sampleFolder: string
  lastOpened: string
}

export function buildAppConfig(
  selections: FolderSelections,
  appVersion: string,
  now: Date = new Date()
): AppConfig | null {
  if (!selections.userFolder || !selections.sampleFolder) return null
  return {
    appVersion,
    userFolder: selections.userFolder.name,
    sampleFolder: selections.sampleFolder.name,
    lastOpened: now.toISOString()
  }
}

export async function writeAppConfig(selections: FolderSelections, appVersion: string): Promise<void> {
  const config = buildAppConfig(selections, appVersion)
  if (!config || !selections.userFolder) return
  const dir = await openFolderForAutomaticAccess(selections.userFolder, 'user')
  if (!dir) return
  const file = await dir.getFileHandle(CONFIG_FILE_NAME, { create: true })
  const writable = await file.createWritable()
  await writable.write(`${JSON.stringify(config, null, 2)}\n`)
  await writable.close()
}
