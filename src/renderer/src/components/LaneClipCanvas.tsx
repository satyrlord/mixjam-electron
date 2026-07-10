import { memo, useCallback, useEffect, useRef } from 'react'
import {
  SAMPLE_BUBBLE_HEIGHT_PX,
  clipScreenRect,
  type LaneClip
} from '../lib/playerShell'
import { bubbleTextColor } from '../lib/sample-utils'
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import {
  clipThemeTokens as themeTokenCache,
  mixTowardBlack,
  onClipThemeTokensRefreshed
} from '../theme/clip-style'

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

const CLIP_TOP = 6
const SELECTION_BORDER_WIDTH = 2
const GHOST_MIN_WIDTH = 48
const GHOST_BADGE_WIDTH = 22
const GHOST_BADGE_HEIGHT = 14

interface ClipHitRect {
  clip: LaneClip
  x: number
  width: number
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

function clipFillColor(clip: LaneClip, accent: string): string {
  if (clip.slot === undefined) return accent
  return themeTokenCache.palette[clip.slot] || accent
}

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
    roundRect(ctx, x, y, w, SAMPLE_BUBBLE_HEIGHT_PX, radius)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  }

  roundRect(ctx, x, y, w, SAMPLE_BUBBLE_HEIGHT_PX, radius)
  ctx.fillStyle = color
  ctx.fill()

  if (missing) {
    ctx.save()
    roundRect(ctx, x, y, w, SAMPLE_BUBBLE_HEIGHT_PX, radius)
    ctx.clip()
    ctx.strokeStyle = mixTowardBlack(color, 0.55)
    ctx.lineWidth = 5
    const step = 5 * Math.SQRT2 * 2
    for (
      let sx = x - SAMPLE_BUBBLE_HEIGHT_PX;
      sx < x + w + SAMPLE_BUBBLE_HEIGHT_PX;
      sx += step
    ) {
      ctx.beginPath()
      ctx.moveTo(sx, y)
      ctx.lineTo(sx + SAMPLE_BUBBLE_HEIGHT_PX, y + SAMPLE_BUBBLE_HEIGHT_PX)
      ctx.stroke()
    }
    ctx.restore()
  } else if (gloss) {
    const glossFill = ctx.createLinearGradient(0, y, 0, y + SAMPLE_BUBBLE_HEIGHT_PX)
    glossFill.addColorStop(0, gloss.top)
    glossFill.addColorStop(1, gloss.bottom)
    roundRect(ctx, x, y, w, SAMPLE_BUBBLE_HEIGHT_PX, radius)
    ctx.fillStyle = glossFill
    ctx.fill()
  }

  if (flashing) {
    roundRect(ctx, x, y, w, SAMPLE_BUBBLE_HEIGHT_PX, radius)
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.globalAlpha = 1.0
  }

  if (border) {
    // Stroke centered on an inset path so the full border width stays inside
    // the bubble bounds (mirrors the selection stroke geometry).
    const inset = border.width / 2
    roundRect(
      ctx,
      x + inset,
      y + inset,
      w - border.width,
      SAMPLE_BUBBLE_HEIGHT_PX - border.width,
      Math.max(0, radius - inset)
    )
    ctx.strokeStyle = border.color
    ctx.lineWidth = border.width
    ctx.stroke()
  } else {
    roundRect(ctx, x, y, w, SAMPLE_BUBBLE_HEIGHT_PX, radius)
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
  ctx.rect(x + 8, y, w - 16, SAMPLE_BUBBLE_HEIGHT_PX)
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
  ctx.fillText(label, x + 8, y + SAMPLE_BUBBLE_HEIGHT_PX / 2)
  ctx.restore()
}

function buildClipDragGhost(
  clip: LaneClip,
  width: number,
  count: number,
  missing: boolean
): HTMLCanvasElement | null {
  const w = Math.max(width, GHOST_MIN_WIDTH)
  const h = SAMPLE_BUBBLE_HEIGHT_PX
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

    ctx.strokeStyle = themeTokenCache.bgGrid
    ctx.lineWidth = 1
    for (let tick = TICKS_PER_BEAT; tick < totalTicks; tick += TICKS_PER_BEAT) {
      if (tick % TICKS_PER_BAR === 0) continue
      const x = Math.round(tick * pixelsPerTick) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

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
        const inset = SELECTION_BORDER_WIDTH / 2
        ctx.globalAlpha = 0.8
        roundRect(
          ctx,
          x + inset,
          CLIP_TOP + inset,
          w - SELECTION_BORDER_WIDTH,
          SAMPLE_BUBBLE_HEIGHT_PX - SELECTION_BORDER_WIDTH,
          themeTokenCache.radiusClip
        )
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
  useEffect(() => onClipThemeTokensRefreshed(draw), [draw])

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
        e.dataTransfer.setDragImage(ghost, grabX, SAMPLE_BUBBLE_HEIGHT_PX / 2)
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
