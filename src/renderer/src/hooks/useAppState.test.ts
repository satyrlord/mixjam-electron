import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElectronAPI } from '../test/electronApi'
import { useAppState } from './useAppState'

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
    const { result } = renderHook(() => useAppState(electronAPI))

    expect(result.current.view).toBe('home')
    expect(result.current.timerText).toBe('00:00.0')

    await waitFor(() => {
      expect(result.current.version).toBe('v0.test.0')
    })

    expect(electronAPI.getVersion).toHaveBeenCalledTimes(1)
  })

  it('falls back to a safe version string when getVersion fails', async () => {
    vi.useRealTimers()
    const electronAPI = createElectronAPI()
    const testError = new Error('ipc unavailable')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(electronAPI.getVersion).mockRejectedValueOnce(testError)
    const { result } = renderHook(() => useAppState(electronAPI))

    await waitFor(() => {
      expect(result.current.version).toBe('version unavailable')
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to read app version:', testError)
  })

  it('moves to tracker and increments the timer', async () => {
    vi.useFakeTimers()
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI))

    await act(async () => {
      await result.current.goToTracker()
    })

    expect(result.current.view).toBe('tracker')
    expect(electronAPI.resizeToTracker).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.timerText).toBe('00:01.0')
  })

  it('returns to home and clears the timer', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI))

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
    vi.mocked(electronAPI.openFilePicker).mockResolvedValueOnce('/tmp/project.mjam')
    const { result } = renderHook(() => useAppState(electronAPI))

    await act(async () => {
      await result.current.handleLoadMixJam()
    })

    expect(electronAPI.openFilePicker).toHaveBeenCalledTimes(1)
    expect(electronAPI.resizeToTracker).toHaveBeenCalledTimes(1)
    expect(result.current.view).toBe('tracker')
  })

  it('stays on home when the file picker is cancelled', async () => {
    const electronAPI = createElectronAPI()
    vi.mocked(electronAPI.openFilePicker).mockResolvedValueOnce(null)
    const { result } = renderHook(() => useAppState(electronAPI))

    await act(async () => {
      await result.current.handleLoadMixJam()
    })

    expect(result.current.view).toBe('home')
    expect(electronAPI.resizeToTracker).not.toHaveBeenCalled()
  })

  it('routes footer actions through the injected electronAPI', async () => {
    const electronAPI = createElectronAPI()
    const { result } = renderHook(() => useAppState(electronAPI))

    await act(async () => {
      await result.current.openSettingsFolder()
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
    const { result, unmount } = renderHook(() => useAppState(electronAPI))

    await act(async () => {
      await result.current.goToTracker()
    })

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
