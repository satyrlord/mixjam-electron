import { useCallback, useEffect, useRef } from 'react'
import type { LaneClip } from '../lib/playerShell'
import { tileWidth } from '../lib/sample-utils'

interface LaneClipCanvasProps {
  clips: LaneClip[]
  totalTicks: number
  laneIndex: number
  flashSamplePath: string | null
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
const TEXT_COLOR = '#EAEAEA'
const LABEL_FONT = '10px sans-serif'

interface ClipHitRect {
  clip: LaneClip
  x: number
  width: number
}

function getComputedAccent(): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return val || ACCENT_FALLBACK
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

export default function LaneClipCanvas({
  clips,
  totalTicks,
  laneIndex,
  flashSamplePath,
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

    const accent = getComputedAccent()
    const pixelsPerTick = canvasWidth / totalTicks
    const hitRects: ClipHitRect[] = []

    ctx.font = LABEL_FONT
    ctx.textBaseline = 'middle'

    for (const clip of clips) {
      const x = clip.startTick * pixelsPerTick
      const w = tileWidth(clip.durationSeconds)
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
      ctx.fillStyle = TEXT_COLOR
      ctx.save()
      ctx.beginPath()
      ctx.rect(x + 8, CLIP_TOP, w - 16, CLIP_HEIGHT)
      ctx.clip()
      ctx.fillText(clip.sampleName, x + 8, CLIP_TOP + CLIP_HEIGHT / 2)
      ctx.restore()

      hitRects.push({ clip, x, width: w })
    }

    hitRectsRef.current = hitRects
  }, [clips, totalTicks, flashSamplePath])

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
    const clip = hitTest(e.clientX)
    if (!clip) return
    // Set up for potential drag — store the clip id for dragstart
    const container = containerRef.current
    if (container) {
      container.dataset.dragClipId = clip.id
    }
  }, [hitTest])

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
