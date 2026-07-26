import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BackendAPI,
  FolderRef,
  LibraryItem,
  LibrarySyncState,
  MixJamFileItem,
  SampleItem,
  SampleAnalysisPatch,
  SampleListItem,
  SampleQueryRequest,
  TagItem
} from '../../../shared/backend-api'
import { sourceGroupFromRelpath } from '../../../shared/sample-palette'
import type { FooterSampleDetail } from '../lib/arrangement'
import { decodeLibraryRule, encodeLibraryRule } from '../lib/library-rule'
import { useSampleTags, type TagRefreshResult } from './useSampleTags'
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
  selectedTagIds: number[]
  sortBy: SampleSortColumn
  sortDir: SampleSortDirection
  tags: TagItem[]
  libraries: LibraryItem[]
}

export interface LibraryDataActions {
  setSelectedSampleDetail: (detail: FooterSampleDetail | null) => void
  setSearchQuery: (query: string) => void
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
  saveLibrary: (name: string) => Promise<LibraryItem>
  deleteLibrary: (id: number) => Promise<void>
  /** Restores the filter state a saved library encodes (spec-004 AC-013). */
  applyLibrary: (library: LibraryItem) => void
  reloadMixJamFiles: () => Promise<void>
  handleSortChange: (col: SampleSortColumn) => void
}

export type LibraryData = LibraryDataState & LibraryDataActions

