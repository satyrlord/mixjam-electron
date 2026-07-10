import { describe, expect, it } from 'vitest'
import {
  clipThemeTokens,
  mixTowardBlack,
  parseClipBorder,
  parseClipGloss,
  parseClipShadow,
  refreshClipThemeTokens
} from './clip-style'

describe('clip style tokens', () => {
  it('parses the canvas-safe shadow and border formats', () => {
    expect(parseClipShadow('1px -2px 0 #000')).toEqual({ x: 1, y: -2, blur: 0, color: '#000' })
    expect(parseClipBorder('2px #112233')).toEqual({ width: 2, color: '#112233' })
    expect(parseClipBorder('0px #112233')).toBeNull()
  })

  it('accepts only two-token clip gloss gradients', () => {
    expect(parseClipGloss('linear-gradient(180deg, #FFFFFF88, #00000000)')).toEqual({
      top: '#FFFFFF88',
      bottom: '#00000000'
    })
    expect(parseClipGloss('linear-gradient(180deg, rgba(0,0,0,.2), transparent)')).toBeNull()
  })

  it('darkens six-digit hex colors without corrupting other CSS colors', () => {
    expect(mixTowardBlack('#808080', 0.5)).toBe('#404040')
    expect(mixTowardBlack('var(--clip-missing)', 0.5)).toBe('var(--clip-missing)')
  })

  it('restores stable fallbacks when optional CSS tokens are absent', () => {
    const root = document.documentElement
    const properties = [
      '--accent', '--clip-select', '--border', '--bg-grid', '--clip-missing',
      '--font-label', '--clip-font-weight', '--radius-clip'
    ]
    properties.forEach((property) => root.style.removeProperty(property))

    refreshClipThemeTokens()

    expect(clipThemeTokens).toMatchObject({
      accent: '#2D8C6F',
      clipSelect: '#FFFFFF',
      border: '#1A4D3E',
      bgGrid: '#1A4D3E',
      clipMissing: '#FB8A7E',
      fontLabel: 'sans-serif',
      clipFontWeight: '400',
      radiusClip: 6
    })
  })
})
