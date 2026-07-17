import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnalysisProgress,
  BackendAPI,
  CalibrationJobIdentity,
  CalibrationProgress,
  CategoryItem,
  FolderRef,
  LibraryItem,
  LibraryJobIdentity,
  LibraryRootState,
  LibrarySyncStartResult,
  LibrarySyncState,
  MixJamFileItem,
  SampleItem,
  SampleAnalysisPatch,
  SampleListItem,
  ScanProgress,
  TagItem
} from '../../../shared/backend-api'
import type { FooterSampleDetail } from '../lib/arrangement'
import { useSyncedRef } from './useSyncedRef'
import { useSampleTags } from './useSampleTags'
import { useSampleCategories } from './useSampleCategories'
import { useSampleLibraries } from './useSampleLibraries'

export type SampleSortColumn = 'filename' | 'duration' | 'dateAdded'
export type SampleSortDirection = 'asc' | 'desc'

export interface LibraryDataState {
  version: string
  mixJamFiles: MixJamFileItem[]
  /** The loaded prefix of the current windowed DB query; empty until the
   *  active Sample Folder's first scan completes. */
  samples: SampleListItem[]
  searchQuery: string
  loading: boolean
  error: string | null
  selectedSampleDetail: FooterSampleDetail | null
  librarySyncState: LibrarySyncState
  calibrationProgress: CalibrationProgress
  totalCount: number
  /** True when the active Sample Folder has a browseable index. */
  dbIndexed: boolean
  /** Relpaths of samples marked missing (scan_state = 2); the tracker stripes
   *  placements referencing them (spec-002 AC-013). Refreshed after every scan. */
  missingSamplePaths: ReadonlySet<string>
  /** True while more windowed pages exist beyond the loaded prefix. */
  hasMoreSamples: boolean
  selectedCategoryId: number | undefined
  selectedTagIds: number[]
  sortBy: SampleSortColumn
  sortDir: SampleSortDirection
  tags: TagItem[]
  categories: CategoryItem[]
  libraries: LibraryItem[]
}

export interface LibraryDataActions {
  setSelectedSampleDetail: (detail: FooterSampleDetail | null) => void
  setSearchQuery: (query: string) => void
  setSelectedCategoryId: (id: number | undefined) => void
  setSelectedTagIds: React.Dispatch<React.SetStateAction<number[]>>
  rescanLibrary: () => Promise<void>
  retryLibrarySync: () => Promise<void>
  cancelLibrarySync: () => Promise<void>
  startUniformFolderCalibration: () => Promise<void>
  cancelUniformFolderCalibration: () => Promise<void>
  /** Fetches the next windowed page of the current query (DB pipeline only). */
  loadMoreSamples: () => void
  createTag: (name: string, color?: string) => Promise<TagItem>
  renameTag: (id: number, name: string) => Promise<void>
  setTagColor: (id: number, color: string | null) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  assignTagToSample: (sample: SampleListItem, tagId: number) => Promise<void>
  unassignTagFromSample: (sample: SampleListItem, tagId: number) => Promise<void>
  updateSampleAnalysis: (sample: SampleListItem, patch: SampleAnalysisPatch) => Promise<void>
  reanalyzeSample: (sample: SampleListItem) => Promise<void>
  createCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  deleteCategory: (id: number) => Promise<void>
  saveLibrary: (name: string) => Promise<LibraryItem>
  deleteLibrary: (id: number) => Promise<void>
  /** Restores the filter state a saved library encodes (spec-004 AC-013). */
  applyLibrary: (library: LibraryItem) => void
  reloadMixJamFiles: () => Promise<void>
  handleSortChange: (col: SampleSortColumn) => void
}

export type LibraryData = LibraryDataState & LibraryDataActions

