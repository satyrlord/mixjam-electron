import type {
  AnalysisProgress,
  CalibrationJobIdentity,
  CalibrationProgress,
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
  detectedGeneratorBpm,
  fingerprintGeneratorSnapshot,
  getStoredGeneratorReadiness,
  loadGeneratorSnapshot
} from './generator-library'
import { validateMixJamGeneratorParameters } from './generator-parameters'
import * as analysisPersistence from './analysis-persistence'
import {
  runPendingAnalysis,
  runSingleAnalysis,
  runUniformFolderCalibration
} from './analysis-runner'
import { resolveFileHandle } from './folder-access'
import { loadFolderHandle } from './handle-store'
import * as indexedSamples from './indexed-sample-persistence'
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
  const CALIBRATION_IDLE: CalibrationProgress = {
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
  let calibrationProgress: CalibrationProgress = { ...CALIBRATION_IDLE }
  let generatorProgress: MixJamGeneratorProgress = { ...GENERATOR_IDLE }
  let syncGeneration = 0
  let calibrationGeneration = 0
  let generatorGeneration = 0
  let jobSequence = 0
  let selectedRootKey: string | null = null
  
  interface ActiveSyncJob {
    identity: LibraryJobIdentity
    generation: number
  }
  
  interface ActiveCalibrationJob {
    identity: CalibrationJobIdentity
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
  let activeCalibration: ActiveCalibrationJob | null = null
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
  
  function nextJobId(prefix: 'sync' | 'calibration' | 'analysis'): string {
    jobSequence++
    return `${prefix}-${Date.now().toString(36)}-${jobSequence.toString(36)}`
  }
  
  function createLibraryIdentity(
    rootKey: string,
    trigger: LibrarySyncTrigger
  ): LibraryJobIdentity {
    return { rootKey, jobId: nextJobId('sync'), trigger }
  }
  
  function createCalibrationIdentity(rootKey: string): CalibrationJobIdentity {
    return { rootKey, jobId: nextJobId('calibration') }
  }
  
  function createSampleAnalysisIdentity(
    rootKey: string,
    sampleId: number
  ): SampleAnalysisJobIdentity {
    return { rootKey, sampleId, jobId: nextJobId('analysis') }
  }
  
  function cancelActiveCalibrationForSync(): void {
    if (!activeCalibration) return
    const { identity } = activeCalibration
    calibrationGeneration++
    activeCalibration = null
    calibrationProgress = {
      identity,
      status: 'cancelled',
      analyzed: calibrationProgress.analyzed,
      total: calibrationProgress.total
    }
    emitEvent({ type: 'calibration-progress', progress: calibrationProgress })
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
    if (activeSync || activeCalibration || activeSingleAnalysis || queuedSyncs.size === 0) return
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
        const handle = await loadFolderHandle(identity.rootKey)
        if (!handle) throw new Error(`No stored folder handle for root ${identity.rootKey}`)
  
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
      if (activeCalibration) cancelActiveCalibrationForSync()
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
  
    if (activeCalibration) {
      if (trigger === 'mutation' && activeCalibration.identity.rootKey !== rootKey) {
        queuedSyncs.set(rootKey, identity)
        return { identity, disposition: 'queued' }
      }
      cancelActiveCalibrationForSync()
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
  
  function startUniformFolderCalibration(db: DB, rootKey: string): CalibrationJobIdentity {
    if (activeSync) throw new Error('Wait for the current library sync to finish')
    if (activeSingleAnalysis) throw new Error('Wait for the current sample analysis to finish')
    if (activeCalibration) {
      if (activeCalibration.identity.rootKey === rootKey) return activeCalibration.identity
      throw new Error('Wait for the current folder calibration to finish')
    }
  
    const identity = createCalibrationIdentity(rootKey)
    const generation = ++calibrationGeneration
    activeCalibration = { identity, generation }
    const isCurrent = (): boolean =>
      activeCalibration?.identity.jobId === identity.jobId &&
      activeCalibration.generation === generation &&
      calibrationGeneration === generation
  
    calibrationProgress = {
      identity,
      status: 'calibrating',
      analyzed: 0,
      total: 0
    }
    emitEvent({ type: 'calibration-progress', progress: calibrationProgress })
  
    void (async () => {
      try {
        const root = await loadFolderHandle(rootKey)
        if (!root) throw new Error(`No stored folder handle for root ${rootKey}`)
        const rootId = indexedSamples.scanRootId(db, rootKey)
        if (rootId === undefined) throw new Error('Library sync must complete before calibration')
  
        const files = new Map<string, File>()
        for (const candidate of analysisPersistence.listCalibrationCandidates(db, rootId)) {
          if (!isCurrent()) return
          const handle = await resolveFileHandle(root, candidate.relpath)
          if (!handle) {
            throw new Error(`Calibration requires a readable file: ${candidate.relpath}`)
          }
          try {
            files.set(candidate.relpath, await handle.getFile())
          } catch (cause) {
            const detail = cause instanceof Error ? cause.message : String(cause)
            throw new Error(`Calibration could not read ${candidate.relpath}: ${detail}`, { cause })
          }
        }
  
        await runUniformFolderCalibration(
          db,
          rootId,
          files,
          (next) => {
            if (!isCurrent()) return
            calibrationProgress = { ...next, identity }
            emitEvent({ type: 'calibration-progress', progress: calibrationProgress })
          },
          isCurrent
        )
        if (!isCurrent()) return
        calibrationProgress = { ...CALIBRATION_IDLE }
        emitEvent({ type: 'calibration-done', done: { identity } })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Calibration error:', message, error)
        if (!isCurrent()) return
        calibrationProgress = {
          identity,
          status: 'error',
          analyzed: calibrationProgress.analyzed,
          total: calibrationProgress.total,
          error: message
        }
        emitEvent({ type: 'calibration-progress', progress: calibrationProgress })
      }
  
      if (activeCalibration?.identity.jobId === identity.jobId) activeCalibration = null
      startNextQueuedSync(db)
    })()
  
    return identity
  }
  
  function cancelUniformFolderCalibration(db: DB, jobId: string): void {
    if (activeCalibration?.identity.jobId !== jobId) return
    const { identity } = activeCalibration
    calibrationGeneration++
    activeCalibration = null
    calibrationProgress = {
      identity,
      status: 'cancelled',
      analyzed: calibrationProgress.analyzed,
      total: calibrationProgress.total
    }
    emitEvent({ type: 'calibration-progress', progress: calibrationProgress })
    startNextQueuedSync(db)
  }
  
  async function reanalyzeSample(
    db: DB,
    rootKey: string,
    sampleId: number,
    relpath: string
  ): Promise<SampleAnalysisDone> {
    if (activeSync || activeCalibration || activeSingleAnalysis) {
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
      const root = await loadFolderHandle(rootKey)
      if (!root) throw new Error(`No stored folder handle for root ${rootKey}`)
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
      if (activeSync?.identity.rootKey === rootKey || activeSingleAnalysis?.identity.rootKey === rootKey || activeCalibration?.identity.rootKey === rootKey || activeGenerator?.identity.rootKey === rootKey) {
        return { status: 'preparing' as const, message: 'Library preparation is still running.' }
      }
      return getStoredGeneratorReadiness(db, rootKey)
    },
    async planMixJam(rootKey: string, jobId: string, parameters: MixJamGeneratorParameters, expectedFingerprint?: string) {
      if (!SAFE_GENERATOR_TOKEN.test(jobId)) throw new Error('The generator job ID is invalid.')
      validateMixJamGeneratorParameters(parameters)
      if (activeSync || activeSingleAnalysis || activeCalibration || activeGenerator) {
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
        const detectedBpm = detectedGeneratorBpm(snapshot.candidates)
        const fingerprint = await fingerprintGeneratorSnapshot(snapshot)
        if (expectedFingerprint !== undefined && fingerprint !== expectedFingerprint) throw new Error('The Sample Folder has changed since this project was generated.')
        const rootHandle = await loadFolderHandle(rootKey)
        if (!rootHandle) throw new Error('The Sample Folder is no longer available.')
        let attemptedFiles = 0
        const analyzed = await analyzeGeneratorCandidates(rootHandle, snapshot.candidates, parameters, (next) => {
          if (!isCurrent()) return
          attemptedFiles = next.phase === 'analyzing' ? Math.max(attemptedFiles, next.completed) : attemptedFiles
          generatorProgress = { identity, status: 'running', ...next }
          emitEvent({ type: 'generator-progress', progress: generatorProgress })
        }, isCurrent)
        if (!isCurrent()) throw new Error('MixJam generator planning was cancelled.')
        generatorProgress = { identity, status: 'running', phase: 'arranging', completed: analyzed.length, total: analyzed.length }
        emitEvent({ type: 'generator-progress', progress: generatorProgress })
        const plan = createMixJamGeneratorPlan(rootKey, fingerprint, analyzed, parameters, { attemptedFiles, analyzedFiles: analyzed.length, uniqueReads: attemptedFiles }, detectedBpm)
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
    startUniformFolderCalibration(rootKey: string): CalibrationJobIdentity {
      if (activeGenerator) throw new Error('Wait for MixJam generation to finish.')
      return startUniformFolderCalibration(db, rootKey)
    },
    cancelUniformFolderCalibration: (jobId: string): void => cancelUniformFolderCalibration(db, jobId),
    getCalibrationProgress: () => ({ ...calibrationProgress }),
    reanalyzeSample(rootKey: string, sampleId: number, relpath: string): Promise<SampleAnalysisDone> {
      if (activeGenerator) throw new Error('Wait for MixJam generation to finish.')
      return reanalyzeSample(db, rootKey, sampleId, relpath)
    }
  }
}
