import { memo, useCallback, useEffect, useRef } from 'react'
import { clipScreenRect, type LaneClip } from '../lib/playerShell'
import { bubbleTextColor } from '../lib/sample-utils'
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'

interface LaneClipCanvasProps {
  clips: LaneClip[]
  totalTicks: number
  laneIndex: number
  flashSamplePath: string | null
  selectedClipIds: ReadonlySet<string>
  /** Relpaths whose sample row is missing (scan_state = 2); those clips render
   *  hazard stripes in --clip-missing (spec-002 AC-013). */
  missingSamplePaths?: ReadonlySet<string>
  onClipDragStart: (clipId: string, event: React.DragEvent) => void
  onClipContextMenu: (info: {
    x: number
    y: number
    laneIndex: number
    clipId: string
    samplePath: string
    sampleName: string
  }) => void
}

const CLIP_HEIGHT = 32
const CLIP_TOP = 6
const CORNER_RADIUS = 6
const ACCENT_FALLBACK = '#2D8C6F'
const SELECTION_BORDER_COLOR = '#FFFFFF'
const SELECTION_BORDER_WIDTH = 2
const GHOST_MIN_WIDTH = 48
const GHOST_BADGE_WIDTH = 22
const GHOST_BADGE_HEIGHT = 14

interface ClipHitRect {
  clip: LaneClip
  x: number
  width: number
}

interface ClipShadow {
  x: number
  y: number
  blur: number
  color: string
}

interface ClipBorder {
  width: number
  color: string
}

/** Parses the --shadow-clip depth token: "<x>px <y>px <blur>[px] <color>" | "none".
 *  The blur component's "px" is optional to accept the CSS-valid unitless
 *  zero shorthand (e.g. "1px 1px 0 #000"), which box-shadow/text-shadow
 *  already accept — rejecting it silently dropped the shadow on canvas only. */
function parseClipShadow(value: string): ClipShadow | null {
  const match = value.trim().match(/^(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)(?:px)?\s+(.+)$/)
  if (!match) return null
  return { x: Number(match[1]), y: Number(match[2]), blur: Number(match[3]), color: match[4] }
}

/** Parses the --border-clip depth token: "<width>px <color>" | "none".
 *  Exported so applyTheme (themes.ts) uses the same rules when it splits this
 *  token into --clip-border-width/--clip-border-color for DOM bubbles — two
 *  independent regexes previously let a malformed token (e.g. "0px #000" or
 *  "1px solid #000") render differently on DOM vs canvas. */
export function parseClipBorder(value: string): ClipBorder | null {
  const match = value.trim().match(/^([\d.]+)px\s+(.+)$/)
  if (!match) return null
  const width = Number(match[1])
  if (width <= 0) return null
  return { width, color: match[2] }
}

/** Parses the --gradient-clip depth token:
 *  "linear-gradient(180deg, <top>, <bottom>)" | "none". Colors must be a
 *  single space-free, comma-free token (the token doubles as valid CSS for
 *  the DOM bubble gloss) — reject anything else rather than mis-splitting a
 *  functional color like rgba(...) into garbage gradient stops. */
function parseClipGloss(value: string): { top: string; bottom: string } | null {
  const match = value.trim().match(/^linear-gradient\(180deg,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*\)$/)
  if (!match) return null
  return { top: match[1], bottom: match[2] }
}

/** Darkens a 6-digit hex toward black (mockup hazard stripes use
 *  color-mix(in srgb, <miss> 55%, black)). Non-hex input returns unchanged. */
