import { describe, expect, it, vi } from 'vitest'
import type { ScanProgress } from '../../../shared/backend-api'
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

  it('forwards and logs fatal scan details from the worker', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const listener = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    proxy.onScanProgress(listener)
    const progress: ScanProgress = {
      status: 'error',
      phase: 2,
      found: 10,
      processed: 7,
      total: 10,
      error: 'database is full'
    }

    worker.emit({ type: 'scan-progress', progress })

    expect(listener).toHaveBeenCalledWith(progress)
    expect(consoleError).toHaveBeenCalledWith('Scan failed:', 'database is full')
    consoleError.mockRestore()
  })

  it('fans out events and supports unsubscribe', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const progress = vi.fn()
    const done = vi.fn()
    const analysisProgress = vi.fn()
    const analysisDone = vi.fn()
    const unsubscribe = proxy.onScanProgress(progress)
    proxy.onScanDone(done)
    proxy.onAnalysisProgress(analysisProgress)
    proxy.onAnalysisDone(analysisDone)
    const value: ScanProgress = {
      status: 'scanning', phase: 1, found: 4, processed: 2, total: 4
    }

    worker.emit({ type: 'scan-progress', progress: value })
    worker.emit({ type: 'scan-done' })
    worker.emit({ type: 'analysis-progress', progress: { status: 'analyzing', analyzed: 2, total: 4 } })
    worker.emit({ type: 'analysis-done' })
    unsubscribe()
    worker.emit({ type: 'scan-progress', progress: value })

    expect(progress).toHaveBeenCalledOnce()
    expect(progress).toHaveBeenCalledWith(value)
    expect(done).toHaveBeenCalledOnce()
    expect(analysisProgress).toHaveBeenCalledWith({ status: 'analyzing', analyzed: 2, total: 4 })
    expect(analysisDone).toHaveBeenCalledOnce()
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

  it('logs analysis error without explicit detail via fallback message', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const listener = vi.fn()
    proxy.onAnalysisProgress(listener)

    worker.emit({ type: 'analysis-progress', progress: { status: 'error', analyzed: 0, total: 0 } })

    expect(consoleError).toHaveBeenCalledWith('Analysis failed:', 'Unknown backend error')
    consoleError.mockRestore()
  })

  it('logs scan error without explicit detail via fallback message', () => {
    const worker = new FakeWorker()
    const proxy = createWorkerProxy(worker)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const listener = vi.fn()
    proxy.onScanProgress(listener)

    worker.emit({ type: 'scan-progress', progress: { status: 'error', phase: null, found: 0, processed: 0, total: 0 } })

    expect(consoleError).toHaveBeenCalledWith('Scan failed:', 'Unknown backend error')
    consoleError.mockRestore()
  })
})
