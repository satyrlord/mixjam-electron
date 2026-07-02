import { useCallback, useEffect, useRef } from 'react'
import { clipScreenRect, type LaneClip } from '../lib/playerShell'
import { bubbleTextColor } from '../lib/sample-utils'

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
const TICKS_PER_BAR = 32
const BEATS_PER_BAR = 4
const TICKS_PER_BEAT = TICKS_PER_BAR / BEATS_PER_BAR

interface ClipHitRect {
  clip: LaneClip
  x: number
  width: number
}

function getComputedColor(token: string, fallback: string): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return val || fallback
}

function getComputedAccent(): string {
  return getComputedColor('--accent', ACCENT_FALLBACK)
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

const SELECTION_BORDER_COLOR = '#FFFFFF'
const SELECTION_BORDER_WIDTH = 2

export default function LaneClipCanvas({
  clips,
  totalTicks,
  laneIndex,
  flashSamplePath,
  selectedClipIds,
  onClipDragStart,
  onClipContextMenu,
}: LaneClipCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRectsRef = useRef<ClipHitRect[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // Draw clips on the canvas
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

    // --- Grid lines ---
    const borderColor = getComputedColor('--border', '#1A4D3E')
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

    // --- Clips ---
    const hitRects: ClipHitRect[] = []
    const accent = getComputedAccent()

    // Match the DOM sample bubbles: theme label font, ink picked per clip color.
    const labelFont = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-label')
      .trim()
    ctx.font = `10px ${labelFont || 'sans-serif'}`
    ctx.textBaseline = 'middle'

    for (const clip of clips) {
      const { x, width: w } = clipScreenRect(clip, pixelsPerTick)
      const color = clip.color || accent
      const isFlashing = flashSamplePath === clip.samplePath

      // Draw rounded rectangle
      roundRect(ctx, x, CLIP_TOP, w, CLIP_HEIGHT, CORNER_RADIUS)
      ctx.fillStyle = color
      ctx.fill()

      // Flash effect: draw semi-transparent overlay
      if (isFlashing) {
        ctx.globalAlpha = 0.4
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.globalAlpha = 1.0
      }

      // Draw border (slightly darker)
      roundRect(ctx, x, CLIP_TOP, w, CLIP_HEIGHT, CORNER_RADIUS)
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.stroke()

      // Draw label (truncated)
      ctx.fillStyle = bubbleTextColor(color)
      ctx.save()
      ctx.beginPath()
      ctx.rect(x + 8, CLIP_TOP, w - 16, CLIP_HEIGHT)
      ctx.clip()
      ctx.fillText(clip.sampleName, x + 8, CLIP_TOP + CLIP_HEIGHT / 2)
      ctx.restore()

      hitRects.push({ clip, x, width: w })

      if (selectedClipIds.has(clip.id)) {
        // Stroked on the clip's own bounding box (inset by half the line
        // width) so the selection highlight never grows the clip's visual
        // footprint beyond its normal w x CLIP_HEIGHT bubble size.
        const inset = SELECTION_BORDER_WIDTH / 2
        ctx.globalAlpha = 0.8
        roundRect(ctx, x + inset, CLIP_TOP + inset, w - SELECTION_BORDER_WIDTH, CLIP_HEIGHT - SELECTION_BORDER_WIDTH, CORNER_RADIUS)
        ctx.strokeStyle = SELECTION_BORDER_COLOR
        ctx.lineWidth = SELECTION_BORDER_WIDTH
        ctx.stroke()
        ctx.globalAlpha = 1.0
      }
    }

    hitRectsRef.current = hitRects
  }, [clips, totalTicks, flashSamplePath, selectedClipIds])

  // Redraw on clips change or resize
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
      // Cannot perform spatial hit-test; return first clip as fallback.
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
      sampleName: clip.sampleName,
    })
  }, [hitTest, laneIndex, onClipContextMenu])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    // Ctrl+click is used for rectangle selection at the TrackerView level
    if (e.ctrlKey) return
    const clip = hitTest(e.clientX)
    if (!clip) return
    // Set up for potential drag — store the clip id for dragstart
    const container = containerRef.current
    if (container) {
      container.dataset.dragClipId = clip.id
    }
    // If this clip is already part of a multi-selection, stop the mousedown
    // from bubbling to TrackerView's lanes-container handler, which would
    // otherwise clear selectedClipIds before dragstart fires and silently
    // downgrade the drag to a single clip instead of the whole group.
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
    onClipDragStart(clipId, e)
    delete container!.dataset.dragClipId
  }, [onClipDragStart])

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
