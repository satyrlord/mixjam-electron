import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderRef } from '../../../shared/backend-api'
import { loadFolderHandle, saveFolderHandle } from './handle-store'
import {
  openFolderForAutomaticAccess,
  openFolderForUserAction,
  relativePathForHandle,
  requestFolderAccess,
  resolveFileHandle,
  validateFolder
} from './folder-access'

vi.mock('./handle-store', () => ({
  loadFolderHandle: vi.fn(),
  saveFolderHandle: vi.fn()
}))

const USER_FOLDER: FolderRef = { id: 'user-folder', name: 'MixJam' }
const SAMPLE_FOLDER: FolderRef = { id: 'sample-folder', name: 'Samples' }

function directory(permission: PermissionState = 'granted'): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'Folder',
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => 'granted'),
    getFileHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
    resolve: vi.fn(),
    keys: async function* () { yield 'sample.wav' }
  } as unknown as FileSystemDirectoryHandle
}

beforeEach(() => {
  vi.mocked(loadFolderHandle).mockReset()
  vi.mocked(saveFolderHandle).mockReset()
})

describe('folder access', () => {
  it('uses role-appropriate permissions for automatic access without a request', async () => {
    const user = directory()
    const samples = directory()
    vi.mocked(loadFolderHandle)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(samples)

    await expect(openFolderForAutomaticAccess(USER_FOLDER, 'user')).resolves.toBe(user)
    await expect(openFolderForAutomaticAccess(SAMPLE_FOLDER, 'sample')).resolves.toBe(samples)

    expect(user.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    expect(samples.queryPermission).toHaveBeenCalledWith({ mode: 'read' })
    expect(user.requestPermission).not.toHaveBeenCalled()
    expect(samples.requestPermission).not.toHaveBeenCalled()
  })

  it('keeps permission recovery on the explicit user-gesture path', async () => {
    const handle = directory('prompt')
    vi.mocked(loadFolderHandle).mockResolvedValue(handle)

    await expect(openFolderForAutomaticAccess(SAMPLE_FOLDER, 'sample')).resolves.toBeNull()
    await expect(requestFolderAccess(SAMPLE_FOLDER, 'sample')).resolves.toBe(true)

    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'read' })
  })

  it('returns the recovered handle for an explicit user action', async () => {
    const handle = directory('prompt')
    vi.mocked(loadFolderHandle).mockResolvedValue(handle)

    await expect(openFolderForUserAction(USER_FOLDER, 'user')).resolves.toBe(handle)

    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
  })

  it('validates stored handles and rejects traversal while resolving only under the root', async () => {
    const root = directory()
    const child = directory()
    const file = { kind: 'file', name: 'kick.wav' } as FileSystemFileHandle
    vi.mocked(root.getDirectoryHandle).mockResolvedValue(child)
    vi.mocked(child.getFileHandle).mockResolvedValue(file)
    vi.mocked(loadFolderHandle).mockResolvedValue(root)

    await expect(validateFolder(SAMPLE_FOLDER, 'sample')).resolves.toBe('ok')
    await expect(resolveFileHandle(root, 'Drums/kick.wav')).resolves.toBe(file)
    await expect(resolveFileHandle(root, '../outside.wav')).resolves.toBeNull()
    await expect(resolveFileHandle(root, 'Drums/../outside.wav')).resolves.toBeNull()
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('Drums')
  })

  it('only reports picked files that the stored root can contain', async () => {
    const root = directory()
    const file = { kind: 'file', name: 'set.mixjam' } as FileSystemFileHandle
    vi.mocked(root.resolve).mockResolvedValueOnce(['Sets', 'set.mixjam']).mockResolvedValueOnce(null)

    await expect(relativePathForHandle(root, file)).resolves.toBe('Sets/set.mixjam')
    await expect(relativePathForHandle(root, file)).resolves.toBeNull()
  })
})
