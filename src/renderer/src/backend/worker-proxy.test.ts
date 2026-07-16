import { describe, expect, it, vi } from 'vitest'
import type {
  AnalysisProgress,
  CalibrationProgress,
  LibraryJobIdentity,
  ScanProgress
} from '../../../shared/backend-api'
import type { WorkerMessage, WorkerRequest } from './protocol'
import { createWorkerProxy } from './worker-proxy'

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  posted: WorkerRequest[] = []
  terminate = vi.fn()

  postMessage(message: WorkerRequest): void {
    this.posted.push(message)
  }

  emit(message: WorkerMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerMessage>)
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent)
  }
}

const IDENTITY: LibraryJobIdentity = {
  rootKey: 'root-test',
  jobId: 'sync-1',
  trigger: 'automatic'
}

describe('worker proxy', () => {
  it('correlates responses with requests', async () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const first = proxy.call('listTags')
    const second = proxy.call('createTag', 'Drums', '#fff')

    expect(worker.posted).toEqual([
      { seq: 1, op: 'listTags', args: [] },
      { seq: 2, op: 'createTag', args: ['Drums', '#fff'] }
    ])
    worker.emit({ type: 'response', seq: 2, ok: true, result: { id: 7 } })
    worker.emit({ type: 'response', seq: 1, ok: true, result: [] })

    await expect(first).resolves.toEqual([])
    await expect(second).resolves.toEqual({ id: 7 })
  })

  it('rejects an unsuccessful response', async () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const result = proxy.call('deleteTag', 3)
    worker.emit({ type: 'response', seq: 1, ok: false, error: 'not found' })
    await expect(result).rejects.toThrow('not found')
  })

  it('forwards fatal scan details from the worker', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const listener = vi.fn()
    proxy.onScanProgress(listener)
    const progress: ScanProgress = {
      identity: IDENTITY,
      status: 'error',
      phase: 2,
      found: 10,
      processed: 7,
      total: 10,
      error: 'database is full'
    }

    worker.emit({ type: 'scan-progress', progress })

    expect(listener).toHaveBeenCalledWith(progress)
  })

  it('fans out events and supports unsubscribe', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const progress = vi.fn()
    const done = vi.fn()
    const analysisProgress = vi.fn()
    const analysisDone = vi.fn()
    const calibrationProgress = vi.fn()
    const calibrationDone = vi.fn()
    const unsubscribe = proxy.onScanProgress(progress)
    proxy.onScanDone(done)
    proxy.onAnalysisProgress(analysisProgress)
    proxy.onAnalysisDone(analysisDone)
    proxy.onCalibrationProgress(calibrationProgress)
    proxy.onCalibrationDone(calibrationDone)
    const value: ScanProgress = {
      identity: IDENTITY,
      status: 'scanning', phase: 1, found: 4, processed: 2, total: 4
    }
    const calibrationValue: CalibrationProgress = {
      identity: { rootKey: 'root-test', jobId: 'calibration-1' },
      status: 'calibrating',
      analyzed: 1,
      total: 4
    }

    worker.emit({ type: 'scan-progress', progress: value })
    worker.emit({
      type: 'scan-done',
      done: { identity: IDENTITY, lastCompletedAt: 1234 }
    })
    worker.emit({
      type: 'analysis-progress',
      progress: { identity: IDENTITY, status: 'analyzing', analyzed: 2, total: 4 }
    })
    worker.emit({ type: 'analysis-done', done: { identity: IDENTITY } })
    worker.emit({ type: 'calibration-progress', progress: calibrationValue })
    worker.emit({
      type: 'calibration-done',
      done: { identity: calibrationValue.identity! }
    })
    unsubscribe()
    worker.emit({ type: 'scan-progress', progress: value })

    expect(progress).toHaveBeenCalledOnce()
    expect(progress).toHaveBeenCalledWith(value)
    expect(done).toHaveBeenCalledWith({ identity: IDENTITY, lastCompletedAt: 1234 })
    expect(analysisProgress).toHaveBeenCalledWith({
      identity: IDENTITY,
      status: 'analyzing',
      analyzed: 2,
      total: 4
    })
    expect(analysisDone).toHaveBeenCalledWith({ identity: IDENTITY })
    expect(calibrationProgress).toHaveBeenCalledWith(calibrationValue)
    expect(calibrationDone).toHaveBeenCalledWith({ identity: calibrationValue.identity })
  })

  it('rejects pending and future calls after a fatal worker error', async () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pending = proxy.call('listTags')

    worker.fail('database crashed')

    await expect(pending).rejects.toThrow('database crashed')
    await expect(proxy.call('listTags')).rejects.toThrow('database crashed')
    expect(worker.terminate).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })

  it('terminates and rejects pending calls on disposal', async () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const pending = proxy.call('listTags')

    proxy.dispose()

    await expect(pending).rejects.toThrow('Backend worker disposed')
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
    expect(worker.onerror).toBeNull()
  })

  it('makes repeated disposal and post-disposal subscriptions inert', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const progress = vi.fn()
    const done = vi.fn()

    proxy.dispose()
    proxy.dispose()
    const unsubscribeProgress = proxy.onScanProgress(progress)
    const unsubscribeDone = proxy.onScanDone(done)
    unsubscribeProgress()
    unsubscribeDone()

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(progress).not.toHaveBeenCalled()
    expect(done).not.toHaveBeenCalled()
  })

  it('forwards analysis error without explicit detail via fallback message', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const listener = vi.fn()
    proxy.onAnalysisProgress(listener)

    const progress: AnalysisProgress = {
      identity: IDENTITY,
      status: 'error',
      analyzed: 0,
      total: 0
    }
    worker.emit({ type: 'analysis-progress', progress })

    expect(listener).toHaveBeenCalledWith(progress)
  })

  it('forwards scan error without explicit detail via fallback message', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const listener = vi.fn()
    proxy.onScanProgress(listener)

    const progress: ScanProgress = {
      identity: IDENTITY,
      status: 'error',
      phase: null,
      found: 0,
      processed: 0,
      total: 0
    }
    worker.emit({ type: 'scan-progress', progress })

    expect(listener).toHaveBeenCalledWith(progress)
  })
})
