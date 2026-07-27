import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendJobCoordinator } from './job-coordinator'
import type { WorkerMessage, WorkerRequest } from './protocol'

const mocks = vi.hoisted(() => ({
  initSchema: vi.fn(),
  querySamples: vi.fn((_db: unknown, request: unknown) => ({ request })),
  updateSampleAnalysis: vi.fn(),
  jobs: {
    getGeneratorReadiness: vi.fn(() => ({ status: 'ready' as const })),
    planMixJam: vi.fn(),
    cancelMixJamPlanning: vi.fn(),
    getGeneratorProgress: vi.fn(() => ({ identity: null, status: 'idle' as const, phase: null, completed: 0, total: 0 })),
    startLibrarySync: vi.fn((rootKey: string, trigger: string) => ({
      identity: { rootKey, trigger, jobId: 'sync-1' },
      disposition: 'started' as const
    })),
    cancelLibrarySync: vi.fn(),
    getScanProgress: vi.fn(() => ({ identity: null, status: 'idle' as const })),
    getAnalysisProgress: vi.fn(() => ({ identity: null, status: 'idle' as const })),
    reanalyzeSample: vi.fn()
  },
  emitEvent: null as null | ((message: WorkerMessage) => void)
}))

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: async () => ({
    installOpfsSAHPoolVfs: async () => ({ OpfsSAHPoolDb: class {} })
  })
}))

vi.mock('./sql', () => ({ DB: class {} }))
vi.mock('./schema', () => ({ initSchema: mocks.initSchema }))
vi.mock('./analysis-persistence', () => ({ updateSampleAnalysis: mocks.updateSampleAnalysis }))
vi.mock('./browser-library-persistence', () => ({
  querySamples: mocks.querySamples,
  listMissingRelpaths: vi.fn(),
  listTags: vi.fn(),
  createTag: vi.fn(),
  renameTag: vi.fn(),
  setTagColor: vi.fn(),
  deleteTag: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
  listLibraries: vi.fn(),
  saveLibrary: vi.fn(),
  deleteLibrary: vi.fn()
}))
vi.mock('./indexed-sample-persistence', () => ({ getLibraryRootState: vi.fn() }))
vi.mock('./job-coordinator', () => ({
  createBackendJobCoordinator: (_db: unknown, emitEvent: (message: WorkerMessage) => void) => {
    mocks.emitEvent = emitEvent
    return mocks.jobs as unknown as BackendJobCoordinator
  }
}))

const messages: WorkerMessage[] = []
const workerContext = {
  postMessage: (message: WorkerMessage): void => { messages.push(message) },
  onmessage: null as ((event: MessageEvent<WorkerRequest>) => void) | null
}
let nextSeq = 1

beforeAll(async () => {
  vi.stubGlobal('self', workerContext)
  await import('./worker')
  await vi.waitFor(() => expect(workerContext.onmessage).not.toBeNull())
})

beforeEach(() => {
  messages.length = 0
  vi.clearAllMocks()
})

function send(op: WorkerRequest['op'] | string, args: unknown[]): number {
  const seq = nextSeq++
  workerContext.onmessage?.({ data: { seq, op, args } } as MessageEvent<WorkerRequest>)
  return seq
}

async function response(seq: number): Promise<Extract<WorkerMessage, { type: 'response' }>> {
  await vi.waitFor(() => expect(messages.some(
    (message) => message.type === 'response' && message.seq === seq
  )).toBe(true))
  return messages.find(
    (message): message is Extract<WorkerMessage, { type: 'response' }> =>
      message.type === 'response' && message.seq === seq
  )!
}

describe('backend worker transport', () => {
  it('serves coordinator calls after initialization', async () => {
    expect(await response(send('getGeneratorReadiness', ['root-a']))).toMatchObject({
      ok: true,
      result: { status: 'ready' }
    })
  })

  it('dispatches persistence and job operations with their arguments', async () => {
    const query = { rootId: 'root-a', limit: 25 }
    expect(await response(send('querySamples', [query]))).toMatchObject({
      ok: true,
      result: { request: query }
    })
    expect(mocks.querySamples).toHaveBeenCalledTimes(1)

    expect(await response(send('startLibrarySync', ['root-a', 'manual']))).toMatchObject({
      ok: true,
      result: { disposition: 'started', identity: { rootKey: 'root-a', trigger: 'manual' } }
    })
    expect(mocks.jobs.startLibrarySync).toHaveBeenCalledWith('root-a', 'manual')
  })

  it('rejects unknown operations and serializes thrown errors', async () => {
    expect(await response(send('not-allowed', []))).toMatchObject({
      ok: false,
      error: 'Unknown backend op: not-allowed'
    })

    mocks.updateSampleAnalysis.mockImplementationOnce(() => { throw new Error('invalid patch') })
    expect(await response(send('updateSampleAnalysis', [1, {}]))).toMatchObject({
      ok: false,
      error: 'invalid patch'
    })
  })

  it('forwards coordinator events without translating their payload', () => {
    const event: WorkerMessage = {
      type: 'scan-progress',
      progress: { identity: null, status: 'idle' }
    }
    mocks.emitEvent?.(event)
    expect(messages).toContainEqual(event)
  })
})
