import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BackendAPI,
  CategoryItem,
  FolderRef,
  LibraryItem,
  LibrarySyncState,
  MixJamFileItem,
  SampleItem,
  SampleAnalysisPatch,
  SampleListItem,
  TagItem
} from '../../../shared/backend-api'
import type { FooterSampleDetail } from '../lib/arrangement'
import { useSyncedRef } from './useSyncedRef'
import { useSampleTags } from './useSampleTags'
import { useSampleCategories } from './useSampleCategories'
import { useSampleLibraries } from './useSampleLibraries'
import { useLibrarySyncRuntime } from './useLibrarySyncRuntime'

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

  const queryDbRef = useRef<() => void>(() => {})
  const refreshMissingRef = useRef<() => void>(() => {})
  const refreshLibraryMetadata = useCallback(() => {
    void backendAPI.listCategories().then(setCategories)
    void backendAPI.listTags().then(setTags)
  }, [backendAPI])
  const librarySync = useLibrarySyncRuntime({
    backendAPI,
    sampleFolder,
    onScanDone: () => {
      refreshLibraryMetadata()
      queryDbRef.current()
      refreshMissingRef.current()
    },
    onAnalysisDone: () => queryDbRef.current()
  })
  const { state: librarySyncState, dbIndexed } = librarySync

  // Query and selection state belongs to the database browse workflow, not
  // the library lifecycle. Reset it when the active Sample Folder changes.
  useEffect(() => {
    querySeqRef.current++
    loadingMoreRef.current = false
    setSamples([])
    setTotalCount(0)
    setLoading(false)
    if (!sampleFolder) {
      setMissingSamplePaths(new Set())
      return
    }
    void refreshMissingSamplePaths()
  }, [refreshMissingSamplePaths, sampleFolder])

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

  // Keep the latest callbacks for the sync runtime without resubscribing its
  // root/job-scoped listeners whenever browse filters change.
  queryDbRef.current = queryDb
  refreshMissingRef.current = refreshMissingSamplePaths

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

  const updateSampleAnalysis = useCallback(async (
    sample: SampleListItem,
    patch: SampleAnalysisPatch
  ) => {
    await backendAPI.updateSampleAnalysis(sample.dbId, patch)
    const clearsAutomaticField = Object.entries(patch).some(([, value]) => value === null)
    if (clearsAutomaticField && sampleFolder) {
      await backendAPI.reanalyzeSample(sampleFolder, sample.dbId, sample.relpath)
      await queryDbRef.current()
      return
    }
    setSamples((current) => current.map((item) => {
      if (item.dbId !== sample.dbId) return item
      const next = { ...item }
      if (Object.prototype.hasOwnProperty.call(patch, 'bpm')) {
        next.bpm = patch.bpm!
        next.bpmSource = 'manual'
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'musicalKey')) {
        next.musicalKey = patch.musicalKey!
        next.musicalKeySource = 'manual'
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'sampleType')) {
        next.sampleType = patch.sampleType!
        next.sampleTypeSource = 'manual'
      }
      return next
    }))
  }, [backendAPI, sampleFolder])

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
    rescanLibrary: librarySync.rescan,
    retryLibrarySync: librarySync.retry,
    cancelLibrarySync: librarySync.cancel,
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
