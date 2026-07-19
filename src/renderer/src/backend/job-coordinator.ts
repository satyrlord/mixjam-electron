import type {
  AnalysisProgress,
  LibraryJobIdentity,
  LibrarySyncStartResult,
  LibrarySyncTrigger,
  MixJamGeneratorParameters,
  MixJamGeneratorProgress,
  SampleAnalysisDone,
  SampleAnalysisJobIdentity,
  ScanProgress
} from '../../../shared/backend-api'
import { SAFE_GENERATOR_TOKEN } from '../../../shared/backend-api'
import { analyzeGeneratorCandidates } from './generator-analysis'
import { createMixJamGeneratorPlan } from './generator-engine'
import {
  fingerprintGeneratorSnapshot,
  getStoredGeneratorReadiness,
  loadGeneratorSnapshot,
  selectGeneratorAnalysisGroup
} from './generator-library'
import { validateMixJamGeneratorParameters } from './generator-parameters'
import {
  runPendingAnalysis,
  runSingleAnalysis
} from './analysis-runner'
import { requireFolderForAutomaticAccess, resolveFileHandle } from './folder-access'
import { runScan } from './indexer'
import type { WorkerMessage } from './protocol'
import type { DB } from './sql'

export function createBackendJobCoordinator(
  db: DB,
  emitEvent: (message: WorkerMessage) => void
) {
  const IDLE: ScanProgress = {
    identity: null,
    status: 'idle',
    phase: null,
    found: 0,
    processed: 0,
    total: 0
  }
  const ANALYSIS_IDLE: AnalysisProgress = {
    identity: null,
    status: 'idle',
    analyzed: 0,
    total: 0
  }
  const GENERATOR_IDLE: MixJamGeneratorProgress = {
    identity: null,
    status: 'idle',
    phase: null,
    completed: 0,
    total: 0
  }
  
  let progress: ScanProgress = { ...IDLE }
  let analysisProgress: AnalysisProgress = { ...ANALYSIS_IDLE }
  let generatorProgress: MixJamGeneratorProgress = { ...GENERATOR_IDLE }
  let syncGeneration = 0
  let generatorGeneration = 0
  let jobSequence = 0
  let selectedRootKey: string | null = null
  
  interface ActiveSyncJob {
    identity: LibraryJobIdentity
    generation: number
  }
  
  interface ActiveSampleAnalysisJob {
    identity: SampleAnalysisJobIdentity
  }
  
  interface ActiveGeneratorJob {
    identity: { rootKey: string; jobId: string }
    generation: number
  }
  
  let activeSync: ActiveSyncJob | null = null
  let activeSingleAnalysis: ActiveSampleAnalysisJob | null = null
  let activeGenerator: ActiveGeneratorJob | null = null
  const completedAutomaticJobs = new Map<string, LibraryJobIdentity>()
  const automaticAttemptJobIds = new Set<string>()
  const queuedSyncs = new Map<string, LibraryJobIdentity>()
  
  function cancelActiveGenerator(): void {
    if (!activeGenerator) return
    const { identity } = activeGenerator
    generatorGeneration++
    activeGenerator = null
    generatorProgress = {
      identity,
      status: 'cancelled',
      phase: generatorProgress.phase,
      completed: generatorProgress.completed,
      total: generatorProgress.total
    }
    emitEvent({ type: 'generator-progress', progress: generatorProgress })
  }
  
  function nextJobId(prefix: 'sync' | 'analysis'): string {
    jobSequence++
    return `${prefix}-${Date.now().toString(36)}-${jobSequence.toString(36)}`
  }
  
  function createLibraryIdentity(
    rootKey: string,
    trigger: LibrarySyncTrigger
  ): LibraryJobIdentity {
    return { rootKey, jobId: nextJobId('sync'), trigger }
  }
  
  function createSampleAnalysisIdentity(
    rootKey: string,
    sampleId: number
  ): SampleAnalysisJobIdentity {
    return { rootKey, sampleId, jobId: nextJobId('analysis') }
  }
  
  function cancelActiveSyncForReplacement(): void {
    if (!activeSync) return
    const { identity } = activeSync
    syncGeneration++
    activeSync = null
    automaticAttemptJobIds.delete(identity.jobId)
    progress = {
      identity,
      status: 'cancelled',
      phase: progress.phase,
      found: progress.found,
      processed: progress.processed,
      total: progress.total
    }
    analysisProgress = { ...ANALYSIS_IDLE }
    emitEvent({ type: 'scan-progress', progress })
    emitEvent({ type: 'analysis-progress', progress: analysisProgress })
  }
  
  function finishSyncJob(db: DB, identity: LibraryJobIdentity): void {
    if (activeSync?.identity.jobId !== identity.jobId) return
    automaticAttemptJobIds.delete(identity.jobId)
    activeSync = null
    startNextQueuedSync(db)
  }
  
  function startNextQueuedSync(db: DB): void {
    if (activeSync || activeSingleAnalysis || queuedSyncs.size === 0) return
    const preferred = selectedRootKey ? queuedSyncs.get(selectedRootKey) : undefined
    const identity = preferred ?? queuedSyncs.values().next().value as LibraryJobIdentity | undefined
    if (!identity) return
    queuedSyncs.delete(identity.rootKey)
    if (identity.trigger === 'automatic') automaticAttemptJobIds.add(identity.jobId)
    beginLibrarySync(db, identity)
  }
  
  function beginLibrarySync(db: DB, identity: LibraryJobIdentity): void {
    const generation = ++syncGeneration
    activeSync = { identity, generation }
    const isCurrent = (): boolean =>
      activeSync?.identity.jobId === identity.jobId &&
      activeSync.generation === generation &&
      syncGeneration === generation
  
    progress = {
      identity,
      status: 'scanning',
      phase: 1,
      found: 0,
      processed: 0,
      total: 0
    }
    analysisProgress = { ...ANALYSIS_IDLE }
    emitEvent({ type: 'scan-progress', progress })
    emitEvent({ type: 'analysis-progress', progress: analysisProgress })
  
    void (async () => {
      let result: Awaited<ReturnType<typeof runScan>>
      try {
        const handle = await requireFolderForAutomaticAccess(identity.rootKey, 'sample')
  
        result = await runScan(
          db,
          identity.rootKey,
          handle,
          (next) => {
            if (!isCurrent()) return
            progress = { ...next, identity }
            emitEvent({ type: 'scan-progress', progress })
          },
          isCurrent,
          { retryUnavailable: identity.trigger === 'manual' }
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Indexer error:', message, error)
        if (!isCurrent()) return
        progress = {
          identity,
          status: 'error',
          phase: progress.phase,
          found: progress.found,
          processed: progress.processed,
          total: progress.total,
          error: message
        }
        emitEvent({ type: 'scan-progress', progress })
        finishSyncJob(db, identity)
        return
      }
  
      if (!isCurrent() || result.lastCompletedAt === null) return
      if (automaticAttemptJobIds.delete(identity.jobId)) {
        completedAutomaticJobs.set(identity.rootKey, identity)
      }
      progress = { ...IDLE }
      emitEvent({
        type: 'scan-done',
        done: { identity, lastCompletedAt: result.lastCompletedAt }
      })
  
      try {
        await runPendingAnalysis(
          db,
          result.rootId,
          result.files,
          (next) => {
            if (!isCurrent()) return
            analysisProgress = { ...next, identity }
            emitEvent({ type: 'analysis-progress', progress: analysisProgress })
          },
          isCurrent
        )
        if (!isCurrent()) return
        analysisProgress = { ...ANALYSIS_IDLE }
        emitEvent({ type: 'analysis-done', done: { identity } })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Analysis error:', message, error)
        if (!isCurrent()) return
        analysisProgress = {
          identity,
          status: 'error',
          analyzed: analysisProgress.analyzed,
          total: analysisProgress.total,
          error: message
        }
        emitEvent({ type: 'analysis-progress', progress: analysisProgress })
      }
      finishSyncJob(db, identity)
    })()
  }
  
  function startLibrarySync(
    db: DB,
    rootKey: string,
    trigger: LibrarySyncTrigger
  ): LibrarySyncStartResult {
    if (activeSingleAnalysis) {
      if (trigger === 'manual') {
        throw new Error('Wait for the current sample analysis to finish')
      }
      const queued = queuedSyncs.get(rootKey)
      if (queued) return { identity: queued, disposition: 'queued' }
      const identity = createLibraryIdentity(rootKey, trigger)
      queuedSyncs.set(rootKey, identity)
      if (trigger === 'automatic') selectedRootKey = rootKey
      return { identity, disposition: 'queued' }
    }
  
    const activeForRoot = activeSync?.identity.rootKey === rootKey ? activeSync.identity : null
    if (activeForRoot) {
      if (trigger !== 'mutation') {
        if (trigger === 'automatic') automaticAttemptJobIds.add(activeForRoot.jobId)
        return { identity: activeForRoot, disposition: 'coalesced' }
      }
      const queued = queuedSyncs.get(rootKey)
      if (queued) return { identity: queued, disposition: 'queued' }
      const identity = createLibraryIdentity(rootKey, 'mutation')
      queuedSyncs.set(rootKey, identity)
      return { identity, disposition: 'queued' }
    }
  
    const queuedForRoot = queuedSyncs.get(rootKey)
    if (queuedForRoot && trigger === 'mutation') {
      return { identity: queuedForRoot, disposition: 'queued' }
    }
    if (queuedForRoot && trigger !== 'mutation') {
      queuedSyncs.delete(rootKey)
      if (trigger === 'automatic') automaticAttemptJobIds.add(queuedForRoot.jobId)
      selectedRootKey = rootKey
      if (activeSync) cancelActiveSyncForReplacement()
      beginLibrarySync(db, queuedForRoot)
      return { identity: queuedForRoot, disposition: 'started' }
    }
  
    if (trigger === 'automatic') {
      const previous = completedAutomaticJobs.get(rootKey)
      if (previous) {
        if (activeGenerator && activeGenerator.identity.rootKey !== rootKey) {
          cancelActiveGenerator()
        }
        return { identity: previous, disposition: 'suppressed' }
      }
    }
    if (activeGenerator) cancelActiveGenerator()
    const identity = createLibraryIdentity(rootKey, trigger)
    if (trigger === 'automatic') automaticAttemptJobIds.add(identity.jobId)
  
    if (activeSync) {
      if (trigger === 'mutation') {
        queuedSyncs.set(rootKey, identity)
        return { identity, disposition: 'queued' }
      }
      selectedRootKey = rootKey
      cancelActiveSyncForReplacement()
    } else if (trigger !== 'mutation') {
      selectedRootKey = rootKey
    }
  
    beginLibrarySync(db, identity)
    return { identity, disposition: 'started' }
  }
  
  function cancelLibrarySync(db: DB, jobId: string): void {
    if (activeSync?.identity.jobId === jobId) {
      const { identity } = activeSync
      syncGeneration++
      activeSync = null
      automaticAttemptJobIds.delete(identity.jobId)
      queuedSyncs.delete(identity.rootKey)
      progress = {
        identity,
        status: 'cancelled',
        phase: progress.phase,
        found: progress.found,
        processed: progress.processed,
        total: progress.total
      }
      analysisProgress = { ...ANALYSIS_IDLE }
      emitEvent({ type: 'scan-progress', progress })
      emitEvent({ type: 'analysis-progress', progress: analysisProgress })
      startNextQueuedSync(db)
      return
    }
  
    for (const [rootKey, queued] of queuedSyncs) {
      if (queued.jobId === jobId) queuedSyncs.delete(rootKey)
    }
  }
  
  async function reanalyzeSample(
    db: DB,
    rootKey: string,
    sampleId: number,
    relpath: string
  ): Promise<SampleAnalysisDone> {
    if (activeSync || activeSingleAnalysis) {
      throw new Error('Wait for the current sync or analysis to finish')
    }
    const identity = createSampleAnalysisIdentity(rootKey, sampleId)
    activeSingleAnalysis = { identity }
    analysisProgress = {
      identity,
      status: 'analyzing',
      analyzed: 0,
      total: 1
    }
    emitEvent({ type: 'analysis-progress', progress: analysisProgress })
    const isCurrent = (): boolean =>
      activeSingleAnalysis?.identity.jobId === identity.jobId
  
    try {
      const root = await requireFolderForAutomaticAccess(rootKey, 'sample')
      const handle = await resolveFileHandle(root, relpath)
      if (!handle) throw new Error(`Sample is not readable: ${relpath}`)
      const file = await handle.getFile()
      await runSingleAnalysis(db, sampleId, file, (next) => {
        if (!isCurrent()) return
        analysisProgress = { ...next, identity }
        emitEvent({ type: 'analysis-progress', progress: analysisProgress })
      })
      if (!isCurrent()) throw new Error('Sample analysis was superseded')
      analysisProgress = { ...ANALYSIS_IDLE }
      const done: SampleAnalysisDone = { identity }
      emitEvent({ type: 'analysis-done', done })
      return done
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Analysis error:', message, error)
      if (isCurrent()) {
        analysisProgress = {
          identity,
          status: 'error',
          analyzed: analysisProgress.analyzed,
          total: Math.max(analysisProgress.total, 1),
          error: message
        }
        emitEvent({ type: 'analysis-progress', progress: analysisProgress })
      }
      throw error
    } finally {
      if (isCurrent()) activeSingleAnalysis = null
      startNextQueuedSync(db)
    }
  }

  return {
    getGeneratorReadiness(rootKey: string) {
      if (activeSync?.identity.rootKey === rootKey || activeSingleAnalysis?.identity.rootKey === rootKey || activeGenerator?.identity.rootKey === rootKey) {
        return { status: 'preparing' as const, message: 'Library preparation is still running.' }
      }
      return getStoredGeneratorReadiness(db, rootKey)
    },
    async planMixJam(rootKey: string, jobId: string, parameters: MixJamGeneratorParameters, expectedFingerprint?: string) {
      if (!SAFE_GENERATOR_TOKEN.test(jobId)) throw new Error('The generator job ID is invalid.')
      validateMixJamGeneratorParameters(parameters)
      if (activeSync || activeSingleAnalysis || activeGenerator) {
        throw new Error('Wait for library preparation to finish before generating.')
      }
      const generation = ++generatorGeneration
      const identity = { rootKey, jobId }
      activeGenerator = { identity, generation }
      const isCurrent = (): boolean => activeGenerator?.identity.jobId === jobId && activeGenerator.generation === generation && generatorGeneration === generation
      try {
        generatorProgress = { identity, status: 'running', phase: 'shortlisting', completed: 0, total: 0 }
        emitEvent({ type: 'generator-progress', progress: generatorProgress })
        const snapshot = loadGeneratorSnapshot(db, rootKey)
        const fingerprint = await fingerprintGeneratorSnapshot(snapshot)
        if (expectedFingerprint !== undefined && fingerprint !== expectedFingerprint) throw new Error('The Sample Folder has changed since this project was generated.')
        const selection = selectGeneratorAnalysisGroup(snapshot, parameters)
        const rootHandle = await requireFolderForAutomaticAccess(rootKey, 'sample')
        let attemptedFiles = 0
        const analyzed = await analyzeGeneratorCandidates(rootHandle, selection.candidates, selection.parameters, (next) => {
          if (!isCurrent()) return
          attemptedFiles = next.phase === 'analyzing' ? Math.max(attemptedFiles, next.completed) : attemptedFiles
          generatorProgress = { identity, status: 'running', ...next }
          emitEvent({ type: 'generator-progress', progress: generatorProgress })
        }, isCurrent)
        if (!isCurrent()) throw new Error('MixJam generator planning was cancelled.')
        generatorProgress = { identity, status: 'running', phase: 'arranging', completed: analyzed.length, total: analyzed.length }
        emitEvent({ type: 'generator-progress', progress: generatorProgress })
        const plan = createMixJamGeneratorPlan(rootKey, fingerprint, analyzed, selection.parameters, { attemptedFiles, analyzedFiles: analyzed.length, uniqueReads: attemptedFiles }, selection.detectedBpm)
        if (!isCurrent()) throw new Error('MixJam generator planning was cancelled.')
        activeGenerator = null
        generatorProgress = { ...GENERATOR_IDLE }
        return plan
      } catch (error) {
        if (isCurrent()) {
          const message = error instanceof Error ? error.message : String(error)
          activeGenerator = null
          generatorProgress = { identity, status: message.includes('cancelled') ? 'cancelled' : 'error', phase: generatorProgress.phase, completed: generatorProgress.completed, total: generatorProgress.total, ...(message.includes('cancelled') ? {} : { error: message }) }
          emitEvent({ type: 'generator-progress', progress: generatorProgress })
        }
        throw error
      }
    },
    cancelMixJamPlanning(jobId: string) { if (activeGenerator?.identity.jobId === jobId) cancelActiveGenerator() },
    getGeneratorProgress: () => ({ ...generatorProgress }),
    startLibrarySync: (rootKey: string, trigger: LibrarySyncTrigger): LibrarySyncStartResult => startLibrarySync(db, rootKey, trigger),
    cancelLibrarySync: (jobId: string): void => cancelLibrarySync(db, jobId),
    getScanProgress: () => ({ ...progress }),
    getAnalysisProgress: () => ({ ...analysisProgress }),
    reanalyzeSample(rootKey: string, sampleId: number, relpath: string): Promise<SampleAnalysisDone> {
      if (activeGenerator) throw new Error('Wait for MixJam generation to finish.')
      return reanalyzeSample(db, rootKey, sampleId, relpath)
    }
  }
}
