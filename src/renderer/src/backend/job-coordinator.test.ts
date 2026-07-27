// Job policy, tested against the coordinator directly.
//
// `createBackendJobCoordinator(db, emitEvent)` takes exactly the two
// collaborators it needs, so these tests construct one with a stub DB and an
// array-collecting sink. Only the modules that actually perform work (scan,
// analysis, generator planning) are mocked; the worker, sqlite-wasm, and every
// persistence module stay out of it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AnalysisProgress,
  DistributiveOmit,
  LibrarySyncTrigger,
  MixJamGeneratorParameters,
  ScanProgress
} from '../../../shared/backend-api'
import type { WorkerMessage } from './protocol'
import type { DB } from './sql'

interface PendingScan {
  rootKey: string
  emit: (progress: DistributiveOmit<ScanProgress, 'identity'>) => void
  resolve: (lastCompletedAt?: number | null) => void
  reject: (error: unknown) => void
}

interface PendingSingleAnalysis {
  sampleId: number
  emit: (progress: DistributiveOmit<AnalysisProgress, 'identity'>) => void
  resolve: () => void
  reject: (error: unknown) => void
}

const mocks = vi.hoisted(() => ({
  pendingScans: [] as PendingScan[],
  pendingPlans: [] as Array<{
    emit: (progress: { phase: 'analyzing' | 'shortlisting'; completed: number; total: number }) => void
    resolve: (plan: unknown) => void
    reject: (e: unknown) => void
  }>,
  pendingSingleAnalyses: [] as PendingSingleAnalysis[],
  storedReadiness: { status: 'ready' } as unknown
}))

vi.mock('./indexer', () => ({
  runScan: (
    _db: unknown,
    rootKey: string,
    _handle: unknown,
    emit: (progress: DistributiveOmit<ScanProgress, 'identity'>) => void
  ) => new Promise((resolve, reject) => {
    mocks.pendingScans.push({ rootKey, emit, resolve, reject })
  })
}))

vi.mock('./analysis-runner', () => ({
  runPendingAnalysis: vi.fn(async () => undefined),
  runSingleAnalysis: (
    _db: unknown,
    sampleId: number,
    _file: File,
    emit: (progress: DistributiveOmit<AnalysisProgress, 'identity'>) => void
  ) => new Promise<void>((resolve, reject) => {
    mocks.pendingSingleAnalyses.push({ sampleId, emit, resolve, reject })
  })
}))

vi.mock('./folder-access', () => ({
  requireFolderForAutomaticAccess: vi.fn(async () => ({})),
  resolveFileHandle: vi.fn(async () => ({ getFile: async () => new File([], 'x.wav') }))
}))

vi.mock('./generator-library', () => ({
  getStoredGeneratorReadiness: () => mocks.storedReadiness,
  loadGeneratorSnapshot: () => ({ rootKey: 'r', candidates: [], analysisSummary: {} }),
  fingerprintGeneratorSnapshot: async () => 'fingerprint-1',
  selectGeneratorAnalysisGroup: (_s: unknown, parameters: MixJamGeneratorParameters) => ({
    candidates: [],
    parameters,
    detectedBpm: 140
  })
}))

vi.mock('./generator-analysis', async () => {
  const actual = await vi.importActual<typeof import('./generator-analysis')>('./generator-analysis')
  return {
    ...actual,
    analyzeGeneratorCandidates: (
      _root: unknown,
      _candidates: unknown,
      _parameters: unknown,
      emit: (progress: { phase: 'analyzing' | 'shortlisting'; completed: number; total: number }) => void
    ) => new Promise((resolve, reject) => {
      mocks.pendingPlans.push({ emit, resolve, reject })
    })
  }
})

vi.mock('./generator-engine', () => ({
  createMixJamGeneratorPlan: () => ({ planId: 'plan-1' })
}))

vi.mock('./generator-parameters', () => ({ validateMixJamGeneratorParameters: () => undefined }))

const { createBackendJobCoordinator } = await import('./job-coordinator')

const DB_STUB = {} as DB
const PARAMETERS = { profileId: 'techno' } as unknown as MixJamGeneratorParameters

let events: WorkerMessage[]
let jobs: ReturnType<typeof createBackendJobCoordinator>

beforeEach(() => {
  mocks.pendingScans.length = 0
  mocks.pendingPlans.length = 0
  mocks.pendingSingleAnalyses.length = 0
  mocks.storedReadiness = { status: 'ready' }
  events = []
  jobs = createBackendJobCoordinator(DB_STUB, (message) => events.push(message))
})

