import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFolderSession } from './useFolderSession'
import type { BackendAPI, FolderRef, FolderRole, FolderValidation, SessionPaths } from '../../../shared/backend-api'

const USER_REF: FolderRef = { id: 'user-1', name: 'MixJam' }
const SAMPLE_REF: FolderRef = { id: 'sample-1', name: 'Samples' }

function makeBackendAPI(overrides: Partial<BackendAPI> = {}): BackendAPI {
  return {
    getVersion: vi.fn(),
    resizeToHome: vi.fn(),
    resizeToTracker: vi.fn(),
    pickFolder: vi.fn(async () => null),
    validateFolder: vi.fn(async () => 'ok' as FolderValidation),
    requestFolderAccess: vi.fn(async () => false),
    loadSession: vi.fn(async () => ({ userFolder: null, sampleFolder: null })),
    saveSession: vi.fn(async () => undefined),
    writeSessionConfig: vi.fn(async () => undefined),
    listRecentProjects: vi.fn(async () => []),
    querySamples: vi.fn(async () => ({ rows: [], total: 0 })),
    hasSamples: vi.fn(async () => false),
    startScan: vi.fn(async () => undefined),
    getScanProgress: vi.fn(async () => ({ status: 'idle', phase: null, found: 0, processed: 0, total: 0 })),
    onScanProgress: vi.fn(() => () => undefined),
    onScanDone: vi.fn(() => () => undefined),
    listTags: vi.fn(async () => []),
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    assignTag: vi.fn(),
    unassignTag: vi.fn(),
    listCategories: vi.fn(async () => []),
    createCategory: vi.fn(),
    deleteCategory: vi.fn(),
    listLibraries: vi.fn(async () => []),
    saveLibrary: vi.fn(),
    deleteLibrary: vi.fn(),
    readSampleBytes: vi.fn(async () => null),
    ...overrides
  } as BackendAPI
}

describe('useFolderSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restores persisted folders concurrently and opens the launch gate', async () => {
    const api = makeBackendAPI({
      loadSession: vi.fn(async (): Promise<SessionPaths> => ({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })),
      validateFolder: vi.fn(async (_ref: FolderRef, role: FolderRole) =>
        role === 'user' ? 'ok' : 'needs-permission'
      )
    })

    const { result } = renderHook(() => useFolderSession(api))

    await waitFor(() => expect(result.current.userFolder.status).toBe('set'))
    expect(result.current.sampleFolder.status).toBe('needs-permission')
    expect(result.current.canStart).toBe(false)
    expect(api.validateFolder).toHaveBeenCalledWith(USER_REF, 'user')
    expect(api.validateFolder).toHaveBeenCalledWith(SAMPLE_REF, 'sample')
  })

  it('ignores restore completion after unmount', async () => {
    let resolveSession!: (paths: SessionPaths) => void
    const api = makeBackendAPI({
      loadSession: vi.fn(() => new Promise<SessionPaths>((resolve) => { resolveSession = resolve }))
    })

    const { result, unmount } = renderHook(() => useFolderSession(api))
    unmount()
    await act(async () => {
      resolveSession({ userFolder: USER_REF, sampleFolder: null })
    })

    expect(result.current.userFolder.status).toBe('empty')
    expect(api.validateFolder).toHaveBeenCalledWith(USER_REF, 'user')
  })

  it('does nothing when folder picking is cancelled', async () => {
    const api = makeBackendAPI({ pickFolder: vi.fn(async () => null) })
    const { result } = renderHook(() => useFolderSession(api))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalled())

    await act(async () => {
      await result.current.pickUser()
    })

    expect(api.validateFolder).not.toHaveBeenCalled()
    expect(api.saveSession).not.toHaveBeenCalled()
    expect(result.current.userFolder.status).toBe('empty')
  })

  it('marks invalid picks as pick errors without saving', async () => {
    const api = makeBackendAPI({
      pickFolder: vi.fn(async () => USER_REF),
      validateFolder: vi.fn(async (): Promise<FolderValidation> => 'invalid')
    })
    const { result } = renderHook(() => useFolderSession(api))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalled())

    await act(async () => {
      await result.current.pickUser()
    })

    expect(result.current.userFolder).toEqual({ ref: USER_REF, status: 'pick-error' })
    expect(api.saveSession).not.toHaveBeenCalled()
  })

  it('persists only folders that are currently set after successful picks', async () => {
    const api = makeBackendAPI({
      pickFolder: vi.fn(async (role: FolderRole) => role === 'user' ? USER_REF : SAMPLE_REF),
      validateFolder: vi.fn(async (): Promise<FolderValidation> => 'ok')
    })
    const { result } = renderHook(() => useFolderSession(api))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalled())

    await act(async () => {
      await result.current.pickUser()
    })
    await act(async () => {
      await result.current.pickSample()
    })

    expect(result.current.canStart).toBe(true)
    expect(api.saveSession).toHaveBeenLastCalledWith({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })
  })

  it('restores permission only for folders that need it', async () => {
    const api = makeBackendAPI({
      loadSession: vi.fn(async () => ({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })),
      validateFolder: vi.fn(async (_ref: FolderRef, role: FolderRole) =>
        role === 'user' ? 'needs-permission' : 'ok'
      ),
      requestFolderAccess: vi.fn(async () => false)
    })
    const { result } = renderHook(() => useFolderSession(api))
    await waitFor(() => expect(result.current.userFolder.status).toBe('needs-permission'))

    await act(async () => {
      await result.current.restoreSample()
    })
    expect(api.requestFolderAccess).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.restoreUser()
    })
    expect(api.requestFolderAccess).toHaveBeenCalledWith(USER_REF, 'user')
    expect(result.current.userFolder.status).toBe('needs-permission')
    expect(api.saveSession).not.toHaveBeenCalled()
  })

  it('saves the session after a permission re-grant validates successfully', async () => {
    const api = makeBackendAPI({
      loadSession: vi.fn(async () => ({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })),
      validateFolder: vi.fn(async (_ref: FolderRef, role: FolderRole) =>
        role === 'user' ? 'needs-permission' : 'ok'
      ),
      requestFolderAccess: vi.fn(async () => true)
    })
    const { result } = renderHook(() => useFolderSession(api))
    await waitFor(() => expect(result.current.userFolder.status).toBe('needs-permission'))
    vi.mocked(api.validateFolder).mockResolvedValue('ok')

    await act(async () => {
      await result.current.restoreUser()
    })

    expect(result.current.userFolder.status).toBe('set')
    expect(result.current.canStart).toBe(true)
    expect(api.saveSession).toHaveBeenCalledWith({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })
  })
})
