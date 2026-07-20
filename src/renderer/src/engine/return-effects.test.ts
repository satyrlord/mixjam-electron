import { describe, expect, it } from 'vitest'
import { createMockContext } from '../test/mockAudioContext'
import {
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
