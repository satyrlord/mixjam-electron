import { useCallback, useEffect, useRef, useState } from 'react'
import type { Player } from '../engine/player'
import { safeJsonParse } from '../lib/safeJsonParse'

const DEFAULT_CHANNEL_COUNT = 16
const PEAK_HOLD_DECAY_DB_PER_S = 30
const SILENCE_DB = -100

export interface ChannelState {
  /** The channel index in the audio graph (lane N → channel N for 1:1 routing). */
  channelIndex: number
  gain: number
  pan: number
  muted: boolean
  solo: boolean
}

export interface MixerState {
  channels: ChannelState[]
  /** Current RMS level in dBFS per channel index (Map keyed by channelIndex). */
  channelLevels: ReadonlyMap<number, number>
  /** Peak hold level per channel index. */
  channelPeaks: ReadonlyMap<number, number>
}

export interface MixerActions {
  setChannelGain: (channelIndex: number, gain: number) => void
  setChannelPan: (channelIndex: number, pan: number) => void
  toggleChannelMute: (channelIndex: number) => void
  toggleChannelSolo: (channelIndex: number) => void
  removeChannel: (channelIndex: number) => void
}

export type Mixer = MixerState & MixerActions

const STORAGE_KEY = 'mixjam-mixer-channels'
const REMOVED_STORAGE_KEY = 'mixjam-mixer-removed'

function loadChannelState(): ChannelState[] {
  return safeJsonParse(
    localStorage.getItem(STORAGE_KEY) ?? '',
    createDefaultChannels(),
    (v): v is ChannelState[] => Array.isArray(v) && v.length > 0
  )
}

function loadRemovedIndices(): number[] {
  return safeJsonParse(
    localStorage.getItem(REMOVED_STORAGE_KEY) ?? '',
    [] as number[],
    (v): v is number[] => Array.isArray(v)
  )
}

function saveChannelState(channels: ChannelState[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels))
  } catch {
    // Storage full or unavailable — non-critical.
  }
}

function saveRemovedIndices(indices: number[]): void {
  try {
    localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify(indices))
  } catch {
    // Storage full or unavailable — non-critical.
  }
}

function createDefaultChannels(): ChannelState[] {
  return Array.from({ length: DEFAULT_CHANNEL_COUNT }, (_, i) => ({
    channelIndex: i,
    gain: 0.8,
    pan: 0,
    muted: false,
    solo: false
  }))
}

function rmsToDb(rms: number): number {
  if (rms <= 0) return SILENCE_DB
  return Math.max(SILENCE_DB, 20 * Math.log10(rms))
}

/**
 * Manages N-channel mixer state (gain, pan, mute, solo) and drives the
 * per-channel dB meter display via a single requestAnimationFrame loop.
 *
 * Receives the Player ref so it can call channel mutators and read analysers
 * without importing the engine directly. Also receives the current view so
 * the apply-to-player effect fires when entering the tracker (the ref mutation
 * of playerRef.current does not trigger re-renders).
 */
