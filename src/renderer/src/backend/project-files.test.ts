import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderRef } from '../../../shared/backend-api'
import { resolveFileHandle } from './folder-access'
import { loadFolderHandle } from './handle-store'
import {
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
    resolve: vi.fn(async () => resolvedPath)
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
})