function dbSampleToListItem(
  s: SampleItem,
  categoryNames: ReadonlyMap<number, string>
): SampleListItem {
  return {
    id: s.relpath,
    dbId: s.id,
    name: s.filename,
    relpath: s.relpath,
    category: (s.categoryId !== null ? categoryNames.get(s.categoryId) : undefined) ?? 'Unsorted',
    durationSeconds: s.duration,
    bpm: s.bpm,
    bpmSource: s.bpmSource,
    musicalKey: s.musicalKey,
    musicalKeySource: s.musicalKeySource,
    sampleType: s.sampleType,
    sampleTypeSource: s.sampleTypeSource,
    tags: s.tags,
    categoryId: s.categoryId,
    tagIds: s.tagIds
  }
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

const DB_SAMPLE_PAGE_SIZE = 500

export function useLibraryData(
  backendAPI: BackendAPI,
  userFolder: FolderRef | null,
  sampleFolder: FolderRef | null
): LibraryData {
  const [version, setVersion] = useState('')
  const [mixJamFiles, setMixJamFiles] = useState<MixJamFileItem[]>([])
  const [samples, setSamples] = useState<SampleListItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedSampleDetail, setSelectedSampleDetail] = useState<FooterSampleDetail | null>(null)
  const [librarySyncState, setLibrarySyncState] = useState<LibrarySyncState>(() =>
    sampleFolder
      ? { status: 'unindexed', rootKey: sampleFolder.id }
      : { status: 'unavailable' }
  )
  const [calibrationProgress, setCalibrationProgress] = useState<CalibrationProgress>({
    identity: null,
    status: 'idle',
    analyzed: 0,
    total: 0
  })
  const [dbIndexed, setDbIndexed] = useState(false)
  const [missingSamplePaths, setMissingSamplePaths] = useState<ReadonlySet<string>>(new Set())
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined)
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [sort, setSort] = useState<{ by: SampleSortColumn; dir: SampleSortDirection }>({
    by: 'filename',
    dir: 'asc'
  })
  const [tags, setTags] = useState<TagItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [libraries, setLibraries] = useState<LibraryItem[]>([])
  const querySeqRef = useRef(0)
  const activeRootKeyRef = useRef<string | null>(sampleFolder?.id ?? null)
  const activeJobRef = useRef<LibraryJobIdentity | null>(null)
  const activeCalibrationRef = useRef<CalibrationJobIdentity | null>(null)
  const hasUsableIndexRef = useRef(false)
  const lastCompletedAtRef = useRef<number | null>(null)
  activeRootKeyRef.current = sampleFolder?.id ?? null
  // Windowed paging cursor for the current query generation.
  const nextOffsetRef = useRef(0)
  const loadingMoreRef = useRef(false)

  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  )
  const categoryNamesRef = useSyncedRef(categoryNames)

  // Items loaded before the category list arrived resolved their category name
  // against an empty map; re-map in place when categories change rather than
  // re-running the whole query.
  useEffect(() => {
    setSamples((prev) => {
      let changed = false
      const next = prev.map((s) => {
        const name =
          (s.categoryId !== null ? categoryNames.get(s.categoryId) : undefined) ?? 'Unsorted'
        if (name === s.category) return s
        changed = true
        return { ...s, category: name }
      })
      return changed ? next : prev
    })
  }, [categoryNames])

  // Version
  useEffect(() => {
    let isMounted = true
    void backendAPI
      .getVersion()
      .then((v) => { if (isMounted) setVersion(v) })
      .catch((error: unknown) => {
        console.error('Failed to read app version:', error)
        if (isMounted) setVersion('version unavailable')
      })
    return () => { isMounted = false }
  }, [backendAPI])

  // MixJam files
  const reloadMixJamFiles = useCallback(async () => {
    try {
      setMixJamFiles(await backendAPI.loadMixJamFiles(userFolder))
    } catch (err) {
      console.error('Failed to load MixJam files:', err)
      setMixJamFiles([])
    }
  }, [backendAPI, userFolder])

  useEffect(() => {
    void reloadMixJamFiles()
  }, [reloadMixJamFiles])

  const terminalJobIdsRef = useRef<Set<string>>(new Set())

  const applyRootState = useCallback((root: LibraryRootState) => {
    if (root.rootKey !== activeRootKeyRef.current) return
    hasUsableIndexRef.current = root.hasUsableIndex
    lastCompletedAtRef.current = root.lastCompletedAt
    setDbIndexed(root.hasUsableIndex)
    setLibrarySyncState((current) => {
      const active = current.status === 'checking' ||
        current.status === 'syncing' ||
        current.status === 'analyzing'
      if (active && current.rootKey === root.rootKey) return current
      return root.lastCompletedAt === null
        ? { status: 'unindexed', rootKey: root.rootKey }
        : { status: 'ready', rootKey: root.rootKey, lastCompletedAt: root.lastCompletedAt }
    })
  }, [])

  const acceptJob = useCallback((identity: LibraryJobIdentity): boolean => {
    if (identity.rootKey !== activeRootKeyRef.current ||
        terminalJobIdsRef.current.has(identity.jobId)) {
      return false
    }
    const active = activeJobRef.current
    if (active && active.jobId !== identity.jobId) return false
    activeJobRef.current = identity
    return true
  }, [])

  const finishJob = useCallback((identity: LibraryJobIdentity) => {
    terminalJobIdsRef.current.add(identity.jobId)
    if (activeJobRef.current?.jobId === identity.jobId) activeJobRef.current = null
  }, [])

  const applyScanProgress = useCallback((progress: ScanProgress) => {
    const identity = progress.identity
    if (!identity || !acceptJob(identity)) return
    if (progress.status === 'scanning') {
      setLibrarySyncState({
        status: 'syncing',
        rootKey: identity.rootKey,
        jobId: identity.jobId,
        hasUsableIndex: hasUsableIndexRef.current,
        phase: progress.phase,
        found: progress.found,
        processed: progress.processed,
        total: progress.total
      })
      return
    }
    if (progress.status === 'cancelled') {
      setLibrarySyncState({
        status: 'cancelled',
        rootKey: identity.rootKey,
        hasUsableIndex: hasUsableIndexRef.current
      })
      finishJob(identity)
      return
    }
    if (progress.status === 'error') {
      setLibrarySyncState({
        status: 'error',
        rootKey: identity.rootKey,
        message: progress.error ?? 'Library sync failed.',
        hasUsableIndex: hasUsableIndexRef.current
      })
      finishJob(identity)
    }
  }, [acceptJob, finishJob])

  const applyAnalysisProgress = useCallback((progress: AnalysisProgress) => {
    const identity = progress.identity
    if (!identity || 'sampleId' in identity || !acceptJob(identity)) return
    if (progress.status === 'analyzing') {
      const lastCompletedAt = lastCompletedAtRef.current
      if (lastCompletedAt === null) return
      setLibrarySyncState({
        status: 'analyzing',
        rootKey: identity.rootKey,
        jobId: identity.jobId,
        lastCompletedAt,
        analyzed: progress.analyzed,
        total: progress.total
      })
      return
    }
    if (progress.status === 'error') {
      setLibrarySyncState({
        status: 'error',
        rootKey: identity.rootKey,
        message: progress.error ?? 'Sample analysis failed.',
        hasUsableIndex: true
      })
      finishJob(identity)
    }
  }, [acceptJob, finishJob])

  const hydrateActiveJob = useCallback(async (identity: LibraryJobIdentity) => {
    const [scan, analysis] = await Promise.all([
      backendAPI.getScanProgress(),
      backendAPI.getAnalysisProgress()
    ])
    if (scan.identity?.jobId === identity.jobId) applyScanProgress(scan)
    if (analysis.identity &&
        !('sampleId' in analysis.identity) &&
        analysis.identity.jobId === identity.jobId) {
      applyAnalysisProgress(analysis)
    }
  }, [applyAnalysisProgress, applyScanProgress, backendAPI])

  const applyStartResult = useCallback(async (
    result: LibrarySyncStartResult,
    folder: FolderRef
  ) => {
    if (folder.id !== activeRootKeyRef.current) return
    if (result.disposition === 'started') {
      terminalJobIdsRef.current.delete(result.identity.jobId)
      activeJobRef.current = result.identity
      setLibrarySyncState((current) => {
        const alreadyActive = (current.status === 'checking' ||
          current.status === 'syncing' ||
          current.status === 'analyzing') &&
          current.rootKey === result.identity.rootKey &&
          current.jobId === result.identity.jobId
        return alreadyActive
          ? current
          : {
              status: 'checking',
              rootKey: result.identity.rootKey,
              jobId: result.identity.jobId
            }
      })
      return
    }
    if (result.disposition === 'coalesced') {
      terminalJobIdsRef.current.delete(result.identity.jobId)
      activeJobRef.current = result.identity
      await hydrateActiveJob(result.identity)
      return
    }
    if (result.disposition === 'suppressed') {
      applyRootState(await backendAPI.getLibraryRootState(folder))
    }
  }, [applyRootState, backendAPI, hydrateActiveJob])

  const refreshMissingSamplePaths = useCallback(async () => {
    if (!sampleFolder) return
    try {
      const next = new Set(await backendAPI.listMissingRelpaths(sampleFolder))
      // Keep the previous Set identity when contents are unchanged (the
      // common case: empty -> empty on every scan) so App's arrangement memo
      // and the memoized LaneRow/LaneSampleBubbleCanvas tree don't re-render and
      // repaint every lane canvas for a no-op.
      setMissingSamplePaths((prev) => setsEqual(prev, next) ? prev : next)
    } catch {
      setMissingSamplePaths((prev) => prev.size === 0 ? prev : new Set())
    }
  }, [backendAPI, sampleFolder])

  useEffect(() => {
    activeRootKeyRef.current = sampleFolder?.id ?? null
    activeJobRef.current = null
    activeCalibrationRef.current = null
    hasUsableIndexRef.current = false
    lastCompletedAtRef.current = null
    querySeqRef.current++
    loadingMoreRef.current = false
    setCalibrationProgress({
      identity: null,
      status: 'idle',
      analyzed: 0,
      total: 0
    })

    if (!sampleFolder) {
      setLibrarySyncState({ status: 'unavailable' })
      setDbIndexed(false)
      setMissingSamplePaths(new Set())
      setSamples([])
      setTotalCount(0)
      setLoading(false)
      return
    }

    let active = true
    setLibrarySyncState({ status: 'unindexed', rootKey: sampleFolder.id })
    setDbIndexed(false)
    setSamples([])
    setTotalCount(0)
    setLoading(false)

    void (async () => {
      try {
        const [root, calibration] = await Promise.all([
          backendAPI.getLibraryRootState(sampleFolder),
          backendAPI.getCalibrationProgress()
        ])
        if (!active || sampleFolder.id !== activeRootKeyRef.current) return
        applyRootState(root)
        if (calibration.status === 'calibrating' &&
            calibration.identity?.rootKey === sampleFolder.id) {
          activeCalibrationRef.current = calibration.identity
          setCalibrationProgress(calibration)
          return
        }
      } catch (cause) {
        console.error('Failed to read library state:', cause)
        if (active && sampleFolder.id === activeRootKeyRef.current) {
          setLibrarySyncState({
            status: 'error',
            rootKey: sampleFolder.id,
            message: 'Unable to read library status.',
            hasUsableIndex: false
          })
        }
      }

      if (!active || sampleFolder.id !== activeRootKeyRef.current) return
      void refreshMissingSamplePaths()
      try {
        const result = await backendAPI.startLibrarySync(sampleFolder, 'automatic')
        if (active) await applyStartResult(result, sampleFolder)
      } catch (cause) {
        console.error('Failed to start automatic library sync:', cause)
        if (active && sampleFolder.id === activeRootKeyRef.current) {
          setLibrarySyncState({
            status: 'error',
            rootKey: sampleFolder.id,
            message: cause instanceof Error ? cause.message : 'Unable to start library sync.',
            hasUsableIndex: hasUsableIndexRef.current
          })
        }
      }
    })()

    return () => {
      active = false
    }
  }, [
    applyRootState,
    applyStartResult,
    backendAPI,
    refreshMissingSamplePaths,
    sampleFolder
  ])

  // Windowed DB query, scoped to the active Sample Folder's scan root. Fetches
  // only the first page; the grid requests more via loadMoreSamples as the user
  // scrolls, so the renderer never holds the full result set (AGENTS.md hard
  // rule: windowed pages over IPC, never full result sets).
  const queryDb = useCallback(async () => {
    if (!sampleFolder) return
    const seq = ++querySeqRef.current
    setLoading(true)
    try {
      const result = await backendAPI.querySamples({
        textSearch: searchQuery || undefined,
        categoryId: selectedCategoryId,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        rootId: sampleFolder.id,
        sortBy: sort.by,
        sortDir: sort.dir,
        limit: DB_SAMPLE_PAGE_SIZE,
        offset: 0
      })
      if (seq !== querySeqRef.current) return

      nextOffsetRef.current = result.rows.length
      setSamples(result.rows.map((s) => dbSampleToListItem(s, categoryNamesRef.current)))
      setTotalCount(result.total)
      setError(null)
    } catch {
      if (seq !== querySeqRef.current) return
      setSamples([])
      setTotalCount(0)
      setError('Unable to query library.')
    } finally {
      if (seq === querySeqRef.current) setLoading(false)
    }
  }, [backendAPI, sampleFolder, searchQuery, selectedCategoryId, selectedTagIds, sort, categoryNamesRef])

  const loadMoreSamples = useCallback(() => {
    if (!dbIndexed || !sampleFolder || loadingMoreRef.current) return
    const seq = querySeqRef.current
    const offset = nextOffsetRef.current
    loadingMoreRef.current = true
    void backendAPI
      .querySamples({
        textSearch: searchQuery || undefined,
        categoryId: selectedCategoryId,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        rootId: sampleFolder.id,
        sortBy: sort.by,
        sortDir: sort.dir,
        limit: DB_SAMPLE_PAGE_SIZE,
        offset
      })
      .then((result) => {
        // A newer query superseded this page while it was in flight.
        if (seq !== querySeqRef.current || result.rows.length === 0) return
        nextOffsetRef.current = offset + result.rows.length
        setSamples((prev) => [
          ...prev,
          ...result.rows.map((s) => dbSampleToListItem(s, categoryNamesRef.current))
        ])
        setTotalCount(result.total)
      })
      .catch((e: unknown) => {
        console.error('Failed to load more samples:', e)
      })
      .finally(() => {
        loadingMoreRef.current = false
      })
  }, [backendAPI, dbIndexed, sampleFolder, searchQuery, selectedCategoryId, selectedTagIds, sort, categoryNamesRef])

  // Debounced query: one effect covers search, filter, and sort changes.
  // Before the active folder's first scan completes there is nothing to query;
  // the browser shows its empty state until onScanDone flips dbIndexed.
  useEffect(() => {
    if (!sampleFolder) {
      setSamples([])
      setSearchQuery('')
      setLoading(false)
      setError(null)
      setSelectedSampleDetail(null)
      return
    }
    if (!dbIndexed) {
      setSamples([])
      setTotalCount(0)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void queryDb()
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [sampleFolder, dbIndexed, queryDb])

  // Clear selection when the selected sample is no longer in the list.
  useEffect(() => {
    if (!selectedSampleDetail) return
    const stillVisible = samples.some((s) => s.relpath === selectedSampleDetail.relpath)
    if (!stillVisible) setSelectedSampleDetail(null)
  }, [samples, selectedSampleDetail])

  // Keep refs to the latest callbacks so onScanDone calls the current
  // versions with up-to-date filter/folder state.
  const queryDbRef = useRef(queryDb)
  queryDbRef.current = queryDb
  const refreshMissingRef = useRef(refreshMissingSamplePaths)
  refreshMissingRef.current = refreshMissingSamplePaths

  // Root- and job-scoped library lifecycle listeners. Events for a folder or
  // job that is no longer active are ignored.
  useEffect(() => {
    const unsubProgress = backendAPI.onScanProgress(applyScanProgress)
    const unsubDone = backendAPI.onScanDone((done) => {
      if (!acceptJob(done.identity)) return
      hasUsableIndexRef.current = true
      lastCompletedAtRef.current = done.lastCompletedAt
      setDbIndexed(true)
      setLibrarySyncState({
        status: 'analyzing',
        rootKey: done.identity.rootKey,
        jobId: done.identity.jobId,
        lastCompletedAt: done.lastCompletedAt,
        analyzed: 0,
        total: 0
      })
      // Refresh categories (folder-driven categories may have changed)
      void backendAPI.listCategories().then(setCategories)
      void backendAPI.listTags().then(setTags)
      void queryDbRef.current()
      // A re-scan can mark placed samples missing (or resurrect them).
      void refreshMissingRef.current()
    })
    return () => { unsubProgress(); unsubDone() }
  }, [acceptJob, applyScanProgress, backendAPI])

  // Tags, categories, libraries — load once on mount
  useEffect(() => {
    let active = true
    void Promise.all([
      backendAPI.listTags(),
      backendAPI.listCategories(),
      backendAPI.listLibraries()
    ]).then(([t, c, l]) => {
      if (active) { setTags(t); setCategories(c); setLibraries(l) }
    })
    return () => { active = false }
  }, [backendAPI])

  const requestLibrarySync = useCallback(async () => {
    const syncActive = librarySyncState.status === 'checking' ||
      librarySyncState.status === 'syncing' ||
      librarySyncState.status === 'analyzing'
    if (!sampleFolder || syncActive || calibrationProgress.status === 'calibrating') return
    try {
      await applyStartResult(
        await backendAPI.startLibrarySync(sampleFolder, 'manual'),
        sampleFolder
      )
    } catch (cause) {
      console.error('Failed to start library sync:', cause)
      setLibrarySyncState({
        status: 'error',
        rootKey: sampleFolder.id,
        message: cause instanceof Error ? cause.message : 'Unable to start library sync.',
        hasUsableIndex: hasUsableIndexRef.current
      })
    }
  }, [
    applyStartResult,
    backendAPI,
    calibrationProgress.status,
    librarySyncState.status,
    sampleFolder
  ])

  const cancelLibrarySync = useCallback(async () => {
    if (librarySyncState.status !== 'checking' &&
        librarySyncState.status !== 'syncing' &&
        librarySyncState.status !== 'analyzing') {
      return
    }
    await backendAPI.cancelLibrarySync(librarySyncState.jobId)
  }, [backendAPI, librarySyncState])

  useEffect(() => {
    const unsubProgress = backendAPI.onAnalysisProgress(applyAnalysisProgress)
    const unsubDone = backendAPI.onAnalysisDone((done) => {
      const identity = done.identity
      if ('sampleId' in identity || !acceptJob(identity)) return
      const lastCompletedAt = lastCompletedAtRef.current
      if (lastCompletedAt !== null) {
        setLibrarySyncState({
          status: 'ready',
          rootKey: identity.rootKey,
          lastCompletedAt
        })
      }
      finishJob(identity)
      void queryDbRef.current()
    })
    return () => { unsubProgress(); unsubDone() }
  }, [acceptJob, applyAnalysisProgress, backendAPI, finishJob])

  useEffect(() => {
    const unsubProgress = backendAPI.onCalibrationProgress((progress) => {
      const identity = progress.identity
      if (!identity || identity.rootKey !== activeRootKeyRef.current) return
      const active = activeCalibrationRef.current
      if (active && active.jobId !== identity.jobId) return
      activeCalibrationRef.current = identity
      setCalibrationProgress(progress)
      if (progress.status !== 'calibrating') activeCalibrationRef.current = null
    })
    const unsubDone = backendAPI.onCalibrationDone((done) => {
      if (done.identity.rootKey !== activeRootKeyRef.current ||
          activeCalibrationRef.current?.jobId !== done.identity.jobId) {
        return
      }
      activeCalibrationRef.current = null
      setCalibrationProgress({
        identity: null,
        status: 'idle',
        analyzed: 0,
        total: 0
      })
      void queryDbRef.current()
    })
    return () => { unsubProgress(); unsubDone() }
  }, [backendAPI])

  const startUniformFolderCalibration = useCallback(async () => {
    const syncActive = librarySyncState.status === 'checking' ||
      librarySyncState.status === 'syncing' ||
      librarySyncState.status === 'analyzing'
    if (!sampleFolder || syncActive || calibrationProgress.status === 'calibrating') return
    try {
      const identity = await backendAPI.startUniformFolderCalibration(sampleFolder)
      if (identity.rootKey !== activeRootKeyRef.current) return
      activeCalibrationRef.current = identity
      setCalibrationProgress((current) =>
        current.identity?.jobId === identity.jobId && current.status === 'calibrating'
          ? current
          : { identity, status: 'calibrating', analyzed: 0, total: 0 }
      )
    } catch (cause) {
      console.error('Failed to start Uniform Folder Calibration:', cause)
      setCalibrationProgress({
        identity: null,
        status: 'error',
        analyzed: 0,
        total: 0,
        error: cause instanceof Error ? cause.message : 'Calibration failed.'
      })
    }
  }, [backendAPI, calibrationProgress.status, librarySyncState.status, sampleFolder])

  const cancelUniformFolderCalibration = useCallback(async () => {
    const identity = calibrationProgress.identity
    if (calibrationProgress.status !== 'calibrating' || !identity) return
    await backendAPI.cancelUniformFolderCalibration(identity.jobId)
  }, [backendAPI, calibrationProgress])

  const updateSampleAnalysis = useCallback(async (
    sample: SampleListItem,
    patch: SampleAnalysisPatch
  ) => {
    await backendAPI.updateSampleAnalysis(sample.dbId, patch)
    setSamples((current) => current.map((item) => {
      if (item.dbId !== sample.dbId) return item
      const next = { ...item }
      if (Object.prototype.hasOwnProperty.call(patch, 'bpm')) {
        next.bpm = patch.bpm ?? null
        next.bpmSource = patch.bpm === null ? null : 'manual'
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'musicalKey')) {
        next.musicalKey = patch.musicalKey ?? null
        next.musicalKeySource = patch.musicalKey === null ? null : 'manual'
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'sampleType')) {
        next.sampleType = patch.sampleType ?? null
        next.sampleTypeSource = patch.sampleType === null ? null : 'manual'
      }
      return next
    }))
  }, [backendAPI])

  const reanalyzeSample = useCallback(async (sample: SampleListItem) => {
    if (!sampleFolder) return
    await backendAPI.reanalyzeSample(sampleFolder, sample.dbId, sample.relpath)
    await queryDbRef.current()
  }, [backendAPI, sampleFolder])

  // Updates one loaded list item's denormalized tag fields after an
  // assign/unassign, without re-running the whole query.
  const patchSampleTags = useCallback((relpath: string, tagIds: number[], tagNames: string[]) => {
    setSamples((prev) =>
      prev.map((s) => (s.relpath === relpath ? { ...s, tagIds, tags: tagNames } : s))
    )
  }, [])

  // --- Composed sub-hooks ---

  const tagActions = useSampleTags(
    backendAPI, tags, setTags, setSelectedTagIds,
    patchSampleTags, setSamples
  )

  const categoryActions = useSampleCategories(
    backendAPI, setCategories, selectedCategoryId, setSelectedCategoryId
  )

  const libraryActions = useSampleLibraries(
    backendAPI, setLibraries,
    searchQuery, selectedCategoryId, selectedTagIds,
    setSearchQuery, setSelectedCategoryId, setSelectedTagIds
  )

  // ---

  const handleSortChange = useCallback((col: SampleSortColumn) => {
    setSort((prev) =>
      prev.by === col
        ? { by: col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { by: col, dir: 'asc' }
    )
  }, [])

  return {
    version,
    mixJamFiles,
    samples,
    searchQuery,
    loading,
    error,
    selectedSampleDetail,
    librarySyncState,
    calibrationProgress,
    totalCount,
    dbIndexed,
    missingSamplePaths,
    hasMoreSamples: dbIndexed && samples.length < totalCount,
    selectedCategoryId,
    selectedTagIds,
    sortBy: sort.by,
    sortDir: sort.dir,
    tags,
    categories,
    libraries,
    setSelectedSampleDetail,
    setSearchQuery,
    setSelectedCategoryId,
    setSelectedTagIds,
    rescanLibrary: requestLibrarySync,
    retryLibrarySync: requestLibrarySync,
    cancelLibrarySync,
    startUniformFolderCalibration,
    cancelUniformFolderCalibration,
    loadMoreSamples,
    createTag: tagActions.createTag,
    renameTag: tagActions.renameTag,
    setTagColor: tagActions.setTagColor,
    deleteTag: tagActions.deleteTag,
    assignTagToSample: tagActions.assignTagToSample,
    unassignTagFromSample: tagActions.unassignTagFromSample,
    updateSampleAnalysis,
    reanalyzeSample,
    createCategory: categoryActions.createCategory,
    deleteCategory: categoryActions.deleteCategory,
    saveLibrary: libraryActions.saveLibrary,
    deleteLibrary: libraryActions.deleteLibrary,
    applyLibrary: libraryActions.applyLibrary,
    reloadMixJamFiles,
    handleSortChange
  }
}