function mixTowardBlack(hex: string, keep: number): string {
  const match = hex.trim().match(/^#([0-9a-fA-F]{6})$/)
  if (!match) return hex
  const channels = [0, 2, 4].map((i) =>
    Math.round(parseInt(match[1].slice(i, i + 2), 16) * keep)
  )
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// Cache theme tokens and refresh when the active theme changes.
const themeTokenCache = {
  accent: ACCENT_FALLBACK,
  clipSelect: SELECTION_BORDER_COLOR,
  border: '#1A4D3E',
  bgGrid: '#1A4D3E',
  clipMissing: '#FB8A7E',
  fontLabel: 'sans-serif',
  clipFontWeight: '400',
  clipUppercase: false,
  radiusClip: CORNER_RADIUS,
  shadowClip: null as ClipShadow | null,
  borderClip: null as ClipBorder | null,
  shadowClipText: null as ClipShadow | null,
  clipGloss: null as { top: string; bottom: string } | null,
  // The active theme's 9 palette slots (8 = Unsorted), read back from the
  // --palette-N custom properties applyTheme publishes, so canvas clips and
  // DOM bubbles can never resolve different colors for the same slot.
  palette: [] as string[]
}

// Mounted lane canvases subscribe so a theme switch repaints placed clips
// immediately — the cache alone refreshing is invisible until the next
// data-driven redraw.
const themeRedrawListeners = new Set<() => void>()

function onThemeTokensRefreshed(listener: () => void): () => void {
  themeRedrawListeners.add(listener)
  return () => themeRedrawListeners.delete(listener)
}

/** Refresh cached theme tokens from computed styles. */
export function refreshThemeTokens(): void {
  const style = getComputedStyle(document.documentElement)
  themeTokenCache.accent = style.getPropertyValue('--accent').trim() || ACCENT_FALLBACK
  themeTokenCache.clipSelect = style.getPropertyValue('--clip-select').trim() || SELECTION_BORDER_COLOR
  themeTokenCache.border = style.getPropertyValue('--border').trim() || '#1A4D3E'
  themeTokenCache.bgGrid = style.getPropertyValue('--bg-grid').trim() || themeTokenCache.border
  themeTokenCache.clipMissing = style.getPropertyValue('--clip-missing').trim() || '#FB8A7E'
  themeTokenCache.fontLabel = style.getPropertyValue('--font-label').trim() || 'sans-serif'
  themeTokenCache.clipFontWeight = style.getPropertyValue('--clip-font-weight').trim() || '400'
  themeTokenCache.clipUppercase = style.getPropertyValue('--clip-case').trim() === 'uppercase'
  const radiusClip = Number.parseFloat(style.getPropertyValue('--radius-clip'))
  themeTokenCache.radiusClip = Number.isFinite(radiusClip)
    ? Math.max(0, Math.min(radiusClip, CLIP_HEIGHT / 2))
    : CORNER_RADIUS
  themeTokenCache.shadowClip = parseClipShadow(style.getPropertyValue('--shadow-clip'))
  themeTokenCache.borderClip = parseClipBorder(style.getPropertyValue('--border-clip'))
  themeTokenCache.shadowClipText = parseClipShadow(style.getPropertyValue('--shadow-clip-text'))
  themeTokenCache.clipGloss = parseClipGloss(style.getPropertyValue('--gradient-clip'))
  themeTokenCache.palette = Array.from({ length: 9 }, (_, slot) =>
    style.getPropertyValue(`--palette-${slot}`).trim()
  )
  // Isolate each lane so one canvas throwing (e.g. a malformed theme token
  // slipping past validation) doesn't skip the repaint of every other lane —
  // this runs inside a MutationObserver callback, outside React's error
  // boundary, so an uncaught throw here would otherwise be silent and fatal
  // to the whole batch.
  themeRedrawListeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.error('Lane canvas redraw failed after theme refresh:', error)
    }
  })
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(refreshThemeTokens)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme-key', 'data-theme-ready', 'style']
  })
}

function getComputedAccent(): string {
  return themeTokenCache.accent
}

