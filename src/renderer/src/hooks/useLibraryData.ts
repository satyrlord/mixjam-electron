import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CategoryItem,
  ElectronAPI,
  LibraryItem,
  RecentProjectItem,
  SampleItem,
  SampleListItem,
  ScanProgress,
  TagItem
} from '../../../shared/ipc'
import type { FooterSampleDetail } from '../lib/playerShell'

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
    id: s.filepath,
    dbId: s.id,
    name: s.filename,
    filepath: s.filepath,
    category: (s.categoryId !== null ? categoryNames.get(s.categoryId) : undefined) ?? 'Unsorted',
    durationSeconds: s.duration,
    tags: s.tags,
    categoryId: s.categoryId,
    tagIds: s.tagIds
  }
}

// Shape of the rule_json written by saveLibrary below. Parsed defensively when
// a library is applied — a malformed blob restores nothing rather than crashing.
interface RuleNode {
  kind?: unknown
  query?: unknown
  categoryIds?: unknown
  tagIds?: unknown
}

function parseLibraryRule(ruleJson: string): {
  textSearch: string
  categoryId: number | undefined
  tagIds: number[]
} {
  const result = { textSearch: '', categoryId: undefined as number | undefined, tagIds: [] as number[] }
  try {
    const parsed = JSON.parse(ruleJson) as { root?: { children?: RuleNode[] } }
    for (const child of parsed.root?.children ?? []) {
      if (child.kind === 'text' && typeof child.query === 'string') {
        result.textSearch = child.query
      } else if (child.kind === 'category' && Array.isArray(child.categoryIds)) {
        const first = child.categoryIds[0]
        if (typeof first === 'number') result.categoryId = first
      } else if (child.kind === 'tag' && Array.isArray(child.tagIds)) {
        result.tagIds = child.tagIds.filter((id): id is number => typeof id === 'number')
      }
    }
  } catch {
    // Malformed rule_json — apply nothing.
  }
  return result
}

const DB_SAMPLE_PAGE_SIZE = 500

