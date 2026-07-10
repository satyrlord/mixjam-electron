import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaybackEngine } from '../engine/playback-engine'
import { safeJsonParse } from '../lib/safeJsonParse'
import { createDefaultEffect, isEffectSlot, type EffectSlot, type EffectType } from '../engine/effects'

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
  effects: EffectSlot[]
}

export interface MixerState {
  channels: ChannelState[]
  /** Current RMS level in dBFS per channel index (Map keyed by channelIndex). */
  channelLevels: ReadonlyMap<number, number>
  /** Peak hold level per channel index. */
  channelPeaks: ReadonlyMap<number, number>
  /** True when at least one channel has been removed and can be restored. */
  canRestoreChannel: boolean
}

export interface MixerActions {
  setChannelGain: (channelIndex: number, gain: number) => void
  setChannelPan: (channelIndex: number, pan: number) => void
  toggleChannelMute: (channelIndex: number) => void
  toggleChannelSolo: (channelIndex: number) => void
  removeChannel: (channelIndex: number) => void
  restoreChannel: () => void
  addChannelEffect: (channelIndex: number, type: EffectType) => void
  updateChannelEffect: (channelIndex: number, effect: EffectSlot) => void
  toggleChannelEffectBypass: (channelIndex: number, effectId: string) => void
  removeChannelEffect: (channelIndex: number, effectId: string) => void
  moveChannelEffect: (channelIndex: number, effectId: string, toIndex: number) => void
}

export type Mixer = MixerState & MixerActions

const STORAGE_KEY = 'mixjam-mixer-channels'

function loadChannelState(): ChannelState[] {
  // Accept a persisted empty array: removing all channels is a legitimate
  // state that must survive reload. Rejecting it here resurrected 16 default
  // strips while the removed-indices list still routed every lane to the
  // master bypass — a mixer whose controls silently did nothing.
  const stored = safeJsonParse(
    localStorage.getItem(STORAGE_KEY) ?? '',
    createDefaultChannels(),
    (v): v is unknown[] => Array.isArray(v)
  )
  const normalized = stored.flatMap((value) => normalizeChannel(value))
  return normalized.length > 0 || stored.length === 0 ? normalized : createDefaultChannels()
}

function normalizeChannel(value: unknown): ChannelState[] {
  if (!value || typeof value !== 'object') return []
  const channel = value as Partial<ChannelState>
  if (!Number.isInteger(channel.channelIndex) || channel.channelIndex! < 0 || channel.channelIndex! >= DEFAULT_CHANNEL_COUNT) return []
  return [{
    channelIndex: channel.channelIndex!,
    gain: typeof channel.gain === 'number' ? channel.gain : DEFAULT_CHANNEL_GAIN,
    pan: typeof channel.pan === 'number' ? channel.pan : 0,
    muted: channel.muted === true,
    solo: channel.solo === true,
    effects: Array.isArray(channel.effects) ? channel.effects.filter(isEffectSlot).slice(0, 4) : []
  }]
}

function saveChannelState(channels: ChannelState[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels))
  } catch {
    // Storage full or unavailable — non-critical.
  }
}

const DEFAULT_CHANNEL_GAIN = 0.8

function createDefaultChannel(channelIndex: number): ChannelState {
  return { channelIndex, gain: DEFAULT_CHANNEL_GAIN, pan: 0, muted: false, solo: false, effects: [] }
}

function createDefaultChannels(): ChannelState[] {
  return Array.from({ length: DEFAULT_CHANNEL_COUNT }, (_, i) => createDefaultChannel(i))
}

/** Indices in [0, DEFAULT_CHANNEL_COUNT) that are absent from `channels`. */
function removedIndicesOf(channels: ChannelState[]): number[] {
  const present = new Set(channels.map((ch) => ch.channelIndex))
  const removed: number[] = []
  for (let i = 0; i < DEFAULT_CHANNEL_COUNT; i++) {
    if (!present.has(i)) removed.push(i)
  }
  return removed
}

function rmsToDb(rms: number): number {
  if (rms <= 0) return SILENCE_DB
  return Math.max(SILENCE_DB, 20 * Math.log10(rms))
}

