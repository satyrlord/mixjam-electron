import { clamp } from '../lib/sample-utils'

export type EffectType = 'delay' | 'reverb' | 'compressor'
export type NoteDivision = '1/4' | '1/8' | '1/16' | '1/8T' | '1/16T'

export interface DelayEffect {
  id: string
  type: 'delay'
  bypassed: boolean
  timeMs: number
  feedback: number
  mix: number
  pingPong: boolean
  tempoSync: boolean
  noteDivision: NoteDivision
}

export interface ReverbEffect {
  id: string
  type: 'reverb'
  bypassed: boolean
  roomSize: number
  decay: number
  mix: number
}

export interface CompressorEffect {
  id: string
  type: 'compressor'
  bypassed: boolean
  threshold: number
  ratio: number
  attackMs: number
  releaseMs: number
  makeupGain: number
}

export type EffectSlot = DelayEffect | ReverbEffect | CompressorEffect

export type EffectPresetValues =
  | Omit<DelayEffect, 'id' | 'type' | 'bypassed'>
  | Omit<ReverbEffect, 'id' | 'type' | 'bypassed'>
  | Omit<CompressorEffect, 'id' | 'type' | 'bypassed'>

export interface EffectPreset {
  name: string
  values: EffectPresetValues
}

export const EFFECT_PRESETS: Record<EffectType, readonly EffectPreset[]> = {
  delay: [
    { name: 'Classic Echo', values: { timeMs: 375, feedback: 0.35, mix: 0.3, pingPong: false, tempoSync: false, noteDivision: '1/8' } },
    { name: 'Slapback', values: { timeMs: 110, feedback: 0.18, mix: 0.22, pingPong: false, tempoSync: false, noteDivision: '1/8' } },
    { name: 'Ping-Pong Eighths', values: { timeMs: 375, feedback: 0.42, mix: 0.35, pingPong: true, tempoSync: true, noteDivision: '1/8' } }
  ],
  reverb: [
    { name: 'Studio Room', values: { roomSize: 0.55, decay: 0.45, mix: 0.25 } },
    { name: 'Tight Room', values: { roomSize: 0.25, decay: 0.2, mix: 0.18 } },
    { name: 'Long Hall', values: { roomSize: 0.85, decay: 0.75, mix: 0.35 } }
  ],
  compressor: [
    { name: 'Classic Control', values: { threshold: -24, ratio: 4, attackMs: 10, releaseMs: 250, makeupGain: 0 } },
    { name: 'Gentle Glue', values: { threshold: -18, ratio: 2, attackMs: 30, releaseMs: 250, makeupGain: 1.5 } },
    { name: 'Leveler', values: { threshold: -30, ratio: 3, attackMs: 60, releaseMs: 600, makeupGain: 3 } }
  ]
}

const NOTE_DIVISIONS = new Set<string>(['1/4', '1/8', '1/16', '1/8T', '1/16T'])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isEffectSlot(value: unknown): value is EffectSlot {
  if (!value || typeof value !== 'object') return false
  const effect = value as Record<string, unknown>
  if (typeof effect.id !== 'string' || typeof effect.bypassed !== 'boolean') return false

  if (effect.type === 'delay') {
    return isFiniteNumber(effect.timeMs) &&
      isFiniteNumber(effect.feedback) &&
      isFiniteNumber(effect.mix) &&
      typeof effect.pingPong === 'boolean' &&
      typeof effect.tempoSync === 'boolean' &&
      typeof effect.noteDivision === 'string' &&
      NOTE_DIVISIONS.has(effect.noteDivision)
  }
  if (effect.type === 'reverb') {
    return isFiniteNumber(effect.roomSize) &&
      isFiniteNumber(effect.decay) &&
      isFiniteNumber(effect.mix)
  }
  if (effect.type === 'compressor') {
    return isFiniteNumber(effect.threshold) &&
      isFiniteNumber(effect.ratio) &&
      isFiniteNumber(effect.attackMs) &&
      isFiniteNumber(effect.releaseMs) &&
      isFiniteNumber(effect.makeupGain)
  }
  return false
}

export function createDefaultEffect(type: EffectType): EffectSlot {
  const common = { id: `fx-${crypto.randomUUID()}`, bypassed: false }
  if (type === 'delay') {
    return { ...common, type, timeMs: 375, feedback: 0.35, mix: 0.3, pingPong: false, tempoSync: false, noteDivision: '1/8' }
  }
  if (type === 'reverb') {
    return { ...common, type, roomSize: 0.55, decay: 0.45, mix: 0.25 }
  }
  return { ...common, type, threshold: -24, ratio: 4, attackMs: 10, releaseMs: 250, makeupGain: 0 }
}

