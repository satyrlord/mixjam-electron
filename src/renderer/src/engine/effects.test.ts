import { describe, expect, it } from 'vitest'
import { EFFECT_PRESETS, applyEffectPreset, createDefaultEffect, effectPresetName } from './effects'

describe('effect presets', () => {
  it('keeps factory defaults aligned with the first named preset', () => {
    for (const type of ['delay', 'reverb', 'compressor'] as const) {
      expect(effectPresetName(createDefaultEffect(type))).toBe(EFFECT_PRESETS[type][0]!.name)
    }
  })

  it('applies presets without changing identity or bypass state and detects custom edits', () => {
    const delay = { ...createDefaultEffect('delay'), bypassed: true }
    const slapback = applyEffectPreset(delay, 'Slapback')
    if (slapback.type !== 'delay') throw new Error('Expected a delay preset')
    expect(slapback).toMatchObject({ id: delay.id, bypassed: true, timeMs: 110, feedback: 0.18 })
    expect(effectPresetName(slapback)).toBe('Slapback')
    expect(effectPresetName({ ...slapback, mix: 0.23 })).toBeNull()
  })
})
