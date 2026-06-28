import { useEffect, useMemo, useRef, useState } from 'react'
import type { ElectronAPI } from '../../../shared/ipc'

type View = 'home' | 'tracker'

const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

function formatTimer(ms: number): string {
  const totalTenths = Math.floor(ms / 100)
  const tenths = totalTenths % 10
  const totalSeconds = Math.floor(totalTenths / 10)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`
}

export function useAppState(electronAPI: ElectronAPI) {
  const [view, setView] = useState<View>('home')
  const [version, setVersion] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
    if (view === 'tracker') {
      startRef.current = Date.now()
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startRef.current)
      }, 100)
    } else {
      setElapsedMs(0)
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [view])

  const goToTracker = async () => {
    await electronAPI.resizeToTracker()
    setView('tracker')
  }

  const goToHome = async () => {
    await electronAPI.resizeToHome()
    setView('home')
  }

  const handleLoadMixJam = async () => {
    const file = await electronAPI.openFilePicker()
    if (file !== null) {
      await goToTracker()
    }
  }

  const openSettingsFolder = async () => {
    await electronAPI.openFolderPicker()
  }

  const openRepo = async () => {
    await electronAPI.openExternal(GITHUB_URL)
  }

  const timerText = useMemo(() => formatTimer(elapsedMs), [elapsedMs])

  return {
    view,
    version,
    timerText,
    goToTracker,
    goToHome,
    handleLoadMixJam,
    openSettingsFolder,
    openRepo
  }
}
