import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  AnalysisProgress,
  MixJamGeneratorParameters,
  MixJamGeneratorPlan
} from '../../../shared/backend-api'
import { createBackendAPI, TEST_SAMPLE_FOLDER } from '../test/backendApi'
import type { AppState } from './useAppState'
import { useMixJamGenerator } from './useMixJamGenerator'

const PARAMETERS: MixJamGeneratorParameters = {
  profileId: 'techno',
  bpmMode: 'fixed',
  bpm: 140,
  intensity: 'medium',
  durationSeconds: 180,
  seed: 'stable-seed'
}

const PLAN: MixJamGeneratorPlan = {
  generatorVersion: 1,
  profileId: 'techno',
  profileVersion: 1,
  seed: PARAMETERS.seed,
  parameters: {
    bpmMode: 'fixed',
    resolvedBpm: 140,
    intensity: 'medium',
    durationSeconds: 180
  },
  corpusFingerprint: 'current-fingerprint',
  sampleFolderKey: TEST_SAMPLE_FOLDER.id,
  targetBars: 1,
  targetTicks: 32,
  quantizedDurationSeconds: 1.7,
  dominantKey: null,
  analysis: { attemptedFiles: 1, analyzedFiles: 1, uniqueReads: 1 },
  selections: [],
  substitutions: [],
  sections: [],
  phrases: [],
  lanes: [],
  channels: []
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function appState(overrides: Partial<AppState> = {}): AppState {
  return {
    bpm: 140,
    librarySyncState: {
      status: 'ready',
      rootKey: TEST_SAMPLE_FOLDER.id,
      lastCompletedAt: 1
    },
    projectGenerator: null,
    saveGeneratedProject: vi.fn(),
    openProjectPath: vi.fn(),
    ...overrides
  } as unknown as AppState
}

describe('useMixJamGenerator', () => {
  it('loads generator readiness for the Home card before the dialog opens', async () => {
    const backendAPI = createBackendAPI()
    const app = appState()
    const { result } = renderHook(() => useMixJamGenerator(app, backendAPI, TEST_SAMPLE_FOLDER))

    await waitFor(() => {
      expect(backendAPI.getGeneratorReadiness).toHaveBeenCalledWith(TEST_SAMPLE_FOLDER)
      expect(result.current.readiness).toEqual({
        status: 'ready',
        detectedBpm: 140,
        eligibleSamples: 2
      })
    })
  })

  it('submits exact regeneration only once with the saved corpus fingerprint', async () => {
    const backendAPI = createBackendAPI()
    vi.mocked(backendAPI.planMixJam).mockImplementation(() => new Promise(() => {}))
    const app = appState({
      projectGenerator: {
        generatorVersion: 1,
        profileId: 'techno',
        profileVersion: 1,
        seed: PARAMETERS.seed,
        parameters: {
          bpmMode: PARAMETERS.bpmMode,
          resolvedBpm: PARAMETERS.bpm!,
          intensity: PARAMETERS.intensity,
          durationSeconds: PARAMETERS.durationSeconds
        },
        corpusFingerprint: 'saved-fingerprint',
        sampleFolderKey: TEST_SAMPLE_FOLDER.id
      }
    })
    const { result } = renderHook(() => useMixJamGenerator(app, backendAPI, TEST_SAMPLE_FOLDER))

    act(() => result.current.openRegenerateExact())

    await waitFor(() => expect(backendAPI.planMixJam).toHaveBeenCalledTimes(1))
    expect(backendAPI.planMixJam).toHaveBeenCalledWith(
      TEST_SAMPLE_FOLDER,
      expect.stringMatching(/^generator-/),
      PARAMETERS,
      'saved-fingerprint'
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(backendAPI.planMixJam).toHaveBeenCalledTimes(1)
  })

  it('does not regenerate metadata from an unsupported generator or profile version', () => {
    const backendAPI = createBackendAPI()
    const app = appState({
      projectGenerator: {
        generatorVersion: 2,
        profileId: 'techno',
        profileVersion: 1,
        seed: PARAMETERS.seed,
        parameters: {
          bpmMode: PARAMETERS.bpmMode,
          resolvedBpm: PARAMETERS.bpm!,
          intensity: PARAMETERS.intensity,
          durationSeconds: PARAMETERS.durationSeconds
        },
        corpusFingerprint: 'future-fingerprint',
        sampleFolderKey: TEST_SAMPLE_FOLDER.id
      }
    })
    const { result } = renderHook(() => useMixJamGenerator(app, backendAPI, TEST_SAMPLE_FOLDER))

    act(() => result.current.openRegenerateExact())
    act(() => result.current.openRegenerateCurrent())

    expect(result.current.open).toBe(false)
    expect(backendAPI.planMixJam).not.toHaveBeenCalled()
  })

  it('cancels an active planning job without starting the save transaction', async () => {
    const backendAPI = createBackendAPI()
    vi.mocked(backendAPI.planMixJam).mockImplementation(() => new Promise(() => {}))
    const app = appState()
    const { result } = renderHook(() => useMixJamGenerator(app, backendAPI, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.readiness?.status).toBe('ready'))

    act(() => result.current.openNew())
    act(() => result.current.onGenerate(PARAMETERS))
    await waitFor(() => expect(backendAPI.planMixJam).toHaveBeenCalledTimes(1))
    const jobId = vi.mocked(backendAPI.planMixJam).mock.calls[0]![1]
    act(() => result.current.close())

    expect(backendAPI.cancelMixJamPlanning).toHaveBeenCalledWith(jobId)
    expect(result.current.open).toBe(false)
    expect(result.current.generating).toBe(false)
    expect(result.current.progress).toBeNull()
    expect(app.saveGeneratedProject).not.toHaveBeenCalled()
  })

  it('ignores a cancelled run after reopening and starting a newer run', async () => {
    const firstPlan = deferred<MixJamGeneratorPlan>()
    const secondPlan = deferred<MixJamGeneratorPlan>()
    const backendAPI = createBackendAPI()
    vi.mocked(backendAPI.planMixJam)
      .mockImplementationOnce(() => firstPlan.promise)
      .mockImplementationOnce(() => secondPlan.promise)
    const app = appState({
      saveGeneratedProject: vi.fn().mockResolvedValue('newer-run.mixjam')
    })
    const { result } = renderHook(() => useMixJamGenerator(app, backendAPI, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.readiness?.status).toBe('ready'))

    act(() => {
      result.current.openNew()
      result.current.onGenerate(PARAMETERS)
    })
    await waitFor(() => expect(backendAPI.planMixJam).toHaveBeenCalledTimes(1))
    act(() => result.current.close())
    act(() => {
      result.current.openNew()
      result.current.onGenerate({ ...PARAMETERS, seed: 'newer-seed' })
    })
    await waitFor(() => expect(backendAPI.planMixJam).toHaveBeenCalledTimes(2))

    await act(async () => { firstPlan.resolve(PLAN); await firstPlan.promise })
    expect(app.saveGeneratedProject).not.toHaveBeenCalled()
    expect(result.current.open).toBe(true)
    expect(result.current.generating).toBe(true)
    expect(result.current.error).toBeNull()

    await act(async () => { secondPlan.resolve({ ...PLAN, seed: 'newer-seed' }); await secondPlan.promise })
    await waitFor(() => expect(result.current.generating).toBe(false))
    expect(app.saveGeneratedProject).toHaveBeenCalledTimes(1)
    expect(result.current.result?.path).toBe('newer-run.mixjam')
  })

  it('marks Home readiness as preparing during standalone sample analysis', async () => {
    const backendAPI = createBackendAPI()
    let emitAnalysis: ((progress: AnalysisProgress) => void) | undefined
    vi.mocked(backendAPI.onAnalysisProgress).mockImplementation((listener) => {
      emitAnalysis = listener
      return () => {}
    })
    const { result } = renderHook(() => useMixJamGenerator(
      appState(),
      backendAPI,
      TEST_SAMPLE_FOLDER
    ))
    await waitFor(() => expect(result.current.readiness?.status).toBe('ready'))

    act(() => emitAnalysis?.({
      identity: {
        rootKey: TEST_SAMPLE_FOLDER.id,
        sampleId: 7,
        jobId: 'sample-analysis-7'
      },
      status: 'analyzing',
      analyzed: 0,
      total: 1
    }))

    expect(result.current.readiness).toEqual({
      status: 'preparing',
      message: 'Library preparation is still running.'
    })
  })
})
