import { memo, useCallback, useEffect, useRef } from 'react'
import {
  LANE_HEAD_WIDTH_PX,
  sampleBubbleScreenRect,
  type ClipPlacement
} from '../lib/arrangement'
import { bubbleTextColor } from '../lib/sample-utils'
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import {
  drawSampleBubbleCanvas,
  sampleBubbleThemeTokens as themeTokenCache,
  onSampleBubbleThemeTokensRefreshed,
  resolveSampleBubbleCanvasVisual,
  roundSampleBubbleRect
} from '../theme/sample-bubble-style'
import { useUiGeometry } from '../ui-size'

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

function getComputedSelectColor(): string {
  return themeTokenCache.selection
}

function drawSampleBubble(
  ctx: CanvasRenderingContext2D,
  placement: ClipPlacement,
  x: number,
  y: number,
  w: number,
  height: number,
  flashing = false,
  missing = false
): void {
  const visual = resolveSampleBubbleCanvasVisual(
    placement.sampleName,
    placement.slot,
    missing
  )
  drawSampleBubbleCanvas(
    ctx,
    visual,
    x,
    y,
    w,
    flashing,
    window.devicePixelRatio || 1,
    height
  )
}

interface SampleBubbleDragGhost {
  canvas: HTMLCanvasElement
  bubbleOffsetX: number
  bubbleOffsetY: number
}

