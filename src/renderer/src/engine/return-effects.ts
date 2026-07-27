import { clamp } from '../lib/sample-utils'
import { getReturnEffect, registerReturnEffect } from './return-effect-registry'
import {
  echoformDelayDescriptor,
  type EchoformDelayModule
} from './return-effects/echoform-delay'
import {
  aetherformReverbDescriptor,
  type AetherformReverbModule
} from './return-effects/aetherform-reverb'

export type {
  EchoformDelayModule,
  EchoformDelayPresetName
} from './return-effects/echoform-delay'
export {
  applyEchoformDelayPreset,
  createDefaultEchoformDelayReturnModule,
  ECHOFORM_DELAY_PRESET_NAMES
} from './return-effects/echoform-delay'
export type {
  AetherformReverbModule,
  AetherformReverbPresetName
} from './return-effects/aetherform-reverb'
export {
  AETHERFORM_REVERB_PRESET_NAMES,
  applyAetherformReverbPreset,
  createDefaultAetherformReverbReturnModule
} from './return-effects/aetherform-reverb'
export { getReturnEffect, returnEffectDescriptors } from './return-effect-registry'

/** The project and audio graph always expose exactly four parallel Return buses. */
export const RETURN_BUS_COUNT = 4

/** A module is either the host-owned Empty slot or one registered effect. */
export type ReturnModule = EmptyReturnModule | EchoformDelayModule | AetherformReverbModule

export interface EmptyReturnModule {
  readonly type: 'empty'
  /** Optional runtime identity; project files identify modules by bus slot. */
  readonly id?: string
}

export interface ReturnModuleProcessor {
  readonly input: GainNode
  readonly output: GainNode
  update(module: ReturnModule, bpm: number): void
  /** Momentary command: flush all internal audio history (Aetherform Clear Tail). */
  clearTail?(): void
  dispose(): void
}

function disconnectAll(nodes: readonly AudioNode[]): void {
  for (const node of new Set(nodes)) {
    try { node.disconnect() } catch { /* already disconnected */ }
  }
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

export function createReturnModuleProcessor(
  context: BaseAudioContext,
  module: ReturnModule,
  bpm: number
): ReturnModuleProcessor {
  const descriptor = getReturnEffect(module.type)
  if (descriptor) return descriptor.createProcessor(context, module, bpm)
  return createEmptyProcessor(context)
}

export function createEmptyReturnModule(id = `fx-${crypto.randomUUID()}`): EmptyReturnModule {
  return { id, type: 'empty' }
}

const EMPTY_KEYS = ['id', 'type'] as const

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

export function isReturnModule(value: unknown): value is ReturnModule {
  if (!value || typeof value !== 'object') return false
  const module = value as Record<string, unknown>
  if (module.id !== undefined && (typeof module.id !== 'string' || module.id.length === 0)) return false
  if (module.type === 'empty') return hasOnlyKeys(module, EMPTY_KEYS)
  const descriptor = getReturnEffect(module.type as string)
  return descriptor ? descriptor.validate(module) : false
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

registerReturnEffect(echoformDelayDescriptor)
registerReturnEffect(aetherformReverbDescriptor)
