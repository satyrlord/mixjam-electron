import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ElectronAPI, RecentProjectItem, SampleBrowserItem } from '../../../shared/ipc'
import {
  type FooterSampleDetail,
  type LaneState,
  anyLaneSoloed,
  createDefaultLanes,
  laneShouldDim,
  placeClipOnLane,
  toggleLaneMute,
  toggleLaneSolo
} from '../lib/playerShell'
import { type Transport, createTransport } from '../engine/transport'
import { formatTimer } from '../lib/formatTimer'

type View = 'home' | 'tracker'

const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

export function useAppState(
  electronAPI: ElectronAPI,
  userFolder: string | null,
  sampleFolder: string | null
) {
  const [view, setView] = useState<View>('home')
  const [version, setVersion] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recentProjects, setRecentProjects] = useState<RecentProjectItem[]>([])
  const [sampleRows, setSampleRows] = useState<SampleBrowserItem[]>([])
  const [sampleSearchQuery, setSampleSearchQuery] = useState('')
  const [sampleBrowserLoading, setSampleBrowserLoading] = useState(false)
  const [sampleBrowserError, setSampleBrowserError] = useState<string | null>(null)
  const [selectedSampleDetail, setSelectedSampleDetail] = useState<FooterSampleDetail | null>(null)
  const [lanes, setLanes] = useState<LaneState[]>(() => createDefaultLanes())
  const transportRef = useRef<Transport | null>(null)
  const [transportState, setTransportState] = useState<Transport['state']>('stopped')
  const sampleQuerySeqRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)

  useEffect(() => {
    let isMounted = true

    void electronAPI
      .getVersion()
      .then((appVersion) => {
        if (isMounted) {
          setVersion(appVersion)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to read app version:', error)
        if (isMounted) {
          setVersion('version unavailable')
        }
      })

    return () => {
      isMounted = false
    }
  }, [electronAPI])

  useEffect(() => {
    let isMounted = true

    void electronAPI
      .loadRecentProjects(userFolder)
      .then((projects) => {
        if (isMounted) {
          setRecentProjects(projects)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load recent projects:', error)
        if (isMounted) {
          setRecentProjects([])
        }
      })

    return () => {
      isMounted = false
    }
  }, [electronAPI, userFolder])

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
        // Ignore results from a query that a newer one has superseded so a
        // slow earlier response can't clobber the latest search.
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
      if (!cancelled) {
        void runSampleQuery(currentQuery, false)
      }
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [runSampleQuery, sampleFolder, sampleSearchQuery])

  useEffect(() => {
    if (!selectedSampleDetail) return
    const stillVisible = sampleRows.some((sample) => sample.path === selectedSampleDetail.path)
    if (!stillVisible) {
      setSelectedSampleDetail(null)
    }
  }, [sampleRows, selectedSampleDetail])

  // Elapsed-time display timer — pure UI concern.
  useEffect(() => {
    if (view !== 'tracker') {
      setElapsedMs(0)
      return
    }

    startRef.current = Date.now()
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startRef.current)
    }, 100)

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [view])

  // Transport instance — audio engine concern, separate from the UI timer.
  useEffect(() => {
    if (view !== 'tracker') return

    const transport = createTransport()
    transportRef.current = transport

    return () => {
      transport.destroy()
      transportRef.current = null
      setTransportState('stopped')
    }
  }, [view])

  const goToTracker = async () => {
    await electronAPI.resizeToTracker()
    setView('tracker')
  }

  const goToHome = async () => {
    await electronAPI.resizeToHome()
    setSelectedSampleDetail(null)
    setView('home')
  }

  const handleLoadMixJam = async () => {
    const file = await electronAPI.openFilePicker()
    if (file !== null) {
      try {
        await electronAPI.recordRecentProject(file)
        setRecentProjects(await electronAPI.loadRecentProjects(userFolder))
      } catch (error) {
        console.error('Failed to record recent project:', error)
      }
      await goToTracker()
    }
  }

  const openFolderPicker = async () => {
    await electronAPI.openFolderPicker()
  }

  const openRepo = async () => {
    await electronAPI.openExternal(GITHUB_URL)
  }

  const rescanSampleBrowser = async () => {
    await runSampleQuery(sampleSearchQuery, true)
  }

  const placeSampleOnLane = useCallback(
    (laneIndex: number, startTick: number) => {
      if (!selectedSampleDetail) return
      setLanes((current) =>
        placeClipOnLane(current, laneIndex, selectedSampleDetail.path, selectedSampleDetail.name, startTick)
      )
    },
    [selectedSampleDetail]
  )

  const handleToggleLaneMute = useCallback((laneIndex: number) => {
    setLanes((current) => toggleLaneMute(current, laneIndex))
  }, [])

  const handleToggleLaneSolo = useCallback((laneIndex: number) => {
    setLanes((current) => toggleLaneSolo(current, laneIndex))
  }, [])

  const transportPlay = useCallback(() => {
    transportRef.current?.play()
    setTransportState(transportRef.current?.state ?? 'stopped')
  }, [])

  const transportPause = useCallback(() => {
    transportRef.current?.pause()
    setTransportState(transportRef.current?.state ?? 'stopped')
  }, [])

  const transportStop = useCallback(() => {
    transportRef.current?.stop()
    setTransportState('stopped')
  }, [])

  const transportSkipBack = useCallback(() => {
    transportRef.current?.skipBack()
  }, [])

  const timerText = useMemo(() => formatTimer(elapsedMs), [elapsedMs])

  const anySoloed = useMemo(() => anyLaneSoloed(lanes), [lanes])

  const dimLane = useCallback(
    (lane: LaneState) => laneShouldDim(lane, anySoloed),
    [anySoloed]
  )

  return {
    view,
    version,
    timerText,
    recentProjects,
    sampleRows,
    sampleSearchQuery,
    sampleBrowserLoading,
    sampleBrowserError,
    selectedSampleDetail,
    setSelectedSampleDetail,
    setSampleSearchQuery,
    rescanSampleBrowser,
    lanes,
    placeSampleOnLane,
    toggleLaneMute: handleToggleLaneMute,
    toggleLaneSolo: handleToggleLaneSolo,
    laneShouldDim: dimLane,
    transportState,
    transportPlay,
    transportPause,
    transportStop,
    transportSkipBack,
    goToTracker,
    goToHome,
    handleLoadMixJam,
    openFolderPicker,
    openRepo
  }
}
