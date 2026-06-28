import { promises as fs, constants, type Dirent } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { FolderRole, RecentProjectItem, SessionPaths } from '../shared/ipc'
import { canonicalizePath } from './path-utils'

export const SESSION_FILE_NAME = 'session.json'
export const CONFIG_FILE_NAME = 'mixjam.json'
export const RECENT_PROJECTS_FILE_NAME = 'recent-projects.json'

export interface RecentProjectEntry {
  path: string
  displayName: string
  lastOpened: string
}

const MIXJAM_PROJECT_EXTENSION = '.mixjam'

export function isFolderRole(value: unknown): value is FolderRole {
  return value === 'user' || value === 'sample'
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function isReadable(path: string): Promise<boolean> {
  try {
    await fs.access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function isWritable(dir: string): Promise<boolean> {
  // fs.access(W_OK) is unreliable for directories on Windows, so probe with a
  // real temp file — the same operation the app performs when it writes
  // mixjam.json into the User Folder.
  const probe = join(dir, `.mixjam-write-test-${process.pid}-${Date.now()}`)
  try {
    await fs.writeFile(probe, '')
    await fs.rm(probe, { force: true })
    return true
  } catch {
    return false
  }
}

export async function validateFolder(path: string, role: FolderRole): Promise<boolean> {
  if (!(await isDirectory(path))) return false
  if (!(await isReadable(path))) return false
  if (role === 'user') return isWritable(path)
  return true
}

export function normalizeSession(value: unknown): SessionPaths {
  const record = (value ?? {}) as Record<string, unknown>
  return {
    userFolder: typeof record.userFolder === 'string' ? record.userFolder : null,
    sampleFolder: typeof record.sampleFolder === 'string' ? record.sampleFolder : null
  }
}

export async function readSession(sessionFilePath: string): Promise<SessionPaths> {
  try {
    return normalizeSession(JSON.parse(await fs.readFile(sessionFilePath, 'utf8')))
  } catch {
    return { userFolder: null, sampleFolder: null }
  }
}

export async function writeSession(sessionFilePath: string, paths: SessionPaths): Promise<void> {
  await fs.writeFile(sessionFilePath, `${JSON.stringify(normalizeSession(paths), null, 2)}\n`, 'utf8')
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

function sortRecentProjects(entries: RecentProjectEntry[]): RecentProjectEntry[] {
  return [...entries].sort((left, right) => right.lastOpened.localeCompare(left.lastOpened))
}

function sortRecentProjectItems(entries: RecentProjectItem[]): RecentProjectItem[] {
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

function isMixJamProjectPath(filePath: string): boolean {
  return extname(filePath).toLowerCase() === MIXJAM_PROJECT_EXTENSION
}

export function normalizeRecentProjects(value: unknown): RecentProjectEntry[] {
  if (!Array.isArray(value)) return []

  const deduped = new Map<string, RecentProjectEntry>()

  for (const entry of value) {
    if (!isRecentProjectEntry(entry)) continue
    const key = canonicalizePath(entry.path)
    const next: RecentProjectEntry = {
      path: key,
      displayName: entry.displayName,
      lastOpened: entry.lastOpened
    }

    const existing = deduped.get(key)
    if (!existing || existing.lastOpened.localeCompare(next.lastOpened) < 0) {
      deduped.set(key, next)
    }
  }

  return sortRecentProjects([...deduped.values()])
}

export function upsertRecentProject(
  entries: RecentProjectEntry[],
  projectFilePath: string,
  now: Date = new Date()
): RecentProjectEntry[] {
  const path = canonicalizePath(projectFilePath)
  const displayName = basename(path, extname(path))
  const nextEntries = entries.filter((entry) => canonicalizePath(entry.path) !== path)
  nextEntries.push({ path, displayName, lastOpened: now.toISOString() })
  return sortRecentProjects(nextEntries)
}

async function discoverMixJamProjects(rootPath: string): Promise<RecentProjectItem[]> {
  if (!(await isDirectory(rootPath))) return []

  const discovered: RecentProjectItem[] = []

  async function walk(currentPath: string): Promise<void> {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return
    }

    for (const entry of entries) {
      const childPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await walk(childPath)
        continue
      }
      if (!entry.isFile() || !isMixJamProjectPath(entry.name)) continue

      const path = canonicalizePath(childPath)
      discovered.push({
        path,
        displayName: basename(path, extname(path)),
        lastOpened: null
      })
    }
  }

  await walk(rootPath)
  return discovered
}

export async function readRecentProjects(registryFilePath: string): Promise<RecentProjectEntry[]> {
  try {
    return normalizeRecentProjects(JSON.parse(await fs.readFile(registryFilePath, 'utf8')))
  } catch {
    return []
  }
}

export async function writeRecentProjects(
  registryFilePath: string,
  entries: RecentProjectEntry[]
): Promise<void> {
  await fs.writeFile(
    registryFilePath,
    `${JSON.stringify(normalizeRecentProjects(entries), null, 2)}\n`,
    'utf8'
  )
}

export async function recordRecentProject(
  registryFilePath: string,
  projectFilePath: string,
  now: Date = new Date()
): Promise<void> {
  await writeRecentProjects(
    registryFilePath,
    upsertRecentProject(await readRecentProjects(registryFilePath), projectFilePath, now)
  )
}

export async function listRecentProjects(
  registryFilePath: string,
  userFolder: string | null
): Promise<RecentProjectItem[]> {
  const merged = new Map<string, RecentProjectItem>()

  for (const entry of await readRecentProjects(registryFilePath)) {
    merged.set(canonicalizePath(entry.path), entry)
  }

  if (userFolder) {
    for (const entry of await discoverMixJamProjects(userFolder)) {
      const key = canonicalizePath(entry.path)
      if (!merged.has(key)) {
        merged.set(key, entry)
      }
    }
  }

  return sortRecentProjectItems([...merged.values()])
}

export interface SessionConfig {
  appVersion: string
  userFolder: string
  sampleFolder: string
  lastOpened: string
}

export function buildSessionConfig(
  paths: SessionPaths,
  appVersion: string,
  now: Date = new Date()
): SessionConfig | null {
  if (!paths.userFolder || !paths.sampleFolder) return null
  return {
    appVersion,
    userFolder: paths.userFolder,
    sampleFolder: paths.sampleFolder,
    lastOpened: now.toISOString()
  }
}

export async function writeSessionConfig(paths: SessionPaths, appVersion: string): Promise<void> {
  const config = buildSessionConfig(paths, appVersion)
  if (!config) return
  await fs.writeFile(
    join(config.userFolder, CONFIG_FILE_NAME),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8'
  )
}
