import { promises as fs, constants } from 'node:fs'
import { join } from 'node:path'
import type { FolderRole, SessionPaths } from '../shared/ipc'

export const SESSION_FILE_NAME = 'session.json'
export const CONFIG_FILE_NAME = 'mixjam.json'

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
