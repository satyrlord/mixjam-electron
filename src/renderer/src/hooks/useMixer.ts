import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaybackEngine } from '../engine/playback-engine'
import { createDefaultEffect, isEffectSlot, type EffectSlot, type EffectType } from '../engine/effects'
import {
  DEFAULT_PROJECT_CHANNEL_COUNT,
  createDefaultChannel,
  createDefaultChannels,
  type ChannelState
} from '../project/project-state'

const PEAK_HOLD_DECAY_DB_PER_S = 30
const SILENCE_DB = -100
const LEGACY_STORAGE_KEY = 'mixjam-mixer-channels'

export interface MixerState {
  channels: ChannelState[]
  /** Current RMS level in dBFS per channel index (Map keyed by channelIndex). */
  channelLevels: ReadonlyMap<number, number>
  /** Peak hold level per channel index. */
  channelPeaks: ReadonlyMap<number, number>
  /** Positive compressor gain reduction in dB, keyed by effect id. */
  effectReductions: ReadonlyMap<string, number>
  /** True when at least one channel has been removed and can be restored. */
  canRestoreChannel: boolean
}

export interface MixerActions {
  setVisualTelemetryActive: (active: boolean) => void
  replaceChannels: (channels: ChannelState[]) => void
  setChannelGain: (channelIndex: number, gain: number) => void
  setChannelPan: (channelIndex: number, pan: number) => void
  toggleChannelMute: (channelIndex: number) => void
  toggleChannelSolo: (channelIndex: number) => void
  removeChannel: (channelIndex: number) => void
  restoreChannel: () => void
  addChannelEffect: (channelIndex: number, type: EffectType) => EffectSlot | null
  updateChannelEffect: (channelIndex: number, effect: EffectSlot) => void
  toggleChannelEffectBypass: (channelIndex: number, effectId: string) => void
  removeChannelEffect: (channelIndex: number, effectId: string) => void
  restoreChannelEffect: (channelIndex: number, effect: EffectSlot, index: number) => boolean
  moveChannelEffect: (channelIndex: number, effectId: string, toIndex: number) => void
}

export type Mixer = MixerState & MixerActions

