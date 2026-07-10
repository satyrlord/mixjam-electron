import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createBackendAPI } from '../test/backendApi'
import { useTransportRuntime } from './useTransportRuntime'

describe('useTransportRuntime', () => {
  it('keeps inactive controls safe when no playback engine exists', async () => {
    const { result } = renderHook(() => useTransportRuntime({
      backendAPI: createBackendAPI(),
      sampleFolder: null,
      active: false,
      getLanes: () => [],
      initialBpm: 120,
      initialMasterGain: 0.8
    }))

    act(() => {
      result.current.transportPlay()
      result.current.transportSkipBack()
      result.current.transportSeek(32)
      result.current.setBpm(128)
      result.current.prepareTempoChange()
      result.current.previewSample('kick.wav')
      result.current.setMasterGain(0.5)
    })

    await expect(result.current.getSampleBuffer('kick.wav')).resolves.toBeNull()
    expect(result.current.transportState).toBe('stopped')
    expect(result.current.currentTick).toBe(0)
    expect(result.current.bpm).toBe(128)
    expect(result.current.masterGain).toBe(0.5)
  })
})
