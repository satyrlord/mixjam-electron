import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderRef } from '../../../shared/backend-api'
import { resolveFileHandle } from './folder-access'
import { loadFolderHandle } from './handle-store'
import {
  RECENT_PROJECTS_STORAGE_KEY,
  listMixJamFiles,
  normalizeRecentProjects,
  readRecentProjects,
  recordRecentProject,
  upsertRecentProject,
  writeRecentProjects
} from './project-catalog'

vi.mock('./handle-store', () => ({ loadFolderHandle: vi.fn() }))
vi.mock('./folder-access', async (importOriginal) => ({
  ...await importOriginal<typeof import('./folder-access')>(),
  resolveFileHandle: vi.fn()
}))

const USER_REF: FolderRef = { id: 'user-1', name: 'MixJam' }

function makeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value))
  }
}

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

let storage: Storage

beforeEach(() => {
  storage = makeStorage()
  vi.mocked(loadFolderHandle).mockReset()
  vi.mocked(resolveFileHandle).mockReset()
})

describe('recent project records', () => {
  it('treats a non-array storage payload as an empty recent-project list', () => {
    expect(normalizeRecentProjects({ path: 'not-a-list.mixjam' })).toEqual([])
  })

  it('drops malformed entries, dedupes paths, and sorts newest first', () => {
    const entries = normalizeRecentProjects([
      { path: 'a.mixjam', displayName: 'a', lastOpened: '2026-01-01T00:00:00.000Z' },
      { path: 'a.mixjam', displayName: 'a', lastOpened: '2026-02-01T00:00:00.000Z' },
      { path: 'b.mixjam', displayName: 'b' },
      { path: 'new.mixjam', displayName: 'new', lastOpened: '2026-06-01T00:00:00.000Z' }
    ])
    expect(entries.map((entry) => entry.path)).toEqual(['new.mixjam', 'a.mixjam'])
  })

  it('adds and refreshes entries without duplication', () => {
    let entries = upsertRecentProject([], 'sets/club-night.mixjam', new Date('2026-01-01'))
    entries = upsertRecentProject(entries, 'b.mixjam', new Date('2026-02-01'))
    entries = upsertRecentProject(entries, 'sets/club-night.mixjam', new Date('2026-03-01'))
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ path: 'sets/club-night.mixjam', displayName: 'club-night' })
  })

  it('derives names without extensions and uses names to break timestamp ties', () => {
    const timestamp = new Date('2026-01-01')
    let entries = upsertRecentProject([], 'zeta', timestamp)
    entries = upsertRecentProject(entries, 'alpha.mixjam', timestamp)
    expect(entries.map(({ displayName }) => displayName)).toEqual(['zeta', 'alpha'])
  })

  it('round-trips normalized storage and survives corrupt JSON', () => {
    recordRecentProject('one.mixjam', new Date('2026-07-01'), storage)
    recordRecentProject('two.mixjam', new Date('2026-07-02'), storage)
    expect(readRecentProjects(storage).map((entry) => entry.path)).toEqual(['two.mixjam', 'one.mixjam'])

    writeRecentProjects([
      { path: 'x.mixjam', displayName: 'x', lastOpened: '2026-01-01T00:00:00.000Z' },
      { path: 'x.mixjam', displayName: 'x', lastOpened: '2026-02-01T00:00:00.000Z' }
    ], storage)
    expect(readRecentProjects(storage)).toHaveLength(1)

    storage.setItem(RECENT_PROJECTS_STORAGE_KEY, 'not json')
    expect(readRecentProjects(storage)).toEqual([])
  })
})

describe('listMixJamFiles', () => {
  it('returns an empty list without an accessible User Folder', async () => {
    expect(await listMixJamFiles(null, storage)).toEqual([])
    vi.mocked(loadFolderHandle).mockResolvedValueOnce(null)
    expect(await listMixJamFiles(USER_REF, storage)).toEqual([])
    vi.mocked(loadFolderHandle).mockRejectedValueOnce(new Error('idb unavailable'))
    expect(await listMixJamFiles(USER_REF, storage)).toEqual([])
    vi.mocked(loadFolderHandle).mockResolvedValueOnce(fakeDir('User', [], 'denied'))
    expect(await listMixJamFiles(USER_REF, storage)).toEqual([])
  })

  it('merges verified recent entries with discovery and skips stale files', async () => {
    const root = fakeDir('User', [
      ['loose.mixjam', fakeFile('loose.mixjam')],
      ['notes.txt', fakeFile('notes.txt')],
      ['Sets', fakeDir('Sets', [['zeta.mixjam', fakeFile('zeta.mixjam')]])],
      ['Broken', throwingDir('Broken')]
    ])
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    vi.mocked(resolveFileHandle).mockImplementation(async (_dir, path) =>
      path === 'registered.mixjam' ? fakeFile('registered.mixjam') : null
    )
    writeRecentProjects([
      { path: 'registered.mixjam', displayName: 'Registered', lastOpened: '2026-07-03T10:00:00.000Z' },
      { path: 'missing.mixjam', displayName: 'Missing', lastOpened: '2026-07-04T10:00:00.000Z' }
    ], storage)

    expect((await listMixJamFiles(USER_REF, storage)).map((project) => project.path)).toEqual([
      'registered.mixjam',
      'loose.mixjam',
      'Sets/zeta.mixjam'
    ])
    expect(resolveFileHandle).toHaveBeenCalledWith(root, 'registered.mixjam')
    expect(resolveFileHandle).toHaveBeenCalledWith(root, 'missing.mixjam')
  })

  it('caps the merged catalog', async () => {
    const files = Array.from({ length: 25 }, (_, index) => [
      `project-${String(index).padStart(2, '0')}.mixjam`,
      fakeFile(`project-${index}.mixjam`)
    ] as [string, FileSystemFileHandle])
    vi.mocked(loadFolderHandle).mockResolvedValue(fakeDir('User', files))
    vi.mocked(resolveFileHandle).mockResolvedValue(null)

    const projects = await listMixJamFiles(USER_REF, storage)
    expect(projects).toHaveLength(20)
    expect(projects[0].displayName).toBe('project-00')
  })
})
