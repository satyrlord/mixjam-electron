import { clamp } from '../lib/sample-utils'

/** The project and audio graph always expose exactly four parallel Return buses. */
export const RETURN_BUS_COUNT = 4

/** The only module records currently accepted by the fixed return buses. */
export type ReturnModule = EmptyReturnModule | DelayReturnModule

export interface EmptyReturnModule {
  readonly type: 'empty'
  /** Optional runtime identity; project files identify modules by bus slot. */
  readonly id?: string
}

export type DelayMode = 'free' | 'sync'
export type ReturnNoteDivision = '1/4' | '1/8' | '1/16' | '1/8T' | '1/16T'

export interface DelayReturnModule {
  readonly type: 'delay'
  /** Optional runtime identity; project files identify modules by bus slot. */
  readonly id?: string
  readonly mode: DelayMode
  readonly timeMs: number
  readonly noteDivision: ReturnNoteDivision
  /** Normalized percentage, 0..75. */
  readonly feedback: number
  /** Normalized percentage, 0..100. */
  readonly tapeDistortion: number
  readonly pingPong: boolean
}

export interface ReturnModuleProcessor {
  readonly input: GainNode
  readonly output: GainNode
  update(module: ReturnModule, bpm: number): void
  dispose(): void
}

const DIVISIONS: Record<ReturnNoteDivision, number> = {
  '1/4': 1,
  '1/8': 0.5,
  '1/16': 0.25,
  '1/8T': 1 / 3,
  '1/16T': 1 / 6
}

function delaySeconds(module: DelayReturnModule, bpm: number): number {
  if (module.mode === 'free') return clamp(module.timeMs, 0, 2000) / 1000
  return (60 / clamp(bpm, 20, 400)) * DIVISIONS[module.noteDivision]
}

function disconnectAll(nodes: readonly AudioNode[]): void {
  for (const node of new Set(nodes)) {
    try { node.disconnect() } catch { /* already disconnected */ }
  }
}

function tapeCurve(amount: number): Float32Array<ArrayBuffer> {
  const a = clamp(amount, 0, 100) / 100
  const curve = new Float32Array(new ArrayBuffer(2048 * Float32Array.BYTES_PER_ELEMENT))
  // At zero this is deliberately an exact identity. At 100% the drive is 5.
  const d = 1 + 4 * a
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = (1 - a) * x + a * Math.tanh(d * x) / d
  }
  return curve
}

/** Reference scalar form used by OfflineAudioContext assertions and DSP docs. */
export function applyTapeDistortion(sample: number, amount: number): number {
  const a = clamp(amount, 0, 100) / 100
  const d = 1 + 4 * a
  return (1 - a) * sample + a * Math.tanh(d * sample) / d
}

function createEmptyProcessor(context: BaseAudioContext): ReturnModuleProcessor {
  const input = context.createGain()
  const output = context.createGain()
  // Empty is an identity module at the black-box boundary. The Return host
  // gates its input, so it cannot create an accidental dry send path.
  input.connect(output)
  return {
    input,
    output,
    update(): void {},
    dispose(): void { disconnectAll([input, output]) }
  }
}

function createDelayProcessor(
  context: BaseAudioContext,
  initial: DelayReturnModule,
  bpm: number
): ReturnModuleProcessor {
  const input = context.createGain()
  const output = context.createGain()
  const splitter = context.createChannelSplitter(2)
  const merger = context.createChannelMerger(2)
  const leftDelay = context.createDelay(2)
  const rightDelay = context.createDelay(2)
  const leftFeedback = context.createGain()
  const rightFeedback = context.createGain()
  const leftShaper = context.createWaveShaper()
  const rightShaper = context.createWaveShaper()
  const nodes: AudioNode[] = [input, output, splitter, merger, leftDelay, rightDelay,
    leftFeedback, rightFeedback, leftShaper, rightShaper]

  input.connect(splitter)
  splitter.connect(leftDelay, 0)
  splitter.connect(rightDelay, 1)
  leftDelay.connect(leftShaper)
  rightDelay.connect(rightShaper)
  leftShaper.connect(merger, 0, 0)
  rightShaper.connect(merger, 0, 1)
  merger.connect(output)

  const configure = (module: DelayReturnModule, currentBpm: number): void => {
    const seconds = delaySeconds(module, currentBpm)
    leftDelay.delayTime.value = seconds
    rightDelay.delayTime.value = seconds
    // Feedback is deliberately capped to 75%, with a small extra safety
    // margin for floating point and browser implementation differences.
    const feedback = clamp(module.feedback, 0, 75) / 100 * 0.99
    leftFeedback.gain.value = feedback
    rightFeedback.gain.value = feedback
    // A WaveShaper curve only covers [-1, 1], so even an identity-shaped
    // curve clamps over-unity input. Null is the Web Audio identity path.
    const curve = module.tapeDistortion === 0 ? null : tapeCurve(module.tapeDistortion)
    leftShaper.curve = curve
    rightShaper.curve = curve
    leftShaper.oversample = '2x'
    rightShaper.oversample = '2x'
  }

  const connectFeedback = (pingPong: boolean): void => {
    // Reconnect only the two feedback edges when ping-pong changes.
    try { leftShaper.disconnect(leftFeedback) } catch { /* edge absent */ }
    try { leftShaper.disconnect(rightFeedback) } catch { /* edge absent */ }
    try { rightShaper.disconnect(leftFeedback) } catch { /* edge absent */ }
    try { rightShaper.disconnect(rightFeedback) } catch { /* edge absent */ }
    try { leftFeedback.disconnect() } catch { /* edge absent */ }
    try { rightFeedback.disconnect() } catch { /* edge absent */ }
    if (pingPong) {
      leftShaper.connect(rightFeedback)
      rightFeedback.connect(leftDelay)
      rightShaper.connect(leftFeedback)
      leftFeedback.connect(rightDelay)
    } else {
      leftShaper.connect(leftFeedback)
      leftFeedback.connect(leftDelay)
      rightShaper.connect(rightFeedback)
      rightFeedback.connect(rightDelay)
    }
  }

  connectFeedback(initial.pingPong)
  configure(initial, bpm)
  return {
    input,
    output,
    update(module: ReturnModule, currentBpm: number): void {
      if (module.type !== 'delay') return
      configure(module, currentBpm)
      connectFeedback(module.pingPong)
    },
    dispose(): void { disconnectAll(nodes) }
  }
}

