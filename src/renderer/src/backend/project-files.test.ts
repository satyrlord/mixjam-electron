import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderRef } from '../../../shared/backend-api'
import { resolveFileHandle } from './folder-access'
import { loadFolderHandle } from './handle-store'
import {
  createGeneratedMixJamFile,
  findMissingSampleFiles,
  openMixJamFile,
  readMixJamFile,
  saveMixJamFileAs,
  writeMixJamFile
} from './project-files'

vi.mock('./handle-store', () => ({ loadFolderHandle: vi.fn() }))
vi.mock('./folder-access', () => ({ resolveFileHandle: vi.fn() }))

const USER_FOLDER: FolderRef = { id: 'user-folder', name: 'MixJam' }
const SAMPLE_FOLDER: FolderRef = { id: 'sample-folder', name: 'Samples' }

function fakeFile(name: string, contents = '{}') {
  const write = vi.fn(async () => undefined)
  const close = vi.fn(async () => undefined)
  const abort = vi.fn(async () => undefined)
  const handle = {
    kind: 'file',
    name,
    getFile: vi.fn(async () => ({ text: async () => contents })),
    createWritable: vi.fn(async () => ({ write, close, abort }))
  } as unknown as FileSystemFileHandle
  return { handle, write, close, abort }
}

function fakeRoot(
  resolvedPath: string[] | null = ['project.mixjam'],
  permission: PermissionState = 'granted',
  requestedPermission: PermissionState = permission
) {
  return {
    kind: 'directory',
    name: 'MixJam',
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => requestedPermission),
    resolve: vi.fn(async () => resolvedPath),
    keys: async function* () {}
  } as unknown as FileSystemDirectoryHandle
}

beforeEach(() => {
  vi.mocked(loadFolderHandle).mockReset()
  vi.mocked(resolveFileHandle).mockReset()
})

