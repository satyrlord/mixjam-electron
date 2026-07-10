import { describe, expect, it } from 'vitest'
import {
  sampleBubbleThemeTokens,
  mixTowardBlack,
  parseSampleBubbleBorder,
  parseSampleBubbleGloss,
  parseSampleBubbleShadow,
  refreshSampleBubbleThemeTokens
} from './sample-bubble-style'

describe('sample bubble style tokens', () => {
  it('parses the canvas-safe shadow and border formats', () => {
    expect(parseSampleBubbleShadow('1px -2px 0 #000')).toEqual({ x: 1, y: -2, blur: 0, color: '#000' })
    expect(parseSampleBubbleBorder('2px #112233')).toEqual({ width: 2, color: '#112233' })
    expect(parseSampleBubbleBorder('0px #112233')).toBeNull()
  })

  it('accepts only two-token sample bubble gloss gradients', () => {
    expect(parseSampleBubbleGloss('linear-gradient(180deg, #FFFFFF88, #00000000)')).toEqual({
      top: '#FFFFFF88',
      bottom: '#00000000'
    })
    expect(parseSampleBubbleGloss('linear-gradient(180deg, rgba(0,0,0,.2), transparent)')).toBeNull()
  })

  it('darkens six-digit hex colors without corrupting other CSS colors', () => {
    expect(mixTowardBlack('#808080', 0.5)).toBe('#404040')
    expect(mixTowardBlack('var(--sample-bubble-missing)', 0.5)).toBe('var(--sample-bubble-missing)')
  })

  it('restores stable fallbacks when optional CSS tokens are absent', () => {
    const root = document.documentElement
    const properties = [
      '--accent', '--sample-bubble-select', '--border', '--bg-grid', '--sample-bubble-missing',
      '--font-label', '--sample-bubble-font-weight', '--radius-sample-bubble'
    ]
    properties.forEach((property) => root.style.removeProperty(property))

    refreshSampleBubbleThemeTokens()

    expect(sampleBubbleThemeTokens).toMatchObject({
      accent: '#2D8C6F',
      selection: '#FFFFFF',
      borderColor: '#1A4D3E',
      bgGrid: '#1A4D3E',
      missing: '#FB8A7E',
      fontLabel: 'sans-serif',
      fontWeight: '400',
      radius: 6
    })
  })
})