export function createReturnModuleProcessor(
  context: BaseAudioContext,
  module: ReturnModule,
  bpm: number
): ReturnModuleProcessor {
  return module.type === 'delay'
    ? createDelayProcessor(context, module, bpm)
    : createEmptyProcessor(context)
}

export function createEmptyReturnModule(id = `fx-${crypto.randomUUID()}`): EmptyReturnModule {
  return { id, type: 'empty' }
}

export function createDefaultDelayReturnModule(id = `fx-${crypto.randomUUID()}`): DelayReturnModule {
  return {
    id,
    type: 'delay',
    mode: 'free',
    timeMs: 375,
    noteDivision: '1/8',
    feedback: 35,
    tapeDistortion: 0,
    pingPong: false
  }
}

export function isReturnModule(value: unknown): value is ReturnModule {
  if (!value || typeof value !== 'object') return false
  const module = value as Record<string, unknown>
  if (module.id !== undefined && (typeof module.id !== 'string' || module.id.length === 0)) return false
  if (module.type === 'empty') return Object.keys(module).every((key) => ['id', 'type'].includes(key))
  return module.type === 'delay' &&
    (module.mode === 'free' || module.mode === 'sync') &&
    typeof module.timeMs === 'number' && Number.isFinite(module.timeMs) && module.timeMs >= 0 && module.timeMs <= 2000 &&
    typeof module.noteDivision === 'string' && module.noteDivision in DIVISIONS &&
    typeof module.feedback === 'number' && Number.isFinite(module.feedback) && module.feedback >= 0 && module.feedback <= 75 &&
    typeof module.tapeDistortion === 'number' && Number.isFinite(module.tapeDistortion) && module.tapeDistortion >= 0 && module.tapeDistortion <= 100 &&
    typeof module.pingPong === 'boolean'
}

export interface SafetyLimiter {
  readonly input: GainNode
  readonly output: GainNode
  setEnabled(enabled: boolean): void
  dispose(): void
}

const SAFETY_CEILING_LINEAR = 10 ** (-1 / 20)

function createHardCeilingCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(2048 * Float32Array.BYTES_PER_ELEMENT))
  for (let i = 0; i < curve.length; i += 1) {
    const input = (i / (curve.length - 1)) * 2 - 1
    curve[i] = clamp(input, -SAFETY_CEILING_LINEAR, SAFETY_CEILING_LINEAR)
  }
  return curve
}

/** Fixed per-return limiter. Bypass is a true zero-latency direct connection. */
export function createSafetyLimiter(context: BaseAudioContext, enabled = true): SafetyLimiter {
  const input = context.createGain()
  const output = context.createGain()
  const lookahead = context.createDelay(0.05)
  const compressor = context.createDynamicsCompressor()
  const ceiling = context.createWaveShaper()
  lookahead.delayTime.value = 0.005
  // Minimal test AudioContexts may omit optional compressor AudioParams. Real
  // DynamicsCompressorNodes expose all six parameters.
  if (compressor.threshold) compressor.threshold.value = -1
  if (compressor.knee) compressor.knee.value = 0
  if (compressor.ratio) compressor.ratio.value = 20
  if (compressor.attack) compressor.attack.value = 0
  if (compressor.release) compressor.release.value = 0.1
  ceiling.curve = createHardCeilingCurve()
  ceiling.oversample = '2x'
  input.connect(lookahead)
  lookahead.connect(compressor)
  compressor.connect(ceiling)
  ceiling.connect(output)
  let isEnabled = false
  const setEnabled = (next: boolean): void => {
    if (isEnabled === next) return
    try { input.disconnect() } catch { /* edge absent */ }
    if (next) input.connect(lookahead)
    else input.connect(output)
    isEnabled = next
  }
  setEnabled(enabled)
  return {
    input,
    output,
    setEnabled,
    dispose(): void { disconnectAll([input, output, lookahead, compressor, ceiling]) }
  }
}
