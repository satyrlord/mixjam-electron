import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MixJamGeneratorParameters,
  MixJamGeneratorProgress,
  MixJamGeneratorReadiness
} from '../../../shared/backend-api'
import type { AppState } from './useAppState'
import type { GeneratorResult } from '../components/MixJamGeneratorDialog'
import { materializeGeneratedProject } from '../project/generated-project'
import { SAFE_SEED } from '../../../shared/backend-api'
import { persistedGeneratorParameters } from '../project/generator-support'

export type MixJamGeneratorMode = 'new' | 'regenerate-exact'

type GeneratorRunState =
  | { status: 'idle' }
  | { status: 'planning'; jobId: string }
  | { status: 'saving'; jobId: string }

async function seedDigest(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))
  return Array.from(new Uint8Array(digest).slice(0, 4), (byte) =>
    byte.toString(16).padStart(2, '0')).join('')
}

export interface UseMixJamGeneratorResult {
  open: boolean
  mode: MixJamGeneratorMode
  readiness: MixJamGeneratorReadiness | null
  initialParameters: MixJamGeneratorParameters | undefined
  generating: boolean
  saving: boolean
  progress: MixJamGeneratorProgress | null
  result: GeneratorResult | null
  error: string | null
  openNew: () => void
  openRegenerateExact: () => void
  openRegenerateCurrent: () => void
  close: () => void
  onGenerate: (parameters: MixJamGeneratorParameters) => void
  onOpenResult: (path: string) => Promise<void>
}

