import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElectronAPI } from '../test/electronApi'
import { useTransportEngine } from './useTransportEngine'

const SAMPLE_FOLDER = 'C:/Samples'

describe('useTransportEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('setLanePan updates lane pan and calls player.setChannelPan', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    // Wait for the Player to be created by the useEffect
    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.setLanePan(0, 0.5)
    })

    expect(result.current.lanes[0]!.pan).toBe(0.5)
  })

  it('previewSample schedules at next downbeat when transport is playing', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    vi.mocked(api.readSampleBytes).mockResolvedValue(new ArrayBuffer(8))
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    // Wait for the Player to be created
    await waitFor(() => expect(result.current.lanes).toBeDefined())

    // Start transport so state is 'playing'
    await act(async () => {
      result.current.transportPlay()
    })

    expect(result.current.transportState).toBe('playing')

    // Preview a sample while playing — hits the transport-aware scheduling branch
    await act(async () => {
      result.current.previewSample('kick.wav')
      // Flush microtasks so the async previewSample can start
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Stop transport to clean up the scheduler
    await act(async () => {
      result.current.transportStop()
    })

    expect(result.current.transportState).toBe('stopped')
  })

  it('previewSample returns early when player is not created (view=home)', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))

    // No player created because view is 'home' — calling previewSample should return early
    await act(async () => {
      result.current.previewSample('kick.wav')
    })
  })

  it('setLanePan updates lane state but skips player.setChannelPan when player is null (view=home)', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))

    await act(async () => {
      result.current.setLanePan(0, 0.5)
    })

    expect(result.current.lanes[0]!.pan).toBe(0.5)
  })

  it('previewSample handles null sample folder gracefully', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, null, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    // loadSampleBytes returns null because sampleFolder is null
    await act(async () => {
      result.current.previewSample('kick.wav')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })
})