/** Indices in [0, DEFAULT_PROJECT_CHANNEL_COUNT) absent from `channels`. */
function removedIndicesOf(channels: ChannelState[]): number[] {
  const present = new Set(channels.map((ch) => ch.channelIndex))
  const removed: number[] = []
  for (let i = 0; i < DEFAULT_PROJECT_CHANNEL_COUNT; i++) {
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
  const [channels, setChannels] = useState<ChannelState[]>(createDefaultChannels)
  const [channelLevels, setChannelLevels] = useState<Map<number, number>>(new Map())
  const [channelPeaks, setChannelPeaks] = useState<Map<number, number>>(new Map())
  const [effectReductions, setEffectReductions] = useState<Map<string, number>>(new Map())
  const [visualTelemetryActive, setVisualTelemetryActive] = useState(false)

  // Keep a ref copy for the rAF loop so it never captures stale state.
  const channelsRef = useRef(channels)
  channelsRef.current = channels

  // Peak hold state: level in dB per channel index.
  const peaksRef = useRef(new Map<number, number>())
  const lastFrameRef = useRef(0)

  // Per-channel reusable Float32Array buffers for analyser reads.
  const meterBuffersRef = useRef(new Map<number, Float32Array>())

  // Project-owned mixer state lives in .mixjam files. Clean up the
  // app-level storage key without importing it into the current project.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Storage can be unavailable; mixer state is in memory either way.
    }
  }, [])

  // Previous frame's levels — kept outside state so the rAF loop can diff
  // against it without triggering renders.
  const prevLevelsRef = useRef(new Map<number, number>())
  const prevReductionsRef = useRef(new Map<string, number>())

  // Mixer meters and FX compressor reduction are visual-only telemetry. Keep
  // the panels mounted to preserve their UI state, but run their shared frame
  // loop only while either panel is visible.
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

      // When silent, decay meters to silence over one frame then keep the loop
      // alive so it resumes immediately when playback starts.
      if (playbackEngine.activeVoiceCount === 0) {
        const silentReductions = new Map<string, number>()
        for (const channel of channelsRef.current) {
          for (const effect of channel.effects) {
            if (effect.type === 'compressor') silentReductions.set(effect.id, 0)
          }
        }
        const previousReductions = prevReductionsRef.current
        const reductionsChanged = silentReductions.size !== previousReductions.size ||
          [...silentReductions.keys()].some((id) => previousReductions.get(id) !== 0)
        if (reductionsChanged) {
          prevReductionsRef.current = silentReductions
          setEffectReductions(silentReductions)
        }
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
      const prevReductions = prevReductionsRef.current
      const newReductions = new Map<string, number>()

      let anyChanged = false

      for (const ch of chs) {
        for (const effect of ch.effects) {
          if (effect.type !== 'compressor') continue
          const reduction = effect.bypassed
            ? 0
            : playbackEngine.getChannelEffectReduction(ch.channelIndex, effect.id)
          newReductions.set(effect.id, reduction)
          if (Math.abs(reduction - (prevReductions.get(effect.id) ?? 0)) >= 0.1) anyChanged = true
        }
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

      if (newReductions.size !== prevReductions.size ||
          [...prevReductions.keys()].some((id) => !newReductions.has(id))) anyChanged = true

      if (anyChanged) {
        prevLevelsRef.current = newLevels
        prevReductionsRef.current = newReductions
        setChannelLevels(newLevels)
        setChannelPeaks(newPeaks)
        setEffectReductions(newReductions)
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

  // Reconcile the complete project snapshot when it changes or a fresh engine
  // is created. The graph owner decides ordering, removal, and solo/mute gating.
  useEffect(() => {
    if (view !== 'player') return
    const playbackEngine = playbackEngineRef.current
    if (!playbackEngine) return

    playbackEngine.applyChannelSnapshot(channels, DEFAULT_PROJECT_CHANNEL_COUNT)
  }, [view, playbackEngineRef, channels])

  const replaceChannels = useCallback((nextChannels: ChannelState[]) => {
    const next = nextChannels
      .map((channel) => ({
        ...channel,
        effects: channel.effects.filter(isEffectSlot).map((effect) => ({ ...effect }))
      }))
      .sort((left, right) => left.channelIndex - right.channelIndex)
    setChannels(next)
    setChannelLevels(new Map())
    setChannelPeaks(new Map())
    setEffectReductions(new Map())
    peaksRef.current = new Map()
    prevLevelsRef.current = new Map()
    prevReductionsRef.current = new Map()
  }, [])

  const setChannelGain = useCallback((channelIndex: number, gain: number) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.channelIndex === channelIndex ? { ...ch, gain } : ch))
    )
  }, [])

  const setChannelPan = useCallback((channelIndex: number, pan: number) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.channelIndex === channelIndex ? { ...ch, pan } : ch))
    )
  }, [])

  const toggleChannelMute = useCallback((channelIndex: number) => {
    setChannels((prev) => {
      const next = prev.map((ch) =>
        ch.channelIndex === channelIndex ? { ...ch, muted: !ch.muted } : ch
      )
      return next
    })
  }, [])

  const toggleChannelSolo = useCallback((channelIndex: number) => {
    setChannels((prev) => {
      const next = prev.map((ch) =>
        ch.channelIndex === channelIndex ? { ...ch, solo: !ch.solo } : ch
      )
      return next
    })
  }, [])

  const removeChannel = useCallback((channelIndex: number) => {
    setChannels((prev) => prev.filter((ch) => ch.channelIndex !== channelIndex))
  }, [])

  const mutateEffects = useCallback((channelIndex: number, mutate: (effects: EffectSlot[]) => EffectSlot[]) => {
    setChannels((prev) => prev.map((channel) => {
      if (channel.channelIndex !== channelIndex) return channel
      const effects = mutate(channel.effects)
      return { ...channel, effects }
    }))
  }, [])

  const addChannelEffect = useCallback((channelIndex: number, type: EffectType) => {
    const channel = channelsRef.current.find((candidate) => candidate.channelIndex === channelIndex)
    if (!channel || channel.effects.length >= 4) return null
    const effect = createDefaultEffect(type)
    mutateEffects(channelIndex, (effects) => effects.length >= 4 ? effects : [...effects, effect])
    return effect
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

  const restoreChannelEffect = useCallback((channelIndex: number, effect: EffectSlot, index: number): boolean => {
    const channel = channelsRef.current.find((candidate) => candidate.channelIndex === channelIndex)
    if (!channel || channel.effects.length >= 4) return false
    mutateEffects(channelIndex, (effects) => {
      const next = [...effects]
      next.splice(Math.max(0, Math.min(index, next.length)), 0, { ...effect })
      return next
    })
    return true
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
    setChannels((prev) =>
      [...prev, restored].sort((a, b) => a.channelIndex - b.channelIndex)
    )
  }, [])

  return {
    channels,
    channelLevels,
    channelPeaks,
    effectReductions,
    canRestoreChannel: channels.length < DEFAULT_PROJECT_CHANNEL_COUNT,
    setVisualTelemetryActive,
    replaceChannels,
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
    restoreChannelEffect,
    moveChannelEffect
  }
}
