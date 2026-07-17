import { clamp } from '../lib/sample-utils'

export const MIN_CLIP_EDGE_FADE_MS = 0
export const MAX_CLIP_EDGE_FADE_MS = 20

export interface ClipEdgeMicroFadeSettings {
  enabled: boolean
  fadeInMs: number
  fadeOutMs: number
}

export const DEFAULT_CLIP_EDGE_MICRO_FADES: ClipEdgeMicroFadeSettings = Object.freeze({
  enabled: true,
  fadeInMs: 2,
  fadeOutMs: 4
})

export interface ClipEdgeFadePlan {
  sampleRate: number
  clipSamples: number
  fadeInSamples: number
  fadeOutSamples: number
}

export interface ClipEdgeFadePlanOptions {
  sampleRate: number
  clipDurationSeconds: number
  fadeInMs: number
  fadeOutMs: number
  fadeInEnabled?: boolean
  fadeOutEnabled?: boolean
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function normalizeClipEdgeMicroFades(
  settings: ClipEdgeMicroFadeSettings
): ClipEdgeMicroFadeSettings {
  return {
    enabled: settings.enabled,
    fadeInMs: clamp(finiteNonNegative(settings.fadeInMs), MIN_CLIP_EDGE_FADE_MS, MAX_CLIP_EDGE_FADE_MS),
    fadeOutMs: clamp(finiteNonNegative(settings.fadeOutMs), MIN_CLIP_EDGE_FADE_MS, MAX_CLIP_EDGE_FADE_MS)
  }
}

export function fadeMillisecondsToSamples(sampleRate: number, durationMs: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return 0
  return Math.max(0, Math.round(sampleRate * finiteNonNegative(durationMs) / 1000))
}

export function createClipEdgeFadePlan({
  sampleRate,
  clipDurationSeconds,
  fadeInMs,
  fadeOutMs,
  fadeInEnabled = true,
  fadeOutEnabled = true
}: ClipEdgeFadePlanOptions): ClipEdgeFadePlan {
  const validSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 0
  const clipSamples = validSampleRate > 0 && Number.isFinite(clipDurationSeconds) && clipDurationSeconds > 0
    ? Math.max(0, Math.round(validSampleRate * clipDurationSeconds))
    : 0
  let fadeInSamples = fadeInEnabled
    ? fadeMillisecondsToSamples(validSampleRate, fadeInMs)
    : 0
  let fadeOutSamples = fadeOutEnabled
    ? fadeMillisecondsToSamples(validSampleRate, fadeOutMs)
    : 0
  const requestedTotal = fadeInSamples + fadeOutSamples

  if (clipSamples === 0 || requestedTotal === 0) {
    return {
      sampleRate: validSampleRate,
      clipSamples,
      fadeInSamples: 0,
      fadeOutSamples: 0
    }
  }

  if (requestedTotal > clipSamples) {
    if (fadeInSamples === 0) {
      fadeOutSamples = clipSamples
    } else if (fadeOutSamples === 0) {
      fadeInSamples = clipSamples
    } else {
      fadeInSamples = Math.round(clipSamples * fadeInSamples / requestedTotal)
      fadeOutSamples = clipSamples - fadeInSamples
    }
  }

  return {
    sampleRate: validSampleRate,
    clipSamples,
    fadeInSamples,
    fadeOutSamples
  }
}

export function clipEdgeGainAtSample(plan: ClipEdgeFadePlan, sampleIndex: number): number {
  if (plan.clipSamples <= 0) return 1
  const sample = clamp(Math.round(sampleIndex), 0, plan.clipSamples - 1)

  if (plan.fadeInSamples > 0 && sample < plan.fadeInSamples) {
    if (plan.fadeInSamples === 1) return 0
    return sample / (plan.fadeInSamples - 1)
  }

  const fadeOutStart = plan.clipSamples - plan.fadeOutSamples
  if (plan.fadeOutSamples > 0 && sample >= fadeOutStart) {
    if (plan.fadeOutSamples === 1) return 0
    return (plan.clipSamples - 1 - sample) / (plan.fadeOutSamples - 1)
  }

  return 1
}
