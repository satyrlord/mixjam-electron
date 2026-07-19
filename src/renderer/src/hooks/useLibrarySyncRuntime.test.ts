import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AnalysisProgress, ScanProgress } from '../../../shared/backend-api'
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
})
