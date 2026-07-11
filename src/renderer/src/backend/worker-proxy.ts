import type { AnalysisProgress, ScanProgress } from '../../../shared/backend-api'
import type { BackendCalls, BackendOp, WorkerMessage, WorkerRequest } from './protocol'

interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: WorkerRequest): void
  terminate(): void
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

export interface WorkerProxy {
  call<Op extends BackendOp>(
    op: Op,
    ...args: Parameters<BackendCalls[Op]>
  ): Promise<ReturnType<BackendCalls[Op]>>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onScanDone(listener: () => void): () => void
  onAnalysisProgress(listener: (progress: AnalysisProgress) => void): () => void
  onAnalysisDone(listener: () => void): () => void
  dispose(): void
}

export function createWorkerProxy(worker: WorkerLike): WorkerProxy {
  let nextSeq = 1
  let stoppedError: Error | null = null
  const pending = new Map<number, Pending>()
  const progressListeners = new Set<(progress: ScanProgress) => void>()
  const doneListeners = new Set<() => void>()
  const analysisProgressListeners = new Set<(progress: AnalysisProgress) => void>()
  const analysisDoneListeners = new Set<() => void>()

  function stop(error: Error): void {
    if (stoppedError) return
    stoppedError = error
    worker.onmessage = null
    worker.onerror = null
    worker.terminate()
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
    progressListeners.clear()
    doneListeners.clear()
    analysisProgressListeners.clear()
    analysisDoneListeners.clear()
  }

  worker.onmessage = (event) => {
    const message = event.data
    if (message.type === 'response') {
      const entry = pending.get(message.seq)
      if (!entry) return
      pending.delete(message.seq)
      if (message.ok) entry.resolve(message.result)
      else entry.reject(new Error(message.error))
      return
    }
    if (message.type === 'scan-progress') {
      for (const listener of progressListeners) listener(message.progress)
      return
    }
    if (message.type === 'scan-done') {
      for (const listener of doneListeners) listener()
      return
    }
    if (message.type === 'analysis-progress') {
      for (const listener of analysisProgressListeners) listener(message.progress)
      return
    }
    for (const listener of analysisDoneListeners) listener()
  }

  worker.onerror = (event) => {
    const error = new Error(event.message || 'Backend worker failed')
    console.error('Backend worker error:', error.message)
    stop(error)
  }

  return {
    call(op, ...args) {
      if (stoppedError) return Promise.reject(stoppedError)
      return new Promise((resolve, reject) => {
        const seq = nextSeq++
        pending.set(seq, { resolve: resolve as (value: unknown) => void, reject })
        worker.postMessage({ seq, op, args })
      })
    },
    onScanProgress(listener) {
      if (!stoppedError) progressListeners.add(listener)
      return () => progressListeners.delete(listener)
    },
    onScanDone(listener) {
      if (!stoppedError) doneListeners.add(listener)
      return () => doneListeners.delete(listener)
    },
    onAnalysisProgress(listener) {
      if (!stoppedError) analysisProgressListeners.add(listener)
      return () => analysisProgressListeners.delete(listener)
    },
    onAnalysisDone(listener) {
      if (!stoppedError) analysisDoneListeners.add(listener)
      return () => analysisDoneListeners.delete(listener)
    },
    dispose() {
      stop(new Error('Backend worker disposed'))
    }
  }
}