export function useLibraryData(
  electronAPI: ElectronAPI,
  userFolder: string | null,
  sampleFolder: string | null
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
  // Sort column and direction live in one state object so handleSortChange can
  // derive the next direction from the previous column inside a single pure
  // updater (setting one state from inside another updater double-fires under
  // StrictMode).
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
  const categoryNamesRef = useRef(categoryNames)
  useEffect(() => { categoryNamesRef.current = categoryNames }, [categoryNames])

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
    void electronAPI
      .getVersion()
      .then((v) => { if (isMounted) setVersion(v) })
      .catch((error: unknown) => {
        console.error('Failed to read app version:', error)
        if (isMounted) setVersion('version unavailable')
      })
    return () => { isMounted = false }
  }, [electronAPI])

  // Recent projects
  const reloadRecentProjects = useCallback(async () => {
    try {
      setRecentProjects(await electronAPI.loadRecentProjects(userFolder))
    } catch (err) {
      console.error('Failed to load recent projects:', err)
      setRecentProjects([])
    }
  }, [electronAPI, userFolder])

  useEffect(() => {
    void reloadRecentProjects()
  }, [reloadRecentProjects])

  // Check whether the active Sample Folder has been indexed. Re-check whenever
  // the folder changes or a scan completes.
  const refreshDbIndexed = useCallback(async () => {
    if (!sampleFolder) return
    try {
      setDbIndexed(await electronAPI.hasSamples(sampleFolder))
    } catch {
      // Keep dbIndexed false on error — the browser stays in its empty state.
    }
  }, [electronAPI, sampleFolder])

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
      const result = await electronAPI.querySamples({
        textSearch: searchQuery || undefined,
        categoryId: selectedCategoryId,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        rootPath: sampleFolder,
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
    } catch (e) {
      if (seq !== querySeqRef.current) return
      console.error('Failed to query DB samples:', e)
      setSamples([])
      setTotalCount(0)
      setError('Unable to query library.')
    } finally {
      if (seq === querySeqRef.current) setLoading(false)
    }
  }, [electronAPI, sampleFolder, searchQuery, selectedCategoryId, selectedTagIds, sort])

  const loadMoreSamples = useCallback(() => {
    if (!dbIndexed || !sampleFolder || loadingMoreRef.current) return
    const seq = querySeqRef.current
    const offset = nextOffsetRef.current
    loadingMoreRef.current = true
    void electronAPI
      .querySamples({
        textSearch: searchQuery || undefined,
        categoryId: selectedCategoryId,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        rootPath: sampleFolder,
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
  }, [electronAPI, dbIndexed, sampleFolder, searchQuery, selectedCategoryId, selectedTagIds, sort])

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
    const stillVisible = samples.some((s) => s.filepath === selectedSampleDetail.filepath)
    if (!stillVisible) setSelectedSampleDetail(null)
  }, [samples, selectedSampleDetail])

  // Keep a ref to the latest queryDb so the onScanDone callback calls the
  // current version with up-to-date filter state.
  const queryDbRef = useRef(queryDb)
  queryDbRef.current = queryDb

  // Scan progress listeners
  useEffect(() => {
    const unsubProgress = electronAPI.onScanProgress((progress) => setScanProgress(progress))
    const unsubDone = electronAPI.onScanDone(() => {
      setScanProgress({ status: 'idle', phase: null, found: 0, processed: 0, total: 0 })
      setDbIndexed(true)
      // Refresh categories (folder-driven categories may have changed)
      void electronAPI.listCategories().then(setCategories)
      void electronAPI.listTags().then(setTags)
      void queryDbRef.current()
    })
    return () => { unsubProgress(); unsubDone() }
  }, [electronAPI])

  // Tags, categories, libraries — load once on mount
  useEffect(() => {
    let active = true
    void Promise.all([
      electronAPI.listTags(),
      electronAPI.listCategories(),
      electronAPI.listLibraries()
    ]).then(([t, c, l]) => {
      if (active) { setTags(t); setCategories(c); setLibraries(l) }
    })
    return () => { active = false }
  }, [electronAPI])

  const startLibraryScan = useCallback(async () => {
    if (!sampleFolder) return
    await electronAPI.startScan(sampleFolder)
    setScanProgress({ status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 })
  }, [electronAPI, sampleFolder])

  // Mirror of the tags list for callbacks that need the latest names without
  // re-subscribing (rename/assign/unassign patch denormalized names).
  const tagsRef = useRef(tags)
  useEffect(() => { tagsRef.current = tags }, [tags])

  const createTag = useCallback(async (name: string, color?: string) => {
    const tag = await electronAPI.createTag(name, color)
    setTags((prev) =>
      (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]).sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    )
    return tag
  }, [electronAPI])

  const renameTag = useCallback(async (id: number, name: string) => {
    await electronAPI.renameTag(id, name)
    setTags((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name } : t)).sort((a, b) => a.name.localeCompare(b.name))
    )
    // Per-sample tag names are denormalized into the list items; rewrite them
    // from the post-rename id -> name mapping (AC-008: rename reflects on all
    // assigned samples).
    const renamed = new Map(tagsRef.current.map((t) => [t.id, t.id === id ? name : t.name]))
    setSamples((prev) =>
      prev.map((s) =>
        s.tagIds.includes(id)
          ? {
              ...s,
              tags: s.tagIds
                .map((tid) => renamed.get(tid))
                .filter((n): n is string => n !== undefined)
                .sort((a, b) => a.localeCompare(b))
            }
          : s
      )
    )
  }, [electronAPI])

  const deleteTag = useCallback(async (id: number) => {
    await electronAPI.deleteTag(id)
    setTags((prev) => prev.filter((t) => t.id !== id))
    setSelectedTagIds((prev) => prev.filter((tid) => tid !== id))
    setSamples((prev) =>
      prev.map((s) => {
        const idx = s.tagIds.indexOf(id)
        if (idx === -1) return s
        return {
          ...s,
          tagIds: s.tagIds.filter((tid) => tid !== id),
          tags: s.tags.filter((_, i) => i !== idx)
        }
      })
    )
  }, [electronAPI])

  // Updates one loaded list item's denormalized tag fields after an
  // assign/unassign, without re-running the whole query.
  const patchSampleTags = useCallback((filepath: string, tagIds: number[], tagNames: string[]) => {
    setSamples((prev) =>
      prev.map((s) => (s.filepath === filepath ? { ...s, tagIds, tags: tagNames } : s))
    )
  }, [])

  const assignTagToSample = useCallback(async (sample: SampleListItem, tagId: number) => {
    if (sample.tagIds.includes(tagId)) return
    await electronAPI.assignTag(sample.dbId, tagId)
    const nextIds = [...sample.tagIds, tagId].sort((a, b) => a - b)
    const nextNames = nextIds
      .map((id) => tagsRef.current.find((t) => t.id === id)?.name)
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.localeCompare(b))
    patchSampleTags(sample.filepath, nextIds, nextNames)
  }, [electronAPI, patchSampleTags])

  const unassignTagFromSample = useCallback(async (sample: SampleListItem, tagId: number) => {
    if (!sample.tagIds.includes(tagId)) return
    await electronAPI.unassignTag(sample.dbId, tagId)
    const nextIds = sample.tagIds.filter((id) => id !== tagId)
    const nextNames = nextIds
      .map((id) => tagsRef.current.find((t) => t.id === id)?.name)
      .filter((name): name is string => name !== undefined)
      .sort((a, b) => a.localeCompare(b))
    patchSampleTags(sample.filepath, nextIds, nextNames)
  }, [electronAPI, patchSampleTags])

  const createCategory = useCallback(async (name: string, parentId?: number) => {
    const cat = await electronAPI.createCategory(name, parentId)
    setCategories((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat]))
    return cat
  }, [electronAPI])

  const deleteCategory = useCallback(async (id: number) => {
    await electronAPI.deleteCategory(id)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    if (selectedCategoryId === id) setSelectedCategoryId(undefined)
  }, [electronAPI, selectedCategoryId])

  const saveLibrary = useCallback(async (name: string) => {
    const ruleJson = JSON.stringify({
      version: 1,
      root: {
        kind: 'group',
        op: 'and',
        children: [
          ...(searchQuery ? [{ kind: 'text', query: searchQuery }] : []),
          ...(selectedCategoryId !== undefined
            ? [{ kind: 'category', quantifier: 'any' as const, categoryIds: [selectedCategoryId], includeDescendants: true }]
            : []),
          ...(selectedTagIds.length > 0
            ? [{ kind: 'tag', quantifier: 'any' as const, tagIds: selectedTagIds }]
            : [])
        ]
      }
    })
    const lib = await electronAPI.saveLibrary(name, ruleJson)
    setLibraries((prev) => [...prev, lib].sort((a, b) => a.name.localeCompare(b.name)))
    return lib
  }, [electronAPI, searchQuery, selectedCategoryId, selectedTagIds])

  const deleteLibrary = useCallback(async (id: number) => {
    await electronAPI.deleteLibrary(id)
    setLibraries((prev) => prev.filter((l) => l.id !== id))
  }, [electronAPI])

  const applyLibrary = useCallback((library: LibraryItem) => {
    const rule = parseLibraryRule(library.ruleJson)
    setSearchQuery(rule.textSearch)
    setSelectedCategoryId(rule.categoryId)
    setSelectedTagIds(rule.tagIds)
  }, [])

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
    loadMoreSamples,
    createTag,
    renameTag,
    deleteTag,
    assignTagToSample,
    unassignTagFromSample,
    createCategory,
    deleteCategory,
    saveLibrary,
    deleteLibrary,
    applyLibrary,
    reloadRecentProjects,
    handleSortChange
  }
}
