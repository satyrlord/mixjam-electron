import { describe, expect, it } from 'vitest'
import {
  createDefaultAetherformReverbReturnModule,
  createDefaultEchoformDelayReturnModule,
  createEmptyReturnModule
} from '../engine/return-effects'
import {
  openReturnEffectEditor,
  returnEffectSummary
} from './return-effect-editor-registry'

describe('return effect editor registry', () => {
  it('opens registered effect editors without exposing per-effect branches to the slot', () => {
    const delay = createDefaultEchoformDelayReturnModule('fx-1')
    const reverb = createDefaultAetherformReverbReturnModule('fx-2')

    expect(openReturnEffectEditor(delay, false)).toEqual({ module: delay, powered: false })
    expect(openReturnEffectEditor(reverb, true)).toEqual({ module: reverb, powered: true })
    expect(openReturnEffectEditor(createEmptyReturnModule('fx-3'), true)).toBeNull()
  })

  it('owns effect summaries beside editor registration', () => {
    expect(returnEffectSummary(createDefaultEchoformDelayReturnModule('fx-1'), 0.82))
      .toContain('Feedback 68%')
    expect(returnEffectSummary(createDefaultAetherformReverbReturnModule('fx-2'), 0.88))
      .toContain('chamber · 2.8 s')
    expect(returnEffectSummary(createEmptyReturnModule('fx-3'), 1)).toBe('No effect assigned')
  })
})
