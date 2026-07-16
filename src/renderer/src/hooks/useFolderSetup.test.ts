import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFolderSetup } from './useFolderSetup'
import type { BackendAPI, FolderRef, FolderRole, FolderValidation, FolderSelections } from '../../../shared/backend-api'

const USER_REF: FolderRef = { id: 'user-1', name: 'MixJam' }
const SAMPLE_REF: FolderRef = { id: 'sample-1', name: 'Samples' }

function makeBackendAPI(overrides: Partial<BackendAPI> = {}): BackendAPI {
  return {
    getVersion: vi.fn(),
    resizeToHome: vi.fn(),
    resizeToPlayer: vi.fn(),
    pickFolder: vi.fn(async () => null),
    validateFolder: vi.fn(async () => 'ok' as FolderValidation),
    requestFolderAccess: vi.fn(async () => false),
    loadFolderSelections: vi.fn(async () => ({ userFolder: null, sampleFolder: null })),
    saveFolderSelections: vi.fn(async () => undefined),
    loadMixJamFiles: vi.fn(async () => []),
    querySamples: vi.fn(async () => ({ rows: [], total: 0 })),
    getLibraryRootState: vi.fn(async (folder: FolderRef) => ({
      rootKey: folder.id,
      lastCompletedAt: null,
      hasUsableIndex: false
    })),
    startLibrarySync: vi.fn(async (folder: FolderRef) => ({
      identity: { rootKey: folder.id, jobId: 'test-job', trigger: 'automatic' as const },
      disposition: 'started' as const
    })),
    cancelLibrarySync: vi.fn(async () => undefined),
    getScanProgress: vi.fn(async () => ({
      identity: null,
      status: 'idle' as const,
      phase: null,
      found: 0,
      processed: 0,
      total: 0
    })),
    getAnalysisProgress: vi.fn(async () => ({
      identity: null,
      status: 'idle' as const,
      analyzed: 0,
      total: 0
    })),
    startUniformFolderCalibration: vi.fn(async (folder: FolderRef) => ({
      rootKey: folder.id,
      jobId: 'test-calibration'
    })),
    cancelUniformFolderCalibration: vi.fn(async () => undefined),
    getCalibrationProgress: vi.fn(async () => ({
      identity: null,
      status: 'idle' as const,
      analyzed: 0,
      total: 0
    })),
    onScanProgress: vi.fn(() => () => undefined),
    onScanDone: vi.fn(() => () => undefined),
    onAnalysisProgress: vi.fn(() => () => undefined),
    onAnalysisDone: vi.fn(() => () => undefined),
    onCalibrationProgress: vi.fn(() => () => undefined),
    onCalibrationDone: vi.fn(() => () => undefined),
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

describe('useFolderSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restores persisted folders concurrently and opens the launch gate', async () => {
    const api = makeBackendAPI({
      loadFolderSelections: vi.fn(async (): Promise<FolderSelections> => ({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })),
      validateFolder: vi.fn(async (_ref: FolderRef, role: FolderRole) =>
        role === 'user' ? 'ok' : 'needs-permission'
      )
    })

    const { result } = renderHook(() => useFolderSetup(api))

    await waitFor(() => expect(result.current.userFolder.status).toBe('set'))
    expect(result.current.sampleFolder.status).toBe('needs-permission')
    expect(result.current.canStart).toBe(false)
    expect(api.validateFolder).toHaveBeenCalledWith(USER_REF, 'user')
    expect(api.validateFolder).toHaveBeenCalledWith(SAMPLE_REF, 'sample')
  })

  it('ignores folder-selection restoration after unmount', async () => {
    let resolveSelections!: (selections: FolderSelections) => void
    const api = makeBackendAPI({
      loadFolderSelections: vi.fn(() => new Promise<FolderSelections>((resolve) => { resolveSelections = resolve }))
    })

    const { result, unmount } = renderHook(() => useFolderSetup(api))
    unmount()
    await act(async () => {
      resolveSelections({ userFolder: USER_REF, sampleFolder: null })
    })

    expect(result.current.userFolder.status).toBe('empty')
    expect(api.validateFolder).toHaveBeenCalledWith(USER_REF, 'user')
  })

  it('does nothing when folder picking is cancelled', async () => {
    const api = makeBackendAPI({ pickFolder: vi.fn(async () => null) })
    const { result } = renderHook(() => useFolderSetup(api))
    await waitFor(() => expect(api.loadFolderSelections).toHaveBeenCalled())

    await act(async () => {
      await result.current.pickUser()
    })

    expect(api.validateFolder).not.toHaveBeenCalled()
    expect(api.saveFolderSelections).not.toHaveBeenCalled()
    expect(result.current.userFolder.status).toBe('empty')
  })

  it('marks invalid picks as pick errors without saving', async () => {
    const api = makeBackendAPI({
      pickFolder: vi.fn(async () => USER_REF),
      validateFolder: vi.fn(async (): Promise<FolderValidation> => 'invalid')
    })
    const { result } = renderHook(() => useFolderSetup(api))
    await waitFor(() => expect(api.loadFolderSelections).toHaveBeenCalled())

    await act(async () => {
      await result.current.pickUser()
    })

    expect(result.current.userFolder).toEqual({ ref: USER_REF, status: 'pick-error' })
    expect(api.saveFolderSelections).not.toHaveBeenCalled()
  })

  it('persists only folders that are currently set after successful picks', async () => {
    const api = makeBackendAPI({
      pickFolder: vi.fn(async (role: FolderRole) => role === 'user' ? USER_REF : SAMPLE_REF),
      validateFolder: vi.fn(async (): Promise<FolderValidation> => 'ok')
    })
    const { result } = renderHook(() => useFolderSetup(api))
    await waitFor(() => expect(api.loadFolderSelections).toHaveBeenCalled())

    await act(async () => {
      await result.current.pickUser()
    })
    await act(async () => {
      await result.current.pickSample()
    })

    expect(result.current.canStart).toBe(true)
    expect(api.saveFolderSelections).toHaveBeenLastCalledWith({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })
  })

  it('restores permission only for folders that need it', async () => {
    const api = makeBackendAPI({
      loadFolderSelections: vi.fn(async () => ({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })),
      validateFolder: vi.fn(async (_ref: FolderRef, role: FolderRole) =>
        role === 'user' ? 'needs-permission' : 'ok'
      ),
      requestFolderAccess: vi.fn(async () => false)
    })
    const { result } = renderHook(() => useFolderSetup(api))
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
    expect(api.saveFolderSelections).not.toHaveBeenCalled()
  })

  it('saves folder selections after a permission re-grant validates successfully', async () => {
    const api = makeBackendAPI({
      loadFolderSelections: vi.fn(async () => ({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })),
      validateFolder: vi.fn(async (_ref: FolderRef, role: FolderRole) =>
        role === 'user' ? 'needs-permission' : 'ok'
      ),
      requestFolderAccess: vi.fn(async () => true)
    })
    const { result } = renderHook(() => useFolderSetup(api))
    await waitFor(() => expect(result.current.userFolder.status).toBe('needs-permission'))
    vi.mocked(api.validateFolder).mockResolvedValue('ok')

    await act(async () => {
      await result.current.restoreUser()
    })

    expect(result.current.userFolder.status).toBe('set')
    expect(result.current.canStart).toBe(true)
    expect(api.saveFolderSelections).toHaveBeenCalledWith({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })
  })
})
