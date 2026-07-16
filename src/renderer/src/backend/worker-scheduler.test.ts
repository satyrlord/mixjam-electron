import { beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  AnalysisProgress,
  CalibrationProgress,
  LibraryJobIdentity,
  LibrarySyncStartResult
} from '../../../shared/backend-api'
import type { WorkerMessage, WorkerRequest } from './protocol'

interface PendingScan {
  rootKey: string
  resolve: () => void
  reject: (error: Error) => void
}

interface PendingSingleAnalysis {
  sampleId: number
  emit: (progress: Omit<AnalysisProgress, 'identity'>) => void
  resolve: () => void
  reject: (error: Error) => void
}

interface PendingCalibration {
  emit: (progress: Omit<CalibrationProgress, 'identity'>) => void
  resolve: () => void
  reject: (error: Error) => void
}

const mocks = vi.hoisted(() => ({
  pendingScans: [] as PendingScan[],
  pendingSingleAnalyses: [] as PendingSingleAnalysis[],
  pendingCalibrations: [] as PendingCalibration[],
  runScan: vi.fn(),
  runPendingAnalysis: vi.fn(async () => undefined),
  runSingleAnalysis: vi.fn(),
  runUniformFolderCalibration: vi.fn()
}))

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: async () => ({
    installOpfsSAHPoolVfs: async () => ({
      OpfsSAHPoolDb: class {}
    })
  })
}))

vi.mock('./sql', () => ({
  DB: class {}
}))

vi.mock('./schema', () => ({
  initSchema: vi.fn()
}))

vi.mock('./library', () => ({
  ensureUnsortedCategory: vi.fn(),
  getLibraryRootState: vi.fn(),
  listMissingRelpaths: vi.fn(),
  querySamples: vi.fn(),
  listTags: vi.fn(),
  createTag: vi.fn(),
  renameTag: vi.fn(),
  setTagColor: vi.fn(),
  deleteTag: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
  updateSampleAnalysis: vi.fn(),
  scanRootId: vi.fn(() => 1),
  listCalibrationCandidates: vi.fn(() => []),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listLibraries: vi.fn(),
  saveLibrary: vi.fn(),
  deleteLibrary: vi.fn()
}))

vi.mock('./handle-store', () => ({
  loadFolderHandle: vi.fn(async () => ({}))
}))

vi.mock('./folder-access', () => ({
  resolveFileHandle: vi.fn(async () => ({
    getFile: async () => new File([new Uint8Array([1])], 'sample.wav')
  }))
}))

vi.mock('./indexer', () => ({
  runScan: mocks.runScan
}))

vi.mock('./analysis-runner', () => ({
  runPendingAnalysis: mocks.runPendingAnalysis,
  runSingleAnalysis: mocks.runSingleAnalysis,
  runUniformFolderCalibration: mocks.runUniformFolderCalibration
}))

const messages: WorkerMessage[] = []
const workerContext = {
  postMessage: (message: WorkerMessage): void => {
    messages.push(message)
  },
  onmessage: null as ((event: MessageEvent<WorkerRequest>) => void) | null
}

let nextSeq = 1

beforeAll(async () => {
  mocks.runScan.mockImplementation(
    (
      _db: unknown,
      rootKey: string
    ): Promise<{
      rootId: number
      files: ReadonlyMap<string, File>
      lastCompletedAt: number
    }> => new Promise((resolve, reject) => {
      mocks.pendingScans.push({
        rootKey,
        resolve: () => resolve({
          rootId: rootKey.length,
          files: new Map(),
          lastCompletedAt: Date.now()
        }),
        reject
      })
    })
  )
  mocks.runSingleAnalysis.mockImplementation(
    (
      _db: unknown,
      sampleId: number,
      _file: File,
      emit: (progress: Omit<AnalysisProgress, 'identity'>) => void
    ): Promise<void> => new Promise((resolve, reject) => {
      mocks.pendingSingleAnalyses.push({ sampleId, emit, resolve, reject })
    })
  )
  mocks.runUniformFolderCalibration.mockImplementation(
    (
      _db: unknown,
      _rootId: number,
      _files: ReadonlyMap<string, File>,
      emit: (progress: Omit<CalibrationProgress, 'identity'>) => void
    ): Promise<void> => new Promise((resolve, reject) => {
      mocks.pendingCalibrations.push({ emit, resolve, reject })
    })
  )
  vi.stubGlobal('self', workerContext)
  await import('./worker')
  await vi.waitFor(() => expect(workerContext.onmessage).not.toBeNull())
})