/**
 * Manages N-channel mixer state (gain, pan, mute, solo) and drives the
 * per-channel dB meter display via a single requestAnimationFrame loop.
 *
 * Receives the PlaybackEngine ref so it can call channel mutators and read analysers
 * without importing the engine directly. Also receives the current view so
 * the apply-state effect fires when entering the Player (the ref mutation
 * of playbackEngineRef.current does not trigger re-renders).
 */
export function useMixer(
  playbackEngineRef: React.RefObject<PlaybackEngine | null>,
  view: string
): Mixer {
  const [channels, setChannels] = useState<ChannelState[]>(loadChannelState)
  const [channelLevels, setChannelLevels] = useState<Map<number, number>>(new Map())
  const [channelPeaks, setChannelPeaks] = useState<Map<number, number>>(new Map())

  // Keep a ref copy for the rAF loop so it never captures stale state.
  const channelsRef = useRef(channels)
  channelsRef.current = channels

  // Peak hold state: level in dB per channel index.
  const peaksRef = useRef(new Map<number, number>())
  const lastFrameRef = useRef(0)

  // Per-channel reusable Float32Array buffers for analyser reads.
  const meterBuffersRef = useRef(new Map<number, Float32Array>())

  // Persist channel state to localStorage on every change. Removed channels are
  // encoded by their absence from this array — there is no separate removed
  // list to drift out of sync (removed indices are derived on reload).
  useEffect(() => {
    saveChannelState(channels)
  }, [channels])

  // Previous frame's levels — kept outside state so the rAF loop can diff
  // against it without triggering renders.
  const prevLevelsRef = useRef(new Map<number, number>())

  // rAF meter loop — reads all channel analysers once per frame, computes RMS,
  // updates peak hold, and batches a single setState. Only runs while the
  // PlaybackEngine exists; stops updating state when values are unchanged.
  useEffect(() => {
    let rafId: number
    let running = true

    const tick = (now: number) => {
      if (!running) return
      const playbackEngine = playbackEngineRef.current
      if (!playbackEngine) {
        rafId = requestAnimationFrame(tick)
        return
      }

      // When silent, decay meters to silence over one frame then keep the loop
      // alive so it resumes immediately when playback starts.
      if (playbackEngine.activeVoiceCount === 0) {
        const prevLevels = prevLevelsRef.current
        if (prevLevels.size > 0) {
          let anyAudible = false
          for (const db of prevLevels.values()) {
            if (db > SILENCE_DB) { anyAudible = true; break }
          }
          if (anyAudible) {
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
        const analyser = playbackEngine.getChannelAnalyser(ch.channelIndex)
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
  }, [playbackEngineRef])

  // Apply channel state to PlaybackEngine when entering the Player (a fresh PlaybackEngine
  // is created on each entry). Also replays removed channel indices so channel
  // removal survives page reload.
  useEffect(() => {
    if (view !== 'player') return
    const playbackEngine = playbackEngineRef.current
    if (!playbackEngine) return

    // Replay removed channels first so their indices are marked before we
    // push gain/pan/mute/solo (which would otherwise create the channels).
    playbackEngine.replayRemovedChannels(removedIndicesOf(channels))

    for (const ch of channels) {
      playbackEngine.setChannelEffects(ch.channelIndex, ch.effects)
      playbackEngine.setChannelGain(ch.channelIndex, ch.gain)
      playbackEngine.setChannelPan(ch.channelIndex, ch.pan)
    }
    // Apply mute/solo gating after all gains are set.
    for (const ch of channels) {
      playbackEngine.setChannelMute(ch.channelIndex, ch.muted)
      playbackEngine.setChannelSolo(ch.channelIndex, ch.solo)
    }
  }, [view, playbackEngineRef, channels])

  const setChannelGain = useCallback((channelIndex: number, gain: number) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.channelIndex === channelIndex ? { ...ch, gain } : ch))
    )
    playbackEngineRef.current?.setChannelGain(channelIndex, gain)
  }, [playbackEngineRef])

  const setChannelPan = useCallback((channelIndex: number, pan: number) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.channelIndex === channelIndex ? { ...ch, pan } : ch))
    )
    playbackEngineRef.current?.setChannelPan(channelIndex, pan)
  }, [playbackEngineRef])

  const toggleChannelMute = useCallback((channelIndex: number) => {
    setChannels((prev) => {
      const next = prev.map((ch) =>
        ch.channelIndex === channelIndex ? { ...ch, muted: !ch.muted } : ch
      )
      // Apply gating immediately using the fresh state from the updater,
      // not the stale closure.
      const playbackEngine = playbackEngineRef.current
      if (playbackEngine) {
        const updated = next.find((c) => c.channelIndex === channelIndex)
        if (updated) playbackEngine.setChannelMute(channelIndex, updated.muted)
      }
      return next
    })
  }, [playbackEngineRef])

  const toggleChannelSolo = useCallback((channelIndex: number) => {
    setChannels((prev) => {
      const next = prev.map((ch) =>
        ch.channelIndex === channelIndex ? { ...ch, solo: !ch.solo } : ch
      )
      const playbackEngine = playbackEngineRef.current
      if (playbackEngine) {
        const updated = next.find((c) => c.channelIndex === channelIndex)
        if (updated) playbackEngine.setChannelSolo(channelIndex, updated.solo)
      }
      return next
    })
  }, [playbackEngineRef])

  const removeChannel = useCallback((channelIndex: number) => {
    setChannels((prev) => prev.filter((ch) => ch.channelIndex !== channelIndex))
    playbackEngineRef.current?.removeChannel(channelIndex)
  }, [playbackEngineRef])

  const mutateEffects = useCallback((channelIndex: number, mutate: (effects: EffectSlot[]) => EffectSlot[]) => {
    setChannels((prev) => prev.map((channel) => {
      if (channel.channelIndex !== channelIndex) return channel
      const effects = mutate(channel.effects)
      return { ...channel, effects }
    }))
  }, [])

  const addChannelEffect = useCallback((channelIndex: number, type: EffectType) => {
    const effect = createDefaultEffect(type)
    mutateEffects(channelIndex, (effects) => effects.length >= 4 ? effects : [...effects, effect])
  }, [mutateEffects])

  const updateChannelEffect = useCallback((channelIndex: number, effect: EffectSlot) => {
    mutateEffects(channelIndex, (effects) => effects.map((current) => current.id === effect.id ? effect : current))
  }, [mutateEffects])

  const toggleChannelEffectBypass = useCallback((channelIndex: number, effectId: string) => {
    mutateEffects(channelIndex, (effects) => effects.map((effect) => effect.id === effectId ? { ...effect, bypassed: !effect.bypassed } : effect))
  }, [mutateEffects])

  const removeChannelEffect = useCallback((channelIndex: number, effectId: string) => {
    mutateEffects(channelIndex, (effects) => effects.filter((effect) => effect.id !== effectId))
  }, [mutateEffects])

  const moveChannelEffect = useCallback((channelIndex: number, effectId: string, toIndex: number) => {
    mutateEffects(channelIndex, (effects) => {
      const fromIndex = effects.findIndex((effect) => effect.id === effectId)
      if (fromIndex < 0) return effects
      const next = [...effects]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved!)
      return next
    })
  }, [mutateEffects])

  // Add-back of a removed channel (not add-new): re-adds the lowest missing
  // channelIndex at default state and re-routes its lane from the master bypass
  // back through the channel. Side effects run outside the setChannels updater
  // (which must stay pure — React double-invokes updaters under StrictMode and
  // may run them for discarded renders); the missing index is derived from the
  // current channels array, mirroring removeChannel.
  const restoreChannel = useCallback(() => {
    const removed = removedIndicesOf(channelsRef.current)
    const lowest = removed[0]
    if (lowest === undefined) return
    const restored = createDefaultChannel(lowest)
    // Re-route the lane back into its channel strip. Gain/pan/mute/solo are
    // re-pushed to PlaybackEngine by the apply-state effect on the next commit.
    playbackEngineRef.current?.restoreChannel(lowest)
    setChannels((prev) =>
      [...prev, restored].sort((a, b) => a.channelIndex - b.channelIndex)
    )
  }, [playbackEngineRef])

  return {
    channels,
    channelLevels,
    channelPeaks,
    canRestoreChannel: channels.length < DEFAULT_CHANNEL_COUNT,
    setChannelGain,
    setChannelPan,
    toggleChannelMute,
    toggleChannelSolo,
    removeChannel,
    restoreChannel,
    addChannelEffect,
    updateChannelEffect,
    toggleChannelEffectBypass,
    removeChannelEffect,
    moveChannelEffect
  }
}