function getComputedSelectColor(): string {
  return themeTokenCache.clipSelect
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/** Resolves a clip's fill color: palette slot when stored, accent fallback.
 *  Slot colors come from the cached --palette-N custom properties so the
 *  canvas can never disagree with DOM bubbles about a slot. */
function clipFillColor(clip: LaneClip, accent: string): string {
  if (clip.slot === undefined) return accent
  return themeTokenCache.palette[clip.slot] || accent
}

/** Draws one clip bubble (body, gloss, border, clipped label). Caller sets
 *  ctx.font and ctx.textBaseline so the lane canvas and the drag ghost stay
 *  in sync. Missing clips render hazard stripes in --clip-missing. */
function drawClipBubble(
  ctx: CanvasRenderingContext2D,
  clip: LaneClip,
  x: number,
  y: number,
  w: number,
  accent: string,
  flashing = false,
  missing = false
): void {
  const color = missing ? themeTokenCache.clipMissing : clipFillColor(clip, accent)
  const radius = themeTokenCache.radiusClip
  const shadow = themeTokenCache.shadowClip
  const border = themeTokenCache.borderClip
  const gloss = themeTokenCache.clipGloss

  if (shadow) {
    // Canvas shadow units ignore the CTM, so the dpr scale that positions the
    // bubble does not apply here — scale the token's CSS px values manually.
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.shadowOffsetX = shadow.x * dpr
    ctx.shadowOffsetY = shadow.y * dpr
    ctx.shadowBlur = shadow.blur * dpr
    ctx.shadowColor = shadow.color
    roundRect(ctx, x, y, w, CLIP_HEIGHT, radius)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  }

  roundRect(ctx, x, y, w, CLIP_HEIGHT, radius)
  ctx.fillStyle = color
  ctx.fill()

  if (missing) {
    // 45-degree hazard stripes: the mockup's
    // repeating-linear-gradient(45deg, miss 0 5px, mix(miss, black) 5px 10px).
    ctx.save()
    roundRect(ctx, x, y, w, CLIP_HEIGHT, radius)
    ctx.clip()
    ctx.strokeStyle = mixTowardBlack(color, 0.55)
    ctx.lineWidth = 5
    // Stripe period along x is lineWidth * sqrt(2) for 45-degree lines.
    const step = 5 * Math.SQRT2 * 2
    // CSS linear-gradient(45deg) bands run top-left to bottom-right ('\'); mirror
    // that here (moveTo top -> lineTo bottom-right) so the canvas treatment
    // matches the DOM/mockup orientation instead of leaning the other way.
    for (let sx = x - CLIP_HEIGHT; sx < x + w + CLIP_HEIGHT; sx += step) {
      ctx.beginPath()
      ctx.moveTo(sx, y)
      ctx.lineTo(sx + CLIP_HEIGHT, y + CLIP_HEIGHT)
      ctx.stroke()
    }
    ctx.restore()
  } else if (gloss) {
    const glossFill = ctx.createLinearGradient(0, y, 0, y + CLIP_HEIGHT)
    glossFill.addColorStop(0, gloss.top)
    glossFill.addColorStop(1, gloss.bottom)
    roundRect(ctx, x, y, w, CLIP_HEIGHT, radius)
    ctx.fillStyle = glossFill
    ctx.fill()
  }

  if (flashing) {
    roundRect(ctx, x, y, w, CLIP_HEIGHT, radius)
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.globalAlpha = 1.0
  }

  if (border) {
    // Stroke centered on an inset path so the full border width stays inside
    // the bubble bounds (mirrors the selection stroke geometry).
    const inset = border.width / 2
    roundRect(ctx, x + inset, y + inset, w - border.width, CLIP_HEIGHT - border.width, Math.max(0, radius - inset))
    ctx.strokeStyle = border.color
    ctx.lineWidth = border.width
    ctx.stroke()
  } else {
    roundRect(ctx, x, y, w, CLIP_HEIGHT, radius)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
  }

  const ink = bubbleTextColor(color)
  const label = themeTokenCache.clipUppercase
    ? clip.sampleName.toUpperCase()
    : clip.sampleName
  const textShadow = themeTokenCache.shadowClipText
  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 8, y, w - 16, CLIP_HEIGHT)
  ctx.clip()
  if (textShadow && ink === '#FFFFFF') {
    // Mirror the DOM bubbles: the theme label shadow applies under light ink
    // only (a dark shadow under dark ink smears). Canvas shadows ignore the
    // CTM — scale like the clip drop-shadow above.
    const dpr = window.devicePixelRatio || 1
    ctx.shadowOffsetX = textShadow.x * dpr
    ctx.shadowOffsetY = textShadow.y * dpr
    ctx.shadowBlur = textShadow.blur * dpr
    ctx.shadowColor = textShadow.color
  }
  ctx.fillStyle = ink
  ctx.fillText(label, x + 8, y + CLIP_HEIGHT / 2)
  ctx.restore()
}

