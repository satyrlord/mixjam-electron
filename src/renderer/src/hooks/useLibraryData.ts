import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BackendAPI,
  CategoryItem,
  FolderRef,
  LibraryItem,
  RecentProjectItem,
  SampleItem,
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
  totalCount: number
  /** True once the active Sample Folder has been indexed (a scan completed). */
  dbIndexed: boolean
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
  setSortBy: React.Dispatch<React.SetStateAction<SampleSortColumn>>
  setSortDir: React.Dispatch<React.SetStateAction<SampleSortDirection>>
  startLibraryScan: () => Promise<void>
  cancelLibraryScan: () => Promise<void>
  /** Fetches the next windowed page of the current query (DB pipeline only). */
  loadMoreSamples: () => void
  createTag: (name: string, color?: string) => Promise<TagItem>
  renameTag: (id: number, name: string) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  assignTagToSample: (sample: SampleListItem, tagId: number) => Promise<void>
  unassignTagFromSample: (sample: SampleListItem, tagId: number) => Promise<void>
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
    tags: s.tags,
    categoryId: s.categoryId,
    tagIds: s.tagIds
  }
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
  const [dbIndexed, setDbIndexed] = useState(false)
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

  useEffect(() => {
    if (sampleFolder) {
      // Assume un-indexed until the check for the new folder answers, so a
      // just-switched folder never briefly renders as indexed.
      setDbIndexed(false)
      void refreshDbIndexed()
    } else {
      setDbIndexed(false)
      setSamples([])
      setTotalCount(0)
      setLoading(false)
    }
  }, [sampleFolder, refreshDbIndexed])

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
  // With a unified list the check is straightforward.
  useEffect(() => {
    if (!selectedSampleDetail) return
    const stillVisible = samples.some((s) => s.relpath === selectedSampleDetail.relpath)
    if (!stillVisible) setSelectedSampleDetail(null)
  }, [samples, selectedSampleDetail])

  // Keep a ref to the latest queryDb so the onScanDone callback calls the
  // current version with up-to-date filter state.
  const queryDbRef = useRef(queryDb)
  queryDbRef.current = queryDb

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
    if (!sampleFolder) return
    await backendAPI.startScan(sampleFolder)
    setScanProgress({ status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 })
  }, [backendAPI, sampleFolder])

  const cancelLibraryScan = useCallback(async () => {
    await backendAPI.cancelScan()
  }, [backendAPI])

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

  // Compatibility dispatchers so callers can still set column or direction
  // independently; both funnel into the single sort state.
  const setSortBy = useCallback<React.Dispatch<React.SetStateAction<SampleSortColumn>>>((action) => {
    setSort((prev) => ({
      ...prev,
      by: typeof action === 'function' ? action(prev.by) : action
    }))
  }, [])

  const setSortDir = useCallback<React.Dispatch<React.SetStateAction<SampleSortDirection>>>((action) => {
    setSort((prev) => ({
      ...prev,
      dir: typeof action === 'function' ? action(prev.dir) : action
    }))
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
    totalCount,
    dbIndexed,
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
    setSortBy,
    setSortDir,
    startLibraryScan,
    cancelLibraryScan,
    loadMoreSamples,
    createTag: tagActions.createTag,
    renameTag: tagActions.renameTag,
    deleteTag: tagActions.deleteTag,
    assignTagToSample: tagActions.assignTagToSample,
    unassignTagFromSample: tagActions.unassignTagFromSample,
    createCategory: categoryActions.createCategory,
    deleteCategory: categoryActions.deleteCategory,
    saveLibrary: libraryActions.saveLibrary,
    deleteLibrary: libraryActions.deleteLibrary,
    applyLibrary: libraryActions.applyLibrary,
    reloadRecentProjects,
    handleSortChange
  }
}
