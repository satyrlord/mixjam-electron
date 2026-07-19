import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFolderHandle } from './handle-store'
import {
  FOLDER_SELECTIONS_STORAGE_KEY,
  buildAppConfig,
  loadFolderSelections,
  normalizeFolderSelections,
  saveFolderSelections,
  writeAppConfig
} from './app-state'
import type { FolderRef } from '../../../shared/backend-api'

vi.mock('./handle-store', () => ({
  loadFolderHandle: vi.fn()
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
    vi.mocked(loadFolderHandle).mockResolvedValue({
      getFileHandle,
      queryPermission: vi.fn(async () => 'granted')
    } as unknown as FileSystemDirectoryHandle)

    await writeAppConfig({ userFolder: USER_REF, sampleFolder: SAMPLE_REF }, '1.2.3')

    expect(getFileHandle).toHaveBeenCalledWith('mixjam.json', { create: true })
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"appVersion": "1.2.3"'))
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"userFolder": "MixJam"'))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
