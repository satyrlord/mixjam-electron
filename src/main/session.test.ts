import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONFIG_FILE_NAME,
  buildSessionConfig,
  isFolderRole,
  normalizeSession,
  readSession,
  validateFolder,
  writeSession,
  writeSessionConfig
} from './session'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mixjam-session-'))
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('isFolderRole', () => {
  it('accepts only the two known roles', () => {
    expect(isFolderRole('user')).toBe(true)
    expect(isFolderRole('sample')).toBe(true)
    expect(isFolderRole('admin')).toBe(false)
    expect(isFolderRole(undefined)).toBe(false)
    expect(isFolderRole(42)).toBe(false)
  })
})

describe('validateFolder', () => {
  it('accepts a readable+writable directory as a user folder', async () => {
    expect(await validateFolder(workDir, 'user')).toBe(true)
  })

  it('accepts a readable directory as a sample folder', async () => {
    expect(await validateFolder(workDir, 'sample')).toBe(true)
  })

  it('rejects a non-existent path for either role', async () => {
    const missing = join(workDir, 'does-not-exist')
    expect(await validateFolder(missing, 'user')).toBe(false)
    expect(await validateFolder(missing, 'sample')).toBe(false)
  })

  it('rejects a file (not a directory)', async () => {
    const file = join(workDir, 'a-file.txt')
    await writeFile(file, 'hi')
    expect(await validateFolder(file, 'sample')).toBe(false)
  })
})

describe('normalizeSession', () => {
  it('keeps string paths and nulls out anything else', () => {
    expect(normalizeSession({ userFolder: 'C:/a', sampleFolder: 'C:/b' })).toEqual({
      userFolder: 'C:/a',
      sampleFolder: 'C:/b'
    })
    expect(normalizeSession({ userFolder: 123, sampleFolder: null })).toEqual({
      userFolder: null,
      sampleFolder: null
    })
    expect(normalizeSession(undefined)).toEqual({ userFolder: null, sampleFolder: null })
  })
})

describe('readSession / writeSession', () => {
  it('round-trips persisted folder paths', async () => {
    const file = join(workDir, 'session.json')
    await writeSession(file, { userFolder: 'C:/user', sampleFolder: 'C:/samples' })
    expect(await readSession(file)).toEqual({ userFolder: 'C:/user', sampleFolder: 'C:/samples' })
  })

  it('returns empty paths when the file is missing or corrupt', async () => {
    expect(await readSession(join(workDir, 'nope.json'))).toEqual({
      userFolder: null,
      sampleFolder: null
    })
    const corrupt = join(workDir, 'corrupt.json')
    await writeFile(corrupt, '{ not json')
    expect(await readSession(corrupt)).toEqual({ userFolder: null, sampleFolder: null })
  })
})

describe('buildSessionConfig', () => {
  it('returns null unless both folders are set', () => {
    expect(buildSessionConfig({ userFolder: 'C:/u', sampleFolder: null }, '1.0.0')).toBeNull()
    expect(buildSessionConfig({ userFolder: null, sampleFolder: 'C:/s' }, '1.0.0')).toBeNull()
  })

  it('includes app version, both paths, and an ISO timestamp', () => {
    const now = new Date('2026-06-28T12:00:00.000Z')
    expect(buildSessionConfig({ userFolder: 'C:/u', sampleFolder: 'C:/s' }, '0.5.0', now)).toEqual({
      appVersion: '0.5.0',
      userFolder: 'C:/u',
      sampleFolder: 'C:/s',
      lastOpened: '2026-06-28T12:00:00.000Z'
    })
  })
})

describe('writeSessionConfig', () => {
  it('writes mixjam.json into the user folder when both folders are set', async () => {
    const userFolder = join(workDir, 'user')
    await mkdir(userFolder)
    await writeSessionConfig({ userFolder, sampleFolder: 'C:/samples' }, '0.5.0')

    const written = JSON.parse(await readFile(join(userFolder, CONFIG_FILE_NAME), 'utf8'))
    expect(written.appVersion).toBe('0.5.0')
    expect(written.userFolder).toBe(userFolder)
    expect(written.sampleFolder).toBe('C:/samples')
    expect(typeof written.lastOpened).toBe('string')
  })

  it('is a no-op when the sample folder is unset', async () => {
    const userFolder = join(workDir, 'user2')
    await mkdir(userFolder)
    await writeSessionConfig({ userFolder, sampleFolder: null }, '0.5.0')
    await expect(readFile(join(userFolder, CONFIG_FILE_NAME), 'utf8')).rejects.toThrow()
  })
})
