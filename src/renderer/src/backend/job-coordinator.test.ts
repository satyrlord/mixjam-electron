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

const mocks = vi.hoisted(() => ({
  pendingScans: [] as PendingScan[],
  pendingPlans: [] as Array<{ resolve: (plan: unknown) => void; reject: (e: unknown) => void }>,
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
  runSingleAnalysis: vi.fn(async () => undefined)
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
    analyzeGeneratorCandidates: () => new Promise((resolve, reject) => {
      mocks.pendingPlans.push({ resolve, reject })
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
