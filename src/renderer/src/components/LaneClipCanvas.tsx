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

/** Parses the --shadow-clip depth token: "<x>px <y>px <blur>px <color>" | "none". */
export function parseClipShadow(value: string): ClipShadow | null {
  const match = value.trim().match(/^(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(.+)$/)
  if (!match) return null
  return { x: Number(match[1]), y: Number(match[2]), blur: Number(match[3]), color: match[4] }
}

/** Parses the --border-clip depth token: "<width>px <color>" | "none". */
export function parseClipBorder(value: string): ClipBorder | null {
  const match = value.trim().match(/^([\d.]+)px\s+(.+)$/)
  if (!match) return null
  const width = Number(match[1])
  if (width <= 0) return null
  return { width, color: match[2] }
}

// Cache theme tokens and refresh when the active theme changes.
const themeTokenCache = {
  accent: ACCENT_FALLBACK,
  clipSelect: SELECTION_BORDER_COLOR,
  border: '#1A4D3E',
  fontLabel: 'sans-serif',
  radiusClip: CORNER_RADIUS,
  shadowClip: null as ClipShadow | null,
  borderClip: null as ClipBorder | null,
  _version: 0
}

/** Refresh cached theme tokens from computed styles. */
export function refreshThemeTokens(): void {
  const style = getComputedStyle(document.documentElement)
  themeTokenCache.accent = style.getPropertyValue('--accent').trim() || ACCENT_FALLBACK
  themeTokenCache.clipSelect = style.getPropertyValue('--clip-select').trim() || SELECTION_BORDER_COLOR
  themeTokenCache.border = style.getPropertyValue('--border').trim() || '#1A4D3E'
  themeTokenCache.fontLabel = style.getPropertyValue('--font-label').trim() || 'sans-serif'
  const radiusClip = Number.parseFloat(style.getPropertyValue('--radius-clip'))
  themeTokenCache.radiusClip = Number.isFinite(radiusClip)
    ? Math.max(0, Math.min(radiusClip, CLIP_HEIGHT / 2))
    : CORNER_RADIUS
  themeTokenCache.shadowClip = parseClipShadow(style.getPropertyValue('--shadow-clip'))
  themeTokenCache.borderClip = parseClipBorder(style.getPropertyValue('--border-clip'))
  themeTokenCache._version++
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

/** Draws one clip bubble (body, border, clipped label). Caller sets ctx.font
 *  and ctx.textBaseline so the lane canvas and the drag ghost stay in sync. */
function drawClipBubble(
  ctx: CanvasRenderingContext2D,
  clip: LaneClip,
  x: number,
  y: number,
  w: number,
  accent: string,
  flashing = false
): void {
  const color = clip.color || accent
  const radius = themeTokenCache.radiusClip
  const shadow = themeTokenCache.shadowClip
  const border = themeTokenCache.borderClip

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

  if (flashing) {
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

  ctx.fillStyle = bubbleTextColor(color)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 8, y, w - 16, CLIP_HEIGHT)
  ctx.clip()
  ctx.fillText(clip.sampleName, x + 8, y + CLIP_HEIGHT / 2)
  ctx.restore()
}

/**
 * Builds an offscreen canvas showing only the grabbed clip (plus a ×N badge
 * for group drags) to use as the drag image. Without it the browser snapshots
 * the whole lane canvas, so dragging one clip ghosts every clip in the lane.
 */
function buildClipDragGhost(clip: LaneClip, width: number, count: number): HTMLCanvasElement | null {
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
  ctx.font = `10px ${themeTokenCache.fontLabel}`
  ctx.textBaseline = 'middle'
  drawClipBubble(ctx, clip, 0, 0, w, getComputedAccent())

  if (count > 1) {
    const bx = w - GHOST_BADGE_WIDTH - 6
    const by = (h - GHOST_BADGE_HEIGHT) / 2
    roundRect(ctx, bx, by, GHOST_BADGE_WIDTH, GHOST_BADGE_HEIGHT, GHOST_BADGE_HEIGHT / 2)
    ctx.fillStyle = SELECTION_BORDER_COLOR
    ctx.fill()
    ctx.fillStyle = '#111111'
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

    const borderColor = themeTokenCache.border
    const pixelsPerTick = canvasWidth / totalTicks

    // Beat lines (more transparent)
    ctx.strokeStyle = borderColor
    ctx.globalAlpha = 0.25
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

    // Bar lines (fully visible)
    ctx.globalAlpha = 1.0
    ctx.strokeStyle = borderColor
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

    // Match the DOM sample bubbles: theme label font, ink picked per clip color.
    ctx.font = `10px ${themeTokenCache.fontLabel}`
    ctx.textBaseline = 'middle'

    for (const clip of clips) {
      const { x, width: w } = clipScreenRect(clip, pixelsPerTick)

      drawClipBubble(ctx, clip, x, CLIP_TOP, w, accent, flashSamplePath === clip.samplePath)

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
  }, [clips, totalTicks, flashSamplePath, selectedClipIds])

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
      const ghost = buildClipDragGhost(hr.clip, hr.width, count)
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
  }, [onClipDragStart, selectedClipIds])

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