function dbSampleToListItem(s: SampleItem): SampleListItem {
  return {
    id: s.relpath,
    dbId: s.id,
    name: s.filename,
    relpath: s.relpath,
    sourceGroup: sourceGroupFromRelpath(s.relpath),
    durationSeconds: s.duration,
    bpm: s.bpm,
    bpmSource: s.bpmSource,
    musicalKey: s.musicalKey,
    musicalKeySource: s.musicalKeySource,
    sampleType: s.sampleType,
    sampleTypeSource: s.sampleTypeSource,
    tags: s.tags,
    tagIds: s.tagIds,
    folderTagIds: s.folderTagIds,
    userTagIds: s.userTagIds
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
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [sort, setSort] = useState<{ by: SampleSortColumn; dir: SampleSortDirection }>({
    by: 'filename',
    dir: 'asc'
  })
  const [tags, setTags] = useState<TagItem[]>([])
  const [libraries, setLibraries] = useState<LibraryItem[]>([])
  const [queryRefreshVersion, setQueryRefreshVersion] = useState(0)
  const querySeqRef = useRef(0)
  const activeSampleFolderIdRef = useRef(sampleFolder?.id ?? null)
  const tagRefreshSeqRef = useRef(0)
  const missingRefreshSeqRef = useRef(0)
  // Windowed paging cursor for the current query generation.
  const nextOffsetRef = useRef(0)
  const firstPagePendingSeqRef = useRef<number | null>(null)
  const loadingMoreSeqRef = useRef<number | null>(null)
  activeSampleFolderIdRef.current = sampleFolder?.id ?? null

  const requestQueryRefresh = useCallback(() => {
    setQueryRefreshVersion((version) => version + 1)
  }, [])

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
    const rootId = sampleFolder?.id
    const seq = ++missingRefreshSeqRef.current
    if (!sampleFolder || rootId === undefined) return
    try {
      const next = new Set(await backendAPI.listMissingRelpaths(sampleFolder))
      if (seq !== missingRefreshSeqRef.current || activeSampleFolderIdRef.current !== rootId) return
      // Keep the previous Set identity when contents are unchanged (the
      // common case: empty -> empty on every scan) so App's arrangement memo
      // and the memoized LaneRow/LaneSampleBubbleCanvas tree don't re-render and
      // repaint every lane canvas for a no-op.
      setMissingSamplePaths((prev) => setsEqual(prev, next) ? prev : next)
    } catch {
      if (seq !== missingRefreshSeqRef.current || activeSampleFolderIdRef.current !== rootId) return
      setMissingSamplePaths((prev) => prev.size === 0 ? prev : new Set())
    }
  }, [backendAPI, sampleFolder])

  const queryDbRef = useRef<() => Promise<void>>(async () => {})
  const refreshMissingRef = useRef<() => Promise<void>>(async () => {})
  const refreshLibraryMetadata = useCallback(async (): Promise<TagRefreshResult> => {
    const rootId = sampleFolder?.id ?? null
    const seq = ++tagRefreshSeqRef.current
    try {
      const nextTags = await backendAPI.listTags(rootId ?? undefined)
      if (seq !== tagRefreshSeqRef.current || activeSampleFolderIdRef.current !== rootId) {
        return { status: 'superseded' }
      }
      const visibleIds = new Set(nextTags.map(({ id }) => id))
      setTags(nextTags)
      setSelectedTagIds((current) => {
        const next = current.filter((id) => visibleIds.has(id))
        return next.length === current.length ? current : next
      })
      requestQueryRefresh()
      return { status: 'applied', tags: nextTags }
    } catch (error) {
      console.error('Failed to refresh tags:', error)
      return { status: 'failed' }
    }
  }, [backendAPI, requestQueryRefresh, sampleFolder])
  const librarySync = useLibrarySyncRuntime({
    backendAPI,
    sampleFolder,
    onScanDone: () => {
      void refreshLibraryMetadata()
      void refreshMissingRef.current()
    },
    onAnalysisDone: requestQueryRefresh
  })
  const { state: librarySyncState, dbIndexed } = librarySync

  // Query and selection state belongs to the database browse workflow, not
  // the library lifecycle. Reset it when the active Sample Folder changes.
  useEffect(() => {
    querySeqRef.current++
    firstPagePendingSeqRef.current = null
    loadingMoreSeqRef.current = null
    tagRefreshSeqRef.current++
    missingRefreshSeqRef.current++
    setSamples([])
    setTotalCount(0)
    setLoading(false)
    setSelectedTagIds([])
    setTags([])
    setMissingSamplePaths(new Set())
    if (!sampleFolder) {
      return
    }
    void refreshMissingSamplePaths()
  }, [refreshMissingSamplePaths, sampleFolder])

  // Windowed DB query, scoped to the active Sample Folder's scan root. Fetches
  // only the first page; the grid requests more via loadMoreSamples as the user
  // scrolls, so the renderer never holds the full result set (AGENTS.md hard
  // rule: windowed pages over IPC, never full result sets).
  const buildQueryRequest = useCallback((rootId: string, offset: number): SampleQueryRequest => ({
    textSearch: searchQuery || undefined,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    rootId,
    sortBy: sort.by,
    sortDir: sort.dir,
    limit: DB_SAMPLE_PAGE_SIZE,
    offset
  }), [searchQuery, selectedTagIds, sort])

  const queryDb = useCallback(async (generation?: number) => {
    if (!sampleFolder) return
    const seq = generation ?? ++querySeqRef.current
    if (generation === undefined) {
      firstPagePendingSeqRef.current = seq
      loadingMoreSeqRef.current = null
      nextOffsetRef.current = 0
    }
    setLoading(true)
    try {
      const result = await backendAPI.querySamples(buildQueryRequest(sampleFolder.id, 0))
      if (seq !== querySeqRef.current) return

      nextOffsetRef.current = result.rows.length
      setSamples(result.rows.map(dbSampleToListItem))
      setTotalCount(result.total)
      setError(null)
    } catch {
      if (seq !== querySeqRef.current) return
      setSamples([])
      setTotalCount(0)
      setError('Unable to query library.')
    } finally {
      if (seq === querySeqRef.current) {
        firstPagePendingSeqRef.current = null
        setLoading(false)
      }
    }
  }, [backendAPI, sampleFolder, buildQueryRequest])

  const loadMoreSamples = useCallback(() => {
    if (!dbIndexed || !sampleFolder) return
    const seq = querySeqRef.current
    if (firstPagePendingSeqRef.current === seq || loadingMoreSeqRef.current === seq) return
    const offset = nextOffsetRef.current
    loadingMoreSeqRef.current = seq
    void backendAPI
      .querySamples(buildQueryRequest(sampleFolder.id, offset))
      .then((result) => {
        // A newer query superseded this page while it was in flight.
        if (seq !== querySeqRef.current || result.rows.length === 0) return
        nextOffsetRef.current = offset + result.rows.length
        setSamples((prev) => [
          ...prev,
          ...result.rows.map(dbSampleToListItem)
        ])
        setTotalCount(result.total)
      })
      .catch((e: unknown) => {
        console.error('Failed to load more samples:', e)
      })
      .finally(() => {
        if (loadingMoreSeqRef.current === seq) loadingMoreSeqRef.current = null
      })
  }, [backendAPI, dbIndexed, sampleFolder, buildQueryRequest])

  // Debounced query: one effect covers search, filter, and sort changes.
  // Before the active folder's first scan completes there is nothing to query;
  // the browser shows its empty state until onScanDone flips dbIndexed.
  useEffect(() => {
    const seq = ++querySeqRef.current
    firstPagePendingSeqRef.current = seq
    loadingMoreSeqRef.current = null
    nextOffsetRef.current = 0
    if (!sampleFolder) {
      firstPagePendingSeqRef.current = null
      setSamples([])
      setSearchQuery('')
      setLoading(false)
      setError(null)
      setSelectedSampleDetail(null)
      return
    }
    if (!dbIndexed) {
      firstPagePendingSeqRef.current = null
      setSamples([])
      setTotalCount(0)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void queryDb(seq)
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [sampleFolder, dbIndexed, queryDb, queryRefreshVersion])

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

  // User tags are global; the active Sample Folder contributes read-only folder tags.
  useEffect(() => {
    let active = true
    void refreshLibraryMetadata()
    void backendAPI.listLibraries().then((nextLibraries) => {
      if (!active) return
      setLibraries(nextLibraries)
    })
    return () => { active = false }
  }, [backendAPI, refreshLibraryMetadata, sampleFolder])

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
  const patchSampleTags = useCallback((
    relpath: string,
    tagIds: number[],
    userTagIds: number[],
    tagNames: string[]
  ) => {
    setSamples((prev) =>
      prev.map((s) => (s.relpath === relpath ? { ...s, tagIds, userTagIds, tags: tagNames } : s))
    )
  }, [])

  // --- Composed sub-hooks ---

  const tagActions = useSampleTags(
    backendAPI, tags, setTags, setSelectedTagIds,
    patchSampleTags, setSamples, sampleFolder?.id ?? null, requestQueryRefresh,
    refreshLibraryMetadata
  )

  // Saved libraries. These were once a separate hook, but it took seven
  // parameters — this hook's own state and setters — to return three thin
  // callbacks, so the split cost more plumbing than it hid.
  const saveLibrary = useCallback(async (name: string) => {
    const ruleJson = encodeLibraryRule({ textSearch: searchQuery, tagIds: selectedTagIds })
    const library = await backendAPI.saveLibrary(name, ruleJson)
    setLibraries((current) =>
      [...current, library].sort((left, right) => left.name.localeCompare(right.name)))
    return library
  }, [backendAPI, searchQuery, selectedTagIds])

  const deleteLibrary = useCallback(async (id: number) => {
    await backendAPI.deleteLibrary(id)
    setLibraries((current) => current.filter((library) => library.id !== id))
  }, [backendAPI])

  const applyLibrary = useCallback((library: LibraryItem) => {
    const rule = decodeLibraryRule(library.ruleJson)
    const availableIds = new Set(tags.map((tag) => tag.id))
    setSearchQuery(rule.textSearch)
    setSelectedTagIds(rule.tagIds.filter((id) => availableIds.has(id)))
  }, [tags])

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
    selectedTagIds,
    sortBy: sort.by,
    sortDir: sort.dir,
    tags,
    libraries,
    setSelectedSampleDetail,
    setSearchQuery,
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
    saveLibrary,
    deleteLibrary,
    applyLibrary,
    reloadMixJamFiles,
    handleSortChange
  }
}
