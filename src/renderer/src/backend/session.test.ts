import { beforeEach, describe, expect, it } from 'vitest'
import {
  RECENT_PROJECTS_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  buildSessionConfig,
  loadSession,
  normalizeRecentProjects,
  normalizeSession,
  readRecentProjects,
  recordRecentProject,
  saveSession,
  upsertRecentProject,
  writeRecentProjects
} from './session'
import type { FolderRef } from '../../../shared/backend-api'

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
})

describe('normalizeSession', () => {
  it('keeps FolderRefs and nulls out anything else', () => {
    expect(normalizeSession({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })).toEqual({
      userFolder: USER_REF,
      sampleFolder: SAMPLE_REF
    })
    expect(normalizeSession({ userFolder: 'C:/a', sampleFolder: 123 })).toEqual({
      userFolder: null,
      sampleFolder: null
    })
    expect(normalizeSession(undefined)).toEqual({ userFolder: null, sampleFolder: null })
  })

  it('strips extra properties from stored refs', () => {
    const normalized = normalizeSession({
      userFolder: { id: 'u', name: 'n', handle: { evil: true } },
      sampleFolder: null
    })
    expect(normalized.userFolder).toEqual({ id: 'u', name: 'n' })
  })
})

describe('loadSession / saveSession', () => {
  it('round-trips a session through storage', () => {
    saveSession({ userFolder: USER_REF, sampleFolder: SAMPLE_REF }, storage)
    expect(loadSession(storage)).toEqual({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })
  })

  it('returns an empty session when storage is empty or corrupt', () => {
    expect(loadSession(storage)).toEqual({ userFolder: null, sampleFolder: null })
    storage.setItem(SESSION_STORAGE_KEY, '{not json')
    expect(loadSession(storage)).toEqual({ userFolder: null, sampleFolder: null })
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

describe('buildSessionConfig', () => {
  it('produces the mixjam.json shape with folder names', () => {
    const config = buildSessionConfig(
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
    expect(buildSessionConfig({ userFolder: USER_REF, sampleFolder: null }, '1')).toBeNull()
    expect(buildSessionConfig({ userFolder: null, sampleFolder: SAMPLE_REF }, '1')).toBeNull()
  })
})
