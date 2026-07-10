import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFolderHandle } from './handle-store'
import { resolveFileHandle } from './folder-access'
import {
  RECENT_PROJECTS_STORAGE_KEY,
  FOLDER_SELECTIONS_STORAGE_KEY,
  buildAppConfig,
  loadFolderSelections,
  listMixJamFiles,
  normalizeRecentProjects,
  normalizeFolderSelections,
  readRecentProjects,
  recordRecentProject,
  saveFolderSelections,
  upsertRecentProject,
  writeRecentProjects,
  writeAppConfig
} from './app-state'
import type { FolderRef } from '../../../shared/backend-api'

vi.mock('./handle-store', () => ({
  loadFolderHandle: vi.fn()
}))

vi.mock('./folder-access', () => ({
  resolveFileHandle: vi.fn()
}))

const USER_REF: FolderRef = { id: 'user-1', name: 'MixJam' }
const SAMPLE_REF: FolderRef = { id: 'sample-1', name: 'Samples' }

/** Minimal in-memory Storage so tests never leak state between cases. */
function makeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value))
  }
}

let storage: Storage

beforeEach(() => {
  storage = makeStorage()
  vi.mocked(loadFolderHandle).mockReset()
  vi.mocked(resolveFileHandle).mockReset()
})

describe('normalizeFolderSelections', () => {
  it('keeps FolderRefs and nulls out anything else', () => {
    expect(normalizeFolderSelections({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })).toEqual({
      userFolder: USER_REF,
      sampleFolder: SAMPLE_REF
    })
    expect(normalizeFolderSelections({ userFolder: 'C:/a', sampleFolder: 123 })).toEqual({
      userFolder: null,
      sampleFolder: null
    })
    expect(normalizeFolderSelections(undefined)).toEqual({ userFolder: null, sampleFolder: null })
  })

  it('strips extra properties from stored refs', () => {
    const normalized = normalizeFolderSelections({
      userFolder: { id: 'u', name: 'n', handle: { evil: true } },
      sampleFolder: null
    })
    expect(normalized.userFolder).toEqual({ id: 'u', name: 'n' })
  })
})

describe('loadFolderSelections / saveFolderSelections', () => {
  it('round-trips folder selections through storage', () => {
    saveFolderSelections({ userFolder: USER_REF, sampleFolder: SAMPLE_REF }, storage)
    expect(loadFolderSelections(storage)).toEqual({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })
  })

  it('returns empty folder selections when storage is empty or corrupt', () => {
    expect(loadFolderSelections(storage)).toEqual({ userFolder: null, sampleFolder: null })
    storage.setItem(FOLDER_SELECTIONS_STORAGE_KEY, '{not json')
    expect(loadFolderSelections(storage)).toEqual({ userFolder: null, sampleFolder: null })
  })
})

describe('normalizeRecentProjects', () => {
  it('drops malformed entries and dedupes by path keeping the newest', () => {
    const entries = normalizeRecentProjects([
      { path: 'a.mixjam', displayName: 'a', lastOpened: '2026-01-01T00:00:00.000Z' },
      { path: 'a.mixjam', displayName: 'a', lastOpened: '2026-02-01T00:00:00.000Z' },
      { path: 'b.mixjam', displayName: 'b' },
      'garbage',
      42
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].lastOpened).toBe('2026-02-01T00:00:00.000Z')
  })

  it('sorts newest first', () => {
    const entries = normalizeRecentProjects([
      { path: 'old.mixjam', displayName: 'old', lastOpened: '2026-01-01T00:00:00.000Z' },
      { path: 'new.mixjam', displayName: 'new', lastOpened: '2026-06-01T00:00:00.000Z' }
    ])
    expect(entries.map((e) => e.path)).toEqual(['new.mixjam', 'old.mixjam'])
  })
})

describe('upsertRecentProject', () => {
  it('adds a new entry with a display name derived from the relpath', () => {
    const entries = upsertRecentProject([], 'sets/club-night.mixjam', new Date('2026-07-01'))
    expect(entries).toHaveLength(1)
    expect(entries[0].displayName).toBe('club-night')
    expect(entries[0].path).toBe('sets/club-night.mixjam')
  })

  it('moves an existing entry to the top instead of duplicating it', () => {
    let entries = upsertRecentProject([], 'a.mixjam', new Date('2026-01-01'))
    entries = upsertRecentProject(entries, 'b.mixjam', new Date('2026-02-01'))
    entries = upsertRecentProject(entries, 'a.mixjam', new Date('2026-03-01'))
    expect(entries).toHaveLength(2)
    expect(entries[0].path).toBe('a.mixjam')
  })
})

describe('recent projects storage round-trip', () => {
  it('persists entries and survives corrupt JSON', () => {
    recordRecentProject('one.mixjam', new Date('2026-07-01'), storage)
    recordRecentProject('two.mixjam', new Date('2026-07-02'), storage)
    expect(readRecentProjects(storage).map((e) => e.path)).toEqual(['two.mixjam', 'one.mixjam'])

    storage.setItem(RECENT_PROJECTS_STORAGE_KEY, 'not json at all')
    expect(readRecentProjects(storage)).toEqual([])
  })

  it('writeRecentProjects normalizes before storing', () => {
    writeRecentProjects(
      [
        { path: 'x.mixjam', displayName: 'x', lastOpened: '2026-01-01T00:00:00.000Z' },
        { path: 'x.mixjam', displayName: 'x', lastOpened: '2026-02-01T00:00:00.000Z' }
      ],
      storage
    )
    expect(readRecentProjects(storage)).toHaveLength(1)
  })
})

