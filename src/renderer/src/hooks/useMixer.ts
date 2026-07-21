import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlaybackEngine, PlaybackReturnSnapshot } from '../engine/playback-engine'
import type { ReturnModule } from '../engine/return-effects'
import { createValueStore, type ReadableStore } from '../lib/value-store'
import {
  toPlaybackProjectGraphSnapshot,
  type LaneState,
  type ProjectFxBuses
} from '../project/project-state'

const PEAK_HOLD_DECAY_DB_PER_S = 30
const SILENCE_DB = -100
const LEGACY_STORAGE_KEY = 'mixjam-mixer-channels'

/** One visual telemetry frame: RMS level and peak-hold in dBFS per channel. */
export interface ChannelMeterFrame {
  levels: ReadonlyMap<number, number>
  peaks: ReadonlyMap<number, number>
}

const SILENT_FRAME: ChannelMeterFrame = { levels: new Map(), peaks: new Map() }

export interface MixerState {
  returnBuses: [PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot]
  /** Telemetry frames at RAF cadence. A store, not React state: meter leaves
   *  subscribe individually so a frame never re-renders the App tree. */
  channelMetersStore: ReadableStore<ChannelMeterFrame>
}

export interface MixerActions {
  setVisualTelemetryActive: (active: boolean) => void
  previewReturnBus: (bus: PlaybackReturnSnapshot) => void
}

export type Mixer = MixerState & MixerActions

function rmsToDb(rms: number): number {
  if (rms <= 0) return SILENCE_DB
  return Math.max(SILENCE_DB, 20 * Math.log10(rms))
}

/**
 * Owns visual channel telemetry and the four Return buses. Mixer channel
 * controls are derived from LaneState; this hook never stores a second copy.
 */
export function useMixer(
  playbackEngineRef: React.RefObject<PlaybackEngine | null>,
  view: string,
  lanes: readonly LaneState[],
  fxBuses: ProjectFxBuses
): Mixer {
  const projectGraphSnapshot = useMemo(
    () => toPlaybackProjectGraphSnapshot({ lanes: [...lanes], fxBuses }),
    [fxBuses, lanes]
  )
  const returnBuses = projectGraphSnapshot.returns as MixerState['returnBuses']
  const [channelMetersStore] = useState(() => createValueStore<ChannelMeterFrame>(SILENT_FRAME))
  const [visualTelemetryActive, setVisualTelemetryActive] = useState(false)

  const channelsRef = useRef(projectGraphSnapshot.channels)
  channelsRef.current = projectGraphSnapshot.channels
  const peaksRef = useRef(new Map<number, number>())
  const lastFrameRef = useRef(0)
  const meterBuffersRef = useRef(new Map<number, Float32Array>())
  const prevLevelsRef = useRef(new Map<number, number>())

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Storage can be unavailable. Current Mixer state is project-owned.
    }
  }, [])

  useEffect(() => {
    if (!visualTelemetryActive) return

    let rafId: number
    let running = true
    lastFrameRef.current = 0

    const tick = (now: number) => {
      if (!running) return
      const playbackEngine = playbackEngineRef.current
      if (!playbackEngine) {
        rafId = requestAnimationFrame(tick)
        return
      }

      if (playbackEngine.activeVoiceCount === 0) {
        const published = channelMetersStore.get()
        let hasAudibleTelemetry = false
        for (const db of published.levels.values()) {
          if (db > SILENCE_DB) {
            hasAudibleTelemetry = true
            break
          }
        }
        if (!hasAudibleTelemetry) {
          for (const db of published.peaks.values()) {
            if (db > SILENCE_DB) {
              hasAudibleTelemetry = true
              break
            }
          }
        }
        if (hasAudibleTelemetry ||
            published.levels.size !== channelsRef.current.length ||
            published.peaks.size !== channelsRef.current.length) {
          const silentLevels = new Map<number, number>()
          const silentPeaks = new Map<number, number>()
          for (const channel of channelsRef.current) {
            silentLevels.set(channel.channelIndex, SILENCE_DB)
            silentPeaks.set(channel.channelIndex, SILENCE_DB)
          }
          prevLevelsRef.current = silentLevels
          peaksRef.current = new Map()
          channelMetersStore.set({ levels: silentLevels, peaks: silentPeaks })
        }
        rafId = requestAnimationFrame(tick)
        return
      }

      const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0
      lastFrameRef.current = now
      const nextLevels = new Map<number, number>()
      const nextPeaks = new Map<number, number>()
      const publishedPeaks = channelMetersStore.get().peaks
      let changed = false

      for (const channel of channelsRef.current) {
        const analyser = playbackEngine.getChannelAnalyser(channel.channelIndex)
        if (!analyser) {
          nextLevels.set(channel.channelIndex, SILENCE_DB)
          nextPeaks.set(channel.channelIndex, SILENCE_DB)
          peaksRef.current.delete(channel.channelIndex)
          if (prevLevelsRef.current.get(channel.channelIndex) !== SILENCE_DB) changed = true
          if (publishedPeaks.get(channel.channelIndex) !== SILENCE_DB) changed = true
          continue
        }

        let buffer = meterBuffersRef.current.get(channel.channelIndex)
        if (!buffer || buffer.length !== analyser.fftSize) {
          buffer = new Float32Array(analyser.fftSize)
          meterBuffersRef.current.set(channel.channelIndex, buffer)
        }
        analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>)

        let sumSquares = 0
        for (const sample of buffer) sumSquares += sample * sample
        const db = rmsToDb(Math.sqrt(sumSquares / buffer.length))
        nextLevels.set(channel.channelIndex, db)
        if (db !== prevLevelsRef.current.get(channel.channelIndex)) changed = true

        const currentPeak = peaksRef.current.get(channel.channelIndex) ?? SILENCE_DB
        const peak = Math.max(currentPeak - PEAK_HOLD_DECAY_DB_PER_S * dt, db)
        peaksRef.current.set(channel.channelIndex, peak)
        nextPeaks.set(channel.channelIndex, peak)
        if (peak !== publishedPeaks.get(channel.channelIndex)) changed = true
      }

      if (nextLevels.size !== prevLevelsRef.current.size) changed = true
      if (nextPeaks.size !== publishedPeaks.size) changed = true
      if (changed) {
        prevLevelsRef.current = nextLevels
        channelMetersStore.set({ levels: nextLevels, peaks: nextPeaks })
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafId)
      lastFrameRef.current = 0
    }
  }, [playbackEngineRef, visualTelemetryActive, channelMetersStore])

  useEffect(() => {
    if (view !== 'player') return
    playbackEngineRef.current?.applyProjectGraphSnapshot(projectGraphSnapshot)
  }, [playbackEngineRef, projectGraphSnapshot, view])

  const previewReturnBus = useCallback((bus: PlaybackReturnSnapshot) => {
    playbackEngineRef.current?.applyReturnSnapshot([
      { ...bus, module: { ...bus.module } as ReturnModule }
    ])
  }, [playbackEngineRef])

  return {
    returnBuses,
    channelMetersStore,
    setVisualTelemetryActive,
    previewReturnBus
  }
}
