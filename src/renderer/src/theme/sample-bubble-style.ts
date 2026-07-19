import { SAMPLE_BUBBLE_HEIGHT_PX } from '../lib/arrangement'
import { bubbleTextColor } from '../lib/sample-utils'

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

/** DOM adapter values for a palette slot. CSS variables keep live theme
 * switching independent from React renders. */
export function sampleBubbleDomStyle(slot: number): Record<string, string> {
  return {
    backgroundColor: `var(--palette-${slot})`,
    '--bubble-self': `var(--palette-${slot})`,
    color: `var(--palette-ink-${slot})`,
    textShadow: `var(--palette-shadow-${slot})`
  }
}

export interface SampleBubbleCanvasVisual {
  color: string
  ink: string
  label: string
  radius: number
  shadow: SampleBubbleShadow | null
  outline: SampleBubbleBorder | null
  textShadow: SampleBubbleShadow | null
  gloss: SampleBubbleGloss | null
  missing: boolean
}

export function resolveSampleBubbleCanvasVisual(
  label: string,
  slot: number | undefined,
  missing: boolean
): SampleBubbleCanvasVisual {
  const color = missing
    ? sampleBubbleThemeTokens.missing
    : slot === undefined
      ? sampleBubbleThemeTokens.accent
      : sampleBubbleThemeTokens.palette[slot] || sampleBubbleThemeTokens.accent
  return {
    color,
    ink: bubbleTextColor(color),
    label: sampleBubbleThemeTokens.uppercase ? label.toUpperCase() : label,
    radius: sampleBubbleThemeTokens.radius,
    shadow: sampleBubbleThemeTokens.shadow,
    outline: sampleBubbleThemeTokens.outline,
    textShadow: sampleBubbleThemeTokens.textShadow,
    gloss: sampleBubbleThemeTokens.gloss,
    missing
  }
}

export function roundSampleBubbleRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  if (!(width > 0) || !(height > 0)) return
  const clampedRadius = Number.isFinite(radius)
    ? Math.max(0, Math.min(radius, width / 2, height / 2))
    : 0
  ctx.moveTo(x + clampedRadius, y)
  ctx.lineTo(x + width - clampedRadius, y)
  ctx.arcTo(x + width, y, x + width, y + clampedRadius, clampedRadius)
  ctx.lineTo(x + width, y + height - clampedRadius)
  ctx.arcTo(x + width, y + height, x + width - clampedRadius, y + height, clampedRadius)
  ctx.lineTo(x + clampedRadius, y + height)
  ctx.arcTo(x, y + height, x, y + height - clampedRadius, clampedRadius)
  ctx.lineTo(x, y + clampedRadius)
  ctx.arcTo(x, y, x + clampedRadius, y, clampedRadius)
  ctx.closePath()
}

export function drawSampleBubbleCanvas(
  ctx: CanvasRenderingContext2D,
  visual: SampleBubbleCanvasVisual,
  x: number,
  y: number,
  width: number,
  flashing = false,
  devicePixelRatio = 1,
  height = SAMPLE_BUBBLE_HEIGHT_PX
): void {
  const { color, radius, shadow, outline, gloss, missing } = visual

  if (shadow) {
    ctx.save()
    ctx.shadowOffsetX = shadow.x * devicePixelRatio
    ctx.shadowOffsetY = shadow.y * devicePixelRatio
    ctx.shadowBlur = shadow.blur * devicePixelRatio
    ctx.shadowColor = shadow.color
    roundSampleBubbleRect(ctx, x, y, width, height, radius)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  }

  roundSampleBubbleRect(ctx, x, y, width, height, radius)
  ctx.fillStyle = color
  ctx.fill()

  if (missing) {
    ctx.save()
    roundSampleBubbleRect(ctx, x, y, width, height, radius)
    ctx.clip()
    ctx.strokeStyle = mixTowardBlack(color, 0.55)
    ctx.lineWidth = 5
    const step = 5 * Math.SQRT2 * 2
    for (
      let stripeX = x - height;
      stripeX < x + width + height;
      stripeX += step
    ) {
      ctx.beginPath()
      ctx.moveTo(stripeX, y)
      ctx.lineTo(stripeX + height, y + height)
      ctx.stroke()
    }
    ctx.restore()
  } else if (gloss) {
    const glossFill = ctx.createLinearGradient(0, y, 0, y + height)
    glossFill.addColorStop(0, gloss.top)
    glossFill.addColorStop(1, gloss.bottom)
    roundSampleBubbleRect(ctx, x, y, width, height, radius)
    ctx.fillStyle = glossFill
    ctx.fill()
  }

  if (flashing) {
    roundSampleBubbleRect(ctx, x, y, width, height, radius)
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.globalAlpha = 1
  }

  if (outline) {
    const inset = outline.width / 2
    roundSampleBubbleRect(
      ctx,
      x + inset,
      y + inset,
      width - outline.width,
      height - outline.width,
      Math.max(0, radius - inset)
    )
    ctx.strokeStyle = outline.color
    ctx.lineWidth = outline.width
  } else {
    roundSampleBubbleRect(ctx, x, y, width, height, radius)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
  }
  ctx.stroke()

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 8, y, Math.max(0, width - 16), height)
  ctx.clip()
  if (visual.textShadow && visual.ink === '#FFFFFF') {
    ctx.shadowOffsetX = visual.textShadow.x * devicePixelRatio
    ctx.shadowOffsetY = visual.textShadow.y * devicePixelRatio
    ctx.shadowBlur = visual.textShadow.blur * devicePixelRatio
    ctx.shadowColor = visual.textShadow.color
  }
  ctx.fillStyle = visual.ink
  ctx.fillText(visual.label, x + 8, y + height / 2)
  ctx.restore()
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
  const configuredBubbleHeight = Number.parseFloat(style.getPropertyValue('--ui-bubble-height'))
  const bubbleHeight = configuredBubbleHeight > 0 ? configuredBubbleHeight : SAMPLE_BUBBLE_HEIGHT_PX
  sampleBubbleThemeTokens.radius = Number.isFinite(radius)
    ? Math.max(0, Math.min(radius, bubbleHeight / 2))
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
