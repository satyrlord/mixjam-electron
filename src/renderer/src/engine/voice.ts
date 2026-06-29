// A Voice is a single triggered sample playback instance wrapping a one-shot
// AudioBufferSourceNode. It is created by the engine's triggerVoice() and
// auto-disposes when the buffer finishes or stop() is called.
//
// Engine boundary: pure TypeScript over the Web Audio API. No React, no DOM.

export type VoiceLifecycle = 'playing' | 'ended'

export interface VoiceEvents {
  onStarted?: (voice: Voice) => void
  onEnded?: (voice: Voice) => void
}

let nextVoiceId = 0

export interface Voice {
  readonly id: number
  readonly trackIndex: number
  readonly state: VoiceLifecycle
  stop(when?: number): void
}

export interface CreateVoiceParams {
  context: BaseAudioContext
  buffer: AudioBuffer
  destination: AudioNode
  when: number
  trackIndex: number
  events?: VoiceEvents
}

export function createVoice({
  context,
  buffer,
  destination,
  when,
  trackIndex,
  events
}: CreateVoiceParams): Voice {
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(destination)

  let state: VoiceLifecycle = 'playing'

  const voice: Voice = {
    id: nextVoiceId++,
    trackIndex,
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
    events?.onEnded?.(voice)
  }

  source.start(when)
  events?.onStarted?.(voice)

  return voice
}
