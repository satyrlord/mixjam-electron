import type {
  AnalysisDone,
  AnalysisProgress,
  LibraryScanDone,
  MixJamGeneratorProgress,
  ScanProgress
} from '../../../shared/backend-api'
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
  ): Promise<Awaited<ReturnType<BackendCalls[Op]>>>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
  onScanDone(listener: (done: LibraryScanDone) => void): () => void
  onAnalysisProgress(listener: (progress: AnalysisProgress) => void): () => void
  onAnalysisDone(listener: (done: AnalysisDone) => void): () => void
  onGeneratorProgress(listener: (progress: MixJamGeneratorProgress) => void): () => void
  dispose(): void
}

export function createWorkerProxy(worker: WorkerLike): WorkerProxy {
  let nextSeq = 1
  let stoppedError: Error | null = null
  const pending = new Map<number, Pending>()
  const progressListeners = new Set<(progress: ScanProgress) => void>()
  const doneListeners = new Set<(done: LibraryScanDone) => void>()
  const analysisProgressListeners = new Set<(progress: AnalysisProgress) => void>()
  const analysisDoneListeners = new Set<(done: AnalysisDone) => void>()
  const generatorProgressListeners = new Set<(progress: MixJamGeneratorProgress) => void>()

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
    generatorProgressListeners.clear()
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
      for (const listener of doneListeners) listener(message.done)
      return
    }
    if (message.type === 'analysis-progress') {
      for (const listener of analysisProgressListeners) listener(message.progress)
      return
    }
    if (message.type === 'analysis-done') {
      for (const listener of analysisDoneListeners) listener(message.done)
      return
    }
    if (message.type === 'generator-progress') {
      for (const listener of generatorProgressListeners) listener(message.progress)
    }
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
    onGeneratorProgress(listener) {
      if (!stoppedError) generatorProgressListeners.add(listener)
      return () => generatorProgressListeners.delete(listener)
    },
    dispose() {
      stop(new Error('Backend worker disposed'))
    }
  }
}
