import { beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  AnalysisProgress,
  LibraryJobIdentity,
  LibrarySyncStartResult,
  ScanProgress
} from '../../../shared/backend-api'
import type { WorkerMessage, WorkerRequest } from './protocol'

interface PendingScan {
  rootKey: string
  emit: (progress: Omit<ScanProgress, 'identity'>) => void
  resolve: (lastCompletedAt?: number | null) => void
  reject: (error: unknown) => void
}

interface PendingSingleAnalysis {
  sampleId: number
  emit: (progress: Omit<AnalysisProgress, 'identity'>) => void
  resolve: () => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  pendingScans: [] as PendingScan[],
  pendingSingleAnalyses: [] as PendingSingleAnalysis[],
  pendingGeneratorFingerprints: [] as Array<() => void>,
  runScan: vi.fn(),
  runPendingAnalysis: vi.fn<(
    db: unknown,
    rootId: number,
    files: ReadonlyMap<string, File>,
    emit: (progress: Omit<AnalysisProgress, 'identity'>) => void,
    isCurrent: () => boolean
  ) => Promise<void>>(async () => undefined),
  runSingleAnalysis: vi.fn(),
  loadFolderHandle: vi.fn<(key: string) => Promise<FileSystemDirectoryHandle | null>>(async () => ({} as FileSystemDirectoryHandle)),
  resolveFileHandle: vi.fn<(root: FileSystemDirectoryHandle, relpath: string) => Promise<FileSystemFileHandle | null>>(async () => ({
    getFile: async () => new File([new Uint8Array([1])], 'sample.wav')
  } as FileSystemFileHandle)),
  getStoredGeneratorReadiness: vi.fn(() => ({ status: 'ready' as const })),
  analyzeGeneratorCandidates: vi.fn<(
    root: FileSystemDirectoryHandle,
    candidates: unknown[],
    parameters: unknown,
    emit: (progress: { phase: 'analyzing' | 'shortlisting'; completed: number; total: number }) => void,
    isCurrent: () => boolean
  ) => Promise<never[]>>(async () => []),
  createMixJamGeneratorPlan: vi.fn(() => ({ lanes: [] }))
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

vi.mock('./indexed-sample-persistence', () => ({
  ensureUnsortedCategory: vi.fn(),
  getLibraryRootState: vi.fn()
}))

vi.mock('./analysis-persistence', () => ({
  updateSampleAnalysis: vi.fn()
}))

vi.mock('./browser-library-persistence', () => ({
  listMissingRelpaths: vi.fn(),
  querySamples: vi.fn(),
  listTags: vi.fn(),
  createTag: vi.fn(),
  renameTag: vi.fn(),
  setTagColor: vi.fn(),
  deleteTag: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listLibraries: vi.fn(),
  saveLibrary: vi.fn(),
  deleteLibrary: vi.fn()
}))

vi.mock('./handle-store', () => ({
  loadFolderHandle: mocks.loadFolderHandle
}))

vi.mock('./folder-access', () => ({
  requireFolderForAutomaticAccess: async (rootKey: string) => {
    const handle = await mocks.loadFolderHandle(rootKey)
    if (!handle) throw new Error('Access to the Sample Folder is required.')
    return handle
  },
  resolveFileHandle: mocks.resolveFileHandle
}))

vi.mock('./indexer', () => ({
  runScan: mocks.runScan
}))

vi.mock('./analysis-runner', () => ({
  runPendingAnalysis: mocks.runPendingAnalysis,
  runSingleAnalysis: mocks.runSingleAnalysis
}))

vi.mock('./generator-library', () => ({
  getStoredGeneratorReadiness: mocks.getStoredGeneratorReadiness,
  loadGeneratorSnapshot: vi.fn(() => ({ candidates: [] })),
  selectGeneratorAnalysisGroup: vi.fn((snapshot, parameters) => ({
    candidates: snapshot.candidates,
    parameters,
    detectedBpm: 120
  })),
  fingerprintGeneratorSnapshot: vi.fn(() => new Promise<string>((resolve) => {
    mocks.pendingGeneratorFingerprints.push(() => resolve('fingerprint'))
  }))
}))

vi.mock('./generator-analysis', () => ({
  analyzeGeneratorCandidates: mocks.analyzeGeneratorCandidates
}))

vi.mock('./generator-engine', () => ({
  createMixJamGeneratorPlan: mocks.createMixJamGeneratorPlan
}))

vi.mock('./generator-parameters', () => ({
  validateMixJamGeneratorParameters: vi.fn()
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
      rootKey: string,
      _handle: unknown,
      emit: (progress: Omit<ScanProgress, 'identity'>) => void
    ): Promise<{
      rootId: number
      files: ReadonlyMap<string, File>
      lastCompletedAt: number | null
    }> => new Promise((resolve, reject) => {
      mocks.pendingScans.push({
        rootKey,
        emit,
        resolve: (lastCompletedAt = Date.now()) => resolve({
          rootId: rootKey.length,
          files: new Map(),
          lastCompletedAt
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
  it('reports readiness from storage while idle and preparing while work owns the root', async () => {
    expect(await waitForResponse(sendCall('getGeneratorReadiness', ['root-readiness']))).toMatchObject({
      ok: true,
      result: { status: 'ready' }
    })

    const started = await callStart('root-readiness', 'manual')
    expect(await waitForResponse(sendCall('getGeneratorReadiness', ['root-readiness']))).toMatchObject({
      ok: true,
      result: { status: 'preparing' }
    })
    await callCancel(started.identity.jobId)
    await waitForPending('root-readiness')
  })

  it('forwards scan and analysis progress and keeps analysis failure observable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.runPendingAnalysis.mockImplementationOnce(async (
      _db: unknown,
      _rootId: number,
      _files: ReadonlyMap<string, File>,
      emit: (progress: Omit<AnalysisProgress, 'identity'>) => void
    ) => {
      emit({ status: 'analyzing', analyzed: 1, total: 2 })
      throw 'analysis failed'
    })
    await callStart('root-progress', 'manual')
    const pending = await waitForPending('root-progress')
    pending.emit({ status: 'scanning', phase: 2, found: 4, processed: 2, total: 4 })
    pending.resolve()
    await vi.waitFor(() => expect(messages).toContainEqual({
      type: 'analysis-progress',
      progress: expect.objectContaining({ status: 'error', error: 'analysis failed' })
    }))
    expect(messages).toContainEqual({
      type: 'scan-progress',
      progress: expect.objectContaining({ phase: 2, found: 4, processed: 2 })
    })
    consoleError.mockRestore()
  })

  it('surfaces missing sync handles and non-Error scan failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.loadFolderHandle.mockResolvedValueOnce(null)
    const missing = await callStart('root-no-handle', 'manual')
    await vi.waitFor(() => expect(messages).toContainEqual({
      type: 'scan-progress',
      progress: expect.objectContaining({ identity: missing.identity, status: 'error' })
    }))

    const failed = await callStart('root-string-error', 'manual')
    ;(await waitForPending('root-string-error')).reject('scan failed')
    await vi.waitFor(() => expect(messages).toContainEqual({
      type: 'scan-progress',
      progress: expect.objectContaining({ identity: failed.identity, error: 'scan failed' })
    }))
    consoleError.mockRestore()
  })

  it('starts a standalone mutation and can remove a queued mutation by identity', async () => {
    const standalone = await callStart('root-standalone-mutation', 'mutation')
    expect(standalone.disposition).toBe('started')
    const queued = await callStart('root-queued-cancel', 'mutation')
    expect(queued.disposition).toBe('queued')
    await callCancel(queued.identity.jobId)
    await complete(await waitForPending('root-standalone-mutation'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.pendingScans.some((scan) => scan.rootKey === 'root-queued-cancel')).toBe(false)
  })

  it('coalesces a manual request onto an active same-root sync', async () => {
    const active = await callStart('root-manual-coalesce', 'automatic')
    expect(await callStart('root-manual-coalesce', 'manual')).toEqual({
      identity: active.identity,
      disposition: 'coalesced'
    })
    await complete(await waitForPending('root-manual-coalesce'))
  })

  it('surfaces missing roots and files during individual analysis', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.loadFolderHandle.mockResolvedValueOnce(null)
    expect(await waitForResponse(
      sendCall('reanalyzeSample', ['single-no-root', 800, 'missing.wav'])
    )).toMatchObject({ ok: false, error: 'Access to the Sample Folder is required.' })

    mocks.resolveFileHandle.mockResolvedValueOnce(null)
    expect(await waitForResponse(
      sendCall('reanalyzeSample', ['single-no-file', 801, 'missing.wav'])
    )).toMatchObject({ ok: false, error: 'Sample is not readable: missing.wav' })
    consoleError.mockRestore()
  })

  it('covers successful generator progress plus validation and fingerprint failures', async () => {
    const parameters = { profileId: 'techno', bpmMode: 'fixed', bpm: 120, intensity: 'medium', durationSeconds: 60, seed: 'coverage' }
    expect(await waitForResponse(
      sendCall('planMixJam', ['root-generator', 'bad job id', parameters])
    )).toMatchObject({ ok: false, error: 'The generator job ID is invalid.' })

    mocks.analyzeGeneratorCandidates.mockImplementationOnce(async (
      _root: FileSystemDirectoryHandle,
      _candidates: unknown[],
      _parameters: unknown,
      emit: (progress: { phase: 'analyzing' | 'shortlisting'; completed: number; total: number }) => void
    ) => {
      emit({ phase: 'shortlisting', completed: 1, total: 2 })
      emit({ phase: 'analyzing', completed: 2, total: 2 })
      return []
    })
    const successSeq = sendCall('planMixJam', ['root-generator', 'generator-success', parameters, 'fingerprint'])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints.length).toBeGreaterThan(0))
    mocks.pendingGeneratorFingerprints.shift()?.()
    expect(await waitForResponse(successSeq)).toMatchObject({ ok: true })
    expect(await waitForResponse(sendCall('getGeneratorProgress', []))).toMatchObject({
      ok: true,
      result: { status: 'idle' }
    })

    const mismatchSeq = sendCall('planMixJam', ['root-generator', 'generator-mismatch', parameters, 'different'])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints.length).toBeGreaterThan(0))
    mocks.pendingGeneratorFingerprints.shift()?.()
    expect(await waitForResponse(mismatchSeq)).toMatchObject({
      ok: false,
      error: 'The Sample Folder has changed since this project was generated.'
    })
  })

