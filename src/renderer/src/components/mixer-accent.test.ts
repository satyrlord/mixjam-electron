import { describe, expect, it } from 'vitest'
import { slotAccentStyle } from './mixer-accent'

describe('slotAccentStyle', () => {
  it('uses the requested slot and falls back to slot one outside the supported range', () => {
    expect(slotAccentStyle(3)).toEqual({
      '--fx-slot-accent': 'var(--fx-accent-3, var(--accent))'
    })
    expect(slotAccentStyle(0)).toEqual({
      '--fx-slot-accent': 'var(--fx-accent-1, var(--accent))'
    })
  })
})
