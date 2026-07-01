import { useCallback, useEffect, useRef, useState } from 'react'
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

export interface LibraryDataState {
  version: string
  recentProjects: RecentProjectItem[]
  /** Unified sample list — populated from the DB browser after the first scan,
   *  falling back to the legacy folder scanner before any scan has run. */
  samples: SampleListItem[]
  searchQuery: string
  loading: boolean
  error: string | null
  selectedSampleDetail: FooterSampleDetail | null
  scanProgress: ScanProgress
  totalCount: number
  selectedCategoryId: number | undefined
  selectedTagIds: number[]
  sortBy: 'filename' | 'duration' | 'dateAdded'
  sortDir: 'asc' | 'desc'
  tags: TagItem[]
  categories: CategoryItem[]
  libraries: LibraryItem[]
}

export interface LibraryDataActions {
  setSelectedSampleDetail: (detail: FooterSampleDetail | null) => void
  setSearchQuery: (query: string) => void
  rescanSampleBrowser: () => Promise<void>
  setSelectedCategoryId: (id: number | undefined) => void
  setSelectedTagIds: React.Dispatch<React.SetStateAction<number[]>>
  setSortBy: React.Dispatch<React.SetStateAction<'filename' | 'duration' | 'dateAdded'>>
  setSortDir: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  startLibraryScan: () => Promise<void>
  createTag: (name: string, color?: string) => Promise<TagItem>
  renameTag: (id: number, name: string) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  createCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  deleteCategory: (id: number) => Promise<void>
  saveLibrary: (name: string) => Promise<LibraryItem>
  deleteLibrary: (id: number) => Promise<void>
  reloadRecentProjects: () => Promise<void>
  handleSortChange: (col: 'filename' | 'duration' | 'dateAdded') => void
}

export type LibraryData = LibraryDataState & LibraryDataActions

function dbSampleToListItem(s: SampleItem, categories: readonly CategoryItem[]): SampleListItem {
  const cat = categories.find((c) => c.id === s.categoryId)
  return {
    id: s.filepath,
    name: s.filename,
    filepath: s.filepath,
    category: cat?.name ?? 'Unsorted',
    durationSeconds: s.duration,
    tags: [],
    categoryId: s.categoryId,
    tagIds: []
  }
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
  const [sortBy, setSortBy] = useState<'filename' | 'duration' | 'dateAdded'>('filename')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [tags, setTags] = useState<TagItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [libraries, setLibraries] = useState<LibraryItem[]>([])
  const querySeqRef = useRef(0)

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

  // Check whether the DB has been indexed (at least one sample row exists).
  // Re-check whenever the sample folder changes or a scan completes.
  const refreshDbIndexed = useCallback(async () => {
    try {
      const hasRows = await electronAPI.hasSamples()
      if (hasRows) setDbIndexed(true)
    } catch {
      // Keep dbIndexed false on error — legacy fallback stays active.
    }
  }, [electronAPI])

  useEffect(() => {
    if (sampleFolder) void refreshDbIndexed()
    else {
      setDbIndexed(false)
      setSamples([])
      setTotalCount(0)
      setLoading(false)
    }
  }, [sampleFolder, refreshDbIndexed])

  // Legacy folder-browser query (used only before the first DB scan).
  const queryLegacy = useCallback(
    async (q: string, forceRescan: boolean) => {
      if (!sampleFolder) {
        setSamples([])
        setLoading(false)
        setError(null)
        return
      }
      const seq = ++querySeqRef.current
      setLoading(true)
      try {
        const rows = await electronAPI.querySampleBrowser(sampleFolder, q, forceRescan)
        if (seq !== querySeqRef.current) return
        setSamples(rows)
        setTotalCount(rows.length)
        setError(null)
      } catch (e) {
        if (seq !== querySeqRef.current) return
        console.error('Failed to query sample browser:', e)
        setSamples([])
        setTotalCount(0)
        setError('Unable to load sample library.')
      } finally {
        if (seq === querySeqRef.current) setLoading(false)
      }
    },
    [electronAPI, sampleFolder]
  )

  // DB-backed query (used after the first scan has completed).
  const queryDb = useCallback(async () => {
    const seq = ++querySeqRef.current
    setLoading(true)
    try {
      const rows: SampleItem[] = []
      let total = 0
      let offset = 0

      do {
        const result = await electronAPI.querySamples({
          textSearch: searchQuery || undefined,
          categoryId: selectedCategoryId,
          tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
          sortBy,
          sortDir,
          limit: DB_SAMPLE_PAGE_SIZE,
          offset
        })
        if (seq !== querySeqRef.current) return

        total = result.total
        rows.push(...result.rows)
        if (result.rows.length === 0) break
        offset += result.rows.length
      } while (rows.length < total)

      const mapped = rows.map((s) => dbSampleToListItem(s, categories))
      setSamples(mapped)
      setTotalCount(total)
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
  }, [electronAPI, searchQuery, selectedCategoryId, selectedTagIds, sortBy, sortDir, categories])

  // Debounced query: chooses legacy or DB pipeline based on dbIndexed.
  const runQuery = useCallback(
    async (q: string, forceRescan: boolean) => {
      if (dbIndexed) {
        await queryDb()
      } else {
        await queryLegacy(q, forceRescan)
      }
    },
    [dbIndexed, queryDb, queryLegacy]
  )

  // Debounce effect for search
  useEffect(() => {
    if (!sampleFolder) {
      setSamples([])
      setSearchQuery('')
      setLoading(false)
      setError(null)
      setSelectedSampleDetail(null)
      return
    }
    let cancelled = false
    const currentQuery = searchQuery
    const timer = window.setTimeout(() => {
      if (!cancelled) void runQuery(currentQuery, false)
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [runQuery, sampleFolder, searchQuery])

  // Debounce effect for DB filter changes (category, tags, sort)
  useEffect(() => {
    if (!dbIndexed || !sampleFolder) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) void runQuery(searchQuery, false)
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [dbIndexed, sampleFolder, selectedCategoryId, selectedTagIds, sortBy, sortDir, runQuery, searchQuery])

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

  const rescanSampleBrowser = useCallback(async () => {
    if (!dbIndexed) {
      await queryLegacy(searchQuery, true)
    }
    // When indexed, rescan is handled by startLibraryScan.
  }, [dbIndexed, queryLegacy, searchQuery])

  const startLibraryScan = useCallback(async () => {
    if (!sampleFolder) return
    await electronAPI.startScan(sampleFolder)
    setScanProgress({ status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 })
  }, [electronAPI, sampleFolder])

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
  }, [electronAPI])

  const deleteTag = useCallback(async (id: number) => {
    await electronAPI.deleteTag(id)
    setTags((prev) => prev.filter((t) => t.id !== id))
    setSelectedTagIds((prev) => prev.filter((tid) => tid !== id))
  }, [electronAPI])

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

  const handleSortChange = useCallback((col: 'filename' | 'duration' | 'dateAdded') => {
    setSortBy((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return col
      }
      setSortDir('asc')
      return col
    })
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
    selectedCategoryId,
    selectedTagIds,
    sortBy,
    sortDir,
    tags,
    categories,
    libraries,
    setSelectedSampleDetail,
    setSearchQuery,
    rescanSampleBrowser,
    setSelectedCategoryId,
    setSelectedTagIds,
    setSortBy,
    setSortDir,
    startLibraryScan,
    createTag,
    renameTag,
    deleteTag,
    createCategory,
    deleteCategory,
    saveLibrary,
    deleteLibrary,
    reloadRecentProjects,
    handleSortChange
  }
}
