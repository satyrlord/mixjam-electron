import { memo, useCallback, useEffect, useRef } from 'react'
import {
  SAMPLE_BUBBLE_HEIGHT_PX,
  sampleBubbleScreenRect,
  type ClipPlacement
} from '../lib/arrangement'
import { bubbleTextColor } from '../lib/sample-utils'
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import {
  sampleBubbleThemeTokens as themeTokenCache,
  mixTowardBlack,
  onSampleBubbleThemeTokensRefreshed
} from '../theme/sample-bubble-style'

interface LaneSampleBubbleCanvasProps {
  placements: ClipPlacement[]
  totalTicks: number
  laneIndex: number
  flashSamplePath: string | null
  selectedPlacementIds: ReadonlySet<string>
  /** Relpaths whose sample row is missing (scan_state = 2); those placements render
   *  hazard stripes in --sample-bubble-missing (spec-002 AC-013). */
  missingSamplePaths?: ReadonlySet<string>
  onPlacementDragStart: (placementId: string, event: React.DragEvent) => void
  onPlacementContextMenu: (info: {
    x: number
    y: number
    laneIndex: number
    placementId: string
    samplePath: string
    sampleName: string
  }) => void
}

const CLIP_TOP = 6
const SELECTION_BORDER_WIDTH = 2
const GHOST_MIN_WIDTH = 48
const GHOST_BADGE_WIDTH = 22
const GHOST_BADGE_HEIGHT = 14
const GHOST_BADGE_GAP = 4

interface SampleBubbleHitRect {
  placement: ClipPlacement
  x: number
  width: number
}

function getComputedAccent(): string {
  return themeTokenCache.accent
}