export function applyEffectPreset(effect: EffectSlot, presetName: string): EffectSlot {
  const preset = EFFECT_PRESETS[effect.type].find((candidate) => candidate.name === presetName)
  return preset ? { ...effect, ...preset.values } as EffectSlot : effect
}

export function effectPresetName(effect: EffectSlot): string | null {
  const ignored = new Set(['id', 'type', 'bypassed'])
  const values = effect as unknown as Record<string, unknown>
  return EFFECT_PRESETS[effect.type].find((preset) =>
    Object.entries(preset.values).every(([key, value]) => ignored.has(key) || values[key] === value)
  )?.name ?? null
}

const EFFECT_META: Record<EffectType, { name: string; glyph: string }> = {
  delay: { name: 'Delay', glyph: 'D' },
  reverb: { name: 'Reverb', glyph: 'R' },
  compressor: { name: 'Compressor', glyph: 'C' }
}

export function effectName(type: EffectType): string {
  return EFFECT_META[type].name
}

export function effectGlyph(type: EffectType): string {
  return EFFECT_META[type].glyph
}

function syncedDelaySeconds(bpm: number, division: NoteDivision): number {
  const quarter = 60 / clamp(bpm, 20, 400)
  const multiplier: Record<NoteDivision, number> = {
    '1/4': 1,
    '1/8': 0.5,
    '1/16': 0.25,
    '1/8T': 1 / 3,
    '1/16T': 1 / 6
  }
  return quarter * multiplier[division]
}

export interface EffectProcessor {
  readonly input: AudioNode
  readonly output: AudioNode
  dispose(): void
  /** Update real-time parameters without tearing down the node graph.
   *  Only supported by delay (tempo-sync time, feedback, mix) and compressor
   *  (threshold, ratio, attack, release, makeup). Reverb is not updatable
   *  in place because its impulse is baked at creation time. */
  updateParams?(effect: EffectSlot, bpm: number): void
  /** Positive gain reduction in dB for metered processors; zero otherwise. */
  getReductionDb?(): number
}

function connectDryWet(
  context: BaseAudioContext,
  input: AudioNode,
  processed: AudioNode,
  output: AudioNode,
  mix: number
): AudioNode[] {
  const dry = context.createGain()
  const wet = context.createGain()
  dry.gain.value = 1 - clamp(mix, 0, 1)
  wet.gain.value = clamp(mix, 0, 1)
  input.connect(dry)
  dry.connect(output)
  processed.connect(wet)
  wet.connect(output)
  return [dry, wet]
}

function createDelay(context: BaseAudioContext, effect: DelayEffect, bpm: number): EffectProcessor {
  const input = context.createGain()
  const output = context.createGain()
  if (effect.bypassed) {
    input.connect(output)
    return disposable(input, output, [input, output])
  }

  const seconds = clamp(effect.tempoSync ? syncedDelaySeconds(bpm, effect.noteDivision) : effect.timeMs / 1000, 0, 2)
  // A literal unity feedback loop never decays, so keep the documented 0..1
  // control range while mapping its top edge to a stable near-unity value.
  const feedbackAmount = clamp(effect.feedback, 0, 1) * 0.99
  const nodes: AudioNode[] = [input, output]

  if (!effect.pingPong) {
    const delay = context.createDelay(2)
    const feedback = context.createGain()
    delay.delayTime.value = seconds
    feedback.gain.value = feedbackAmount
    input.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    nodes.push(delay, feedback, ...connectDryWet(context, input, delay, output, effect.mix))
    return {
      input,
      output,
      dispose(): void { for (const node of new Set(nodes)) node.disconnect() },
      updateParams(effect: EffectSlot, bpm: number): void {
        if (effect.type !== 'delay') return
        const seconds = clamp(effect.tempoSync ? syncedDelaySeconds(bpm, effect.noteDivision) : effect.timeMs / 1000, 0, 2)
        delay.delayTime.value = seconds
        feedback.gain.value = clamp(effect.feedback, 0, 1) * 0.99
        const [dry, wet] = nodes.slice(-2) as GainNode[]
        if (dry && wet) {
          dry.gain.value = 1 - clamp(effect.mix, 0, 1)
          wet.gain.value = clamp(effect.mix, 0, 1)
        }
      }
    }
  }

  const leftDelay = context.createDelay(2)
  const rightDelay = context.createDelay(2)
  const leftFeedback = context.createGain()
  const rightFeedback = context.createGain()
  const leftPan = context.createStereoPanner()
  const rightPan = context.createStereoPanner()
  const wetBus = context.createGain()
  leftDelay.delayTime.value = seconds
  rightDelay.delayTime.value = seconds
  leftFeedback.gain.value = feedbackAmount
  rightFeedback.gain.value = feedbackAmount
  leftPan.pan.value = -1
  rightPan.pan.value = 1
  input.connect(leftDelay)
  leftDelay.connect(leftPan)
  leftPan.connect(wetBus)
  leftDelay.connect(leftFeedback)
  leftFeedback.connect(rightDelay)
  rightDelay.connect(rightPan)
  rightPan.connect(wetBus)
  rightDelay.connect(rightFeedback)
  rightFeedback.connect(leftDelay)
  nodes.push(leftDelay, rightDelay, leftFeedback, rightFeedback, leftPan, rightPan, wetBus,
    ...connectDryWet(context, input, wetBus, output, effect.mix))
  return {
    input,
    output,
    dispose(): void { for (const node of new Set(nodes)) node.disconnect() },
    updateParams(effect: EffectSlot, bpm: number): void {
      if (effect.type !== 'delay') return
      const seconds = clamp(effect.tempoSync ? syncedDelaySeconds(bpm, effect.noteDivision) : effect.timeMs / 1000, 0, 2)
      leftDelay.delayTime.value = seconds
      rightDelay.delayTime.value = seconds
      leftFeedback.gain.value = clamp(effect.feedback, 0, 1) * 0.99
      rightFeedback.gain.value = clamp(effect.feedback, 0, 1) * 0.99
      const [dry, wet] = nodes.slice(-2) as GainNode[]
      if (dry && wet) {
        dry.gain.value = 1 - clamp(effect.mix, 0, 1)
        wet.gain.value = clamp(effect.mix, 0, 1)
      }
    }
  }
}

