import { describe, expect, it } from 'vitest'
import { createMockContext } from '../test/mockAudioContext'
import {
  applyAetherformReverbPreset,
  AETHERFORM_REVERB_PRESET_NAMES,
  createDefaultAetherformReverbReturnModule,
  createDefaultEchoformDelayReturnModule,
  createEmptyReturnModule,
  createReturnModuleProcessor,
  createSafetyLimiter,
  isReturnModule
} from './return-effects'

describe('return FX module contracts', () => {
  it('creates the documented Empty and Echoform (Wide Tape Echo) defaults', () => {
    expect(createEmptyReturnModule('fx-1')).toEqual({ id: 'fx-1', type: 'empty' })
    expect(createDefaultEchoformDelayReturnModule('fx-2')).toMatchObject({
      id: 'fx-2',
      type: 'echoform-delay',
      mode: 'sync',
      divisionL: '1/4',
      divisionR: '1/8.',
      timeMsL: 420,
      timeMsR: 610,
      feedback: 68,
      pingPong: true,
      width: 142,
      lowCut: 160,
      highCut: 7800,
      modRate: 0.38,
      modDepth: 5.4,
      character: 'tape',
      duckAmount: 34,
      duckRelease: 620,
      outputDb: -1.5,
      freeze: false,
      bypass: false
    })
  })

  it('accepts only the closed module union', () => {
    const delay = createDefaultEchoformDelayReturnModule('fx-1')
    expect(isReturnModule(createEmptyReturnModule('fx-0'))).toBe(true)
    expect(isReturnModule(delay)).toBe(true)
    // Feedback may reach 110 (over-unity), but not beyond.
    expect(isReturnModule({ ...delay, feedback: 110 })).toBe(true)
    expect(isReturnModule({ ...delay, feedback: 111 })).toBe(false)
    // Width spans 0..200.
    expect(isReturnModule({ ...delay, width: 200 })).toBe(true)
    expect(isReturnModule({ ...delay, width: 201 })).toBe(false)
  })

  it('rejects malformed module identities and out-of-range values', () => {
    const delay = createDefaultEchoformDelayReturnModule('fx-1')
    expect(isReturnModule(null)).toBe(false)
    expect(isReturnModule({ id: '', type: 'empty' })).toBe(false)
    expect(isReturnModule({ type: 'empty', extra: true })).toBe(false)
    expect(isReturnModule({ ...delay, mode: 'other' })).toBe(false)
    expect(isReturnModule({ ...delay, timeMsL: Number.NaN })).toBe(false)
    expect(isReturnModule({ ...delay, divisionL: '1/3' })).toBe(false)
    expect(isReturnModule({ ...delay, highCut: 500 })).toBe(false)
    expect(isReturnModule({ ...delay, modDepth: 21 })).toBe(false)
    expect(isReturnModule({ ...delay, duckRelease: 40 })).toBe(false)
    expect(isReturnModule({ ...delay, pingPong: 'yes' })).toBe(false)
    // The removed native-delay fields are no longer accepted.
    expect(isReturnModule({ ...delay, tapeDistortion: 0 })).toBe(false)
    expect(isReturnModule({ ...delay, mix: 82 })).toBe(false)
    expect(isReturnModule({ ...delay, link: true })).toBe(false)
  })

  it('builds, updates, and disposes empty and echoform processors', () => {
    const context = createMockContext()
    const ctx = context as unknown as BaseAudioContext

    const empty = createReturnModuleProcessor(ctx, createEmptyReturnModule('fx-1'), 120)
    empty.update(createDefaultEchoformDelayReturnModule('fx-1'), 120)
    empty.dispose()

    // Without a registered worklet the echoform processor uses an identity
    // fallback; it must still expose input/output and survive update/dispose.
    const delay = createReturnModuleProcessor(ctx, createDefaultEchoformDelayReturnModule('fx-2'), 120)
    expect(delay.input).toBeDefined()
    expect(delay.output).toBeDefined()
    delay.update(createEmptyReturnModule('fx-2'), 120)
    delay.update({ ...createDefaultEchoformDelayReturnModule('fx-2'), mode: 'free', pingPong: false }, 60)
    delay.dispose()
  })

  it('creates the documented Aetherform (Warm Chamber) default', () => {
    expect(createDefaultAetherformReverbReturnModule('fx-3')).toMatchObject({
      id: 'fx-3',
      type: 'aetherform-reverb',
      spaceModel: 'chamber',
      preDelayMs: 24,
      decaySeconds: 2.8,
      sizePercent: 68,
      character: 'vintage',
      widthPercent: 148,
      lateBalancePercent: 72,
      lowCutHz: 180,
      highCutHz: 8600,
      diffusionPercent: 78,
      densityPercent: 84,
      earlyReflectionsEnabled: true,
      modRateHz: 0.32,
      modDepthPercent: 18,
      shimmerEnabled: false,
      shimmerAmountPercent: 24,
      shimmerIntervalSemitones: 12,
      duckAmountPercent: 28,
      duckReleaseMs: 720,
      outputDb: -1.5,
      freeze: false,
      bypass: false
    })
  })

  it('validates the Aetherform module ranges and enums', () => {
    const reverb = createDefaultAetherformReverbReturnModule('fx-1')
    expect(isReturnModule(reverb)).toBe(true)
    expect(isReturnModule({ ...reverb, spaceModel: 'cathedral' })).toBe(false)
    expect(isReturnModule({ ...reverb, character: 'digital' })).toBe(false)
    expect(isReturnModule({ ...reverb, preDelayMs: 251 })).toBe(false)
    expect(isReturnModule({ ...reverb, decaySeconds: 0.1 })).toBe(false)
    expect(isReturnModule({ ...reverb, decaySeconds: 30 })).toBe(true)
    expect(isReturnModule({ ...reverb, sizePercent: 4 })).toBe(false)
    expect(isReturnModule({ ...reverb, widthPercent: 201 })).toBe(false)
    expect(isReturnModule({ ...reverb, shimmerIntervalSemitones: 5 })).toBe(false)
    expect(isReturnModule({ ...reverb, shimmerIntervalSemitones: 24 })).toBe(true)
    expect(isReturnModule({ ...reverb, modRateHz: 3.5 })).toBe(false)
    expect(isReturnModule({ ...reverb, duckReleaseMs: 40 })).toBe(false)
    expect(isReturnModule({ ...reverb, freeze: 'yes' })).toBe(false)
    // Mix is the FX-return level, never a module field.
    expect(isReturnModule({ ...reverb, mix: 88 })).toBe(false)
    // Clear Tail is a momentary command, never serialized state.
    expect(isReturnModule({ ...reverb, clearTail: true })).toBe(false)
  })

  it('defines all seven Aetherform presets as complete valid modules', () => {
    const base = createDefaultAetherformReverbReturnModule('fx-1')
    expect(AETHERFORM_REVERB_PRESET_NAMES).toHaveLength(7)
    for (const name of AETHERFORM_REVERB_PRESET_NAMES) {
      const preset = applyAetherformReverbPreset(base, name)
      expect(isReturnModule(preset)).toBe(true)
      expect(preset.id).toBe('fx-1')
      expect(preset.bypass).toBe(false)
    }
    expect(applyAetherformReverbPreset(base, 'Warm Chamber')).toEqual(base)
    const frozen = applyAetherformReverbPreset(base, 'Frozen Cathedral')
    expect(frozen).toMatchObject({
      spaceModel: 'hall',
      character: 'bloom',
      decaySeconds: 18,
      shimmerEnabled: true,
      shimmerIntervalSemitones: 19,
      earlyReflectionsEnabled: false,
      freeze: true
    })
    const smallRoom = applyAetherformReverbPreset(base, 'Small Room')
    expect(smallRoom).toMatchObject({ spaceModel: 'room', character: 'natural', decaySeconds: 0.7 })
  })

  it('builds, updates, and disposes the aetherform processor fallback', () => {
    const context = createMockContext()
    const ctx = context as unknown as BaseAudioContext
    // Without a registered worklet the reverb processor uses an identity
    // fallback; it must still expose input/output and survive update/dispose.
    const reverb = createReturnModuleProcessor(ctx, createDefaultAetherformReverbReturnModule('fx-3'), 120)
    expect(reverb.input).toBeDefined()
    expect(reverb.output).toBeDefined()
    reverb.update(createEmptyReturnModule('fx-3'), 120)
    reverb.update({ ...createDefaultAetherformReverbReturnModule('fx-3'), freeze: true }, 120)
    expect(() => reverb.clearTail?.()).not.toThrow()
    reverb.dispose()
  })

  it('toggles and disposes the fixed safety limiter', () => {
    const context = createMockContext()
    const limiter = createSafetyLimiter(context as unknown as BaseAudioContext, false)
    limiter.setEnabled(false)
    limiter.setEnabled(true)
    limiter.setEnabled(false)
    limiter.dispose()
    expect(context.created.compressors).toHaveLength(1)
  })
})
