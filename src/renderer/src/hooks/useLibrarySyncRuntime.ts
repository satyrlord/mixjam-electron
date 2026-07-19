import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AnalysisProgress,
  BackendAPI,
  FolderRef,
  LibraryJobIdentity,
  LibraryRootState,
  LibrarySyncStartResult,
  LibrarySyncState,
  ScanProgress
} from '../../../shared/backend-api'
import { useSyncedRef } from './useSyncedRef'

export interface LibrarySyncRuntime {
  state: LibrarySyncState
  dbIndexed: boolean
  rescan: () => Promise<void>
  retry: () => Promise<void>
  cancel: () => Promise<void>
}

interface UseLibrarySyncRuntimeOptions {
  backendAPI: BackendAPI
  sampleFolder: FolderRef | null
  onScanDone: () => void
  onAnalysisDone: () => void
}

function isActive(state: LibrarySyncState): state is Extract<LibrarySyncState, { jobId: string }> {
  return state.status === 'checking' || state.status === 'syncing' || state.status === 'analyzing'
}

/**
 * Renderer-side lifecycle owner for one Sample Folder's library sync. Backend
 * admission and scheduling remain in the worker; this hook only reconciles
 * root/job-scoped events into renderer state.
 */
export function useLibrarySyncRuntime({
  backendAPI,
  sampleFolder,
  onScanDone,
  onAnalysisDone
}: UseLibrarySyncRuntimeOptions): LibrarySyncRuntime {
  const [state, setState] = useState<LibrarySyncState>(() => sampleFolder
    ? { status: 'unindexed', rootKey: sampleFolder.id }
    : { status: 'unavailable' })
  const [dbIndexed, setDbIndexed] = useState(false)
  const activeRootKeyRef = useRef<string | null>(sampleFolder?.id ?? null)
  const activeJobRef = useRef<LibraryJobIdentity | null>(null)
  const terminalJobIdsRef = useRef<Set<string>>(new Set())
  const hasUsableIndexRef = useRef(false)
  const lastCompletedAtRef = useRef<number | null>(null)
  const onScanDoneRef = useSyncedRef(onScanDone)
  const onAnalysisDoneRef = useSyncedRef(onAnalysisDone)
  activeRootKeyRef.current = sampleFolder?.id ?? null

  const applyRootState = useCallback((root: LibraryRootState) => {
    if (root.rootKey !== activeRootKeyRef.current) return
    hasUsableIndexRef.current = root.hasUsableIndex
    lastCompletedAtRef.current = root.lastCompletedAt
    setDbIndexed(root.hasUsableIndex)
    setState((current) => {
      if (isActive(current) && current.rootKey === root.rootKey) return current
      return root.lastCompletedAt === null
        ? { status: 'unindexed', rootKey: root.rootKey }
        : { status: 'ready', rootKey: root.rootKey, lastCompletedAt: root.lastCompletedAt }
    })
  }, [])

  const acceptJob = useCallback((identity: LibraryJobIdentity): boolean => {
    if (identity.rootKey !== activeRootKeyRef.current || terminalJobIdsRef.current.has(identity.jobId)) {
      return false
    }
    const active = activeJobRef.current
    if (active && active.jobId !== identity.jobId) return false
    activeJobRef.current = identity
    return true
  }, [])

  const finishJob = useCallback((identity: LibraryJobIdentity) => {
    terminalJobIdsRef.current.add(identity.jobId)
    if (activeJobRef.current?.jobId === identity.jobId) activeJobRef.current = null
  }, [])

  const applyScanProgress = useCallback((progress: ScanProgress) => {
    const identity = progress.identity
    if (!identity || !acceptJob(identity)) return
    if (progress.status === 'scanning') {
      setState({
        status: 'syncing', rootKey: identity.rootKey, jobId: identity.jobId,
        hasUsableIndex: hasUsableIndexRef.current, phase: progress.phase,
        found: progress.found, processed: progress.processed, total: progress.total
      })
      return
    }
    if (progress.status === 'cancelled') {
      setState({ status: 'cancelled', rootKey: identity.rootKey, hasUsableIndex: hasUsableIndexRef.current })
      finishJob(identity)
      return
    }
    if (progress.status === 'error') {
      setState({
        status: 'error', rootKey: identity.rootKey,
        message: progress.error ?? 'Library sync failed.', hasUsableIndex: hasUsableIndexRef.current
      })
      finishJob(identity)
    }
  }, [acceptJob, finishJob])

  const applyAnalysisProgress = useCallback((progress: AnalysisProgress) => {
    const identity = progress.identity
    if (!identity || 'sampleId' in identity || !acceptJob(identity)) return
    if (progress.status === 'analyzing') {
      const lastCompletedAt = lastCompletedAtRef.current
      if (lastCompletedAt === null) return
      setState({
        status: 'analyzing', rootKey: identity.rootKey, jobId: identity.jobId,
        lastCompletedAt, analyzed: progress.analyzed, total: progress.total
      })
      return
    }
    if (progress.status === 'error') {
      setState({
        status: 'error', rootKey: identity.rootKey,
        message: progress.error ?? 'Sample analysis failed.', hasUsableIndex: true
      })
      finishJob(identity)
    }
  }, [acceptJob, finishJob])

  const hydrateActiveJob = useCallback(async (identity: LibraryJobIdentity) => {
    const [scan, analysis] = await Promise.all([backendAPI.getScanProgress(), backendAPI.getAnalysisProgress()])
    if (scan.identity?.jobId === identity.jobId) applyScanProgress(scan)
    if (analysis.identity && !('sampleId' in analysis.identity) && analysis.identity.jobId === identity.jobId) {
      applyAnalysisProgress(analysis)
    }
  }, [applyAnalysisProgress, applyScanProgress, backendAPI])

  const applyStartResult = useCallback(async (result: LibrarySyncStartResult, folder: FolderRef) => {
    if (folder.id !== activeRootKeyRef.current) return
    if (result.disposition === 'started') {
      terminalJobIdsRef.current.delete(result.identity.jobId)
      activeJobRef.current = result.identity
      setState((current) => isActive(current) && current.rootKey === result.identity.rootKey && current.jobId === result.identity.jobId
        ? current
        : { status: 'checking', rootKey: result.identity.rootKey, jobId: result.identity.jobId })
      return
    }
    if (result.disposition === 'coalesced') {
      terminalJobIdsRef.current.delete(result.identity.jobId)
      activeJobRef.current = result.identity
      await hydrateActiveJob(result.identity)
      return
    }
    applyRootState(await backendAPI.getLibraryRootState(folder))
  }, [applyRootState, backendAPI, hydrateActiveJob])

  useEffect(() => {
    activeJobRef.current = null
    terminalJobIdsRef.current.clear()
    hasUsableIndexRef.current = false
    lastCompletedAtRef.current = null
    if (!sampleFolder) {
      setState({ status: 'unavailable' })
      setDbIndexed(false)
      return
    }
    let active = true
    setState({ status: 'unindexed', rootKey: sampleFolder.id })
    setDbIndexed(false)
    void (async () => {
      try {
        const root = await backendAPI.getLibraryRootState(sampleFolder)
        if (!active || sampleFolder.id !== activeRootKeyRef.current) return
        applyRootState(root)
      } catch (cause) {
        console.error('Failed to read library state:', cause)
        if (active && sampleFolder.id === activeRootKeyRef.current) {
          setState({ status: 'error', rootKey: sampleFolder.id, message: 'Unable to read library status.', hasUsableIndex: false })
        }
      }
      if (!active || sampleFolder.id !== activeRootKeyRef.current) return
      try {
        const result = await backendAPI.startLibrarySync(sampleFolder, 'automatic')
        if (active) await applyStartResult(result, sampleFolder)
      } catch (cause) {
        console.error('Failed to start automatic library sync:', cause)
        if (active && sampleFolder.id === activeRootKeyRef.current) {
          setState({
            status: 'error', rootKey: sampleFolder.id,
            message: cause instanceof Error ? cause.message : 'Unable to start library sync.',
            hasUsableIndex: hasUsableIndexRef.current
          })
        }
      }
    })()
    return () => { active = false }
  }, [applyRootState, applyStartResult, backendAPI, sampleFolder])

  useEffect(() => {
    const unsubProgress = backendAPI.onScanProgress(applyScanProgress)
    const unsubDone = backendAPI.onScanDone((done) => {
      if (!acceptJob(done.identity)) return
      hasUsableIndexRef.current = true
      lastCompletedAtRef.current = done.lastCompletedAt
      setDbIndexed(true)
      setState({
        status: 'analyzing', rootKey: done.identity.rootKey, jobId: done.identity.jobId,
        lastCompletedAt: done.lastCompletedAt, analyzed: 0, total: 0
      })
      onScanDoneRef.current()
    })
    const unsubAnalysisProgress = backendAPI.onAnalysisProgress(applyAnalysisProgress)
    const unsubAnalysisDone = backendAPI.onAnalysisDone((done) => {
      const identity = done.identity
      if ('sampleId' in identity || !acceptJob(identity)) return
      const lastCompletedAt = lastCompletedAtRef.current
      if (lastCompletedAt !== null) {
        setState({ status: 'ready', rootKey: identity.rootKey, lastCompletedAt })
      }
      finishJob(identity)
      onAnalysisDoneRef.current()
    })
    return () => {
      unsubProgress()
      unsubDone()
      unsubAnalysisProgress()
      unsubAnalysisDone()
    }
  }, [acceptJob, applyAnalysisProgress, applyScanProgress, backendAPI, finishJob, onAnalysisDoneRef, onScanDoneRef])

  const request = useCallback(async () => {
    if (!sampleFolder || isActive(state)) return
    try {
      await applyStartResult(await backendAPI.startLibrarySync(sampleFolder, 'manual'), sampleFolder)
    } catch (cause) {
      console.error('Failed to start library sync:', cause)
      setState({
        status: 'error', rootKey: sampleFolder.id,
        message: cause instanceof Error ? cause.message : 'Unable to start library sync.',
        hasUsableIndex: hasUsableIndexRef.current
      })
    }
  }, [applyStartResult, backendAPI, sampleFolder, state])

  const cancel = useCallback(async () => {
    if (!isActive(state)) return
    await backendAPI.cancelLibrarySync(state.jobId)
  }, [backendAPI, state])

  return { state, dbIndexed, rescan: request, retry: request, cancel }
}