describe('buildAppConfig', () => {
  it('produces the mixjam.json shape with folder names', () => {
    const config = buildAppConfig(
      { userFolder: USER_REF, sampleFolder: SAMPLE_REF },
      '0.99',
      new Date('2026-07-03T10:00:00.000Z')
    )
    expect(config).toEqual({
      appVersion: '0.99',
      userFolder: 'MixJam',
      sampleFolder: 'Samples',
      lastOpened: '2026-07-03T10:00:00.000Z'
    })
  })

  it('returns null unless both folders are set', () => {
    expect(buildAppConfig({ userFolder: USER_REF, sampleFolder: null }, '1')).toBeNull()
    expect(buildAppConfig({ userFolder: null, sampleFolder: SAMPLE_REF }, '1')).toBeNull()
  })
})

function fakeFile(name: string): FileSystemFileHandle {
  return { kind: 'file', name } as unknown as FileSystemFileHandle
}

function fakeDir(
  name: string,
  entries: [string, FileSystemDirectoryHandle | FileSystemFileHandle][] = [],
  permission: PermissionState = 'granted'
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    queryPermission: vi.fn(async () => permission),
    entries: async function* () {
      for (const entry of entries) yield entry
    }
  } as unknown as FileSystemDirectoryHandle
}

function throwingDir(name: string): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      yield* []
      throw new Error('unreadable')
    }
  } as unknown as FileSystemDirectoryHandle
}

describe('listMixJamFiles', () => {
  it('returns an empty list without an accessible user folder', async () => {
    expect(await listMixJamFiles(null, storage)).toEqual([])

    vi.mocked(loadFolderHandle).mockResolvedValueOnce(null)
    expect(await listMixJamFiles(USER_REF, storage)).toEqual([])

    vi.mocked(loadFolderHandle).mockRejectedValueOnce(new Error('idb unavailable'))
    expect(await listMixJamFiles(USER_REF, storage)).toEqual([])

    vi.mocked(loadFolderHandle).mockResolvedValueOnce(fakeDir('User', [], 'denied'))
    expect(await listMixJamFiles(USER_REF, storage)).toEqual([])
  })

  it('merges verified registry entries with discovered projects and skips stale files', async () => {
    const root = fakeDir('User', [
      ['loose.mixjam', fakeFile('loose.mixjam')],
      ['notes.txt', fakeFile('notes.txt')],
      ['Sets', fakeDir('Sets', [['zeta.mixjam', fakeFile('zeta.mixjam')]])],
      ['Broken', throwingDir('Broken')]
    ])
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    vi.mocked(resolveFileHandle).mockImplementation(async (_dir, relpath) =>
      relpath === 'registered.mixjam' ? fakeFile('registered.mixjam') : null
    )
    writeRecentProjects(
      [
        { path: 'registered.mixjam', displayName: 'Registered', lastOpened: '2026-07-03T10:00:00.000Z' },
        { path: 'missing.mixjam', displayName: 'Missing', lastOpened: '2026-07-04T10:00:00.000Z' }
      ],
      storage
    )

    const projects = await listMixJamFiles(USER_REF, storage)

    expect(projects.map((project) => project.path)).toEqual([
      'registered.mixjam',
      'loose.mixjam',
      'Sets/zeta.mixjam'
    ])
    expect(resolveFileHandle).toHaveBeenCalledWith(root, 'registered.mixjam')
    expect(resolveFileHandle).toHaveBeenCalledWith(root, 'missing.mixjam')
  })

  it('caps the merged MixJam file list', async () => {
    const files = Array.from({ length: 25 }, (_, index) =>
      [`project-${String(index).padStart(2, '0')}.mixjam`, fakeFile(`project-${index}.mixjam`)] as [
        string,
        FileSystemFileHandle
      ]
    )
    vi.mocked(loadFolderHandle).mockResolvedValue(fakeDir('User', files))
    vi.mocked(resolveFileHandle).mockResolvedValue(null)

    const projects = await listMixJamFiles(USER_REF, storage)

    expect(projects).toHaveLength(20)
    expect(projects[0].displayName).toBe('project-00')
  })
})

describe('writeAppConfig', () => {
  it('does not touch storage when complete folder selections or a handle are missing', async () => {
    await writeAppConfig({ userFolder: USER_REF, sampleFolder: null }, '1.0')
    expect(loadFolderHandle).not.toHaveBeenCalled()

    vi.mocked(loadFolderHandle).mockResolvedValueOnce(null)
    await writeAppConfig({ userFolder: USER_REF, sampleFolder: SAMPLE_REF }, '1.0')
    expect(loadFolderHandle).toHaveBeenCalledWith(USER_REF.id)
  })

  it('writes mixjam.json into the user folder', async () => {
    const write = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)
    const getFileHandle = vi.fn(async () => ({
      kind: 'file',
      name: 'mixjam.json',
      createWritable: async () => ({ write, close })
    } as unknown as FileSystemFileHandle))
    vi.mocked(loadFolderHandle).mockResolvedValue({ getFileHandle } as unknown as FileSystemDirectoryHandle)

    await writeAppConfig({ userFolder: USER_REF, sampleFolder: SAMPLE_REF }, '1.2.3')

    expect(getFileHandle).toHaveBeenCalledWith('mixjam.json', { create: true })
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"appVersion": "1.2.3"'))
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"userFolder": "MixJam"'))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