function start(rootKey: string, trigger: LibrarySyncTrigger = 'manual'): ReturnType<typeof jobs.startLibrarySync> {
  return jobs.startLibrarySync(rootKey, trigger)
}

/** Waits for the scan to actually reach `runScan` — folder access is awaited first. */
async function awaitScan(rootKey: string, occurrence = 1): Promise<PendingScan> {
  await vi.waitFor(() => {
    expect(mocks.pendingScans.filter((pending) => pending.rootKey === rootKey).length)
      .toBeGreaterThanOrEqual(occurrence)
  })
  return mocks.pendingScans.filter((pending) => pending.rootKey === rootKey)[occurrence - 1]!
}

async function settleScan(rootKey: string, occurrence = 1): Promise<void> {
  const scan = await awaitScan(rootKey, occurrence)
  scan.resolve(Date.now())
  await vi.waitFor(() => expect(jobs.getScanProgress().status).not.toBe('scanning'))
}

async function awaitSingle(sampleId: number): Promise<PendingSingleAnalysis> {
  await vi.waitFor(() => expect(
    mocks.pendingSingleAnalyses.some((pending) => pending.sampleId === sampleId)
  ).toBe(true))
  return mocks.pendingSingleAnalyses.find((pending) => pending.sampleId === sampleId)!
}

describe('readiness reflects who owns the root', () => {
  it('reports stored readiness while idle and preparing while a job owns the root', async () => {
    expect(jobs.getGeneratorReadiness('root-a')).toMatchObject({ status: 'ready' })

    start('root-a')
    await awaitScan('root-a')
    expect(jobs.getGeneratorReadiness('root-a')).toMatchObject({ status: 'preparing' })
    // A different root is unaffected — busy-ness is per root, not global.
    expect(jobs.getGeneratorReadiness('root-b')).toMatchObject({ status: 'ready' })

    await settleScan('root-a')
    expect(jobs.getGeneratorReadiness('root-a')).toMatchObject({ status: 'ready' })
  })
})

describe('library sync admission', () => {
  it('coalesces a second request for a root already syncing', async () => {
    const first = start('root-a')
    const second = start('root-a')
    expect(second.identity.jobId).toBe(first.identity.jobId)
    await awaitScan('root-a')
    expect(mocks.pendingScans).toHaveLength(1)
  })

  it('a manual request for a different root replaces the active sync', async () => {
    const first = start('root-a')
    await awaitScan('root-a')
    expect(jobs.getScanProgress()).toMatchObject({ status: 'scanning' })

    const second = start('root-b')
    expect(second.disposition).toBe('started')
    // The displaced job is cancelled, not queued: only one root may scan and a
    // newer explicit request wins.
    expect(events.some((event) =>
      event.type === 'scan-progress' &&
      event.progress.status === 'cancelled' &&
      event.progress.identity?.jobId === first.identity.jobId
    )).toBe(true)
    await awaitScan('root-b')
  })

  it('queues a mutation follow-up behind the active sync and runs it after', async () => {
    start('root-a')
    await awaitScan('root-a')
    const mutation = start('root-a', 'mutation')
    expect(mutation.disposition).toBe('queued')

    // Resolve the active scan directly: the queued follow-up starts as soon as
    // the connection frees, so scan progress never returns to idle in between.
    ;(await awaitScan('root-a')).resolve(Date.now())
    await awaitScan('root-a', 2)
    expect(jobs.getScanProgress().identity?.jobId).toBe(mutation.identity.jobId)
  })

  it('runs an automatic sync at most once per root', async () => {
    const first = start('root-a', 'automatic')
    expect(first.disposition).toBe('started')
    await settleScan('root-a')

    const again = start('root-a', 'automatic')
    expect(again.disposition).toBe('suppressed')
    expect(again.identity.jobId).toBe(first.identity.jobId)
    // Nothing new was dispatched; the completed scan is still the only one.
    expect(mocks.pendingScans).toHaveLength(1)
  })

  it('a manual re-scan still runs after an automatic sync completed', async () => {
    start('root-a', 'automatic')
    await settleScan('root-a')
    expect(start('root-a', 'manual').disposition).toBe('started')
    await awaitScan('root-a', 2)
  })

  it('a mutation follow-up never coalesces onto an active sync', async () => {
    const active = start('root-a', 'manual')
    await awaitScan('root-a')
    const mutation = start('root-a', 'mutation')
    // A plain repeat coalesces; a mutation is a follow-up and gets its own job.
    expect(start('root-a', 'manual').identity.jobId).toBe(active.identity.jobId)
    expect(mutation.identity.jobId).not.toBe(active.identity.jobId)
    expect(mutation.disposition).toBe('queued')
    expect(mocks.pendingScans).toHaveLength(1)
  })

  it('deduplicates queued mutations and can cancel one without dropping another', async () => {
    const single = jobs.reanalyzeSample('root-owner', 40, 'active.wav')
    const pending = await awaitSingle(40)
    const kept = start('root-kept', 'mutation')
    expect(start('root-kept', 'mutation')).toEqual(kept)
    const removed = start('root-removed', 'mutation')
    jobs.cancelLibrarySync(removed.identity.jobId)

    pending.resolve()
    await single
    await awaitScan('root-kept')
    expect(mocks.pendingScans.some((scan) => scan.rootKey === 'root-removed')).toBe(false)
  })

  it('does not suppress an automatic retry after a failed first attempt', async () => {
    const first = start('root-retry', 'automatic')
    ;(await awaitScan('root-retry')).reject(new Error('temporary read failure'))
    await vi.waitFor(() => expect(jobs.getScanProgress()).toMatchObject({
      identity: first.identity,
      status: 'error'
    }))
    expect(start('root-retry', 'automatic').disposition).toBe('started')
    await awaitScan('root-retry', 2)
  })
})