async function callStart(
  rootKey: string,
  trigger: 'automatic' | 'manual' | 'mutation'
): Promise<LibrarySyncStartResult> {
  const seq = nextSeq++
  workerContext.onmessage?.({
    data: { seq, op: 'startLibrarySync', args: [rootKey, trigger] }
  } as MessageEvent<WorkerRequest>)
  await vi.waitFor(() => {
    expect(messages.some((message) => message.type === 'response' && message.seq === seq)).toBe(true)
  })
  const response = messages.find(
    (message) => message.type === 'response' && message.seq === seq
  )
  if (!response || response.type !== 'response' || !response.ok) {
    throw new Error('startLibrarySync failed')
  }
  return response.result as LibrarySyncStartResult
}

async function callCancel(jobId: string): Promise<void> {
  const seq = nextSeq++
  workerContext.onmessage?.({
    data: { seq, op: 'cancelLibrarySync', args: [jobId] }
  } as MessageEvent<WorkerRequest>)
  await vi.waitFor(() => {
    expect(messages.some((message) => message.type === 'response' && message.seq === seq)).toBe(true)
  })
}

function sendCall(op: WorkerRequest['op'], args: unknown[]): number {
  const seq = nextSeq++
  workerContext.onmessage?.({
    data: { seq, op, args }
  } as MessageEvent<WorkerRequest>)
  return seq
}

async function waitForResponse(seq: number): Promise<Extract<WorkerMessage, { type: 'response' }>> {
  await vi.waitFor(() => {
    expect(messages.some((message) => message.type === 'response' && message.seq === seq)).toBe(true)
  })
  const response = messages.find(
    (message): message is Extract<WorkerMessage, { type: 'response' }> =>
      message.type === 'response' && message.seq === seq
  )
  if (!response) throw new Error(`Missing response ${seq}`)
  return response
}

async function waitForPendingSingle(
  sampleId: number,
  occurrence = 1
): Promise<PendingSingleAnalysis> {
  await vi.waitFor(() => {
    expect(mocks.pendingSingleAnalyses.filter((job) => job.sampleId === sampleId).length)
      .toBeGreaterThanOrEqual(occurrence)
  })
  return mocks.pendingSingleAnalyses.filter((job) => job.sampleId === sampleId)[occurrence - 1]
}

async function waitForPendingCalibration(occurrence = 1): Promise<PendingCalibration> {
  await vi.waitFor(() => {
    expect(mocks.pendingCalibrations.length).toBeGreaterThanOrEqual(occurrence)
  })
  return mocks.pendingCalibrations[occurrence - 1]
}

async function waitForPending(rootKey: string, occurrence = 1): Promise<PendingScan> {
  await vi.waitFor(() => {
    expect(mocks.pendingScans.filter((scan) => scan.rootKey === rootKey).length)
      .toBeGreaterThanOrEqual(occurrence)
  })
  return mocks.pendingScans.filter((scan) => scan.rootKey === rootKey)[occurrence - 1]
}

async function complete(scan: PendingScan): Promise<void> {
  const identity = scanEvents(scan.rootKey).at(-1)
  if (!identity) throw new Error(`No active scan event for ${scan.rootKey}`)
  scan.resolve()
  await vi.waitFor(() => {
    expect(messages.some(
      (message) =>
        message.type === 'analysis-done' &&
        message.done.identity.jobId === identity.jobId
    )).toBe(true)
  })
}

function scanEvents(rootKey: string): LibraryJobIdentity[] {
  return messages.flatMap((message) =>
    message.type === 'scan-progress' &&
    message.progress.status === 'scanning' &&
    message.progress.identity?.rootKey === rootKey
      ? [message.progress.identity]
      : []
  )
}

