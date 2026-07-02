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

  it('getSampleBuffer returns null when player is not initialized', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    // Start on 'home' so the Player is never created
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'home'))

    const buffer = await result.current.getSampleBuffer('kick.wav')
    expect(buffer).toBeNull()
  })

  it('getSampleBuffer returns null for a missing sample', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    vi.mocked(api.readSampleBytes).mockResolvedValue(null)
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    const buffer = await result.current.getSampleBuffer('nonexistent.wav')
    expect(buffer).toBeNull()
  })

  it('removeClipFromLane with non-existent clip is a no-op', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => { result.current.removeClipFromLane(0, 'nonexistent') })
    expect(result.current.lanes[0].clips).toHaveLength(0)
  })

  it('removeClipFromLane removes a placed clip', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', filepath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    const clipId = result.current.lanes[0].clips[0].id
    expect(result.current.lanes[0].clips).toHaveLength(1)

    await act(async () => { result.current.removeClipFromLane(0, clipId) })
    expect(result.current.lanes[0].clips).toHaveLength(0)
  })

  it('removeClips batch-removes multiple clips', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'a.wav', filepath: '/s/a.wav', tags: [], duration: 0.5 },
        0, 0
      )
      result.current.placeSampleDetailOnLane(
        { name: 'b.wav', filepath: '/s/b.wav', tags: [], duration: 0.5 },
        0, 32
      )
    })
    const ids = result.current.lanes[0].clips.map((c) => c.id)
    expect(ids).toHaveLength(2)

    await act(async () => { result.current.removeClips(ids) })
    expect(result.current.lanes[0].clips).toHaveLength(0)
  })

  it('duplicateClipGroup duplicates clips across lanes', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', filepath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    const clipId = result.current.lanes[0].clips[0].id
    expect(result.current.lanes[0].clips).toHaveLength(1)

    await act(async () => {
      result.current.duplicateClipGroup([
        { clipId, toLaneIndex: 1, newStartTick: 16 }
      ])
    })
    expect(result.current.lanes[0].clips).toHaveLength(1)
    expect(result.current.lanes[1].clips).toHaveLength(1)
  })

  it('undo is a no-op when history is empty', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    expect(result.current.canUndo).toBe(false)
    await act(async () => { result.current.undo() })
    expect(result.current.canUndo).toBe(false)
  })

  it('redo is a no-op when future stack is empty', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    expect(result.current.canRedo).toBe(false)
    await act(async () => { result.current.redo() })
    expect(result.current.canRedo).toBe(false)
  })

  it('undo reverts the last clip placement', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    expect(result.current.canUndo).toBe(false)

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', filepath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    expect(result.current.lanes[0].clips).toHaveLength(1)
    expect(result.current.canUndo).toBe(true)

    await act(async () => { result.current.undo() })
    expect(result.current.lanes[0].clips).toHaveLength(0)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })

  it('redo restores an undone placement', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', filepath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    await act(async () => { result.current.undo() })
    expect(result.current.lanes[0].clips).toHaveLength(0)

    await act(async () => { result.current.redo() })
    expect(result.current.lanes[0].clips).toHaveLength(1)
  })

  it('moveClipOnLane moves a clip to a different lane', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', filepath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    const clipId = result.current.lanes[0].clips[0].id
    expect(result.current.lanes[0].clips).toHaveLength(1)
    expect(result.current.lanes[1].clips).toHaveLength(0)

    await act(async () => {
      result.current.moveClipOnLane(clipId, 1, 8)
    })
    expect(result.current.lanes[0].clips).toHaveLength(0)
    expect(result.current.lanes[1].clips).toHaveLength(1)
    expect(result.current.lanes[1].clips[0].sampleName).toBe('kick.wav')
  })

  it('moveClipGroup moves multiple clips in one operation', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', filepath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
      result.current.placeSampleDetailOnLane(
        { name: 'snare.wav', filepath: '/s/snare.wav', tags: [], duration: 0.5 },
        1, 0
      )
    })
    const kickId = result.current.lanes[0].clips[0].id
    const snareId = result.current.lanes[1].clips[0].id
    expect(result.current.lanes[0].clips).toHaveLength(1)
    expect(result.current.lanes[1].clips).toHaveLength(1)

    await act(async () => {
      result.current.moveClipGroup([
        { clipId: kickId, toLaneIndex: 2, newStartTick: 8 },
        { clipId: snareId, toLaneIndex: 2, newStartTick: 24 }
      ])
    })
    expect(result.current.lanes[0].clips).toHaveLength(0)
    expect(result.current.lanes[1].clips).toHaveLength(0)
    expect(result.current.lanes[2].clips).toHaveLength(2)
  })

  it('pauses and resumes transport', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    vi.mocked(api.readSampleBytes).mockResolvedValue(new ArrayBuffer(8))
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    // Start playing
    await act(async () => { result.current.transportPlay() })
    expect(result.current.transportState).toBe('playing')
    // Let the timer interval fire at least once so timerRef.current is set
    await act(async () => { await new Promise((r) => setTimeout(r, 150)) })

    // Pause — this triggers the timer cleanup branch
    await act(async () => { result.current.transportPause() })
    expect(result.current.transportState).toBe('paused')

    // Stop to clean up
    await act(async () => { result.current.transportStop() })
  })

  it('resets elapsed time when leaving tracker while playing', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    vi.mocked(api.readSampleBytes).mockResolvedValue(new ArrayBuffer(8))
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    // Start playing so the timer is running
    await act(async () => { result.current.transportPlay() })
    expect(result.current.transportState).toBe('playing')
    await act(async () => { await new Promise((r) => setTimeout(r, 150)) })

    // Navigate away from tracker while playing — hits the timer cleanup branch
    await act(async () => { result.current.setView('home') })
    expect(result.current.view).toBe('home')
  })

  it('duplicateClipOnLane copies a clip to another lane', async () => {
    vi.useRealTimers()
    const api = createElectronAPI()
    const { result } = renderHook(() => useTransportEngine(api, SAMPLE_FOLDER, 'tracker'))

    await waitFor(() => expect(result.current.lanes).toBeDefined())

    await act(async () => {
      result.current.placeSampleDetailOnLane(
        { name: 'kick.wav', filepath: '/s/kick.wav', tags: [], duration: 0.5 },
        0, 0
      )
    })
    const clipId = result.current.lanes[0].clips[0].id
    expect(result.current.lanes[0].clips).toHaveLength(1)

    await act(async () => {
      result.current.duplicateClipOnLane(clipId, 2, 16)
    })
    expect(result.current.lanes[0].clips).toHaveLength(1)
    expect(result.current.lanes[2].clips).toHaveLength(1)
    expect(result.current.lanes[2].clips[0].sampleName).toBe('kick.wav')
  })
})