describe('cancellation', () => {
  it('cancelling the active sync emits a cancelled progress and frees the root', async () => {
    const started = start('root-a')
    await awaitScan('root-a')
    jobs.cancelLibrarySync(started.identity.jobId)

    expect(jobs.getScanProgress()).toMatchObject({ status: 'cancelled' })
    expect(events.some((event) =>
      event.type === 'scan-progress' && event.progress.status === 'cancelled'
    )).toBe(true)
    expect(jobs.getGeneratorReadiness('root-a')).toMatchObject({ status: 'ready' })
  })

  it('cancelling an unknown job id is a no-op', async () => {
    start('root-a')
    await awaitScan('root-a')
    jobs.cancelLibrarySync('not-a-job')
    expect(jobs.getScanProgress().status).toBe('scanning')
  })
})

describe('generator exclusion', () => {
  it('refuses to plan while a library sync holds the connection', async () => {
    start('root-a')
    await awaitScan('root-a')
    await expect(jobs.planMixJam('root-a', 'gen-1', PARAMETERS))
      .rejects.toThrow('Wait for library preparation to finish before generating.')
  })

  it('rejects a job id that is not a safe token', async () => {
    await expect(jobs.planMixJam('root-a', 'bad id!', PARAMETERS))
      .rejects.toThrow('The generator job ID is invalid.')
  })

  it('a starting library sync cancels a running generator', async () => {
    const planning = jobs.planMixJam('root-a', 'gen-1', PARAMETERS)
    await vi.waitFor(() => expect(mocks.pendingPlans).toHaveLength(1))
    expect(jobs.getGeneratorProgress()).toMatchObject({ status: 'running' })

    start('root-a')

    expect(jobs.getGeneratorProgress()).toMatchObject({ status: 'cancelled' })
    mocks.pendingPlans[0]!.resolve([])
    await expect(planning).rejects.toThrow()
  })

  it('refuses single-sample analysis while the generator is running', async () => {
    void jobs.planMixJam('root-a', 'gen-1', PARAMETERS)
    await vi.waitFor(() => expect(mocks.pendingPlans).toHaveLength(1))

    expect(() => jobs.reanalyzeSample('root-a', 1, 'kick.wav'))
      .toThrow('Wait for MixJam generation to finish.')
  })

  it('cancelMixJamPlanning only cancels the job it names', async () => {
    void jobs.planMixJam('root-a', 'gen-1', PARAMETERS)
    await vi.waitFor(() => expect(mocks.pendingPlans).toHaveLength(1))

    jobs.cancelMixJamPlanning('gen-other')
    expect(jobs.getGeneratorProgress()).toMatchObject({ status: 'running' })

    jobs.cancelMixJamPlanning('gen-1')
    expect(jobs.getGeneratorProgress()).toMatchObject({ status: 'cancelled' })
  })

  it('keeps generation active for a suppressed same-root automatic sync', async () => {
    const completed = start('root-a', 'automatic')
    await settleScan('root-a')
    const planning = jobs.planMixJam('root-a', 'gen-suppressed', PARAMETERS)
    await vi.waitFor(() => expect(mocks.pendingPlans).toHaveLength(1))

    expect(start('root-a', 'automatic')).toEqual({
      identity: completed.identity,
      disposition: 'suppressed'
    })
    expect(jobs.getGeneratorProgress()).toMatchObject({ status: 'running' })

    jobs.cancelMixJamPlanning('gen-suppressed')
    mocks.pendingPlans[0]!.resolve([])
    await expect(planning).rejects.toThrow()
  })

  it('cancels a cross-root generator before suppressing a completed automatic sync', async () => {
    const completed = start('root-a', 'automatic')
    await settleScan('root-a')
    const planning = jobs.planMixJam('root-b', 'gen-cross-root', PARAMETERS)
    await vi.waitFor(() => expect(mocks.pendingPlans).toHaveLength(1))

    expect(start('root-a', 'automatic')).toEqual({
      identity: completed.identity,
      disposition: 'suppressed'
    })
    expect(jobs.getGeneratorProgress()).toMatchObject({ status: 'cancelled' })

    mocks.pendingPlans[0]!.resolve([])
    await expect(planning).rejects.toThrow()
  })

  it('publishes planning progress and returns a completed plan', async () => {
    const planning = jobs.planMixJam('root-a', 'gen-complete', PARAMETERS)
    await vi.waitFor(() => expect(mocks.pendingPlans).toHaveLength(1))
    mocks.pendingPlans[0]!.emit({ phase: 'analyzing', completed: 2, total: 3 })
    mocks.pendingPlans[0]!.emit({ phase: 'shortlisting', completed: 3, total: 3 })
    mocks.pendingPlans[0]!.resolve([{ relpath: 'kick.wav' }])

    await expect(planning).resolves.toEqual({ planId: 'plan-1' })
    expect(jobs.getGeneratorProgress()).toMatchObject({ status: 'idle' })
    expect(events).toContainEqual(expect.objectContaining({
      type: 'generator-progress',
      progress: expect.objectContaining({ phase: 'analyzing', completed: 2 })
    }))
  })

  it('rejects a stale expected corpus fingerprint before analysis', async () => {
    await expect(jobs.planMixJam('root-a', 'gen-stale', PARAMETERS, 'stale'))
      .rejects.toThrow('The Sample Folder has changed since this project was generated.')
    expect(mocks.pendingPlans).toHaveLength(0)
  })
})