function createReverb(context: BaseAudioContext, effect: ReverbEffect): EffectProcessor {
  const input = context.createGain()
  const output = context.createGain()
  if (effect.bypassed) {
    input.connect(output)
    return disposable(input, output, [input, output])
  }
  const convolver = context.createConvolver()
  convolver.channelCount = 1
  convolver.channelCountMode = 'explicit'
  const duration = 0.15 + clamp(effect.decay, 0, 1) * 3.85
  const frames = Math.max(1, Math.floor(context.sampleRate * duration))
  const impulse = context.createBuffer(2, frames, context.sampleRate)
  const room = clamp(effect.roomSize, 0, 1)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let frame = 0; frame < frames; frame++) {
      const envelope = Math.pow(1 - frame / frames, 1.5 + (1 - room) * 4)
      data[frame] = (Math.random() * 2 - 1) * envelope * (0.25 + room * 0.75)
    }
  }
  convolver.buffer = impulse
  input.connect(convolver)
  return disposable(input, output, [input, convolver, output,
    ...connectDryWet(context, input, convolver, output, effect.mix)])
}

function createCompressor(context: BaseAudioContext, effect: CompressorEffect): EffectProcessor {
  const input = context.createGain()
  const output = context.createGain()
  if (effect.bypassed) {
    input.connect(output)
    return disposable(input, output, [input, output])
  }
  const compressor = context.createDynamicsCompressor()
  const makeup = context.createGain()
  compressor.threshold.value = clamp(effect.threshold, -60, 0)
  compressor.ratio.value = clamp(effect.ratio, 1, 20)
  compressor.attack.value = clamp(effect.attackMs, 0, 200) / 1000
  compressor.release.value = clamp(effect.releaseMs, 5, 3000) / 1000
  makeup.gain.value = Math.pow(10, clamp(effect.makeupGain, 0, 24) / 20)
  input.connect(compressor)
  compressor.connect(makeup)
  makeup.connect(output)
  return {
    input,
    output,
    dispose(): void { for (const node of new Set([input, compressor, makeup, output])) node.disconnect() },
    updateParams(effect: EffectSlot): void {
      if (effect.type !== 'compressor') return
      compressor.threshold.value = clamp(effect.threshold, -60, 0)
      compressor.ratio.value = clamp(effect.ratio, 1, 20)
      compressor.attack.value = clamp(effect.attackMs, 0, 200) / 1000
      compressor.release.value = clamp(effect.releaseMs, 5, 3000) / 1000
      makeup.gain.value = Math.pow(10, clamp(effect.makeupGain, 0, 24) / 20)
    },
    getReductionDb(): number {
      return Number.isFinite(compressor.reduction) ? Math.max(0, -compressor.reduction) : 0
    }
  }
}

function disposable(input: AudioNode, output: AudioNode, nodes: AudioNode[]): EffectProcessor {
  return {
    input,
    output,
    dispose(): void {
      for (const node of new Set(nodes)) node.disconnect()
    }
  }
}

export function createEffectProcessor(context: BaseAudioContext, effect: EffectSlot, bpm: number): EffectProcessor {
  if (effect.type === 'delay') return createDelay(context, effect, bpm)
  if (effect.type === 'reverb') return createReverb(context, effect)
  return createCompressor(context, effect)
}