export function useMixer(
  playerRef: React.RefObject<Player | null>,
  view: string
): Mixer {
  const [channels, setChannels] = useState<ChannelState[]>(loadChannelState)
  const [channelLevels, setChannelLevels] = useState<Map<number, number>>(new Map())
  const [channelPeaks, setChannelPeaks] = useState<Map<number, number>>(new Map())

  // Track which channels have been removed (persisted across reloads).
  const removedIndicesRef = useRef<number[]>(loadRemovedIndices())

  // Keep a ref copy for the rAF loop so it never captures stale state.
  const channelsRef = useRef(channels)
  channelsRef.current = channels

  // Peak hold state: level in dB per channel index.
  const peaksRef = useRef(new Map<number, number>())
  const lastFrameRef = useRef(0)

  // Per-channel reusable Float32Array buffers for analyser reads.
  const meterBuffersRef = useRef(new Map<number, Float32Array>())

  // Persist channel state to localStorage on every change.
  useEffect(() => {
    saveChannelState(channels)
  }, [channels])

  // Persist removed indices.
  useEffect(() => {
    saveRemovedIndices(removedIndicesRef.current)
  }, [channels])

  // Previous frame's levels — kept outside state so the rAF loop can diff
  // against it without triggering renders.
  const prevLevelsRef = useRef(new Map<number, number>())

  // rAF meter loop — reads all channel analysers once per frame, computes RMS,
  // updates peak hold, and batches a single setState. Only runs while the
  // player exists; stops updating state when values are unchanged.
  useEffect(() => {
    let rafId: number
    let running = true

    const tick = (now: number) => {
      if (!running) return
      const player = playerRef.current
      if (!player) {
        rafId = requestAnimationFrame(tick)
        return
      }

      // When silent, decay meters to silence over one frame then keep the loop
      // alive so it resumes immediately when playback starts.
      if (player.activeVoiceCount === 0) {
        const prevLevels = prevLevelsRef.current
        if (prevLevels.size > 0) {
          let anySilent = false
          for (const [idx, db] of prevLevels) {
            if (db > SILENCE_DB) { anySilent = true; break }
            void idx
          }
          if (anySilent) {
            const silentLevels = new Map<number, number>()
            const silentPeaks = new Map<number, number>()
            for (const ch of channelsRef.current) {
              silentLevels.set(ch.channelIndex, SILENCE_DB)
              silentPeaks.set(ch.channelIndex, SILENCE_DB)
            }
            prevLevelsRef.current = silentLevels
            peaksRef.current = new Map()
            setChannelLevels(silentLevels)
            setChannelPeaks(silentPeaks)
          }
        }
        rafId = requestAnimationFrame(tick)
        return
      }

      const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0
      lastFrameRef.current = now

      const chs = channelsRef.current
      const newLevels = new Map<number, number>()
      const newPeaks = new Map<number, number>()
      const currentPeaks = peaksRef.current
      const buffers = meterBuffersRef.current
      const prevLevels = prevLevelsRef.current

      let anyChanged = false

      for (const ch of chs) {
        const analyser = player.getChannelAnalyser(ch.channelIndex)
        if (!analyser) {
          newLevels.set(ch.channelIndex, SILENCE_DB)
          if (prevLevels.get(ch.channelIndex) !== SILENCE_DB) anyChanged = true
          continue
        }

        // Reuse the per-channel buffer.
        let buffer = buffers.get(ch.channelIndex)
        if (!buffer || buffer.length !== analyser.fftSize) {
          buffer = new Float32Array(analyser.fftSize)
          buffers.set(ch.channelIndex, buffer)
        }
        analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>)

        let sumSquares = 0
        for (let i = 0; i < buffer.length; i++) {
          const sample = buffer[i]
          sumSquares += sample * sample
        }
        const rms = Math.sqrt(sumSquares / buffer.length)
        const db = rmsToDb(rms)

        newLevels.set(ch.channelIndex, db)
        if (db !== prevLevels.get(ch.channelIndex)) anyChanged = true

        // Peak hold: track the maximum recent RMS and decay over time.
        const currentPeak = currentPeaks.get(ch.channelIndex) ?? SILENCE_DB
        const decayAmount = PEAK_HOLD_DECAY_DB_PER_S * dt
        const decayedPeak = currentPeak - decayAmount
        const newPeak = Math.max(decayedPeak, db)
        currentPeaks.set(ch.channelIndex, newPeak)
        newPeaks.set(ch.channelIndex, newPeak)
      }

      if (anyChanged) {
        prevLevelsRef.current = newLevels
        setChannelLevels(newLevels)
        setChannelPeaks(newPeaks)
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(rafId)
    }
  }, [playerRef])

  // Apply channel state to the Player when entering the tracker (a fresh Player
  // is created on each entry). Also replays removed channel indices so channel
  // removal survives page reload.
  useEffect(() => {
    if (view !== 'tracker') return
    const player = playerRef.current
    if (!player) return

    // Replay removed channels first so their indices are marked before we
    // push gain/pan/mute/solo (which would otherwise create the channels).
    player.replayRemovedChannels(removedIndicesRef.current)

    for (const ch of channels) {
      player.setChannelGain(ch.channelIndex, ch.gain)
      player.setChannelPan(ch.channelIndex, ch.pan)
    }
    // Apply mute/solo gating after all gains are set.
    for (const ch of channels) {
      player.setChannelMute(ch.channelIndex, ch.muted)
      player.setChannelSolo(ch.channelIndex, ch.solo)
    }
  }, [view, playerRef, channels])

  const setChannelGain = useCallback((channelIndex: number, gain: number) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.channelIndex === channelIndex ? { ...ch, gain } : ch))
    )
    playerRef.current?.setChannelGain(channelIndex, gain)
  }, [playerRef])

  const setChannelPan = useCallback((channelIndex: number, pan: number) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.channelIndex === channelIndex ? { ...ch, pan } : ch))
    )
    playerRef.current?.setChannelPan(channelIndex, pan)
  }, [playerRef])

  const toggleChannelMute = useCallback((channelIndex: number) => {
    setChannels((prev) => {
      const next = prev.map((ch) =>
        ch.channelIndex === channelIndex ? { ...ch, muted: !ch.muted } : ch
      )
      // Apply gating immediately using the fresh state from the updater,
      // not the stale closure.
      const player = playerRef.current
      if (player) {
        const updated = next.find((c) => c.channelIndex === channelIndex)
        if (updated) player.setChannelMute(channelIndex, updated.muted)
      }
      return next
    })
  }, [playerRef])

  const toggleChannelSolo = useCallback((channelIndex: number) => {
    setChannels((prev) => {
      const next = prev.map((ch) =>
        ch.channelIndex === channelIndex ? { ...ch, solo: !ch.solo } : ch
      )
      const player = playerRef.current
      if (player) {
        const updated = next.find((c) => c.channelIndex === channelIndex)
        if (updated) player.setChannelSolo(channelIndex, updated.solo)
      }
      return next
    })
  }, [playerRef])

  const removeChannel = useCallback((channelIndex: number) => {
    setChannels((prev) => prev.filter((ch) => ch.channelIndex !== channelIndex))
    // Track removed indices so they survive page reload (the Player's
    // removedChannels set is cleared on close()).
    if (!removedIndicesRef.current.includes(channelIndex)) {
      removedIndicesRef.current = [...removedIndicesRef.current, channelIndex]
    }
    playerRef.current?.removeChannel(channelIndex)
  }, [playerRef])

  return {
    channels,
    channelLevels,
    channelPeaks,
    setChannelGain,
    setChannelPan,
    toggleChannelMute,
    toggleChannelSolo,
    removeChannel
  }
}
