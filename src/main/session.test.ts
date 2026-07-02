import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalizePath } from './path-utils'
import {
  CONFIG_FILE_NAME,
  RECENT_PROJECTS_FILE_NAME,
  buildSessionConfig,
  isFolderRole,
  defaultUserFolderPath,
  listRecentProjects,
  normalizeRecentProjects,
  normalizeSession,
  recordRecentProject,
  readRecentProjects,
  readSession,
  upsertRecentProject,
  validateFolder,
  writeRecentProjects,
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

describe('normalizeRecentProjects', () => {
  it('keeps only valid entries, deduplicates by canonical path, and sorts newest first', () => {
    expect(
      normalizeRecentProjects([
        {
          path: 'C:/Users/Test/Documents/MixJam/alpha.mixjam',
          displayName: 'Alpha',
          lastOpened: '2026-06-28T12:00:00.000Z'
        },
        {
          path: 'c:/users/test/documents/mixjam/ALPHA.mixjam',
          displayName: 'Alpha Duplicate',
          lastOpened: '2026-06-28T13:00:00.000Z'
        },
        {
          path: 'C:/Users/Test/Documents/MixJam/beta.mixjam',
          displayName: 'Beta',
          lastOpened: '2026-06-28T11:00:00.000Z'
        },
        { nope: true }
      ])
    ).toEqual([
      {
        path: 'c:\\users\\test\\documents\\mixjam\\alpha.mixjam',
        displayName: 'Alpha Duplicate',
        lastOpened: '2026-06-28T13:00:00.000Z'
      },
      {
        path: 'c:\\users\\test\\documents\\mixjam\\beta.mixjam',
        displayName: 'Beta',
        lastOpened: '2026-06-28T11:00:00.000Z'
      }
    ])
  })
})

describe('upsertRecentProject', () => {
  it('inserts a new project and refreshes existing paths to the top of the list', () => {
    const original = [
      {
        path: 'c:/users/test/documents/mixjam/beta.mixjam',
        displayName: 'Beta',
        lastOpened: '2026-06-28T10:00:00.000Z'
      },
      {
        path: 'c:/users/test/documents/mixjam/alpha.mixjam',
        displayName: 'Alpha',
        lastOpened: '2026-06-28T09:00:00.000Z'
      }
    ]

    expect(
      upsertRecentProject(
        original,
        'C:/Users/Test/Documents/MixJam/alpha.mixjam',
        new Date('2026-06-28T12:00:00.000Z')
      )
    ).toEqual([
      {
        path: 'c:\\users\\test\\documents\\mixjam\\alpha.mixjam',
        displayName: 'alpha',
        lastOpened: '2026-06-28T12:00:00.000Z'
      },
      {
        path: 'c:/users/test/documents/mixjam/beta.mixjam',
        displayName: 'Beta',
        lastOpened: '2026-06-28T10:00:00.000Z'
      }
    ])
  })
})

describe('readRecentProjects / writeRecentProjects', () => {
  it('round-trips recent projects through disk', async () => {
    const file = join(workDir, RECENT_PROJECTS_FILE_NAME)
    const entries = [
      {
        path: 'C:/Users/Test/Documents/MixJam/alpha.mixjam',
        displayName: 'Alpha',
        lastOpened: '2026-06-28T12:00:00.000Z'
      }
    ]

    await writeRecentProjects(file, entries)

    expect(await readRecentProjects(file)).toEqual([
      {
        path: 'c:\\users\\test\\documents\\mixjam\\alpha.mixjam',
        displayName: 'Alpha',
        lastOpened: '2026-06-28T12:00:00.000Z'
      }
    ])
  })

  it('returns an empty list when the registry file is missing or corrupt', async () => {
    expect(await readRecentProjects(join(workDir, RECENT_PROJECTS_FILE_NAME))).toEqual([])

    const corrupt = join(workDir, 'recent-projects-corrupt.json')
    await writeFile(corrupt, '{ not json')
    expect(await readRecentProjects(corrupt)).toEqual([])
  })
})

describe('recordRecentProject', () => {
  it('persists an upserted project entry to disk', async () => {
    const file = join(workDir, RECENT_PROJECTS_FILE_NAME)

    await recordRecentProject(
      file,
      'C:/Users/Test/Documents/MixJam/subfolder/song.mixjam',
      new Date('2026-06-28T14:00:00.000Z')
    )

    expect(await readRecentProjects(file)).toEqual([
      {
        path: 'c:\\users\\test\\documents\\mixjam\\subfolder\\song.mixjam',
        displayName: 'song',
        lastOpened: '2026-06-28T14:00:00.000Z'
      }
    ])
  })
})

describe('defaultUserFolderPath (AC-010b)', () => {
  it('returns Documents/MixJam under the given home on Windows-style path', () => {
    expect(defaultUserFolderPath('C:\\Users\\Alice')).toBe(join('C:\\Users\\Alice', 'Documents', 'MixJam'))
  })

  it('returns Documents/MixJam under the given home on POSIX-style path', () => {
    expect(defaultUserFolderPath('/home/alice')).toBe(join('/home/alice', 'Documents', 'MixJam'))
  })
})

describe('listRecentProjects', () => {
  it('merges registry entries with recursively discovered user-folder projects', async () => {
    const file = join(workDir, RECENT_PROJECTS_FILE_NAME)
    const userFolder = join(workDir, 'MixJam')
    const nested = join(userFolder, 'sets', 'summer')

    await mkdir(nested, { recursive: true })
    await writeFile(join(userFolder, 'alpha.mixjam'), '{}')
    await writeFile(join(nested, 'beta.mixjam'), '{}')
    await writeFile(join(nested, 'notes.txt'), 'ignore me')

    await writeRecentProjects(file, [
      {
        path: join(userFolder, 'alpha.mixjam'),
        displayName: 'alpha',
        lastOpened: '2026-06-28T15:00:00.000Z'
      }
    ])

    expect(await listRecentProjects(file, userFolder)).toEqual([
      {
        path: canonicalizePath(join(userFolder, 'alpha.mixjam')),
        displayName: 'alpha',
        lastOpened: '2026-06-28T15:00:00.000Z'
      },
      {
        path: canonicalizePath(join(nested, 'beta.mixjam')),
        displayName: 'beta',
        lastOpened: null
      }
    ])
  })
})