describe('worker library scheduler', () => {
  it('coalesces an active automatic request and suppresses it after completion', async () => {
    const first = await callStart('root-coalesce', 'automatic')
    const duplicate = await callStart('root-coalesce', 'automatic')

    expect(first.disposition).toBe('started')
    expect(duplicate).toEqual({
      identity: first.identity,
      disposition: 'coalesced'
    })

    await complete(await waitForPending('root-coalesce'))
    const suppressed = await callStart('root-coalesce', 'automatic')
    expect(suppressed).toEqual({
      identity: first.identity,
      disposition: 'suppressed'
    })
    expect(scanEvents('root-coalesce')).toHaveLength(1)
  })

  it('collapses repeated same-root mutations into one follow-up identity', async () => {
    const active = await callStart('root-dirty', 'automatic')
    const firstMutation = await callStart('root-dirty', 'mutation')
    const duplicateMutation = await callStart('root-dirty', 'mutation')

    expect(active.disposition).toBe('started')
    expect(firstMutation.disposition).toBe('queued')
    expect(duplicateMutation).toEqual(firstMutation)

    await complete(await waitForPending('root-dirty', 1))
    const followUp = await waitForPending('root-dirty', 2)
    expect(scanEvents('root-dirty').at(-1)).toEqual(firstMutation.identity)
    await complete(followUp)
  })

  it('prioritizes a selected root without losing a queued mutation follow-up', async () => {
    const oldRoot = await callStart('root-old', 'automatic')
    const queuedMutation = await callStart('root-old', 'mutation')
    const selected = await callStart('root-selected', 'automatic')

    expect(oldRoot.disposition).toBe('started')
    expect(queuedMutation.disposition).toBe('queued')
    expect(selected.disposition).toBe('started')

    const selectedScan = await waitForPending('root-selected')
    await complete(selectedScan)
    const oldFollowUp = await waitForPending('root-old', 2)
    expect(scanEvents('root-old').at(-1)).toEqual(queuedMutation.identity)
    await complete(oldFollowUp)

    // Resolve the replaced scan last. Its stale completion must not emit done.
    const replaced = await waitForPending('root-old', 1)
    replaced.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const oldDone = messages.filter(
      (message) =>
        message.type === 'analysis-done' &&
        message.done.identity.jobId === oldRoot.identity.jobId
    )
    expect(oldDone).toHaveLength(0)
  })

  it('ignores stale cancellation ids and cancels only the owning job', async () => {
    const active = await callStart('root-cancel', 'automatic')
    const pending = await waitForPending('root-cancel')

    await callCancel('stale-job-id')
    expect(messages.some(
      (message) =>
        message.type === 'scan-progress' &&
        message.progress.status === 'cancelled' &&
        message.progress.identity?.rootKey === 'root-cancel'
    )).toBe(false)

    await callCancel(active.identity.jobId)
    expect(messages.some(
      (message) =>
        message.type === 'scan-progress' &&
        message.progress.status === 'cancelled' &&
        message.progress.identity?.jobId === active.identity.jobId
    )).toBe(true)

    pending.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(messages.some(
      (message) =>
        message.type === 'analysis-done' &&
        message.done.identity.jobId === active.identity.jobId
    )).toBe(false)

    const retry = await callStart('root-cancel', 'automatic')
    expect(retry.disposition).toBe('started')
    expect(retry.identity.jobId).not.toBe(active.identity.jobId)
    await complete(await waitForPending('root-cancel', 2))
  })

  it('does not suppress an automatic retry after a failed first job', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failed = await callStart('root-failure', 'automatic')
    const firstPending = await waitForPending('root-failure')
    firstPending.reject(new Error('temporary read failure'))
    await vi.waitFor(() => {
      expect(messages.some(
        (message) =>
          message.type === 'scan-progress' &&
          message.progress.status === 'error' &&
          message.progress.identity?.jobId === failed.identity.jobId
      )).toBe(true)
    })

    const retry = await callStart('root-failure', 'automatic')
    expect(retry.disposition).toBe('started')
    expect(retry.identity.jobId).not.toBe(failed.identity.jobId)
    await complete(await waitForPending('root-failure', 2))
    consoleError.mockRestore()
  })

  it('keeps a single-sample request pending until typed completion', async () => {
    const seq = sendCall('reanalyzeSample', ['root-single-success', 101, 'one.wav'])
    const pending = await waitForPendingSingle(101)

    expect(messages.some((message) => message.type === 'response' && message.seq === seq))
      .toBe(false)

    pending.emit({ status: 'analyzing', analyzed: 1, total: 1 })
    const progressEvent = messages.filter((message) => {
      if (message.type !== 'analysis-progress') return false
      const { identity } = message.progress
      return identity !== null && 'sampleId' in identity && identity.sampleId === 101
    }).at(-1)
    expect(progressEvent).toMatchObject({
      type: 'analysis-progress',
      progress: {
        identity: { rootKey: 'root-single-success', sampleId: 101 },
        status: 'analyzing',
        analyzed: 1,
        total: 1
      }
    })

    pending.resolve()
    const response = await waitForResponse(seq)
    expect(response).toMatchObject({
      ok: true,
      result: {
        identity: { rootKey: 'root-single-success', sampleId: 101 }
      }
    })
    if (!response.ok) throw new Error(response.error)
    const result = response.result as { identity: { jobId: string } }
    expect(messages).toContainEqual({
      type: 'analysis-done',
      done: {
        identity: {
          rootKey: 'root-single-success',
          sampleId: 101,
          jobId: result.identity.jobId
        }
      }
    })
  })

  it('rejects a single-sample request with its observable typed error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const seq = sendCall('reanalyzeSample', ['root-single-error', 202, 'broken.wav'])
    const pending = await waitForPendingSingle(202)
    pending.reject(new Error('decode failed'))

    const response = await waitForResponse(seq)
    expect(response).toEqual({
      type: 'response',
      seq,
      ok: false,
      error: 'decode failed'
    })
    expect(messages).toContainEqual({
      type: 'analysis-progress',
      progress: expect.objectContaining({
        identity: expect.objectContaining({
          rootKey: 'root-single-error',
          sampleId: 202
        }),
        status: 'error',
        error: 'decode failed'
      })
    })
    consoleError.mockRestore()
  })

  it('queues an automatic selected-root sync behind individual analysis', async () => {
    const singleSeq = sendCall('reanalyzeSample', ['root-active-analysis', 250, 'active.wav'])
    const pendingSingle = await waitForPendingSingle(250)

    const queued = await waitForResponse(
      sendCall('startLibrarySync', ['root-selected-next', 'automatic'])
    )
    expect(queued).toMatchObject({
      ok: true,
      result: {
        disposition: 'queued',
        identity: {
          rootKey: 'root-selected-next',
          trigger: 'automatic'
        }
      }
    })

    pendingSingle.resolve()
    await waitForResponse(singleSeq)
    const pendingSync = await waitForPending('root-selected-next')
    expect(scanEvents('root-selected-next').at(-1)?.trigger).toBe('automatic')
    await complete(pendingSync)
  })

  it('serializes single analysis with sync and calibration in both start orders', async () => {
    const singleSeq = sendCall('reanalyzeSample', ['root-serialized', 303, 'active.wav'])
    const pendingSingle = await waitForPendingSingle(303)

    const blockedCalibration = await waitForResponse(
      sendCall('startUniformFolderCalibration', ['root-serialized'])
    )
    expect(blockedCalibration).toMatchObject({
      ok: false,
      error: 'Wait for the current sample analysis to finish'
    })
    const blockedSync = await waitForResponse(
      sendCall('startLibrarySync', ['root-serialized', 'manual'])
    )
    expect(blockedSync).toMatchObject({
      ok: false,
      error: 'Wait for the current sample analysis to finish'
    })

    const queuedMutation = await waitForResponse(
      sendCall('startLibrarySync', ['root-serialized', 'mutation'])
    )
    expect(queuedMutation).toMatchObject({
      ok: true,
      result: { disposition: 'queued' }
    })

    pendingSingle.resolve()
    await waitForResponse(singleSeq)
    await complete(await waitForPending('root-serialized'))

    const calibrationResponse = await waitForResponse(
      sendCall('startUniformFolderCalibration', ['root-calibration-first'])
    )
    if (!calibrationResponse.ok) throw new Error(calibrationResponse.error)
    const calibration = calibrationResponse.result as { jobId: string }
    const pendingCalibration = await waitForPendingCalibration()

    const blockedSingle = await waitForResponse(
      sendCall('reanalyzeSample', ['root-calibration-first', 304, 'blocked.wav'])
    )
    expect(blockedSingle).toMatchObject({
      ok: false,
      error: 'Wait for the current sync or analysis to finish'
    })

    await waitForResponse(
      sendCall('cancelUniformFolderCalibration', [calibration.jobId])
    )
    pendingCalibration.resolve()

    const retrySeq = sendCall('reanalyzeSample', ['root-calibration-first', 304, 'retry.wav'])
    const retry = await waitForPendingSingle(304)
    retry.resolve()
    expect(await waitForResponse(retrySeq)).toMatchObject({ ok: true })
  })
})