export function useMixJamGenerator(
  app: AppState,
  backendAPI: typeof window.backendAPI,
  resolvedSampleFolder: { id: string; name: string } | null
): UseMixJamGeneratorResult {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<MixJamGeneratorMode>('new')
  const [readiness, setReadiness] = useState<MixJamGeneratorReadiness | null>(null)
  const [runState, setRunState] = useState<GeneratorRunState>({ status: 'idle' })
  const [progress, setProgress] = useState<MixJamGeneratorProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GeneratorResult | null>(null)
  const [initialParameters, setInitialParameters] = useState<MixJamGeneratorParameters | undefined>()
  const exactAutoSubmitPendingRef = useRef(false)
  const runStateRef = useRef<GeneratorRunState>({ status: 'idle' })
  const readinessRequestRef = useRef({ generation: 0, rootKey: null as string | null })
  const resolvedRootKey = resolvedSampleFolder?.id ?? null
  if (readinessRequestRef.current.rootKey !== resolvedRootKey) {
    readinessRequestRef.current = {
      generation: readinessRequestRef.current.generation + 1,
      rootKey: resolvedRootKey
    }
  }

  const updateRunState = useCallback((next: GeneratorRunState) => {
    runStateRef.current = next
    setRunState(next)
  }, [])

  const ownsRun = useCallback((jobId: string) => {
    const current = runStateRef.current
    return current.status !== 'idle' && current.jobId === jobId
  }, [])

  const storedGeneratorParameters = useCallback((): MixJamGeneratorParameters | null => {
    const generator = app.projectGenerator
    return generator ? persistedGeneratorParameters(generator) : null
  }, [app.projectGenerator])

  const resetState = useCallback((modeValue: MixJamGeneratorMode, params: MixJamGeneratorParameters | undefined) => {
    setMode(modeValue)
    setInitialParameters(params)
    setResult(null)
    setError(null)
    setReadiness(null)
    setProgress(null)
    exactAutoSubmitPendingRef.current = false
  }, [])

  const requestReadiness = useCallback((folder: { id: string; name: string }) => {
    const requestGeneration = ++readinessRequestRef.current.generation
    const requestRootKey = folder.id
    const isCurrentRequest = (): boolean =>
      readinessRequestRef.current.generation === requestGeneration &&
      readinessRequestRef.current.rootKey === requestRootKey
    void backendAPI.getGeneratorReadiness(folder)
      .then((next) => {
        if (isCurrentRequest()) setReadiness(next)
      })
      .catch((err: unknown) => {
        if (isCurrentRequest()) setError(err instanceof Error ? err.message : String(err))
      })
  }, [backendAPI])

  const fetchReadiness = useCallback(() => {
    if (resolvedSampleFolder) requestReadiness(resolvedSampleFolder)
  }, [requestReadiness, resolvedSampleFolder])

  useEffect(() => {
    if (!resolvedSampleFolder) return
    const rootKey = resolvedSampleFolder.id
    const preparing = (): void => setReadiness({
      status: 'preparing',
      message: 'Library preparation is still running.'
    })
    const unsubs = [
      backendAPI.onAnalysisProgress((progress) => {
        if (progress.identity?.rootKey !== rootKey) return
        if (progress.status === 'analyzing') preparing()
        else fetchReadiness()
      }),
      backendAPI.onAnalysisDone((done) => {
        if (done.identity.rootKey === rootKey) fetchReadiness()
      })
    ]
    return () => { for (const unsub of unsubs) unsub() }
  }, [backendAPI, fetchReadiness, resolvedSampleFolder])

  const openNew = useCallback(() => {
    resetState('new', undefined)
    setOpen(true)
    fetchReadiness()
  }, [resetState, fetchReadiness])

  const openRegenerateExact = useCallback(() => {
    const parameters = storedGeneratorParameters()
    if (!parameters) return
    resetState('regenerate-exact', parameters)
    exactAutoSubmitPendingRef.current = true
    setOpen(true)
    setReadiness({
      status: 'ready',
      analysisState: 'resolved',
      detectedBpm: parameters.bpm ?? app.bpm,
      eligibleSamples: 0,
      tempoClusters: [{
        relpathPrefix: parameters.tempoClusterPrefix ?? '',
        sampleCount: 0,
        bpm: parameters.bpm ?? app.bpm,
        musicalKey: null,
        confidence: 1
      }]
    })
  }, [app.bpm, resetState, storedGeneratorParameters])

  const openRegenerateCurrent = useCallback(() => {
    const parameters = storedGeneratorParameters()
    if (!parameters) return
    resetState('new', parameters)
    setOpen(true)
    fetchReadiness()
  }, [fetchReadiness, resetState, storedGeneratorParameters])

  const close = useCallback(() => {
    const activeRun = runStateRef.current
    if (activeRun.status === 'saving') return
    exactAutoSubmitPendingRef.current = false
    if (activeRun.status === 'planning') {
      updateRunState({ status: 'idle' })
      setProgress(null)
      void backendAPI.cancelMixJamPlanning(activeRun.jobId)
    }
    setOpen(false)
  }, [backendAPI, updateRunState])

  const runGenerateRef = useRef<((parameters: MixJamGeneratorParameters) => void) | null>(null)

  const runGenerate = useCallback(async (parameters: MixJamGeneratorParameters) => {
    if (!resolvedSampleFolder) return
    if (!SAFE_SEED.test(parameters.seed)) return
    setProgress(null)
    setError(null)
    const jobId = `generator-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`
    updateRunState({ status: 'planning', jobId })
    try {
      const expectedFingerprint = mode === 'regenerate-exact'
        ? app.projectGenerator?.corpusFingerprint
        : undefined
      const plan = await backendAPI.planMixJam(resolvedSampleFolder, jobId, parameters, expectedFingerprint)
      if (!ownsRun(jobId)) return
      updateRunState({ status: 'saving', jobId })
      const path = await app.saveGeneratedProject(
        materializeGeneratedProject(plan),
        `${plan.profileId}-${plan.parameters.resolvedBpm}bpm-${plan.parameters.intensity}-${await seedDigest(plan.seed)}`
      )
      if (!ownsRun(jobId)) return
      if (!path) throw new Error('The generated project could not be saved.')
      setResult({
        path,
        summary: [
          `${plan.profileId[0]!.toUpperCase()}${plan.profileId.slice(1)} at ${plan.parameters.resolvedBpm} BPM`,
          `${plan.targetBars} bars (${plan.quantizedDurationSeconds.toFixed(1)} seconds)`,
          `${plan.selections.reduce((count, selection) => count + selection.sampleRefs.length, 0)} selected samples`,
          `${plan.substitutions.length} substitutions`,
          `${plan.analysis.analyzedFiles}/${plan.analysis.attemptedFiles} transient analyses`,
          `samples: ${plan.selections.flatMap((selection) => selection.sampleRefs).join(', ')}`,
          `substitutions: ${plan.substitutions.map((entry) => `${entry.requestedType} to ${entry.selectedType}`).join(', ') || 'none'}`,
          `sections: ${plan.sections.map((section) => section.name).join(', ')}`,
          `mixer: ${plan.lanes.map((lane) => `${lane.index + 1}=${lane.gain.toFixed(2)}/${lane.pan.toFixed(2)}`).join(', ')}`,
          'FX: generators leave all four return slots Empty'
        ].join('; ') + '.'
      })
    } catch (err) {
      if (!ownsRun(jobId)) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (ownsRun(jobId)) updateRunState({ status: 'idle' })
    }
  }, [app, backendAPI, mode, ownsRun, resolvedSampleFolder, updateRunState])

  useEffect(() => backendAPI.onGeneratorProgress((next) => {
    const current = runStateRef.current
    if (current.status !== 'idle' && next.identity?.jobId === current.jobId) setProgress(next)
  }), [backendAPI])

  useEffect(() => {
    runGenerateRef.current = runGenerate
  }, [runGenerate])

  useEffect(() => {
    if (!resolvedSampleFolder) {
      setReadiness(null)
      return
    }
    requestReadiness(resolvedSampleFolder)
  }, [app.librarySyncState.status, requestReadiness, resolvedSampleFolder])

  const onGenerate = useCallback((parameters: MixJamGeneratorParameters) => {
    void runGenerate(parameters)
  }, [runGenerate])

  const onOpenResult = useCallback(async (path: string) => {
    setOpen(false)
    await app.openProjectPath(path)
  }, [app])

  useEffect(() => {
    if (!open || mode !== 'regenerate-exact' || !initialParameters ||
        !exactAutoSubmitPendingRef.current) return
    exactAutoSubmitPendingRef.current = false
    if (SAFE_SEED.test(initialParameters.seed)) runGenerateRef.current?.(initialParameters)
  }, [initialParameters, mode, open])

  return useMemo(
    () => ({
      open,
      mode,
      readiness,
      initialParameters,
      generating: runState.status !== 'idle',
      saving: runState.status === 'saving',
      progress,
      result,
      error,
      openNew,
      openRegenerateExact,
      openRegenerateCurrent,
      close,
      onGenerate,
      onOpenResult
    }),
    [open, mode, readiness, initialParameters, runState, progress, result, error, openNew, openRegenerateExact, openRegenerateCurrent, close, onGenerate, onOpenResult]
  )
}