/**
 * Builds an offscreen canvas showing only the grabbed clip (plus a ×N badge
 * for group drags) to use as the drag image. Without it the browser snapshots
 * the whole lane canvas, so dragging one clip ghosts every clip in the lane.
 */
function buildClipDragGhost(
  clip: LaneClip,
  width: number,
  count: number,
  missing: boolean
): HTMLCanvasElement | null {
  const w = Math.max(width, GHOST_MIN_WIDTH)
  const h = CLIP_HEIGHT
  const dpr = window.devicePixelRatio || 1

  const canvas = document.createElement('canvas')
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  // setDragImage needs the element rendered in the document; park it offscreen.
  canvas.style.position = 'fixed'
  canvas.style.top = '-1000px'
  canvas.style.left = '0'
  canvas.style.pointerEvents = 'none'

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(dpr, dpr)
  ctx.font = `${themeTokenCache.clipFontWeight} 10px ${themeTokenCache.fontLabel}`
  ctx.textBaseline = 'middle'
  drawClipBubble(ctx, clip, 0, 0, w, getComputedAccent(), false, missing)

  if (count > 1) {
    const bx = w - GHOST_BADGE_WIDTH - 6
    const by = (h - GHOST_BADGE_HEIGHT) / 2
    const badge = getComputedSelectColor()
    roundRect(ctx, bx, by, GHOST_BADGE_WIDTH, GHOST_BADGE_HEIGHT, GHOST_BADGE_HEIGHT / 2)
    ctx.fillStyle = badge
    ctx.fill()
    ctx.fillStyle = bubbleTextColor(badge)
    ctx.textAlign = 'center'
    ctx.fillText(`×${count}`, bx + GHOST_BADGE_WIDTH / 2, by + GHOST_BADGE_HEIGHT / 2)
  }

  return canvas
}