function getComputedSelectColor(): string {
  return themeTokenCache.selection
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

function sampleBubbleFillColor(placement: ClipPlacement, accent: string): string {
  if (placement.slot === undefined) return accent
  return themeTokenCache.palette[placement.slot] || accent
}

function drawSampleBubble(
  ctx: CanvasRenderingContext2D,
  placement: ClipPlacement,
  x: number,
  y: number,
  w: number,
  accent: string,
  flashing = false,
  missing = false
): void {
  const color = missing ? themeTokenCache.missing : sampleBubbleFillColor(placement, accent)
  const radius = themeTokenCache.radius
  const shadow = themeTokenCache.shadow
  const border = themeTokenCache.outline
  const gloss = themeTokenCache.gloss

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
  const label = themeTokenCache.uppercase
    ? placement.sampleName.toUpperCase()
    : placement.sampleName
  const textShadow = themeTokenCache.textShadow
  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 8, y, Math.max(0, w - 16), SAMPLE_BUBBLE_HEIGHT_PX)
  ctx.clip()
  if (textShadow && ink === '#FFFFFF') {
    // Mirror the DOM bubbles: the theme label shadow applies under light ink
    // only (a dark shadow under dark ink smears). Canvas shadows ignore the
    // CTM — scale like the placement drop-shadow above.
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

interface SampleBubbleDragGhost {
  canvas: HTMLCanvasElement
  bubbleOffsetX: number
  bubbleOffsetY: number
}

function buildSampleBubbleDragGhost(
  placement: ClipPlacement,
  width: number,
  count: number,
  missing: boolean
): SampleBubbleDragGhost | null {
  const shadow = themeTokenCache.shadow
  const shadowPadding = shadow
    ? Math.ceil(shadow.blur + Math.max(Math.abs(shadow.x), Math.abs(shadow.y)))
    : 0
  const badgeSpace = count > 1 ? GHOST_BADGE_GAP + GHOST_BADGE_WIDTH : 0
  const contentWidth = Math.max(width + badgeSpace, GHOST_MIN_WIDTH)
  const canvasWidth = contentWidth + shadowPadding * 2
  const canvasHeight = SAMPLE_BUBBLE_HEIGHT_PX + shadowPadding * 2
  const bubbleOffsetX = shadowPadding
  const bubbleOffsetY = shadowPadding
  const dpr = window.devicePixelRatio || 1

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth * dpr
  canvas.height = canvasHeight * dpr
  canvas.style.width = `${canvasWidth}px`
  canvas.style.height = `${canvasHeight}px`
  // setDragImage needs the element rendered in the document; park it offscreen.
  canvas.style.position = 'fixed'
  canvas.style.top = '-1000px'
  canvas.style.left = '0'
  canvas.style.pointerEvents = 'none'

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(dpr, dpr)
  ctx.font = `${themeTokenCache.fontWeight} 10px ${themeTokenCache.fontLabel}`
  ctx.textBaseline = 'middle'
  drawSampleBubble(
    ctx,
    placement,
    bubbleOffsetX,
    bubbleOffsetY,
    width,
    getComputedAccent(),
    false,
    missing
  )

  if (count > 1) {
    const bx = bubbleOffsetX + width + GHOST_BADGE_GAP
    const by = bubbleOffsetY + (SAMPLE_BUBBLE_HEIGHT_PX - GHOST_BADGE_HEIGHT) / 2
    const badge = getComputedSelectColor()
    roundRect(ctx, bx, by, GHOST_BADGE_WIDTH, GHOST_BADGE_HEIGHT, GHOST_BADGE_HEIGHT / 2)
    ctx.fillStyle = badge
    ctx.fill()
    ctx.fillStyle = bubbleTextColor(badge)
    ctx.textAlign = 'center'
    ctx.fillText(`×${count}`, bx + GHOST_BADGE_WIDTH / 2, by + GHOST_BADGE_HEIGHT / 2)
  }

  return { canvas, bubbleOffsetX, bubbleOffsetY }
}

function LaneSampleBubbleCanvas({
  placements,
  totalTicks,
  laneIndex,
  flashSamplePath,
  selectedPlacementIds,
  missingSamplePaths,
  onPlacementDragStart,
  onPlacementContextMenu
}: LaneSampleBubbleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRectsRef = useRef<SampleBubbleHitRect[]>([])
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

    ctx.strokeStyle = themeTokenCache.borderColor
    ctx.lineWidth = 1
    for (let tick = TICKS_PER_BAR; tick < totalTicks; tick += TICKS_PER_BAR) {
      const x = Math.round(tick * pixelsPerTick) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    const hitRects: SampleBubbleHitRect[] = []
    const accent = getComputedAccent()

    ctx.font = `${themeTokenCache.fontWeight} 10px ${themeTokenCache.fontLabel}`
    ctx.textBaseline = 'middle'

    for (const placement of placements) {
      const { x, width: w } = sampleBubbleScreenRect(placement, pixelsPerTick)

      drawSampleBubble(
        ctx, placement, x, CLIP_TOP, w, accent,
        flashSamplePath === placement.samplePath,
        missingSamplePaths?.has(placement.samplePath) ?? false
      )

      hitRects.push({ placement, x, width: w })

      if (selectedPlacementIds.has(placement.id)) {
        const inset = SELECTION_BORDER_WIDTH / 2
        ctx.globalAlpha = 0.8
        roundRect(
          ctx,
          x + inset,
          CLIP_TOP + inset,
          w - SELECTION_BORDER_WIDTH,
          SAMPLE_BUBBLE_HEIGHT_PX - SELECTION_BORDER_WIDTH,
          themeTokenCache.radius
        )
        ctx.strokeStyle = getComputedSelectColor()
        ctx.lineWidth = SELECTION_BORDER_WIDTH
        ctx.stroke()
        ctx.globalAlpha = 1.0
      }
    }

    hitRectsRef.current = hitRects
  }, [placements, totalTicks, flashSamplePath, selectedPlacementIds, missingSamplePaths])

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
  // but existing placements would keep the previous theme's palette/radius/shadows
  // until the next placement mutation without this (spec-002 AC-011).
  useEffect(() => onSampleBubbleThemeTokensRefreshed(draw), [draw])

  const hitTest = useCallback((clientX: number): ClipPlacement | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    // In test environments (jsdom) the canvas has 0 dimensions; fall back to
    // checking placement pixel-position based on totalTicks and container width.
    if (rect.width === 0) {
      return placements.length > 0 ? placements[0] : null
    }
    const x = clientX - rect.left

    for (let i = hitRectsRef.current.length - 1; i >= 0; i--) {
      const hr = hitRectsRef.current[i]
      if (x >= hr.x && x <= hr.x + hr.width) {
        return hr.placement
      }
    }
    return null
  }, [placements])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const placement = hitTest(e.clientX)
    if (!placement) return
    onPlacementContextMenu({
      x: e.clientX,
      y: e.clientY,
      laneIndex,
      placementId: placement.id,
      samplePath: placement.samplePath,
      sampleName: placement.sampleName
    })
  }, [hitTest, laneIndex, onPlacementContextMenu])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (e.ctrlKey) return
    const container = containerRef.current
    if (container) {
      delete container.dataset.dragPlacementId
      delete container.dataset.dragGrabX
    }
    const placement = hitTest(e.clientX)
    if (!placement) return
    if (container) {
      container.dataset.dragPlacementId = placement.id
      const canvasRect = canvasRef.current?.getBoundingClientRect()
      const hr = hitRectsRef.current.find((h) => h.placement.id === placement.id)
      const grabX = canvasRect && hr ? e.clientX - canvasRect.left - hr.x : 0
      container.dataset.dragGrabX = String(Math.max(0, grabX))
    }
    // Preserve multi-selection drag by preventing parent mousedown clear.
    if (selectedPlacementIds.has(placement.id)) {
      e.stopPropagation()
    }
  }, [hitTest, selectedPlacementIds])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const container = containerRef.current
    const placementId = container?.dataset.dragPlacementId
    if (!placementId) {
      e.preventDefault()
      return
    }

    const hr = hitRectsRef.current.find((h) => h.placement.id === placementId)
    if (hr && e.dataTransfer && typeof e.dataTransfer.setDragImage === 'function') {
      const count = selectedPlacementIds.size > 1 && selectedPlacementIds.has(placementId)
        ? selectedPlacementIds.size
        : 1
      const missing = missingSamplePaths?.has(hr.placement.samplePath) ?? false
      const ghost = buildSampleBubbleDragGhost(hr.placement, hr.width, count, missing)
      if (ghost) {
        document.body.appendChild(ghost.canvas)
        const grabX = Math.min(Number(container!.dataset.dragGrabX ?? '0'), hr.width)
        e.dataTransfer.setDragImage(
          ghost.canvas,
          ghost.bubbleOffsetX + grabX,
          ghost.bubbleOffsetY + SAMPLE_BUBBLE_HEIGHT_PX / 2
        )
        window.setTimeout(() => ghost.canvas.remove(), 0)
      }
    }

    onPlacementDragStart(placementId, e)
    delete container!.dataset.dragPlacementId
    delete container!.dataset.dragGrabX
  }, [onPlacementDragStart, selectedPlacementIds, missingSamplePaths])

  return (
    <div
      ref={containerRef}
      className="lane-sample-bubble-canvas-container"
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      data-placement-count={placements.length}
      data-placement-sample-names={placements.map((c) => c.sampleName).join(',')}
    >
      <canvas ref={canvasRef} className="lane-sample-bubble-canvas" />
    </div>
  )
}

// Memoized so the tracker's 10Hz playhead/meter updates skip redrawing every
// lane canvas; a lane re-renders only when its placements, the selection, or the
// flash target change.
export default memo(LaneSampleBubbleCanvas)