  it('blocks competing work during generation and reports generator setup failures', async () => {
    const parameters = { profileId: 'techno', bpmMode: 'fixed', bpm: 120, intensity: 'medium', durationSeconds: 60, seed: 'coverage' }
    const activeSeq = sendCall('planMixJam', ['root-generator-blocking', 'generator-blocking', parameters])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints.length).toBeGreaterThan(0))
    expect(await waitForResponse(
      sendCall('reanalyzeSample', ['root-generator-blocking', 900, 'sample.wav'])
    )).toMatchObject({ ok: false, error: 'Wait for MixJam generation to finish.' })
    await waitForResponse(sendCall('cancelMixJamPlanning', ['generator-blocking']))
    mocks.pendingGeneratorFingerprints.shift()?.()
    await waitForResponse(activeSeq)
    await waitForResponse(sendCall('cancelMixJamPlanning', ['already-finished']))

    mocks.loadFolderHandle.mockResolvedValueOnce(null)
    const missingSeq = sendCall('planMixJam', ['root-generator-missing', 'generator-missing', parameters])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints.length).toBeGreaterThan(0))
    mocks.pendingGeneratorFingerprints.shift()?.()
    expect(await waitForResponse(missingSeq)).toMatchObject({
      ok: false,
      error: 'Access to the Sample Folder is required.'
    })

    mocks.analyzeGeneratorCandidates.mockRejectedValueOnce(new Error('cancelled by runner'))
    const cancelledSeq = sendCall('planMixJam', ['root-generator-cancelled', 'generator-cancelled', parameters])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints.length).toBeGreaterThan(0))
    mocks.pendingGeneratorFingerprints.shift()?.()
    expect(await waitForResponse(cancelledSeq)).toMatchObject({ ok: false, error: 'cancelled by runner' })
  })

  it('admits only one generator job and releases the slot after cancellation', async () => {
    const parameters = {
      profileId: 'balanced',
      bpm: 120,
      intensity: 0.5,
      durationBars: 8,
      seed: 'scheduler-test'
    }
    const firstSeq = sendCall('planMixJam', ['root-generator', 'generator-first', parameters])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints).toHaveLength(1))

    const overlap = await waitForResponse(
      sendCall('planMixJam', ['root-generator', 'generator-second', parameters])
    )
    expect(overlap).toMatchObject({
      ok: false,
      error: 'Wait for library preparation to finish before generating.'
    })

    await waitForResponse(sendCall('cancelMixJamPlanning', ['generator-first']))
    mocks.pendingGeneratorFingerprints.shift()?.()
    const cancelled = await waitForResponse(firstSeq)
    expect(cancelled).toMatchObject({
      ok: false,
      error: 'MixJam generator planning was cancelled.'
    })

    const retrySeq = sendCall('planMixJam', ['root-generator', 'generator-retry', parameters])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints).toHaveLength(1))
    mocks.pendingGeneratorFingerprints.shift()?.()
    expect(await waitForResponse(retrySeq)).toMatchObject({ ok: true })
  })

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

  it('keeps generation active when a redundant automatic sync is suppressed', async () => {
    const rootKey = 'root-generator-suppression'
    const completed = await callStart(rootKey, 'automatic')
    await complete(await waitForPending(rootKey))

    const parameters = {
      profileId: 'balanced',
      bpm: 120,
      intensity: 0.5,
      durationBars: 8,
      seed: 'suppression-test'
    }
    const generatorJobId = 'generator-suppression'
    const generatorSeq = sendCall('planMixJam', [rootKey, generatorJobId, parameters])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints).toHaveLength(1))

    expect(await callStart(rootKey, 'automatic')).toEqual({
      identity: completed.identity,
      disposition: 'suppressed'
    })
    expect(await waitForResponse(sendCall('getGeneratorProgress', []))).toMatchObject({
      ok: true,
      result: {
        identity: { rootKey, jobId: generatorJobId },
        status: 'running'
      }
    })
    expect(messages).not.toContainEqual({
      type: 'generator-progress',
      progress: expect.objectContaining({
        identity: { rootKey, jobId: generatorJobId },
        status: 'cancelled'
      })
    })

    await waitForResponse(sendCall('cancelMixJamPlanning', [generatorJobId]))
    mocks.pendingGeneratorFingerprints.shift()?.()
    expect(await waitForResponse(generatorSeq)).toMatchObject({
      ok: false,
      error: 'MixJam generator planning was cancelled.'
    })
  })

  it('still cancels generation when a suppressed automatic sync replaces its root', async () => {
    const generatorRoot = 'root-generator-before-replacement'
    const replacementRoot = 'root-generator-replacement'
    await callStart(generatorRoot, 'automatic')
    await complete(await waitForPending(generatorRoot))
    const replacement = await callStart(replacementRoot, 'automatic')
    await complete(await waitForPending(replacementRoot))

    const generatorJobId = 'generator-root-replacement'
    const generatorSeq = sendCall('planMixJam', [generatorRoot, generatorJobId, {
      profileId: 'balanced',
      bpm: 120,
      intensity: 0.5,
      durationBars: 8,
      seed: 'replacement-test'
    }])
    await vi.waitFor(() => expect(mocks.pendingGeneratorFingerprints).toHaveLength(1))

    expect(await callStart(replacementRoot, 'automatic')).toEqual({
      identity: replacement.identity,
      disposition: 'suppressed'
    })
    expect(messages).toContainEqual({
      type: 'generator-progress',
      progress: expect.objectContaining({
        identity: { rootKey: generatorRoot, jobId: generatorJobId },
        status: 'cancelled'
      })
    })

    mocks.pendingGeneratorFingerprints.shift()?.()
    expect(await waitForResponse(generatorSeq)).toMatchObject({
      ok: false,
      error: 'MixJam generator planning was cancelled.'
    })
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

  it('serializes single analysis with sync', async () => {
    const singleSeq = sendCall('reanalyzeSample', ['root-serialized', 303, 'active.wav'])
    const pendingSingle = await waitForPendingSingle(303)

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
  })

  it('deduplicates queued mutations and cancels one queued root without dropping another', async () => {
    const singleSeq = sendCall('reanalyzeSample', ['root-queue-owner', 404, 'active.wav'])
    const pendingSingle = await waitForPendingSingle(404)

    const queued = await waitForResponse(
      sendCall('startLibrarySync', ['root-queue-kept', 'mutation'])
    )
    if (!queued.ok) throw new Error(queued.error)
    const duplicate = await waitForResponse(
      sendCall('startLibrarySync', ['root-queue-kept', 'mutation'])
    )
    expect(duplicate).toMatchObject({ ok: true, result: queued.result })

    const removable = await waitForResponse(
      sendCall('startLibrarySync', ['root-queue-removed', 'mutation'])
    )
    if (!removable.ok) throw new Error(removable.error)
    const removableResult = removable.result as LibrarySyncStartResult
    await callCancel(removableResult.identity.jobId)

    pendingSingle.resolve()
    await waitForResponse(singleSeq)
    await complete(await waitForPending('root-queue-kept'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.pendingScans.some((scan) => scan.rootKey === 'root-queue-removed')).toBe(false)
  })
})
