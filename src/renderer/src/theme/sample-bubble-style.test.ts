import { describe, expect, it, vi } from 'vitest'
import {
  sampleBubbleThemeTokens,
  mixTowardBlack,
  parseSampleBubbleBorder,
  parseSampleBubbleGloss,
  parseSampleBubbleShadow,
  roundSampleBubbleRect,
  resolveSampleBubbleCanvasVisual,
  sampleBubbleDomStyle,
  refreshSampleBubbleThemeTokens
} from './sample-bubble-style'

describe('sample bubble style tokens', () => {
  it('clamps canvas corner radii to the rectangle dimensions', () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn()
    } as unknown as CanvasRenderingContext2D

    roundSampleBubbleRect(ctx, 10, 4, 12, 26, 12)

    expect(ctx.moveTo).toHaveBeenCalledWith(16, 4)
    expect(ctx.lineTo).toHaveBeenCalledWith(16, 4)
    expect(ctx.arcTo).toHaveBeenCalledWith(22, 4, 22, 10, 6)
  })

  it('leaves an empty path for non-positive dimensions', () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn()
    } as unknown as CanvasRenderingContext2D

    roundSampleBubbleRect(ctx, 0, 0, 0, 26, 12)
    roundSampleBubbleRect(ctx, 0, 0, 12, -1, 12)

    expect(ctx.beginPath).toHaveBeenCalledTimes(2)
    expect(ctx.moveTo).not.toHaveBeenCalled()
    expect(ctx.arcTo).not.toHaveBeenCalled()
  })

  it('owns DOM palette-slot styles', () => {
    expect(sampleBubbleDomStyle(3)).toEqual({
      backgroundColor: 'var(--palette-3)',
      '--bubble-self': 'var(--palette-3)',
      color: 'var(--palette-ink-3)',
      textShadow: 'var(--palette-shadow-3)'
    })
    expect(sampleBubbleDomStyle(8).backgroundColor).toBe('var(--palette-8)')
  })

  it('resolves one canvas visual model for placements and drag ghosts', () => {
    sampleBubbleThemeTokens.accent = '#123456'
    sampleBubbleThemeTokens.missing = '#FF0000'
    sampleBubbleThemeTokens.palette = ['#ABCDEF']
    sampleBubbleThemeTokens.uppercase = true

    expect(resolveSampleBubbleCanvasVisual('kick.wav', 0, false)).toMatchObject({
      color: '#ABCDEF',
      label: 'KICK.WAV'
    })
    expect(resolveSampleBubbleCanvasVisual('missing.wav', undefined, true)).toMatchObject({
      color: '#FF0000',
      label: 'MISSING.WAV',
      missing: true
    })
  })
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