describe('single-sample analysis admission', () => {
  it('queues automatic and mutation syncs while rejecting a manual sync', async () => {
    const analysis = jobs.reanalyzeSample('root-a', 50, 'active.wav')
    const pending = await awaitSingle(50)

    expect(start('root-auto', 'automatic').disposition).toBe('queued')
    expect(start('root-mutation', 'mutation').disposition).toBe('queued')
    expect(() => start('root-manual', 'manual'))
      .toThrow('Wait for the current sample analysis to finish')

    pending.resolve()
    await analysis
    await awaitScan('root-auto')
  })

  it('keeps completion typed and an analysis failure observable', async () => {
    const success = jobs.reanalyzeSample('root-a', 60, 'one.wav')
    const pendingSuccess = await awaitSingle(60)
    pendingSuccess.emit({ status: 'analyzing', analyzed: 1, total: 1 })
    pendingSuccess.resolve()
    await expect(success).resolves.toMatchObject({
      identity: { rootKey: 'root-a', sampleId: 60 }
    })
    expect(events).toContainEqual(expect.objectContaining({ type: 'analysis-done' }))

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failure = jobs.reanalyzeSample('root-a', 61, 'broken.wav')
    const pendingFailure = await awaitSingle(61)
    pendingFailure.reject(new Error('decode failed'))
    await expect(failure).rejects.toThrow('decode failed')
    expect(jobs.getAnalysisProgress()).toMatchObject({ status: 'error', error: 'decode failed' })
    consoleError.mockRestore()
  })
})

describe('progress snapshots', () => {
  it('hands out copies, so a caller cannot mutate coordinator state', async () => {
    start('root-a')
    await awaitScan('root-a')
    const snapshot = jobs.getScanProgress() as unknown as { status: string }
    snapshot.status = 'tampered'
    expect(jobs.getScanProgress().status).toBe('scanning')
  })

  it('starts idle for every job family', () => {
    const fresh = createBackendJobCoordinator(DB_STUB, () => {})
    expect(fresh.getScanProgress()).toMatchObject({ identity: null, status: 'idle' })
    expect(fresh.getAnalysisProgress()).toMatchObject({ identity: null, status: 'idle' })
    expect(fresh.getGeneratorProgress()).toMatchObject({ identity: null, status: 'idle' })
  })
})