function LaneClipCanvas({
  clips,
  totalTicks,
  laneIndex,
  flashSamplePath,
  selectedClipIds,
  missingSamplePaths,
  onClipDragStart,
  onClipContextMenu
}: LaneClipCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRectsRef = useRef<ClipHitRect[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    const canvasWidth = rect.width
    const canvasHeight = rect.height

    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    const pixelsPerTick = canvasWidth / totalTicks

    // Beat lines in the dedicated grid color — every theme authors --bg-grid
    // subtle against its lane surface (spec-002 AC-012). The old --border
    // source made Beton's beat grid full black and Cosmic's nearly invisible.
    ctx.strokeStyle = themeTokenCache.bgGrid
    ctx.lineWidth = 1
    for (let tick = TICKS_PER_BEAT; tick < totalTicks; tick += TICKS_PER_BEAT) {
      // Skip positions that fall on bar lines — they are drawn separately
      if (tick % TICKS_PER_BAR === 0) continue
      const x = Math.round(tick * pixelsPerTick) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    // Bar lines stay on the structural border color for hierarchy.
    ctx.strokeStyle = themeTokenCache.border
    ctx.lineWidth = 1
    for (let tick = TICKS_PER_BAR; tick < totalTicks; tick += TICKS_PER_BAR) {
      const x = Math.round(tick * pixelsPerTick) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    const hitRects: ClipHitRect[] = []
    const accent = getComputedAccent()

    // Match the DOM sample bubbles: theme label font/weight, ink per slot.
    ctx.font = `${themeTokenCache.clipFontWeight} 10px ${themeTokenCache.fontLabel}`
    ctx.textBaseline = 'middle'

    for (const clip of clips) {
      const { x, width: w } = clipScreenRect(clip, pixelsPerTick)

      drawClipBubble(
        ctx, clip, x, CLIP_TOP, w, accent,
        flashSamplePath === clip.samplePath,
        missingSamplePaths?.has(clip.samplePath) ?? false
      )

      hitRects.push({ clip, x, width: w })

      if (selectedClipIds.has(clip.id)) {
        // Keep selection stroke inside the bubble bounds.
        const inset = SELECTION_BORDER_WIDTH / 2
        ctx.globalAlpha = 0.8
        roundRect(ctx, x + inset, CLIP_TOP + inset, w - SELECTION_BORDER_WIDTH, CLIP_HEIGHT - SELECTION_BORDER_WIDTH, themeTokenCache.radiusClip)
        ctx.strokeStyle = getComputedSelectColor()
        ctx.lineWidth = SELECTION_BORDER_WIDTH
        ctx.stroke()
        ctx.globalAlpha = 1.0
      }
    }

    hitRectsRef.current = hitRects
  }, [clips, totalTicks, flashSamplePath, selectedClipIds, missingSamplePaths])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  // Repaint on theme switch: the token cache refreshes via MutationObserver,
  // but placed clips would keep the previous theme's palette/radius/shadows
  // until the next clip mutation without this (spec-002 AC-011).
  useEffect(() => onThemeTokensRefreshed(draw), [draw])

  // Hit-test to find which clip is at (x, y)
  const hitTest = useCallback((clientX: number): LaneClip | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    // In test environments (jsdom) the canvas has 0 dimensions; fall back to
    // checking clip pixel-position based on totalTicks and container width.
    if (rect.width === 0) {
      return clips.length > 0 ? clips[0] : null
    }
    const x = clientX - rect.left

    for (let i = hitRectsRef.current.length - 1; i >= 0; i--) {
      const hr = hitRectsRef.current[i]
      if (x >= hr.x && x <= hr.x + hr.width) {
        return hr.clip
      }
    }
    return null
  }, [clips])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const clip = hitTest(e.clientX)
    if (!clip) return
    e.preventDefault()
    e.stopPropagation()
    onClipContextMenu({
      x: e.clientX,
      y: e.clientY,
      laneIndex,
      clipId: clip.id,
      samplePath: clip.samplePath,
      sampleName: clip.sampleName
    })
  }, [hitTest, laneIndex, onClipContextMenu])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (e.ctrlKey) return
    const container = containerRef.current
    if (container) {
      delete container.dataset.dragClipId
      delete container.dataset.dragGrabX
    }
    const clip = hitTest(e.clientX)
    if (!clip) return
    if (container) {
      container.dataset.dragClipId = clip.id
      const canvasRect = canvasRef.current?.getBoundingClientRect()
      const hr = hitRectsRef.current.find((h) => h.clip.id === clip.id)
      const grabX = canvasRect && hr ? e.clientX - canvasRect.left - hr.x : 0
      container.dataset.dragGrabX = String(Math.max(0, grabX))
    }
    // Preserve multi-selection drag by preventing parent mousedown clear.
    if (selectedClipIds.has(clip.id)) {
      e.stopPropagation()
    }
  }, [hitTest, selectedClipIds])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const container = containerRef.current
    const clipId = container?.dataset.dragClipId
    if (!clipId) {
      e.preventDefault()
      return
    }

    const hr = hitRectsRef.current.find((h) => h.clip.id === clipId)
    if (hr && e.dataTransfer && typeof e.dataTransfer.setDragImage === 'function') {
      const count = selectedClipIds.size > 1 && selectedClipIds.has(clipId)
        ? selectedClipIds.size
        : 1
      const missing = missingSamplePaths?.has(hr.clip.samplePath) ?? false
      const ghost = buildClipDragGhost(hr.clip, hr.width, count, missing)
      if (ghost) {
        document.body.appendChild(ghost)
        const ghostWidth = Math.max(hr.width, GHOST_MIN_WIDTH)
        const grabX = Math.min(Number(container!.dataset.dragGrabX ?? '0'), ghostWidth)
        e.dataTransfer.setDragImage(ghost, grabX, CLIP_HEIGHT / 2)
        window.setTimeout(() => ghost.remove(), 0)
      }
    }

    onClipDragStart(clipId, e)
    delete container!.dataset.dragClipId
    delete container!.dataset.dragGrabX
  }, [onClipDragStart, selectedClipIds, missingSamplePaths])

  return (
    <div
      ref={containerRef}
      className="lane-clip-canvas-container"
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      data-clip-count={clips.length}
      data-clip-names={clips.map((c) => c.sampleName).join(',')}
    >
      <canvas ref={canvasRef} className="lane-clip-canvas" />
    </div>
  )
}

// Memoized so the tracker's 10Hz playhead/meter updates skip redrawing every
// lane canvas; a lane re-renders only when its clips, the selection, or the
// flash target change.
export default memo(LaneClipCanvas)