describe('project file access', () => {
  it('opens a filtered .mixjam file and returns its User Folder-relative path', async () => {
    const root = fakeRoot(['sets', 'club.mixjam'])
    const file = fakeFile('club.mixjam', '{"formatVersion":1}')
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    vi.stubGlobal('showOpenFilePicker', undefined)
    window.showOpenFilePicker = vi.fn(async () => [file.handle])

    await expect(openMixJamFile(USER_FOLDER)).resolves.toEqual({
      path: 'sets/club.mixjam',
      fileName: 'club.mixjam',
      contents: '{"formatVersion":1}'
    })
    expect(window.showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({
      multiple: false,
      excludeAcceptAllOption: true
    }))
  })

  it('returns null when the user cancels an open or save picker', async () => {
    vi.mocked(loadFolderHandle).mockResolvedValue(fakeRoot())
    window.showOpenFilePicker = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError')
    })
    window.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError')
    })

    await expect(openMixJamFile(USER_FOLDER)).resolves.toBeNull()
    await expect(saveMixJamFileAs(USER_FOLDER, 'Untitled.mixjam', '{}')).resolves.toBeNull()
  })

  it('handles empty open selection and plain AbortError-shaped picker failures', async () => {
    vi.mocked(loadFolderHandle).mockResolvedValue(fakeRoot())
    window.showOpenFilePicker = vi.fn(async () => [])
    await expect(openMixJamFile(USER_FOLDER)).resolves.toBeNull()

    window.showSaveFilePicker = vi.fn(async () => {
      throw { name: 'AbortError' }
    })
    await expect(saveMixJamFileAs(USER_FOLDER, 'Untitled', '{}')).resolves.toBeNull()
  })

  it('rejects inaccessible folders after failed permission recovery', async () => {
    vi.mocked(loadFolderHandle).mockResolvedValueOnce(null)
    await expect(readMixJamFile(USER_FOLDER, 'missing.mixjam')).rejects.toThrow(
      'folder is no longer available'
    )

    const denied = fakeRoot([], 'prompt', 'denied')
    vi.mocked(loadFolderHandle).mockResolvedValueOnce(denied)
    await expect(readMixJamFile(USER_FOLDER, 'missing.mixjam')).rejects.toThrow(
      'Access to the MixJam folder is required.'
    )
    expect(denied.requestPermission).toHaveBeenCalledWith({ mode: 'read' })
  })

  it('does not request User Folder permission before opening a project', async () => {
    const root = fakeRoot(['club.mixjam'], 'prompt', 'granted')
    const file = fakeFile('club.mixjam')
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    window.showOpenFilePicker = vi.fn(async () => [file.handle])

    await expect(openMixJamFile(USER_FOLDER)).resolves.toMatchObject({ path: 'club.mixjam' })

    expect(root.queryPermission).not.toHaveBeenCalled()
    expect(root.requestPermission).not.toHaveBeenCalled()
  })

  it('opens picker selections outside the User Folder as read-only imports', async () => {
    const root = fakeRoot(null)
    const file = fakeFile('outside.mixjam', '{"external":true}')
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    window.showOpenFilePicker = vi.fn(async () => [file.handle])

    await expect(openMixJamFile(USER_FOLDER)).resolves.toEqual({
      path: null,
      fileName: 'outside.mixjam',
      contents: '{"external":true}'
    })
  })

  it('opens an external project when the stored User Folder handle is unavailable', async () => {
    const file = fakeFile('outside.mixjam')
    vi.mocked(loadFolderHandle).mockResolvedValue(null)
    window.showOpenFilePicker = vi.fn(async () => [file.handle])

    await expect(openMixJamFile(USER_FOLDER)).resolves.toMatchObject({
      path: null,
      fileName: 'outside.mixjam'
    })
    expect(window.showOpenFilePicker).toHaveBeenCalledTimes(1)
  })

  it('saves through createWritable and commits only by closing the stream', async () => {
    const root = fakeRoot(['sets', 'new.mixjam'])
    const file = fakeFile('new.mixjam')
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    window.showSaveFilePicker = vi.fn(async () => file.handle)

    await expect(saveMixJamFileAs(USER_FOLDER, 'new.mixjam', '{"ok":true}\n')).resolves.toEqual({
      path: 'sets/new.mixjam',
      contents: '{"ok":true}\n'
    })
    expect(file.write).toHaveBeenCalledWith('{"ok":true}\n')
    expect(file.close).toHaveBeenCalledTimes(1)
    expect(file.abort).not.toHaveBeenCalled()
  })

  it('creates generated projects with the first free monotonic suffix', async () => {
    const created = fakeFile('techno-140bpm-medium-seed-003.mixjam')
    const getFileHandle = vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (options?.create) return created.handle
      if (name.endsWith('-001.mixjam') || name.endsWith('-002.mixjam')) return fakeFile(name).handle
      throw new DOMException('missing', 'NotFoundError')
    })
    const root = {
      ...fakeRoot(),
      getFileHandle,
      keys: async function* () {
        yield 'techno-140bpm-medium-seed-001.mixjam'
        yield 'techno-140bpm-medium-seed-002.mixjam'
      }
    } as unknown as FileSystemDirectoryHandle
    vi.mocked(loadFolderHandle).mockResolvedValue(root)

    await expect(createGeneratedMixJamFile(
      USER_FOLDER,
      'techno-140bpm-medium-seed',
      '{"generated":true}\n'
    )).resolves.toEqual({
      path: 'techno-140bpm-medium-seed-003.mixjam',
      contents: '{"generated":true}\n'
    })
    expect(getFileHandle).toHaveBeenLastCalledWith(
      'techno-140bpm-medium-seed-003.mixjam',
      { create: true }
    )
    expect(created.write).toHaveBeenCalledWith('{"generated":true}\n')
    expect(created.close).toHaveBeenCalledTimes(1)
  })

  it('keeps generated suffixes monotonic instead of filling deleted gaps', async () => {
    const created = fakeFile('house-seed-004.mixjam')
    const root = {
      ...fakeRoot(),
      keys: async function* () {
        yield 'house-seed-001.mixjam'
        yield 'house-seed-003.mixjam'
      },
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (options?.create && name === 'house-seed-004.mixjam') return created.handle
        throw new DOMException('missing', 'NotFoundError')
      })
    } as unknown as FileSystemDirectoryHandle
    vi.mocked(loadFolderHandle).mockResolvedValue(root)

    await expect(createGeneratedMixJamFile(USER_FOLDER, 'house-seed', '{}')).resolves.toMatchObject({
      path: 'house-seed-004.mixjam'
    })
  })

  it('ignores unrelated generated names and propagates unexpected lookup failures', async () => {
    const root = {
      ...fakeRoot(),
      keys: async function* () {
        yield 'notes.txt'
        yield 'house-seed-latest.mixjam'
      },
      getFileHandle: vi.fn(async () => {
        throw new DOMException('denied', 'NotAllowedError')
      })
    } as unknown as FileSystemDirectoryHandle
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    await expect(createGeneratedMixJamFile(USER_FOLDER, 'house-seed', '{}')).rejects.toThrow(
      'denied'
    )
  })

  it('rejects unsafe generated project basenames before touching the folder', async () => {
    await expect(createGeneratedMixJamFile(USER_FOLDER, '../bad', '{}')).rejects.toThrow(
      'Generated MixJam basenames may contain only'
    )
    expect(loadFolderHandle).not.toHaveBeenCalled()
  })

  it('removes a newly allocated generated file when its transactional write fails', async () => {
    const created = fakeFile('house-seed-001.mixjam')
    created.write.mockRejectedValueOnce(new Error('disk full'))
    const removeEntry = vi.fn(async () => undefined)
    const root = {
      ...fakeRoot(),
      getFileHandle: vi.fn(async (_name: string, options?: { create?: boolean }) => {
        if (options?.create) return created.handle
        throw new DOMException('missing', 'NotFoundError')
      }),
      removeEntry
    } as unknown as FileSystemDirectoryHandle
    vi.mocked(loadFolderHandle).mockResolvedValue(root)

    await expect(createGeneratedMixJamFile(USER_FOLDER, 'house-seed', '{}')).rejects.toThrow('disk full')
    expect(removeEntry).toHaveBeenCalledWith('house-seed-001.mixjam')
  })

  it('rejects Save As selections outside the User Folder before writing', async () => {
    const root = fakeRoot(null)
    const file = fakeFile('outside.mixjam')
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    window.showSaveFilePicker = vi.fn(async () => file.handle)

    await expect(saveMixJamFileAs(USER_FOLDER, 'outside.mixjam', '{}')).rejects.toThrow(
      'MixJam projects must be saved inside the selected User Folder.'
    )
    expect(file.handle.createWritable).not.toHaveBeenCalled()
  })

  it('aborts a failed write and preserves the original error', async () => {
    const root = fakeRoot(['project.mixjam'])
    const file = fakeFile('project.mixjam')
    file.write.mockRejectedValueOnce(new Error('disk full'))
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    vi.mocked(resolveFileHandle).mockResolvedValue(file.handle)

    await expect(writeMixJamFile(USER_FOLDER, 'project.mixjam', '{}')).rejects.toThrow('disk full')
    expect(file.abort).toHaveBeenCalledTimes(1)
    expect(file.close).not.toHaveBeenCalled()
  })

  it('reads and overwrites only safe relative .mixjam paths', async () => {
    const root = fakeRoot()
    const file = fakeFile('project.mixjam', '{"project":true}')
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    vi.mocked(resolveFileHandle).mockResolvedValue(file.handle)

    await expect(readMixJamFile(USER_FOLDER, 'project.mixjam')).resolves.toEqual({
      path: 'project.mixjam',
      contents: '{"project":true}'
    })
    await writeMixJamFile(USER_FOLDER, 'project.mixjam', '{"saved":true}')
    expect(file.write).toHaveBeenCalledWith('{"saved":true}')
    await expect(readMixJamFile(USER_FOLDER, '../outside.mixjam')).rejects.toThrow(
      'The MixJam project path is invalid.'
    )
  })

  it('rejects missing read and write targets and appends the save extension', async () => {
    const root = fakeRoot(['untitled.mixjam'])
    const file = fakeFile('untitled.mixjam')
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    vi.mocked(resolveFileHandle).mockResolvedValue(null)
    await expect(readMixJamFile(USER_FOLDER, 'missing.mixjam')).rejects.toThrow('could not be found')
    await expect(writeMixJamFile(USER_FOLDER, 'missing.mixjam', '{}')).rejects.toThrow('could not be found')

    window.showSaveFilePicker = vi.fn(async (options) => {
      expect(options.suggestedName).toBe('untitled.mixjam')
      return file.handle
    })
    await expect(saveMixJamFileAs(USER_FOLDER, 'untitled', '{}')).resolves.toMatchObject({
      path: 'untitled.mixjam'
    })
  })

  it('finds missing samples without reading their bytes', async () => {
    const root = fakeRoot()
    vi.mocked(loadFolderHandle).mockResolvedValue(root)
    vi.mocked(resolveFileHandle).mockImplementation(async (_root, path) =>
      path === 'Drums/kick.wav' ? fakeFile('kick.wav').handle : null
    )

    await expect(findMissingSampleFiles(SAMPLE_FOLDER, [
      'Drums/kick.wav',
      'Loops/missing.wav',
      'Loops/missing.wav'
    ])).resolves.toEqual(['Loops/missing.wav'])
    expect(resolveFileHandle).toHaveBeenCalledTimes(2)
  })

  it('treats unsafe sample paths as missing without resolving them', async () => {
    vi.mocked(loadFolderHandle).mockResolvedValue(fakeRoot())
    vi.mocked(resolveFileHandle).mockResolvedValue(null)
    await expect(findMissingSampleFiles(SAMPLE_FOLDER, ['../escape.wav'])).resolves.toEqual([
      '../escape.wav'
    ])
    expect(resolveFileHandle).not.toHaveBeenCalled()
  })

  it('serializes two concurrent generated file calls so each gets a distinct suffix', async () => {
    const created = new Map<string, ReturnType<typeof fakeFile>>()
    const getFileHandle = vi.fn(async (name: string, options?: { create?: boolean }) => {
      const entry = created.get(name) ?? fakeFile(name)
      if (options?.create) {
        created.set(name, entry)
        return entry.handle
      }
      if (created.has(name)) return entry.handle
      throw new DOMException('missing', 'NotFoundError')
    })
    const root = {
      ...fakeRoot(),
      getFileHandle,
      keys: async function* () {
        for (const name of created.keys()) yield name
      }
    } as unknown as FileSystemDirectoryHandle
    vi.mocked(loadFolderHandle).mockResolvedValue(root)

    const firstPromise = createGeneratedMixJamFile(USER_FOLDER, 'house-seed', '{}')
    const secondPromise = createGeneratedMixJamFile(USER_FOLDER, 'house-seed', '{}')
    const first = await firstPromise
    const second = await secondPromise

    expect(first.path).not.toEqual(second.path)
    expect([first.path, second.path].sort()).toEqual([
      'house-seed-001.mixjam',
      'house-seed-002.mixjam'
    ])
  })
})
