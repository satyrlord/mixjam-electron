import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AnalysisProgress, LibraryJobIdentity, LibraryScanDone, ScanProgress } from '../../../shared/backend-api'
import { createBackendAPI, TEST_SAMPLE_FOLDER } from '../test/backendApi'
import { useLibrarySyncRuntime } from './useLibrarySyncRuntime'

const JOB = { rootKey: TEST_SAMPLE_FOLDER.id, jobId: 'sync-job', trigger: 'automatic' as const }

describe('useLibrarySyncRuntime', () => {
  it('accepts progress only for the active Sample Folder and job', async () => {
    const api = createBackendAPI()
    let onProgress: ((progress: ScanProgress) => void) | undefined
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    vi.mocked(api.onScanProgress).mockImplementation((listener) => {
      onProgress = listener
      return () => {}
    })

    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state).toEqual({
      status: 'checking', rootKey: TEST_SAMPLE_FOLDER.id, jobId: JOB.jobId
    }))

    act(() => onProgress?.({
      identity: { ...JOB, rootKey: 'other-folder' }, status: 'scanning', phase: 1,
      found: 10, processed: 1, total: 10
    }))
    expect(result.current.state.status).toBe('checking')

    act(() => onProgress?.({
      identity: JOB, status: 'scanning', phase: 2, found: 10, processed: 4, total: 10
    }))
    expect(result.current.state).toMatchObject({ status: 'syncing', jobId: JOB.jobId, processed: 4 })
  })

  it('rejects the previous root immediately after the Sample Folder changes', async () => {
    const api = createBackendAPI()
    const otherFolder = { id: 'other-folder', name: 'Other' }
    let onProgress: ((progress: ScanProgress) => void) | undefined
    vi.mocked(api.onScanProgress).mockImplementation((listener) => {
      onProgress = listener
      return () => {}
    })
    vi.mocked(api.startLibrarySync).mockImplementation(async (folder) => ({
      identity: { rootKey: folder.id, jobId: `job-${folder.id}`, trigger: 'automatic' },
      disposition: 'started'
    }))
    const { result, rerender } = renderHook(
      ({ folder }) => useLibrarySyncRuntime({
        backendAPI: api,
        sampleFolder: folder,
        onScanDone: vi.fn(),
        onAnalysisDone: vi.fn()
      }),
      { initialProps: { folder: TEST_SAMPLE_FOLDER } }
    )
    await waitFor(() => expect(result.current.state).toMatchObject({ rootKey: TEST_SAMPLE_FOLDER.id }))

    rerender({ folder: otherFolder })
    act(() => onProgress?.({
      identity: JOB, status: 'scanning', phase: 1, found: 1, processed: 1, total: 1
    }))

    expect(result.current.state).toMatchObject({ rootKey: otherFolder.id })
  })

  it('hydrates a coalesced job from backend lifecycle state', async () => {
    const api = createBackendAPI()
    const onScanDone = vi.fn()
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'coalesced' })
    vi.mocked(api.getScanProgress).mockResolvedValue({
      identity: JOB, status: 'scanning', phase: 1, found: 3, processed: 1, total: 3
    })
    vi.mocked(api.getAnalysisProgress).mockResolvedValue({
      identity: null, status: 'idle', analyzed: 0, total: 0
    } as AnalysisProgress)

    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone,
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state).toMatchObject({
      status: 'syncing', jobId: JOB.jobId, processed: 1
    }))
    expect(onScanDone).not.toHaveBeenCalled()
  })

  it('delegates cancellation to the active backend job', async () => {
    const api = createBackendAPI()
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state.status).toBe('checking'))
    await act(async () => result.current.cancel())
    expect(api.cancelLibrarySync).toHaveBeenCalledWith(JOB.jobId)
  })

  it('handles scan cancelled progress', async () => {
    const api = createBackendAPI()
    let onProgress: ((progress: ScanProgress) => void) | undefined
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    vi.mocked(api.onScanProgress).mockImplementation((listener) => {
      onProgress = listener
      return () => {}
    })

    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state.status).toBe('checking'))

    act(() => onProgress?.({
      identity: JOB, status: 'cancelled'
    }))
    expect(result.current.state).toMatchObject({ status: 'cancelled', rootKey: TEST_SAMPLE_FOLDER.id })
  })

  it('handles scan error progress', async () => {
    const api = createBackendAPI()
    let onProgress: ((progress: ScanProgress) => void) | undefined
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    vi.mocked(api.onScanProgress).mockImplementation((listener) => {
      onProgress = listener
      return () => {}
    })

    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state.status).toBe('checking'))

    act(() => onProgress?.({
      identity: JOB, status: 'error', error: 'disk full'
    }))
    expect(result.current.state).toMatchObject({ status: 'error', message: 'disk full' })
  })

  it('handles analysis progress with analyzing status', async () => {
    const api = createBackendAPI()
    let onAnalysis: ((progress: AnalysisProgress) => void) | undefined
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    vi.mocked(api.onAnalysisProgress).mockImplementation((listener) => {
      onAnalysis = listener
      return () => {}
    })

    // Simulate that a scan already completed
    vi.mocked(api.getLibraryRootState).mockResolvedValue({
      rootKey: TEST_SAMPLE_FOLDER.id, lastCompletedAt: 123456, hasUsableIndex: true
    })

    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state.status).toBe('checking'))

    act(() => onAnalysis?.({
      identity: JOB, status: 'analyzing', analyzed: 5, total: 20
    }))
    expect(result.current.state).toMatchObject({ status: 'analyzing', analyzed: 5, total: 20 })
  })

  it('handles analysis error progress', async () => {
    const api = createBackendAPI()
    let onAnalysis: ((progress: AnalysisProgress) => void) | undefined
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    vi.mocked(api.onAnalysisProgress).mockImplementation((listener) => {
      onAnalysis = listener
      return () => {}
    })

    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state.status).toBe('checking'))

    act(() => onAnalysis?.({
      identity: JOB, status: 'error', error: 'decode failure'
    }))
    expect(result.current.state).toMatchObject({ status: 'error', message: 'decode failure' })
  })

  it('handles scan done event and transitions to analyzing', async () => {
    const api = createBackendAPI()
    let onScanDoneListener: ((done: LibraryScanDone) => void) | undefined
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    vi.mocked(api.onScanDone).mockImplementation((listener) => {
      onScanDoneListener = listener
      return () => {}
    })

    const onScanDone = vi.fn()
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone,
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state.status).toBe('checking'))

    act(() => onScanDoneListener?.({
      identity: JOB, lastCompletedAt: 999
    }))

    expect(result.current.state).toMatchObject({
      status: 'analyzing', jobId: JOB.jobId, lastCompletedAt: 999
    })
    expect(result.current.dbIndexed).toBe(true)
    expect(onScanDone).toHaveBeenCalled()
  })

  it('handles analysis done event and transitions to ready', async () => {
    const api = createBackendAPI()
    let onAnalysisDoneListener: ((done: { identity: LibraryJobIdentity }) => void) | undefined
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    vi.mocked(api.onAnalysisDone).mockImplementation((listener) => {
      onAnalysisDoneListener = listener
      return () => {}
    })
    vi.mocked(api.getLibraryRootState).mockResolvedValue({
      rootKey: TEST_SAMPLE_FOLDER.id, lastCompletedAt: 999, hasUsableIndex: true
    })

    // First deliver scan done to set lastCompletedAt
    let onScanDoneListener: ((done: LibraryScanDone) => void) | undefined
    vi.mocked(api.onScanDone).mockImplementation((listener) => {
      onScanDoneListener = listener
      return () => {}
    })

    const onAnalysisDone = vi.fn()
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone
    }))

    await waitFor(() => expect(result.current.state.status).toBe('checking'))

    act(() => onScanDoneListener?.({ identity: JOB, lastCompletedAt: 999 }))

    act(() => onAnalysisDoneListener?.({
      identity: JOB
    }))

    expect(result.current.state).toMatchObject({
      status: 'ready', rootKey: TEST_SAMPLE_FOLDER.id, lastCompletedAt: 999
    })
    expect(onAnalysisDone).toHaveBeenCalled()
  })

  it('shows unavailable state when sampleFolder is null', () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: null,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    expect(result.current.state).toEqual({ status: 'unavailable' })
    expect(result.current.dbIndexed).toBe(false)
  })

  it('handles getLibraryRootState rejection gracefully', async () => {
    const api = createBackendAPI()
    vi.mocked(api.getLibraryRootState).mockRejectedValue(new Error('DB locked'))
    // Both calls need to fail; otherwise startLibrarySync would overwrite the error state
    vi.mocked(api.startLibrarySync).mockRejectedValue(new Error('start blocked'))
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state).toMatchObject({
      status: 'error'
    }))
  })

  it('handles automatic startLibrarySync rejection', async () => {
    const api = createBackendAPI()
    vi.mocked(api.startLibrarySync).mockRejectedValue(new Error('Permission denied'))
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state).toMatchObject({
      status: 'error', message: 'Permission denied'
    }))
  })

  it('handles manual rescan rejection', async () => {
    const api = createBackendAPI()
    // Use suppressed disposition so automatic sync does NOT create an active job.
    // Then the manual rescan can proceed.
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'suppressed' })
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    // The initial state should be ready (suppressed → applyRootState with hasUsableIndex: true)
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    // Override for the manual call
    vi.mocked(api.startLibrarySync).mockRejectedValue(new Error('busy'))
    await act(async () => result.current.rescan())
    expect(result.current.state).toMatchObject({ status: 'error', message: 'busy' })
  })

  it('cancel is a no-op when no active job', async () => {
    const api = createBackendAPI()
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    // State should be unindexed (no active job) since startLibrarySync disposition is suppressed
    await act(async () => result.current.cancel())
    expect(api.cancelLibrarySync).not.toHaveBeenCalled()
  })

  it('rescan is a no-op during active sync', async () => {
    const api = createBackendAPI()
    vi.mocked(api.startLibrarySync).mockResolvedValue({ identity: JOB, disposition: 'started' })
    const { result } = renderHook(() => useLibrarySyncRuntime({
      backendAPI: api,
      sampleFolder: TEST_SAMPLE_FOLDER,
      onScanDone: vi.fn(),
      onAnalysisDone: vi.fn()
    }))

    await waitFor(() => expect(result.current.state.status).toBe('checking'))

    // Trying to rescan during checking should be a no-op
    vi.mocked(api.startLibrarySync).mockClear()
    await act(async () => result.current.rescan())
    expect(api.startLibrarySync).not.toHaveBeenCalled()
  })
})
