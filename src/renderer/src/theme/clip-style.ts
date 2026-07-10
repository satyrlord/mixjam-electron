import { SAMPLE_BUBBLE_HEIGHT_PX } from '../lib/playerShell'

const ACCENT_FALLBACK = '#2D8C6F'
const SELECT_FALLBACK = '#FFFFFF'
const RADIUS_FALLBACK = 6

export interface ClipShadow {
  x: number
  y: number
  blur: number
  color: string
}

export interface ClipBorder {
  width: number
  color: string
}

export interface ClipGloss {
  top: string
  bottom: string
}

interface ClipThemeTokens {
  accent: string
  clipSelect: string
  border: string
  bgGrid: string
  clipMissing: string
  fontLabel: string
  clipFontWeight: string
  clipUppercase: boolean
  radiusClip: number
  shadowClip: ClipShadow | null
  borderClip: ClipBorder | null
  shadowClipText: ClipShadow | null
  clipGloss: ClipGloss | null
  palette: string[]
}

export function parseClipShadow(value: string): ClipShadow | null {
  const match = value.trim().match(/^(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)(?:px)?\s+(.+)$/)
  if (!match) return null
  return { x: Number(match[1]), y: Number(match[2]), blur: Number(match[3]), color: match[4] }
}

export function parseClipBorder(value: string): ClipBorder | null {
  const match = value.trim().match(/^([\d.]+)px\s+(.+)$/)
  if (!match) return null
  const width = Number(match[1])
  return width > 0 ? { width, color: match[2] } : null
}

export function parseClipGloss(value: string): ClipGloss | null {
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

export const clipThemeTokens: ClipThemeTokens = {
  accent: ACCENT_FALLBACK,
  clipSelect: SELECT_FALLBACK,
  border: '#1A4D3E',
  bgGrid: '#1A4D3E',
  clipMissing: '#FB8A7E',
  fontLabel: 'sans-serif',
  clipFontWeight: '400',
  clipUppercase: false,
  radiusClip: RADIUS_FALLBACK,
  shadowClip: null,
  borderClip: null,
  shadowClipText: null,
  clipGloss: null,
  palette: []
}

const redrawListeners = new Set<() => void>()

export function onClipThemeTokensRefreshed(listener: () => void): () => void {
  redrawListeners.add(listener)
  return () => redrawListeners.delete(listener)
}

export function refreshClipThemeTokens(): void {
  const style = getComputedStyle(document.documentElement)
  clipThemeTokens.accent = style.getPropertyValue('--accent').trim() || ACCENT_FALLBACK
  clipThemeTokens.clipSelect = style.getPropertyValue('--clip-select').trim() || SELECT_FALLBACK
  clipThemeTokens.border = style.getPropertyValue('--border').trim() || '#1A4D3E'
  clipThemeTokens.bgGrid = style.getPropertyValue('--bg-grid').trim() || clipThemeTokens.border
  clipThemeTokens.clipMissing = style.getPropertyValue('--clip-missing').trim() || '#FB8A7E'
  clipThemeTokens.fontLabel = style.getPropertyValue('--font-label').trim() || 'sans-serif'
  clipThemeTokens.clipFontWeight = style.getPropertyValue('--clip-font-weight').trim() || '400'
  clipThemeTokens.clipUppercase = style.getPropertyValue('--clip-case').trim() === 'uppercase'
  const radius = Number.parseFloat(style.getPropertyValue('--radius-clip'))
  clipThemeTokens.radiusClip = Number.isFinite(radius)
    ? Math.max(0, Math.min(radius, SAMPLE_BUBBLE_HEIGHT_PX / 2))
    : RADIUS_FALLBACK
  clipThemeTokens.shadowClip = parseClipShadow(style.getPropertyValue('--shadow-clip'))
  clipThemeTokens.borderClip = parseClipBorder(style.getPropertyValue('--border-clip'))
  clipThemeTokens.shadowClipText = parseClipShadow(style.getPropertyValue('--shadow-clip-text'))
  clipThemeTokens.clipGloss = parseClipGloss(style.getPropertyValue('--gradient-clip'))
  clipThemeTokens.palette = Array.from({ length: 9 }, (_, slot) =>
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
  const observer = new MutationObserver(refreshClipThemeTokens)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme-key', 'data-theme-ready', 'style']
  })
}
