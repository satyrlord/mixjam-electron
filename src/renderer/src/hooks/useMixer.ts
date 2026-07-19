import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlaybackChannelSnapshot, PlaybackEngine, PlaybackReturnSnapshot } from '../engine/playback-engine'
import type { ReturnModule } from '../engine/return-effects'
import type { LaneState } from '../lib/arrangement'
import type { ProjectFxBuses } from '../project/project-state'

const PEAK_HOLD_DECAY_DB_PER_S = 30
const SILENCE_DB = -100
const LEGACY_STORAGE_KEY = 'mixjam-mixer-channels'

export interface MixerState {
  returnBuses: [PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot, PlaybackReturnSnapshot]
  /** Current RMS level in dBFS per lane-derived channel index. */
  channelLevels: ReadonlyMap<number, number>
  /** Peak hold level per lane-derived channel index. */
  channelPeaks: ReadonlyMap<number, number>
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

export function playbackChannelsFromLanes(lanes: readonly LaneState[]): PlaybackChannelSnapshot[] {
  return lanes.map((lane) => ({
      laneId: lane.id,
      channelIndex: lane.index,
      gain: lane.gain,
      // The persistent lane panner owns pan. The graph channel stays centered
      // so the same pan is never applied twice.
      pan: 0,
      muted: lane.muted,
      solo: lane.solo,
      effects: [],
      sends: lane.sends
    }))
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
  const channels = useMemo(() => playbackChannelsFromLanes(lanes), [lanes])
  const returnBuses = useMemo(() => fxBuses.map((bus) => ({
    index: bus.index,
    module: { ...bus.module } as ReturnModule,
    powered: bus.powered,
    returnLevel: bus.returnLevel,
    limiterEnabled: bus.limiterEnabled
  })) as MixerState['returnBuses'], [fxBuses])
  const [channelLevels, setChannelLevels] = useState<Map<number, number>>(new Map())
  const [channelPeaks, setChannelPeaks] = useState<Map<number, number>>(new Map())
  const [visualTelemetryActive, setVisualTelemetryActive] = useState(false)

  const channelsRef = useRef(channels)
  channelsRef.current = channels
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
        const previous = prevLevelsRef.current
        if ([...previous.values()].some((db) => db > SILENCE_DB)) {
          const silentLevels = new Map<number, number>()
          const silentPeaks = new Map<number, number>()
          for (const channel of channelsRef.current) {
            silentLevels.set(channel.channelIndex, SILENCE_DB)
            silentPeaks.set(channel.channelIndex, SILENCE_DB)
          }
          prevLevelsRef.current = silentLevels
          peaksRef.current = new Map()
          setChannelLevels(silentLevels)
          setChannelPeaks(silentPeaks)
        }
        rafId = requestAnimationFrame(tick)
        return
      }

      const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0
      lastFrameRef.current = now
      const nextLevels = new Map<number, number>()
      const nextPeaks = new Map<number, number>()
      let changed = false

      for (const channel of channelsRef.current) {
        const analyser = playbackEngine.getChannelAnalyser(channel.channelIndex)
        if (!analyser) {
          nextLevels.set(channel.channelIndex, SILENCE_DB)
          if (prevLevelsRef.current.get(channel.channelIndex) !== SILENCE_DB) changed = true
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
      }

      if (nextLevels.size !== prevLevelsRef.current.size) changed = true
      if (changed) {
        prevLevelsRef.current = nextLevels
        setChannelLevels(nextLevels)
        setChannelPeaks(nextPeaks)
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafId)
      lastFrameRef.current = 0
    }
  }, [playbackEngineRef, visualTelemetryActive])

  useEffect(() => {
    if (view !== 'player') return
    playbackEngineRef.current?.applyChannelSnapshot(channels)
  }, [channels, playbackEngineRef, view])

  useEffect(() => {
    if (view !== 'player') return
    playbackEngineRef.current?.applyReturnSnapshot(returnBuses)
  }, [playbackEngineRef, returnBuses, view])

  const previewReturnBus = useCallback((bus: PlaybackReturnSnapshot) => {
    playbackEngineRef.current?.applyReturnSnapshot([
      { ...bus, module: { ...bus.module } as ReturnModule }
    ])
  }, [playbackEngineRef])

  return {
    returnBuses,
    channelLevels,
    channelPeaks,
    setVisualTelemetryActive,
    previewReturnBus
  }
}