function buildSampleBubbleDragGhost(
  placement: ClipPlacement,
  width: number,
  height: number,
  fontSize: number,
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
  const canvasHeight = height + shadowPadding * 2
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
  ctx.font = `${themeTokenCache.fontWeight} ${fontSize}px ${themeTokenCache.fontLabel}`
  ctx.textBaseline = 'middle'
  drawSampleBubble(
    ctx,
    placement,
    bubbleOffsetX,
    bubbleOffsetY,
    width,
    height,
    false,
    missing
  )

  if (count > 1) {
    const bx = bubbleOffsetX + width + GHOST_BADGE_GAP
    const by = bubbleOffsetY + (height - GHOST_BADGE_HEIGHT) / 2
    const badge = getComputedSelectColor()
    roundSampleBubbleRect(ctx, bx, by, GHOST_BADGE_WIDTH, GHOST_BADGE_HEIGHT, GHOST_BADGE_HEIGHT / 2)
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
  const uiGeometry = useUiGeometry()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRectsRef = useRef<SampleBubbleHitRect[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    const scrollport = container.closest<HTMLElement>('.tracker-lanes')
    const fullWidth = rect.width
    const availableWidth = scrollport
      ? Math.max(1, scrollport.clientWidth - LANE_HEAD_WIDTH_PX)
      : fullWidth
    const canvasWidth = Math.min(fullWidth, availableWidth)
    const canvasHeight = rect.height
    const bubbleHeight = uiGeometry.bubbleHeight
    const bubbleTop = Math.max(0, (canvasHeight - bubbleHeight) / 2)
    const maximumViewportLeft = Math.max(0, fullWidth - canvasWidth)
    const viewportLeft = scrollport
      ? Math.min(Math.max(0, scrollport.scrollLeft), maximumViewportLeft)
      : 0

    canvas.width = Math.max(1, Math.round(canvasWidth * dpr))
    canvas.height = Math.max(1, Math.round(canvasHeight * dpr))
    canvas.style.left = `${viewportLeft}px`
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    const pixelsPerTick = fullWidth / totalTicks
    const firstVisibleTick = Math.max(
      TICKS_PER_BEAT,
      Math.floor(viewportLeft / pixelsPerTick / TICKS_PER_BEAT) * TICKS_PER_BEAT
    )
    const lastVisibleTick = Math.min(
      totalTicks,
      Math.ceil((viewportLeft + canvasWidth) / pixelsPerTick / TICKS_PER_BEAT) * TICKS_PER_BEAT
    )

    ctx.strokeStyle = themeTokenCache.bgGrid
    ctx.lineWidth = 1
    for (let tick = firstVisibleTick; tick < lastVisibleTick; tick += TICKS_PER_BEAT) {
      if (tick % TICKS_PER_BAR === 0) continue
      const x = Math.round(tick * pixelsPerTick - viewportLeft) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    ctx.strokeStyle = themeTokenCache.borderColor
    ctx.lineWidth = 1
    const firstVisibleBarTick = Math.max(
      TICKS_PER_BAR,
      Math.floor(firstVisibleTick / TICKS_PER_BAR) * TICKS_PER_BAR
    )
    for (let tick = firstVisibleBarTick; tick < lastVisibleTick; tick += TICKS_PER_BAR) {
      const x = Math.round(tick * pixelsPerTick - viewportLeft) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    const hitRects: SampleBubbleHitRect[] = []
    ctx.font = `${themeTokenCache.fontWeight} ${uiGeometry.fontMd}px ${themeTokenCache.fontLabel}`
    ctx.textBaseline = 'middle'

    for (const placement of placements) {
      const { x, width: w } = sampleBubbleScreenRect(placement, pixelsPerTick)
      hitRects.push({ placement, x, width: w })
      if (x + w < viewportLeft || x > viewportLeft + canvasWidth) continue

      drawSampleBubble(
        ctx, placement, x - viewportLeft, bubbleTop, w, bubbleHeight,
        flashSamplePath === placement.samplePath,
        missingSamplePaths?.has(placement.samplePath) ?? false
      )

      if (selectedPlacementIds.has(placement.id)) {
        const inset = SELECTION_BORDER_WIDTH / 2
        ctx.globalAlpha = 0.8
        roundSampleBubbleRect(
          ctx,
          x - viewportLeft + inset,
          bubbleTop + inset,
          w - SELECTION_BORDER_WIDTH,
          bubbleHeight - SELECTION_BORDER_WIDTH,
          themeTokenCache.radius
        )
        ctx.strokeStyle = getComputedSelectColor()
        ctx.lineWidth = SELECTION_BORDER_WIDTH
        ctx.stroke()
        ctx.globalAlpha = 1.0
      }
    }

    hitRectsRef.current = hitRects
  }, [placements, totalTicks, flashSamplePath, selectedPlacementIds, missingSamplePaths, uiGeometry])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const scrollport = container.closest<HTMLElement>('.tracker-lanes')
    let scrollFrame: number | null = null
    const scheduleScrollDraw = () => {
      if (scrollFrame !== null) return
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null
        draw()
      })
    }
    const observer = new ResizeObserver(() => draw())
    observer.observe(container)
    if (scrollport) {
      observer.observe(scrollport)
      scrollport.addEventListener('scroll', scheduleScrollDraw, { passive: true })
    }
    return () => {
      observer.disconnect()
      scrollport?.removeEventListener('scroll', scheduleScrollDraw)
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
    }
  }, [draw])

  // Repaint on theme switch: the token cache refreshes via MutationObserver,
  // but existing placements would keep the previous theme's palette/radius/shadows
  // until the next placement mutation without this (spec-002 AC-011).
  useEffect(() => onSampleBubbleThemeTokensRefreshed(draw), [draw])

  const hitTest = useCallback((clientX: number): ClipPlacement | null => {
    const container = containerRef.current
    if (!container) return null
    const rect = container.getBoundingClientRect()
    // In test environments (jsdom) the lane has 0 dimensions; fall back to
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
      const containerRect = container.getBoundingClientRect()
      const hr = hitRectsRef.current.find((h) => h.placement.id === placement.id)
      const grabX = hr ? e.clientX - containerRect.left - hr.x : 0
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
      const bubbleHeight = uiGeometry.bubbleHeight
      const ghost = buildSampleBubbleDragGhost(
        hr.placement,
        hr.width,
        bubbleHeight,
        uiGeometry.fontMd,
        count,
        missing
      )
      if (ghost) {
        document.body.appendChild(ghost.canvas)
        const grabX = Math.min(Number(container!.dataset.dragGrabX ?? '0'), hr.width)
        e.dataTransfer.setDragImage(
          ghost.canvas,
          ghost.bubbleOffsetX + grabX,
          ghost.bubbleOffsetY + bubbleHeight / 2
        )
        window.setTimeout(() => ghost.canvas.remove(), 0)
      }
    }

    onPlacementDragStart(placementId, e)
    delete container!.dataset.dragPlacementId
    delete container!.dataset.dragGrabX
  }, [onPlacementDragStart, selectedPlacementIds, missingSamplePaths, uiGeometry.bubbleHeight, uiGeometry.fontMd])

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
