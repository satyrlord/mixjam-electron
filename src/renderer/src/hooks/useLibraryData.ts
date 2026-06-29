import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CategoryItem,
  ElectronAPI,
  LibraryItem,
  RecentProjectItem,
  SampleBrowserItem,
  SampleItem,
  ScanProgress,
  TagItem
} from '../../../shared/ipc'
import type { FooterSampleDetail } from '../lib/playerShell'

export interface LibraryDataState {
  version: string
  recentProjects: RecentProjectItem[]
  sampleRows: SampleBrowserItem[]
  sampleSearchQuery: string
  sampleBrowserLoading: boolean
  sampleBrowserError: string | null
  selectedSampleDetail: FooterSampleDetail | null
  scanProgress: ScanProgress
  dbSamples: SampleItem[]
  dbSampleTotal: number
  dbSearchQuery: string
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
  setSampleSearchQuery: (query: string) => void
  rescanSampleBrowser: () => Promise<void>
  setDbSearchQuery: (query: string) => void
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

export function useLibraryData(
  electronAPI: ElectronAPI,
  userFolder: string | null,
  sampleFolder: string | null
): LibraryData {
  const [version, setVersion] = useState('')
  const [recentProjects, setRecentProjects] = useState<RecentProjectItem[]>([])
  const [sampleRows, setSampleRows] = useState<SampleBrowserItem[]>([])
  const [sampleSearchQuery, setSampleSearchQuery] = useState('')
  const [sampleBrowserLoading, setSampleBrowserLoading] = useState(false)
  const [sampleBrowserError, setSampleBrowserError] = useState<string | null>(null)
  const [selectedSampleDetail, setSelectedSampleDetail] = useState<FooterSampleDetail | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    status: 'idle', phase: null, found: 0, processed: 0, total: 0
  })
  const [dbSamples, setDbSamples] = useState<SampleItem[]>([])
  const [dbSampleTotal, setDbSampleTotal] = useState(0)
  const [dbSearchQuery, setDbSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined)
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [sortBy, setSortBy] = useState<'filename' | 'duration' | 'dateAdded'>('filename')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [tags, setTags] = useState<TagItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [libraries, setLibraries] = useState<LibraryItem[]>([])
  const sampleQuerySeqRef = useRef(0)
  const dbQuerySeqRef = useRef(0)

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
    } catch (error) {
      console.error('Failed to load recent projects:', error)
      setRecentProjects([])
    }
  }, [electronAPI, userFolder])

  useEffect(() => {
    void reloadRecentProjects()
  }, [reloadRecentProjects])

  // Reload DB samples (no debounce — the debounce wrapper is in the effect below)
  const reloadDbSamples = useCallback(async () => {
    const seq = ++dbQuerySeqRef.current
    const result = await electronAPI.querySamples({
      textSearch: dbSearchQuery || undefined,
      categoryId: selectedCategoryId,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      sortBy,
      sortDir,
      limit: 500
    })
    // Discard a stale response that a newer query has superseded.
    if (seq !== dbQuerySeqRef.current) return
    setDbSamples(result.rows)
    setDbSampleTotal(result.total)
  }, [electronAPI, dbSearchQuery, selectedCategoryId, selectedTagIds, sortBy, sortDir])

  // DB sample query debounce
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) void reloadDbSamples()
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [reloadDbSamples])

  // Sample browser query (with supersede guard)
  const runSampleQuery = useCallback(
    async (searchQuery: string, forceRescan: boolean) => {
      if (!sampleFolder) {
        setSampleRows([])
        setSampleBrowserLoading(false)
        setSampleBrowserError(null)
        return
      }
      const seq = ++sampleQuerySeqRef.current
      setSampleBrowserLoading(true)
      try {
        const rows = await electronAPI.querySampleBrowser(sampleFolder, searchQuery, forceRescan)
        if (seq !== sampleQuerySeqRef.current) return
        setSampleRows(rows)
        setSampleBrowserError(null)
      } catch (error) {
        if (seq !== sampleQuerySeqRef.current) return
        console.error('Failed to query sample browser:', error)
        setSampleRows([])
        setSampleBrowserError('Unable to load sample library.')
      } finally {
        if (seq === sampleQuerySeqRef.current) {
          setSampleBrowserLoading(false)
        }
      }
    },
    [electronAPI, sampleFolder]
  )

  // Debounced sample browser search
  useEffect(() => {
    if (!sampleFolder) {
      setSampleRows([])
      setSampleSearchQuery('')
      setSampleBrowserLoading(false)
      setSampleBrowserError(null)
      setSelectedSampleDetail(null)
      return
    }
    let cancelled = false
    const currentQuery = sampleSearchQuery
    const timer = window.setTimeout(() => {
      if (!cancelled) void runSampleQuery(currentQuery, false)
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [runSampleQuery, sampleFolder, sampleSearchQuery])

  // Clear selection when the selected sample is no longer in the active list.
  // The DB browser (dbSamples, keyed by absolute filepath) supersedes the legacy
  // browser (sampleRows, keyed by relative path), so the selection is valid if it
  // matches either list — checking only one would wipe a DB selection instantly.
  useEffect(() => {
    if (!selectedSampleDetail) return
    const stillVisible =
      dbSamples.some((s) => s.filepath === selectedSampleDetail.path) ||
      sampleRows.some((s) => s.path === selectedSampleDetail.path)
    if (!stillVisible) setSelectedSampleDetail(null)
  }, [dbSamples, sampleRows, selectedSampleDetail])

  // Keep a ref to the latest reloadDbSamples so the onScanDone callback
  // (registered once) always calls the current version with up-to-date
  // filter state (selectedCategoryId, search query, etc.).
  const reloadDbSamplesRef = useRef(reloadDbSamples)
  reloadDbSamplesRef.current = reloadDbSamples

  // Scan progress listeners
  useEffect(() => {
    const unsubProgress = electronAPI.onScanProgress((progress) => setScanProgress(progress))
    const unsubDone = electronAPI.onScanDone(() => {
      setScanProgress({ status: 'idle', phase: null, found: 0, processed: 0, total: 0 })
      // Refresh categories (folder-driven categories may have changed)
      void electronAPI.listCategories().then(setCategories)
      void electronAPI.listTags().then(setTags)
      void reloadDbSamplesRef.current()
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
    await runSampleQuery(sampleSearchQuery, true)
  }, [runSampleQuery, sampleSearchQuery])

  const startLibraryScan = useCallback(async () => {
    if (!sampleFolder) return
    await electronAPI.startScan(sampleFolder)
    setScanProgress({ status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 })
  }, [electronAPI, sampleFolder])

  const createTag = useCallback(async (name: string, color?: string) => {
    const tag = await electronAPI.createTag(name, color)
    // createTag is idempotent server-side, so guard against inserting a
    // duplicate id (which would produce duplicate React keys).
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
    // createCategory returns the existing row for a duplicate name, so dedup by
    // id to avoid duplicate React keys / duplicate category chips.
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
          ...(dbSearchQuery ? [{ kind: 'text', query: dbSearchQuery }] : []),
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
  }, [electronAPI, dbSearchQuery, selectedCategoryId, selectedTagIds])

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
    sampleRows,
    sampleSearchQuery,
    sampleBrowserLoading,
    sampleBrowserError,
    selectedSampleDetail,
    scanProgress,
    dbSamples,
    dbSampleTotal,
    dbSearchQuery,
    selectedCategoryId,
    selectedTagIds,
    sortBy,
    sortDir,
    tags,
    categories,
    libraries,
    setSelectedSampleDetail,
    setSampleSearchQuery,
    rescanSampleBrowser,
    setDbSearchQuery,
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
