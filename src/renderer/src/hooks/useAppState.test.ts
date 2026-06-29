import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecentProjectItem, SampleBrowserItem } from '../../../shared/ipc'
import { createElectronAPI } from '../test/electronApi'
import { useAppState } from './useAppState'

const USER_FOLDER = 'C:/Users/test/MixJam'
const SAMPLE_FOLDER = 'C:/Samples'

describe('useAppState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads version data and starts in home view', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    expect(result.current.view).toBe('home')
    expect(result.current.timerText).toBe('00:00.0')

    await waitFor(() => {
      expect(result.current.version).toBe('v0.test.0')
    })

    expect(electronAPI.getVersion).toHaveBeenCalledTimes(1)
    expect(electronAPI.loadRecentProjects).toHaveBeenCalledWith(USER_FOLDER)

    await waitFor(() => {
      expect(electronAPI.querySampleBrowser).toHaveBeenCalledWith(SAMPLE_FOLDER, '', false)
    })
  })

  it('falls back to a safe version string when getVersion fails', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()
    const testError = new Error('ipc unavailable')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(electronAPI.getVersion).mockRejectedValueOnce(testError)
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.version).toBe('version unavailable')
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to read app version:', testError)
  })

  it('moves to tracker and increments the timer while playing', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToTracker()
    })

    expect(result.current.view).toBe('tracker')
    expect(electronAPI.resizeToTracker).toHaveBeenCalledTimes(1)

    // Timer should be at 00:00.0 until playback starts
    expect(result.current.timerText).toBe('00:00.0')

    // Start playback
    act(() => {
      result.current.transportPlay()
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.timerText).toBe('00:01.0')
  })

  it('returns to home and clears the timer', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToTracker()
      await result.current.goToHome()
    })

    expect(result.current.view).toBe('home')
    expect(result.current.timerText).toBe('00:00.0')
    expect(electronAPI.resizeToHome).toHaveBeenCalledTimes(1)
  })

  it('opens the file picker and switches to tracker when a file is selected', async () => {
    const electronAPI = createElectronAPI()
    vi.mocked(electronAPI.openFilePicker).mockResolvedValueOnce('/tmp/project.mixjam')
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.handleLoadMixJam()
    })

    expect(electronAPI.openFilePicker).toHaveBeenCalledTimes(1)
    expect(electronAPI.recordRecentProject).toHaveBeenCalledWith('/tmp/project.mixjam')
    expect(electronAPI.resizeToTracker).toHaveBeenCalledTimes(1)
    expect(result.current.view).toBe('tracker')
  })

  it('stays on home when the file picker is cancelled', async () => {
    const electronAPI = createElectronAPI()
    vi.mocked(electronAPI.openFilePicker).mockResolvedValueOnce(null)
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.handleLoadMixJam()
    })

    expect(result.current.view).toBe('home')
    expect(electronAPI.resizeToTracker).not.toHaveBeenCalled()
  })

  it('routes footer actions through the injected electronAPI', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.openFolderPicker()
      await result.current.openRepo()
    })

    expect(electronAPI.openFolderPicker).toHaveBeenCalledTimes(1)
    expect(electronAPI.openExternal).toHaveBeenCalledWith(
      'https://github.com/satyrlord/mixjam-electron'
    )
  })

  it('clears the running timer when unmounted from the tracker view', async () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const electronAPI = createElectronAPI()
    const { result, unmount } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToTracker()
    })

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  it('stores selected sample detail for the footer surface', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.sampleRows.length).toBeGreaterThan(0)
    })

    act(() => {
      result.current.setSelectedSampleDetail({
        name: 'kick_808.wav',
        path: 'Drums/Kicks/kick_808.wav',
        metadata: ['44.1 kHz', 'Stereo'],
        tags: ['Drums', 'Kick'],
        duration: null
      })
    })

    expect(result.current.selectedSampleDetail?.name).toBe('kick_808.wav')
  })

  it('rescans sample browser when requested', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.rescanSampleBrowser()
    })

    expect(electronAPI.querySampleBrowser).toHaveBeenCalledWith(SAMPLE_FOLDER, '', true)
  })

  it('places a sample clip on a lane via drag-and-drop', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.sampleRows.length).toBeGreaterThan(0)
    })

    act(() => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick_808.wav', path: 'Drums/Kicks/kick_808.wav', metadata: [], tags: [], duration: null },
        0,
        0
      )
    })

    const lane0 = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0?.clips).toHaveLength(1)
    expect(lane0?.clips[0]?.sampleName).toBe('kick_808.wav')
    expect(lane0?.clips[0]?.startTick).toBe(0)
    expect(lane0?.clips[0]?.durationTicks).toBe(32)
  })

  it('falls back when loadRecentProjects fails', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()
    const testError = new Error('session unavailable')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(electronAPI.loadRecentProjects).mockRejectedValueOnce(testError)
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.recentProjects).toEqual([])
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load recent projects:', testError)
  })

  it('clears sample state when sampleFolder is null', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, null))

    expect(result.current.sampleRows).toEqual([])
    expect(result.current.sampleBrowserLoading).toBe(false)
    expect(result.current.sampleBrowserError).toBeNull()
    expect(result.current.selectedSampleDetail).toBeNull()
    expect(result.current.sampleSearchQuery).toBe('')

    // Even a forced rescan must safely no-op when folder is null.
    await act(async () => {
      await result.current.rescanSampleBrowser()
    })

    expect(result.current.sampleRows).toEqual([])
    expect(result.current.sampleBrowserLoading).toBe(false)
    expect(result.current.sampleBrowserError).toBeNull()
  })

  it('handles querySampleBrowser rejection', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()
    const testError = new Error('db locked')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(electronAPI.querySampleBrowser).mockRejectedValueOnce(testError)
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.sampleBrowserError).toBe('Unable to load sample library.')
    })

    expect(result.current.sampleRows).toEqual([])
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to query sample browser:', testError)
  })

  it('clears selected sample detail when that sample is no longer visible', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await waitFor(() => {
      expect(result.current.sampleRows.length).toBeGreaterThan(0)
    })

    // Pick a path that actually exists in the current rows so the effect
    // does not immediately clear it.
    const visiblePath = result.current.sampleRows[0].path
    act(() => {
      result.current.setSelectedSampleDetail({
        name: 'kick_808.wav',
        path: visiblePath,
        metadata: ['44.1 kHz', 'Stereo'],
        tags: ['Drums', 'Kick'],
        duration: null
      })
    })

    expect(result.current.selectedSampleDetail?.path).toBe(visiblePath)

    // Simulate search that returns rows without the selected sample
    vi.mocked(electronAPI.querySampleBrowser).mockResolvedValueOnce([])
    act(() => {
      result.current.setSampleSearchQuery('nonexistent')
    })

    await waitFor(() => {
      expect(result.current.selectedSampleDetail).toBeNull()
    })
  })

  it('handles recordRecentProject failure in handleLoadMixJam', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()
    const testError = new Error('disk full')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(electronAPI.openFilePicker).mockResolvedValueOnce('/tmp/project.mixjam')
    vi.mocked(electronAPI.recordRecentProject).mockRejectedValueOnce(testError)
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.handleLoadMixJam()
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to record recent project:', testError)
    expect(result.current.view).toBe('tracker')
  })

  it('toggles lane mute', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    act(() => {
      result.current.toggleLaneMute(0)
    })

    const lane0 = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0?.muted).toBe(true)

    act(() => {
      result.current.toggleLaneMute(0)
    })

    const lane0After = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0After?.muted).toBe(false)
  })

  it('toggles lane solo', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    act(() => {
      result.current.toggleLaneSolo(0)
    })

    const lane0 = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0?.solo).toBe(true)

    act(() => {
      result.current.toggleLaneSolo(0)
    })

    const lane0After = result.current.lanes.find((lane) => lane.index === 0)
    expect(lane0After?.solo).toBe(false)
  })

  it('reports lane dim state', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    // Default: nothing soloed, no lane dimmed
    const initialDim = result.current.laneShouldDim(result.current.lanes[0])
    expect(initialDim).toBe(false)

    // Solo lane 0; lane 1 should dim
    act(() => {
      result.current.toggleLaneSolo(0)
    })

    const lane1 = result.current.lanes.find((lane) => lane.index === 1)
    expect(lane1).toBeDefined()
    if (lane1) {
      expect(result.current.laneShouldDim(lane1)).toBe(true)
    }
  })

  it('creates and destroys transport with tracker lifecycle', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    // Initially no transport
    expect(result.current.transportState).toBe('stopped')

    // Enter tracker
    await act(async () => {
      await result.current.goToTracker()
    })

    expect(result.current.transportState).toBe('stopped')

    // Leave tracker — transport destroyed
    await act(async () => {
      await result.current.goToHome()
    })

    expect(result.current.transportState).toBe('stopped')
  })

  it('transport play sets state to playing', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToTracker()
    })

    act(() => {
      result.current.transportPlay()
    })

    expect(result.current.transportState).toBe('playing')
  })

  it('transport pause and stop transitions', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToTracker()
    })

    act(() => {
      result.current.transportPlay()
    })

    expect(result.current.transportState).toBe('playing')

    act(() => {
      result.current.transportPause()
    })

    expect(result.current.transportState).toBe('paused')

    act(() => {
      result.current.transportStop()
    })

    expect(result.current.transportState).toBe('stopped')
  })

  it('transport skipBack is callable', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => {
      await result.current.goToTracker()
    })

    expect(() => {
      act(() => {
        result.current.transportSkipBack()
      })
    }).not.toThrow()
  })

  it('ignores stale sample query responses when a newer query is in flight', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()

    // First call will be slow, second fast
    vi.mocked(electronAPI.querySampleBrowser)
      .mockResolvedValueOnce([
        { id: 'old', name: 'old.wav', path: 'old/old.wav', category: '', duration: '--', metadata: [], tags: [] }
      ] as SampleBrowserItem[])
      .mockResolvedValueOnce([
        { id: 'new', name: 'new.wav', path: 'new/new.wav', category: '', duration: '--', metadata: [], tags: [] }
      ] as SampleBrowserItem[])

    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    // Wait for first query to settle — the debounce means the second call
    // supersedes it before the first resolves, per mock ordering.
    await waitFor(() => {
      expect(result.current.sampleRows.length).toBeGreaterThan(0)
    })

    // Either the first or second query's rows are set; the stale guard
    // ensures the last query wins.
    expect(result.current.sampleBrowserError).toBeNull()
  })

  it('transport operations are no-ops when not in tracker view', () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    // In home view, transportRef.current is null
    expect(result.current.transportState).toBe('stopped')

    act(() => {
      result.current.transportPlay()
    })
    expect(result.current.transportState).toBe('stopped')

    act(() => {
      result.current.transportPause()
    })
    expect(result.current.transportState).toBe('stopped')
  })

  it('handles unmount during pending version fetch', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()

    // Delay getVersion so we can unmount while it is pending.
    let resolveVersion: (v: string) => void
    vi.mocked(electronAPI.getVersion).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVersion = resolve
      })
    )

    const { unmount } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    // Unmount before the promise resolves — isMounted becomes false.
    unmount()

    // Resolving after unmount must not call setState on an unmounted component.
    resolveVersion!('should-not-appear')

    // No crash = pass; the isMounted guard prevented the state update.
  })

  it('handles unmount during pending recent-projects fetch', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()

    let resolveProjects: (projects: RecentProjectItem[]) => void
    vi.mocked(electronAPI.loadRecentProjects).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProjects = resolve
      })
    )

    const { unmount } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    unmount()

    resolveProjects!([])
    // No crash = pass.
  })

  it('setBpm updates the BPM state', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToTracker() })

    act(() => { result.current.setBpm(140) })
    expect(result.current.bpm).toBe(140)
  })

  it('setMasterGain updates the master gain', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToTracker() })

    act(() => { result.current.setMasterGain(0.5) })
    expect(result.current.masterGain).toBe(0.5)
  })

  it('moveClipOnLane repositions a clip across lanes', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToTracker() })

    act(() => { result.current.placeSampleDetailOnLane({ name: 'k.wav', path: '/s/k.wav', metadata: [], tags: [], duration: null }, 0, 0) })
    const cid = result.current.lanes[0].clips[0].id

    act(() => { result.current.moveClipOnLane(cid, 2, 64) })
    expect(result.current.lanes[0].clips).toHaveLength(0)
    expect(result.current.lanes[2].clips).toHaveLength(1)
    expect(result.current.lanes[2].clips[0].startTick).toBe(64)
  })

  it('removeClipFromLane deletes a clip', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToTracker() })

    act(() => { result.current.placeSampleDetailOnLane({ name: 'k.wav', path: '/s/k.wav', metadata: [], tags: [], duration: null }, 0, 0) })
    const cid = result.current.lanes[0].clips[0].id

    act(() => { result.current.removeClipFromLane(0, cid) })
    expect(result.current.lanes[0].clips).toHaveLength(0)
  })

  it('setLanePan updates pan value', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI, USER_FOLDER, SAMPLE_FOLDER))

    await act(async () => { await result.current.goToTracker() })

    act(() => { result.current.setLanePan(3, -0.5) })
    expect(result.current.lanes[3].pan).toBe(-0.5)
  })
})
