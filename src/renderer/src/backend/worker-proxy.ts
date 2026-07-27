import type {
  AnalysisDone,
  AnalysisProgress,
  LibraryScanDone,
  MixJamGeneratorProgress,
  ScanProgress
} from '../../../shared/backend-api'
import type { BackendCalls, BackendOp, WorkerEvent, WorkerMessage, WorkerRequest } from './protocol'

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
  type EventListener = (event: WorkerEvent) => void
  const eventListeners = new Map<WorkerEvent['type'], Set<EventListener>>()

  function subscribe<T extends WorkerEvent['type']>(
    type: T,
    listener: (event: Extract<WorkerEvent, { type: T }>) => void
  ): () => void {
    const listeners = eventListeners.get(type) ?? new Set<EventListener>()
    eventListeners.set(type, listeners)
    const adapted = listener as EventListener
    if (!stoppedError) listeners.add(adapted)
    return () => listeners.delete(adapted)
  }

  function stop(error: Error): void {
    if (stoppedError) return
    stoppedError = error
    worker.onmessage = null
    worker.onerror = null
    worker.terminate()
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
    eventListeners.clear()
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
    for (const listener of eventListeners.get(message.type) ?? []) listener(message)
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
      return subscribe('scan-progress', (event) => listener(event.progress))
    },
    onScanDone(listener) {
      return subscribe('scan-done', (event) => listener(event.done))
    },
    onAnalysisProgress(listener) {
      return subscribe('analysis-progress', (event) => listener(event.progress))
    },
    onAnalysisDone(listener) {
      return subscribe('analysis-done', (event) => listener(event.done))
    },
    onGeneratorProgress(listener) {
      return subscribe('generator-progress', (event) => listener(event.progress))
    },
    dispose() {
      stop(new Error('Backend worker disposed'))
    }
  }
}
