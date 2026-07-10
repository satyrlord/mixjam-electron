import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnalysisProgress,
  BackendAPI,
  CategoryItem,
  FolderRef,
  LibraryItem,
  RecentProjectItem,
  SampleItem,
  SampleAnalysisPatch,
  SampleListItem,
  ScanProgress,
  TagItem
} from '../../../shared/backend-api'
import type { FooterSampleDetail } from '../lib/playerShell'
import { useSyncedRef } from './useSyncedRef'
import { useSampleTags } from './useSampleTags'
import { useSampleCategories } from './useSampleCategories'
import { useSampleLibraries } from './useSampleLibraries'

export type SampleSortColumn = 'filename' | 'duration' | 'dateAdded'
export type SampleSortDirection = 'asc' | 'desc'

export interface LibraryDataState {
  version: string
  recentProjects: RecentProjectItem[]
  /** The loaded prefix of the current windowed DB query; empty until the
   *  active Sample Folder's first scan completes. */
  samples: SampleListItem[]
  searchQuery: string
  loading: boolean
  error: string | null
  selectedSampleDetail: FooterSampleDetail | null
  scanProgress: ScanProgress
  analysisProgress: AnalysisProgress
  totalCount: number
  /** True once the active Sample Folder has been indexed (a scan completed). */
  dbIndexed: boolean
  /** Relpaths of samples marked missing (scan_state = 2); the tracker stripes
   *  clips referencing them (spec-002 AC-013). Refreshed after every scan. */
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
  startLibraryScan: () => Promise<void>
  cancelLibraryScan: () => Promise<void>
  /** Fetches the next windowed page of the current query (DB pipeline only). */
  loadMoreSamples: () => void
  createTag: (name: string, color?: string) => Promise<TagItem>
  renameTag: (id: number, name: string) => Promise<void>
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
  reloadRecentProjects: () => Promise<void>
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
  const [recentProjects, setRecentProjects] = useState<RecentProjectItem[]>([])
  const [samples, setSamples] = useState<SampleListItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedSampleDetail, setSelectedSampleDetail] = useState<FooterSampleDetail | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    status: 'idle', phase: null, found: 0, processed: 0, total: 0
  })
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>({
    status: 'idle', analyzed: 0, total: 0
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

  // Recent projects
  const reloadRecentProjects = useCallback(async () => {
    try {
      setRecentProjects(await backendAPI.loadRecentProjects(userFolder))
    } catch (err) {
      console.error('Failed to load recent projects:', err)
      setRecentProjects([])
    }
  }, [backendAPI, userFolder])

  useEffect(() => {
    void reloadRecentProjects()
  }, [reloadRecentProjects])

  const refreshDbIndexed = useCallback(async () => {
    if (!sampleFolder) return
    try {
      setDbIndexed(await backendAPI.hasSamples(sampleFolder))
    } catch {
      setDbIndexed(false)
    }
  }, [backendAPI, sampleFolder])

  const refreshMissingSamplePaths = useCallback(async () => {
    if (!sampleFolder) return
    try {
      const next = new Set(await backendAPI.listMissingRelpaths(sampleFolder))
      // Keep the previous Set identity when contents are unchanged (the
      // common case: empty -> empty on every scan) so App's arrangement memo
      // and the memoized LaneRow/LaneClipCanvas tree don't re-render and
      // repaint every lane canvas for a no-op.
      setMissingSamplePaths((prev) => setsEqual(prev, next) ? prev : next)
    } catch {
      setMissingSamplePaths((prev) => prev.size === 0 ? prev : new Set())
    }
  }, [backendAPI, sampleFolder])

  useEffect(() => {
    if (sampleFolder) {
      // Assume un-indexed until the check for the new folder answers, so a
      // just-switched folder never briefly renders as indexed.
      setDbIndexed(false)
      void refreshDbIndexed()
      void refreshMissingSamplePaths()
    } else {
      setDbIndexed(false)
      setMissingSamplePaths(new Set())
      setSamples([])
      setTotalCount(0)
      setLoading(false)
    }
  }, [sampleFolder, refreshDbIndexed, refreshMissingSamplePaths])

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

  // Scan progress listeners
  useEffect(() => {
    const unsubProgress = backendAPI.onScanProgress((progress) => setScanProgress(progress))
    const unsubDone = backendAPI.onScanDone(() => {
      setScanProgress({ status: 'idle', phase: null, found: 0, processed: 0, total: 0 })
      setDbIndexed(true)
      // Refresh categories (folder-driven categories may have changed)
      void backendAPI.listCategories().then(setCategories)
      void backendAPI.listTags().then(setTags)
      void queryDbRef.current()
      // A re-scan can mark placed samples missing (or resurrect them).
      void refreshMissingRef.current()
    })
    return () => { unsubProgress(); unsubDone() }
  }, [backendAPI])

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

  const startLibraryScan = useCallback(async () => {
    if (!sampleFolder || analysisProgress.status === 'analyzing') return
    await backendAPI.startScan(sampleFolder)
    setScanProgress({ status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 })
  }, [analysisProgress.status, backendAPI, sampleFolder])

  const cancelLibraryScan = useCallback(async () => {
    await backendAPI.cancelScan()
  }, [backendAPI])

  useEffect(() => {
    const unsubProgress = backendAPI.onAnalysisProgress(setAnalysisProgress)
    const unsubDone = backendAPI.onAnalysisDone(() => {
      setAnalysisProgress({ status: 'idle', analyzed: 0, total: 0 })
      void queryDbRef.current()
    })
    return () => { unsubProgress(); unsubDone() }
  }, [backendAPI])

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
  }, [backendAPI, sampleFolder])

  // Updates one loaded list item's denormalized tag fields after an
  // assign/unassign, without re-running the whole query.
  const patchSampleTags = useCallback((relpath: string, tagIds: number[], tagNames: string[]) => {
    setSamples((prev) =>
      prev.map((s) => (s.relpath === relpath ? { ...s, tagIds, tags: tagNames } : s))
    )
  }, [])

  const patchAllSamples = useCallback(
    (updater: (prev: SampleListItem[]) => SampleListItem[]) => setSamples(updater),
    []
  )

  // --- Composed sub-hooks ---

  const tagActions = useSampleTags(
    backendAPI, tags, setTags, setSelectedTagIds,
    patchSampleTags, patchAllSamples
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
    recentProjects,
    samples,
    searchQuery,
    loading,
    error,
    selectedSampleDetail,
    scanProgress,
    analysisProgress,
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
    startLibraryScan,
    cancelLibraryScan,
    loadMoreSamples,
    createTag: tagActions.createTag,
    renameTag: tagActions.renameTag,
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
    reloadRecentProjects,
    handleSortChange
  }
}
