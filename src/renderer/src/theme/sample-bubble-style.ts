import { SAMPLE_BUBBLE_HEIGHT_PX } from '../lib/arrangement'

const ACCENT_FALLBACK = '#2D8C6F'
const SELECT_FALLBACK = '#FFFFFF'
const RADIUS_FALLBACK = 6

export interface SampleBubbleShadow {
  x: number
  y: number
  blur: number
  color: string
}

export interface SampleBubbleBorder {
  width: number
  color: string
}

export interface SampleBubbleGloss {
  top: string
  bottom: string
}

interface SampleBubbleThemeTokens {
  accent: string
  selection: string
  borderColor: string
  bgGrid: string
  missing: string
  fontLabel: string
  fontWeight: string
  uppercase: boolean
  radius: number
  shadow: SampleBubbleShadow | null
  outline: SampleBubbleBorder | null
  textShadow: SampleBubbleShadow | null
  gloss: SampleBubbleGloss | null
  palette: string[]
}

export function parseSampleBubbleShadow(value: string): SampleBubbleShadow | null {
  const match = value.trim().match(/^(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)(?:px)?\s+(.+)$/)
  if (!match) return null
  return { x: Number(match[1]), y: Number(match[2]), blur: Number(match[3]), color: match[4] }
}

export function parseSampleBubbleBorder(value: string): SampleBubbleBorder | null {
  const match = value.trim().match(/^([\d.]+)px\s+(.+)$/)
  if (!match) return null
  const width = Number(match[1])
  return width > 0 ? { width, color: match[2] } : null
}

export function parseSampleBubbleGloss(value: string): SampleBubbleGloss | null {
  const match = value.trim().match(/^linear-gradient\(180deg,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*\)$/)
  return match ? { top: match[1], bottom: match[2] } : null
}

export function mixTowardBlack(hex: string, keep: number): string {
  const match = hex.trim().match(/^#([0-9a-fA-F]{6})$/)
  if (!match) return hex
  const channels = [0, 2, 4].map((i) =>
    Math.round(parseInt(match[1].slice(i, i + 2), 16) * keep)
  )
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export const sampleBubbleThemeTokens: SampleBubbleThemeTokens = {
  accent: ACCENT_FALLBACK,
  selection: SELECT_FALLBACK,
  borderColor: '#1A4D3E',
  bgGrid: '#1A4D3E',
  missing: '#FB8A7E',
  fontLabel: 'sans-serif',
  fontWeight: '400',
  uppercase: false,
  radius: RADIUS_FALLBACK,
  shadow: null,
  outline: null,
  textShadow: null,
  gloss: null,
  palette: []
}

const redrawListeners = new Set<() => void>()

export function onSampleBubbleThemeTokensRefreshed(listener: () => void): () => void {
  redrawListeners.add(listener)
  return () => redrawListeners.delete(listener)
}

export function refreshSampleBubbleThemeTokens(): void {
  const style = getComputedStyle(document.documentElement)
  sampleBubbleThemeTokens.accent = style.getPropertyValue('--accent').trim() || ACCENT_FALLBACK
  sampleBubbleThemeTokens.selection = style.getPropertyValue('--sample-bubble-select').trim() || SELECT_FALLBACK
  sampleBubbleThemeTokens.borderColor = style.getPropertyValue('--border').trim() || '#1A4D3E'
  sampleBubbleThemeTokens.bgGrid = style.getPropertyValue('--bg-grid').trim() || sampleBubbleThemeTokens.borderColor
  sampleBubbleThemeTokens.missing = style.getPropertyValue('--sample-bubble-missing').trim() || '#FB8A7E'
  sampleBubbleThemeTokens.fontLabel = style.getPropertyValue('--font-label').trim() || 'sans-serif'
  sampleBubbleThemeTokens.fontWeight = style.getPropertyValue('--sample-bubble-font-weight').trim() || '400'
  sampleBubbleThemeTokens.uppercase = style.getPropertyValue('--sample-bubble-case').trim() === 'uppercase'
  const radius = Number.parseFloat(style.getPropertyValue('--radius-sample-bubble'))
  sampleBubbleThemeTokens.radius = Number.isFinite(radius)
    ? Math.max(0, Math.min(radius, SAMPLE_BUBBLE_HEIGHT_PX / 2))
    : RADIUS_FALLBACK
  sampleBubbleThemeTokens.shadow = parseSampleBubbleShadow(style.getPropertyValue('--shadow-sample-bubble'))
  sampleBubbleThemeTokens.outline = parseSampleBubbleBorder(style.getPropertyValue('--border-sample-bubble'))
  sampleBubbleThemeTokens.textShadow = parseSampleBubbleShadow(style.getPropertyValue('--shadow-sample-bubble-text'))
  sampleBubbleThemeTokens.gloss = parseSampleBubbleGloss(style.getPropertyValue('--gradient-sample-bubble'))
  sampleBubbleThemeTokens.palette = Array.from({ length: 9 }, (_, slot) =>
    style.getPropertyValue(`--palette-${slot}`).trim()
  )
  redrawListeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.error('Lane canvas redraw failed after theme refresh:', error)
    }
  })
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(refreshSampleBubbleThemeTokens)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme-key', 'data-theme-ready', 'style']
  })
}
