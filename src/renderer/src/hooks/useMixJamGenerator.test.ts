import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  AnalysisProgress,
  MixJamGeneratorProgress,
  MixJamGeneratorParameters,
  MixJamGeneratorPlan,
  MixJamGeneratorReadiness
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

const SECOND_SAMPLE_FOLDER = { id: 'second-sample-folder', name: 'Other Samples' }

const PLAN: MixJamGeneratorPlan = {
  generatorVersion: 1,
  profileId: 'techno',
  profileVersion: 2,
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

const DETAILED_PLAN: MixJamGeneratorPlan = {
  ...PLAN,
  selections: [{
    laneIndex: 0,
    requestedType: 'Percussion',
    selectedType: 'Snare',
    sampleRefs: ['Drums/snare.wav']
  }],
  substitutions: [{ laneIndex: 0, requestedType: 'Percussion', selectedType: 'Snare' }],
  sections: [{ name: 'Intro', startBar: 0, endBar: 1, activeLanes: [0] }],
  channels: [{
    channelIndex: 0,
    gain: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    effects: [{
      id: 'fx-1',
      type: 'reverb',
      presetName: 'Room',
      values: { roomSize: 0.5, decay: 0.4, mix: 0.2 }
    }]
  }]
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
        analysisState: 'resolved',
        detectedBpm: 140,
        eligibleSamples: 2,
        tempoClusters: [{
          relpathPrefix: '', sampleCount: 2, bpm: 140, musicalKey: 'Am', confidence: 1
        }]
      })
    })
  })

  it('ignores readiness responses from an older sample root', async () => {
    const firstReadiness = deferred<MixJamGeneratorReadiness>()
    const secondReadiness = deferred<MixJamGeneratorReadiness>()
    const backendAPI = createBackendAPI()
    vi.mocked(backendAPI.getGeneratorReadiness)
      .mockImplementationOnce(() => firstReadiness.promise)
      .mockImplementationOnce(() => secondReadiness.promise)
    const app = appState()
    const { result, rerender } = renderHook(
      ({ folder }: { folder: typeof TEST_SAMPLE_FOLDER }) => useMixJamGenerator(app, backendAPI, folder),
      { initialProps: { folder: TEST_SAMPLE_FOLDER } }
    )

    await waitFor(() => expect(backendAPI.getGeneratorReadiness).toHaveBeenCalledTimes(1))
    rerender({ folder: SECOND_SAMPLE_FOLDER })
    await waitFor(() => expect(backendAPI.getGeneratorReadiness).toHaveBeenCalledTimes(2))

    const currentRootReadiness: MixJamGeneratorReadiness = {
      status: 'ready',
      analysisState: 'resolved',
      detectedBpm: 128,
      eligibleSamples: 8,
      tempoClusters: [{
        relpathPrefix: '', sampleCount: 8, bpm: 128, musicalKey: null, confidence: 0.9
      }]
    }
    const oldRootReadiness: MixJamGeneratorReadiness = {
      status: 'needs-preparation',
      message: 'Old root is still preparing.'
    }

    await act(async () => {
      secondReadiness.resolve(currentRootReadiness)
      await secondReadiness.promise
    })
    expect(result.current.readiness).toEqual(currentRootReadiness)

    await act(async () => {
      firstReadiness.resolve(oldRootReadiness)
      await firstReadiness.promise
    })
    expect(result.current.readiness).toEqual(currentRootReadiness)
  })

  it('submits exact regeneration only once with the saved corpus fingerprint', async () => {
    const backendAPI = createBackendAPI()
    vi.mocked(backendAPI.planMixJam).mockImplementation(() => new Promise(() => {}))
    const app = appState({
      projectGenerator: {
        generatorVersion: 1,
        profileId: 'techno',
        profileVersion: 2,
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
        profileVersion: 2,
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

  it('opens current-corpus regeneration with stored parameters and refreshed readiness', async () => {
    const backendAPI = createBackendAPI()
    const app = appState({
      projectGenerator: {
        generatorVersion: 1,
        profileId: 'techno',
        profileVersion: 2,
        seed: PARAMETERS.seed,
        parameters: {
          bpmMode: 'fixed',
          resolvedBpm: 140,
          intensity: 'medium',
          durationSeconds: 180
        },
        corpusFingerprint: 'saved-fingerprint',
        sampleFolderKey: TEST_SAMPLE_FOLDER.id
      }
    })
    const { result } = renderHook(() => useMixJamGenerator(app, backendAPI, TEST_SAMPLE_FOLDER))

    act(() => result.current.openRegenerateCurrent())

    expect(result.current.open).toBe(true)
    expect(result.current.mode).toBe('new')
    expect(result.current.initialParameters).toEqual(PARAMETERS)
    await waitFor(() => expect(result.current.readiness?.status).toBe('ready'))
  })

  it('owns progress, saving state, result summaries, and opening the saved result', async () => {
    const planResult = deferred<MixJamGeneratorPlan>()
    const saveResult = deferred<string | null>()
    const backendAPI = createBackendAPI()
    let emitProgress: ((progress: MixJamGeneratorProgress) => void) | undefined
    vi.mocked(backendAPI.onGeneratorProgress).mockImplementation((listener) => {
      emitProgress = listener
      return () => {}
    })
    vi.mocked(backendAPI.planMixJam).mockReturnValue(planResult.promise)
    const app = appState({ saveGeneratedProject: vi.fn(() => saveResult.promise) })
    const { result } = renderHook(() => useMixJamGenerator(app, backendAPI, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.readiness?.status).toBe('ready'))

    act(() => {
      result.current.openNew()
      result.current.onGenerate(PARAMETERS)
    })
    await waitFor(() => expect(backendAPI.planMixJam).toHaveBeenCalledTimes(1))
    const jobId = vi.mocked(backendAPI.planMixJam).mock.calls[0]![1]
    act(() => emitProgress?.({
      identity: { rootKey: TEST_SAMPLE_FOLDER.id, jobId },
      status: 'running',
      phase: 'analyzing',
      completed: 1,
      total: 2
    }))
    expect(result.current.progress?.completed).toBe(1)
    act(() => emitProgress?.({
      identity: { rootKey: TEST_SAMPLE_FOLDER.id, jobId: 'foreign' },
      status: 'running',
      phase: 'analyzing',
      completed: 2,
      total: 2
    }))
    expect(result.current.progress?.completed).toBe(1)

    await act(async () => { planResult.resolve(DETAILED_PLAN); await planResult.promise })
    await waitFor(() => expect(result.current.saving).toBe(true))
    act(() => result.current.close())
    expect(result.current.open).toBe(true)

    await act(async () => { saveResult.resolve('generated.mixjam'); await saveResult.promise })
    await waitFor(() => expect(result.current.generating).toBe(false))
    expect(result.current.result?.summary).toContain('1 selected samples')
    expect(result.current.result?.summary).toContain('Percussion to Snare')
    expect(result.current.result?.summary).toContain('FX: Room')

    await act(async () => result.current.onOpenResult('generated.mixjam'))
    expect(result.current.open).toBe(false)
    expect(app.openProjectPath).toHaveBeenCalledWith('generated.mixjam')
  })

  it('rejects unsafe seeds and reports planning and save failures', async () => {
    const backendAPI = createBackendAPI()
    const app = appState({ saveGeneratedProject: vi.fn().mockResolvedValue(null) })
    const { result } = renderHook(() => useMixJamGenerator(app, backendAPI, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.readiness?.status).toBe('ready'))

    act(() => result.current.onGenerate({ ...PARAMETERS, seed: 'unsafe seed!' }))
    expect(backendAPI.planMixJam).not.toHaveBeenCalled()

    vi.mocked(backendAPI.planMixJam).mockRejectedValueOnce(new Error('planning failed'))
    act(() => result.current.onGenerate(PARAMETERS))
    await waitFor(() => expect(result.current.error).toBe('planning failed'))

    vi.mocked(backendAPI.planMixJam).mockResolvedValueOnce(PLAN)
    act(() => result.current.onGenerate(PARAMETERS))
    await waitFor(() => expect(result.current.error).toBe('The generated project could not be saved.'))
  })

  it('tracks analysis lifecycle only for the active root', async () => {
    const backendAPI = createBackendAPI()
    let emitAnalysis: ((progress: AnalysisProgress) => void) | undefined
    let emitAnalysisDone: ((done: Parameters<Parameters<typeof backendAPI.onAnalysisDone>[0]>[0]) => void) | undefined
    vi.mocked(backendAPI.onAnalysisProgress).mockImplementation((listener) => { emitAnalysis = listener; return () => {} })
    vi.mocked(backendAPI.onAnalysisDone).mockImplementation((listener) => { emitAnalysisDone = listener; return () => {} })
    const { result } = renderHook(() => useMixJamGenerator(appState(), backendAPI, TEST_SAMPLE_FOLDER))
    await waitFor(() => expect(result.current.readiness?.status).toBe('ready'))
    vi.mocked(backendAPI.getGeneratorReadiness).mockClear()

    act(() => emitAnalysis?.({
      identity: { rootKey: TEST_SAMPLE_FOLDER.id, sampleId: 1, jobId: 'analysis-1' },
      status: 'analyzing', analyzed: 0, total: 1
    }))
    expect(result.current.readiness?.status).toBe('preparing')

    act(() => emitAnalysisDone?.({
      identity: { rootKey: 'other', sampleId: 1, jobId: 'analysis-1' }
    }))
    expect(backendAPI.getGeneratorReadiness).not.toHaveBeenCalled()

    act(() => emitAnalysisDone?.({
      identity: { rootKey: TEST_SAMPLE_FOLDER.id, jobId: 'analysis-all', trigger: 'automatic' }
    }))
    await waitFor(() => expect(backendAPI.getGeneratorReadiness).toHaveBeenCalledTimes(1))

    act(() => emitAnalysis?.({
      identity: { rootKey: TEST_SAMPLE_FOLDER.id, sampleId: 1, jobId: 'analysis-2' },
      status: 'idle', analyzed: 1, total: 1
    }))
    await waitFor(() => expect(backendAPI.getGeneratorReadiness).toHaveBeenCalledTimes(2))
  })

  it('stays closed and idle without a resolved Sample Folder', () => {
    const backendAPI = createBackendAPI()
    const { result } = renderHook(() => useMixJamGenerator(appState(), backendAPI, null))

    act(() => {
      result.current.openNew()
      result.current.onGenerate(PARAMETERS)
    })

    expect(result.current.readiness).toBeNull()
    expect(result.current.generating).toBe(false)
    expect(backendAPI.planMixJam).not.toHaveBeenCalled()
  })
})
