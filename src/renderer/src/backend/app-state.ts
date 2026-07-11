// App-state persistence for the browser backend. Folder selections and the
// recent-project registry live in localStorage; project files stay real files
// in the User Folder, reached through its stored directory handle.

import type { FolderRef, MixJamFileItem, FolderSelections } from '../../../shared/backend-api'
import { loadFolderHandle } from './handle-store'
import { resolveFileHandle } from './folder-access'

export const FOLDER_SELECTIONS_STORAGE_KEY = 'mixjam.session' // persisted compatibility key
export const RECENT_PROJECTS_STORAGE_KEY = 'mixjam.recent-projects'
const CONFIG_FILE_NAME = 'mixjam.json'

const MIXJAM_PROJECT_EXTENSION = '.mixjam'

// Keep the combined MixJam Browser/Home result bounded after merging the
// recent-project registry with files discovered under the User Folder.
const MIXJAM_FILES_LIMIT = 20

export interface RecentProjectEntry {
  /** Relpath of the .mixjam file within the User Folder ('/'-separated). */
  path: string
  displayName: string
  lastOpened: string
}

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
// Recent projects
// ---------------------------------------------------------------------------

function isRecentProjectEntry(value: unknown): value is RecentProjectEntry {
  const record = value as Record<string, unknown>
  return (
    !!record &&
    typeof record.path === 'string' &&
    typeof record.displayName === 'string' &&
    typeof record.lastOpened === 'string'
  )
}

function sortRecentEntries(entries: RecentProjectEntry[]): RecentProjectEntry[] {
  return [...entries].sort((left, right) => right.lastOpened.localeCompare(left.lastOpened))
}

function sortMixJamFileItems(entries: MixJamFileItem[]): MixJamFileItem[] {
  return [...entries].sort((left, right) => {
    if (left.lastOpened && right.lastOpened) {
      const timeOrder = right.lastOpened.localeCompare(left.lastOpened)
      return timeOrder !== 0 ? timeOrder : left.displayName.localeCompare(right.displayName)
    }
    if (left.lastOpened) return -1
    if (right.lastOpened) return 1
    return left.displayName.localeCompare(right.displayName)
  })
}

function isMixJamProjectPath(name: string): boolean {
  return name.toLowerCase().endsWith(MIXJAM_PROJECT_EXTENSION)
}

function displayNameForProjectPath(relpath: string): string {
  const base = relpath.split('/').filter(Boolean).pop() ?? relpath
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

export function normalizeRecentProjects(value: unknown): RecentProjectEntry[] {
  if (!Array.isArray(value)) return []

  const deduped = new Map<string, RecentProjectEntry>()

  for (const entry of value) {
    if (!isRecentProjectEntry(entry)) continue
    const existing = deduped.get(entry.path)
    if (!existing || existing.lastOpened.localeCompare(entry.lastOpened) < 0) {
      deduped.set(entry.path, {
        path: entry.path,
        displayName: entry.displayName,
        lastOpened: entry.lastOpened
      })
    }
  }

  return sortRecentEntries([...deduped.values()])
}

export function upsertRecentProject(
  entries: RecentProjectEntry[],
  projectRelpath: string,
  now: Date = new Date()
): RecentProjectEntry[] {
  const nextEntries = entries.filter((entry) => entry.path !== projectRelpath)
  nextEntries.push({
    path: projectRelpath,
    displayName: displayNameForProjectPath(projectRelpath),
    lastOpened: now.toISOString()
  })
  return sortRecentEntries(nextEntries)
}

export function readRecentProjects(storage: Storage = localStorage): RecentProjectEntry[] {
  try {
    return normalizeRecentProjects(JSON.parse(storage.getItem(RECENT_PROJECTS_STORAGE_KEY) ?? ''))
  } catch {
    return []
  }
}

export function writeRecentProjects(
  entries: RecentProjectEntry[],
  storage: Storage = localStorage
): void {
  storage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(normalizeRecentProjects(entries)))
}

export function recordRecentProject(
  projectRelpath: string,
  now: Date = new Date(),
  storage: Storage = localStorage
): void {
  writeRecentProjects(upsertRecentProject(readRecentProjects(storage), projectRelpath, now), storage)
}

// Maximum directory depth to walk when discovering .mixjam project files.
// Prevents blocking the worker on extremely deep User Folder structures while
// still allowing typical project nesting (genre/artist/project patterns).
const DISCOVER_MAX_DEPTH = 8

async function discoverMixJamProjects(
  root: FileSystemDirectoryHandle
): Promise<MixJamFileItem[]> {
  const discovered: MixJamFileItem[] = []

  async function walk(dir: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > DISCOVER_MAX_DEPTH) return
    let iterator: AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>
    try {
      iterator = dir.entries()
      for await (const [name, entry] of iterator) {
        if (entry.kind === 'directory') {
          await walk(entry, `${prefix}${name}/`, depth + 1)
          continue
        }
        if (!isMixJamProjectPath(name)) continue
        const relpath = `${prefix}${name}`
        discovered.push({
          path: relpath,
          displayName: displayNameForProjectPath(relpath),
          lastOpened: null
        })
      }
    } catch {
      // Unreadable subtree — skip it, same as the fs walk did.
    }
  }

  await walk(root, '', 0)
  return discovered
}

/**
 * Merges the recent-projects registry (entries whose file still exists) with
 * .mixjam files discovered under the User Folder. Without an accessible User
 * Folder handle nothing can be verified, so the list is empty.
 */
export async function listMixJamFiles(
  userFolder: FolderRef | null,
  storage: Storage = localStorage
): Promise<MixJamFileItem[]> {
  if (!userFolder) return []

  let handle: FileSystemDirectoryHandle | null
  try {
    handle = await loadFolderHandle(userFolder.id)
    if (!handle) return []
    if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') return []
  } catch {
    return []
  }

  const merged = new Map<string, MixJamFileItem>()

  // Registry entries may point at files that have since been deleted or moved;
  // drop those instead of offering dead entries.
  const registered = readRecentProjects(storage)
  const exists = await Promise.all(
    registered.map(async (entry) => (await resolveFileHandle(handle, entry.path)) !== null)
  )
  registered.forEach((entry, i) => {
    if (exists[i]) merged.set(entry.path, entry)
  })

  for (const entry of await discoverMixJamProjects(handle)) {
    if (!merged.has(entry.path)) {
      merged.set(entry.path, entry)
    }
  }

  return sortMixJamFileItems([...merged.values()]).slice(0, MIXJAM_FILES_LIMIT)
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
  const dir = await loadFolderHandle(selections.userFolder.id)
  if (!dir) return
  const file = await dir.getFileHandle(CONFIG_FILE_NAME, { create: true })
  const writable = await file.createWritable()
  await writable.write(`${JSON.stringify(config, null, 2)}\n`)
  await writable.close()
}
