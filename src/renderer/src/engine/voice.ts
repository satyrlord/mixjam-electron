// A Voice is a single triggered sample playback instance wrapping a one-shot
// AudioBufferSourceNode. It is created by the engine's triggerVoice() and
// auto-disposes when the buffer finishes or stop() is called.
//
// Engine boundary: pure TypeScript over the Web Audio API. No React, no DOM.

import { clipEdgeGainAtSample, type ClipEdgeFadePlan } from './clip-edge-fades'

export type VoiceLifecycle = 'playing' | 'ended'

export interface VoiceEvents {
  onStarted?: (voice: Voice) => void
  onEnded?: (voice: Voice) => void
}

let nextVoiceId = 0

export interface Voice {
  readonly id: number
  readonly laneIndex: number
  readonly state: VoiceLifecycle
  stop(when?: number): void
}

export interface CreateVoiceParams {
  context: BaseAudioContext
  buffer: AudioBuffer
  destination: AudioNode
  when: number
  laneIndex: number
  playbackRate?: number
  sourceOffsetSeconds?: number
  edgeFadePlan?: ClipEdgeFadePlan
  edgeFadeStartSample?: number
  events?: VoiceEvents
}

function scheduleEdgeFade(
  gain: AudioParam,
  plan: ClipEdgeFadePlan,
  when: number,
  startSample: number
): void {
  if (plan.sampleRate <= 0 || plan.clipSamples <= 0) return
  const boundedStart = Math.max(0, Math.min(plan.clipSamples - 1, Math.round(startSample)))
  const timeForSample = (sample: number): number =>
    when + Math.max(0, sample - boundedStart) / plan.sampleRate
  gain.setValueAtTime(clipEdgeGainAtSample(plan, boundedStart), when)

  const fadeInEnd = plan.fadeInSamples - 1
  if (plan.fadeInSamples >= 2 && boundedStart < fadeInEnd) {
    gain.linearRampToValueAtTime(1, timeForSample(fadeInEnd))
  } else if (
    plan.fadeInSamples === 1 &&
    boundedStart === 0 &&
    plan.clipSamples > 1
  ) {
    gain.setValueAtTime(clipEdgeGainAtSample(plan, 1), timeForSample(1))
  }

  const fadeOutStart = plan.clipSamples - plan.fadeOutSamples
  const fadeOutEnd = plan.clipSamples - 1
  if (plan.fadeOutSamples >= 2 && boundedStart < fadeOutEnd) {
    if (boundedStart < fadeOutStart) {
      gain.setValueAtTime(1, timeForSample(fadeOutStart))
    }
    gain.linearRampToValueAtTime(0, timeForSample(fadeOutEnd))
  } else if (plan.fadeOutSamples === 1 && boundedStart <= fadeOutEnd) {
    gain.setValueAtTime(0, timeForSample(fadeOutEnd))
  }
}

export function createVoice({
  context,
  buffer,
  destination,
  when,
  laneIndex,
  playbackRate = 1,
  sourceOffsetSeconds = 0,
  edgeFadePlan,
  edgeFadeStartSample = 0,
  events
}: CreateVoiceParams): Voice {
  const source = context.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = playbackRate
  const edgeGain = edgeFadePlan && (edgeFadePlan.fadeInSamples > 0 || edgeFadePlan.fadeOutSamples > 0)
    ? context.createGain()
    : null
  if (edgeGain && edgeFadePlan) {
    scheduleEdgeFade(edgeGain.gain, edgeFadePlan, when, edgeFadeStartSample)
    source.connect(edgeGain)
    edgeGain.connect(destination)
  } else {
    source.connect(destination)
  }

  let state: VoiceLifecycle = 'playing'

  const voice: Voice = {
    id: nextVoiceId++,
    laneIndex,
    get state() {
      return state
    },
    stop(stopWhen?: number): void {
      if (state === 'ended') return
      try {
        source.stop(stopWhen)
      } catch {
        // stop() throws if the node never started or already stopped; the
        // onended handler still fires, so we can safely ignore it here.
      }
    }
  }

  source.onended = () => {
    if (state === 'ended') return
    state = 'ended'
    source.disconnect()
    edgeGain?.disconnect()
    events?.onEnded?.(voice)
  }

  source.start(when, Math.max(0, sourceOffsetSeconds))
  events?.onStarted?.(voice)

  return voice
}
