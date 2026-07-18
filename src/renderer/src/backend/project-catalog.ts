import type { FolderRef, MixJamFileItem } from '../../../shared/backend-api'
import { resolveFileHandle } from './folder-access'
import { loadFolderHandle } from './handle-store'

export const RECENT_PROJECTS_STORAGE_KEY = 'mixjam.recent-projects'

const MIXJAM_PROJECT_EXTENSION = '.mixjam'
const MIXJAM_FILES_LIMIT = 20
const DISCOVER_MAX_DEPTH = 8

export interface RecentProjectEntry {
  /** Relpath of the .mixjam file within the User Folder ('/'-separated). */
  path: string
  displayName: string
  lastOpened: string
}

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

async function discoverMixJamProjects(
  root: FileSystemDirectoryHandle
): Promise<MixJamFileItem[]> {
  const discovered: MixJamFileItem[] = []

  async function walk(dir: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > DISCOVER_MAX_DEPTH) return
    try {
      for await (const [name, entry] of dir.entries()) {
        if (entry.kind === 'directory') {
          await walk(entry, `${prefix}${name}/`, depth + 1)
        } else if (name.toLowerCase().endsWith(MIXJAM_PROJECT_EXTENSION)) {
          const path = `${prefix}${name}`
          discovered.push({ path, displayName: displayNameForProjectPath(path), lastOpened: null })
        }
      }
    } catch {
      // An unreadable subtree does not invalidate the rest of the catalog.
    }
  }

  await walk(root, '', 0)
  return discovered
}

/** Builds the verified, bounded MixJam Browser catalog for the User Folder. */
export async function listMixJamFiles(
  userFolder: FolderRef | null,
  storage: Storage = localStorage
): Promise<MixJamFileItem[]> {
  if (!userFolder) return []

  let handle: FileSystemDirectoryHandle | null
  try {
    handle = await loadFolderHandle(userFolder.id)
    if (!handle || (await handle.queryPermission({ mode: 'read' })) !== 'granted') return []
  } catch {
    return []
  }

  const merged = new Map<string, MixJamFileItem>()
  const registered = readRecentProjects(storage)
  const exists = await Promise.all(
    registered.map(async (entry) => (await resolveFileHandle(handle, entry.path)) !== null)
  )
  registered.forEach((entry, index) => {
    if (exists[index]) merged.set(entry.path, entry)
  })
  for (const entry of await discoverMixJamProjects(handle)) {
    if (!merged.has(entry.path)) merged.set(entry.path, entry)
  }

  return sortMixJamFileItems([...merged.values()]).slice(0, MIXJAM_FILES_LIMIT)
}
