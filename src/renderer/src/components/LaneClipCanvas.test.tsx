import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LaneClipCanvas from './LaneClipCanvas'
import type { LaneClip } from '../lib/playerShell'

const CLIPS: LaneClip[] = [
  {
    id: 'clip-1',
    samplePath: 'C:/kick.wav',
    sampleName: 'kick.wav',
    startTick: 0,
    durationTicks: 16,
    durationSeconds: 0.5,
    color: '#FF0000'
  },
  {
    id: 'clip-2',
    samplePath: 'C:/snare.wav',
    sampleName: 'snare.wav',
    startTick: 16,
    durationTicks: 16,
    durationSeconds: 0.5
  }
]

function makeMockCtx() {
  return {
    scale: vi.fn(),
    clearRect: vi.fn(),
    font: '',
    textBaseline: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fillStyle: '',
    fill: vi.fn(),
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1,
    stroke: vi.fn(),
    save: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn()
  }
}

describe('LaneClipCanvas', () => {
  let mockCtx: ReturnType<typeof makeMockCtx>
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockCtx = makeMockCtx()
    originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx)
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1)
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
    vi.restoreAllMocks()
  })

  it('renders a canvas and data attributes for clips', () => {
    render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const container = document.querySelector('.lane-clip-canvas-container')
    expect(container).toBeTruthy()
    expect(container?.getAttribute('data-clip-count')).toBe('2')
    expect(container?.getAttribute('data-clip-names')).toBe('kick.wav,snare.wav')
  })

  it('draws clips onto the canvas context', () => {
    render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    // fill is called twice per clip (fill + flash if applicable, plus border stroke)
    // Each clip: roundRect + fill (body), roundRect + stroke (border), fillText (label)
    expect(mockCtx.fill).toHaveBeenCalled()
    expect(mockCtx.stroke).toHaveBeenCalled()
    expect(mockCtx.fillText).toHaveBeenCalledWith('kick.wav', expect.any(Number), expect.any(Number))
    expect(mockCtx.fillText).toHaveBeenCalledWith('snare.wav', expect.any(Number), expect.any(Number))
  })

  it('draws a flash overlay when flashSamplePath matches a clip', () => {
    render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath="C:/kick.wav"
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    // The flash path sets globalAlpha to 0.4 then back to 1.0
    expect(mockCtx.globalAlpha).toBe(1.0)
    // fill called at least 3 times: body, flash overlay, border
    expect(mockCtx.fill.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('uses the clip color or falls back to the accent CSS variable', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={[CLIPS[1]!]} // clip without explicit color
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const canvas = container.querySelector('canvas')!
    const ctx = canvas.getContext('2d')! as unknown as { fillStyle: string }
    expect(ctx.fillStyle).toBeDefined()
  })

  it('calls onClipContextMenu with clip info on right-click', () => {
    const onCtx = vi.fn()
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={3}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={onCtx}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')!
    fireEvent.contextMenu(el)

    expect(onCtx).toHaveBeenCalledTimes(1)
    const info = onCtx.mock.calls[0]![0]
    expect(info.laneIndex).toBe(3)
    // In jsdom, canvas has 0 width so hitTest returns the first clip
    expect(info.clipId).toBe('clip-1')
    expect(info.samplePath).toBe('C:/kick.wav')
  })

  it('does not call onClipContextMenu when there are no clips', () => {
    const onCtx = vi.fn()
    const { container } = render(
      <LaneClipCanvas
        clips={[]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={onCtx}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')!
    fireEvent.contextMenu(el)

    expect(onCtx).not.toHaveBeenCalled()
  })

  it('stores clip id on mouse down with left button', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })

    expect(el.dataset.dragClipId).toBe('clip-1')
  })

  it('ignores mouse down with non-left button', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 2 })

    expect(el.dataset.dragClipId).toBeUndefined()
  })

  it('calls onClipDragStart when drag starts after mouse down', () => {
    const onDrag = vi.fn()
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={onDrag}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })
    fireEvent.dragStart(el)

    expect(onDrag).toHaveBeenCalledTimes(1)
    expect(onDrag.mock.calls[0]![0]).toBe('clip-1')
  })

  it('sets a custom drag image showing only the grabbed clip', () => {
    vi.useFakeTimers()
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })
    mockCtx.fillText.mockClear()

    const setDragImage = vi.fn()
    fireEvent.dragStart(el, { dataTransfer: { setDragImage } })

    expect(setDragImage).toHaveBeenCalledTimes(1)
    const ghost = setDragImage.mock.calls[0]![0]
    expect(ghost).toBeInstanceOf(HTMLCanvasElement)
    expect(document.body.contains(ghost)).toBe(true)
    // The ghost renders only the grabbed clip's label — not the lane's other clips
    expect(mockCtx.fillText).toHaveBeenCalledWith('kick.wav', expect.any(Number), expect.any(Number))
    expect(mockCtx.fillText).not.toHaveBeenCalledWith('snare.wav', expect.any(Number), expect.any(Number))

    // The helper element is cleaned up right after the browser snapshots it
    vi.runAllTimers()
    expect(document.body.contains(ghost)).toBe(false)
    vi.useRealTimers()
  })

  it('adds a count badge to the drag image for group drags', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set(['clip-1', 'clip-2'])}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })
    mockCtx.fillText.mockClear()

    fireEvent.dragStart(el, { dataTransfer: { setDragImage: vi.fn() } })

    expect(mockCtx.fillText).toHaveBeenCalledWith('×2', expect.any(Number), expect.any(Number))
  })

  it('prevents default on drag start when no clip was mouse-downed', () => {
    const onDrag = vi.fn()
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={onDrag}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    // Drag without a prior mouse-down — no clip id stored
    fireEvent.dragStart(el)

    expect(onDrag).not.toHaveBeenCalled()
  })

  it('uses spatial hit-test when canvas has non-zero width', () => {
    const onCtx = vi.fn()
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={onCtx}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    const canvas = container.querySelector('canvas')!
    // Mock canvas getBoundingClientRect to return non-zero width
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40, x: 0, y: 0,
      toJSON: () => ({})
    } as DOMRect)

    // clientX=10 falls within clip hit rects (x=0, width=48)
    fireEvent.contextMenu(el, { clientX: 10 })

    expect(onCtx).toHaveBeenCalledTimes(1)
    // Iterating from end, clip-2 is found first
    expect(onCtx.mock.calls[0]![0].clipId).toBe('clip-2')
  })

  it('returns null from spatial hit-test when clientX misses all clips', () => {
    const onCtx = vi.fn()
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={onCtx}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    const canvas = container.querySelector('canvas')!
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40, x: 0, y: 0,
      toJSON: () => ({})
    } as DOMRect)

    // clientX=100 is outside all clip hit rects (max x+width = 48)
    fireEvent.contextMenu(el, { clientX: 100 })

    expect(onCtx).not.toHaveBeenCalled()
  })

  it('draws selection highlight border when a clip is in selectedClipIds', () => {
    // Use only one clip so its selection highlight is the last drawing operation
    render(
      <LaneClipCanvas
        clips={[CLIPS[0]!]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set(['clip-1'])}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    // Selection highlight strokes with the theme's --clip-select token (not a
    // hardcoded white, which would be invisible against a white clip/accent
    // in themes like Club PA) and lineWidth 2. Since clip-1 is the only clip
    // and is selected, the last stroke call is the selection border.
    expect(mockCtx.strokeStyle).toBe('#FFE066')
    expect(mockCtx.lineWidth).toBe(2)
  })

  it('ignores Ctrl+click on mousedown (rectangle-select handled at TrackerView level)', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0, ctrlKey: true })

    expect(el.dataset.dragClipId).toBeUndefined()
  })

  it('stops propagation on mousedown when the clip is already selected', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set(['clip-1'])}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    const event = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true })
    const stopSpy = vi.spyOn(event, 'stopPropagation')
    el.dispatchEvent(event)

    expect(stopSpy).toHaveBeenCalled()
  })

  it('does not stop propagation on mousedown when clip is not selected', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set(['clip-2'])}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    const event = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true })
    const stopSpy = vi.spyOn(event, 'stopPropagation')
    el.dispatchEvent(event)

    expect(stopSpy).not.toHaveBeenCalled()
  })

  it('calls onClipDragStart without custom drag image when dataTransfer lacks setDragImage', () => {
    const onDrag = vi.fn()
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={onDrag}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })
    // Fire dragstart with dataTransfer that has no setDragImage
    fireEvent.dragStart(el, { dataTransfer: {} })

    expect(onDrag).toHaveBeenCalledTimes(1)
    expect(onDrag.mock.calls[0]![0]).toBe('clip-1')
  })

  it('clears stale drag data on fresh mousedown when no clip is hit', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={[]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    // Simulate stale state
    el.dataset.dragClipId = 'old-clip'
    el.dataset.dragGrabX = '10'

    fireEvent.mouseDown(el, { button: 0 })

    // Stale data cleared because no clip hit
    expect(el.dataset.dragClipId).toBeUndefined()
    expect(el.dataset.dragGrabX).toBeUndefined()
  })

  it('stores grabX offset relative to the clip position on mousedown', () => {
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={vi.fn()}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    const canvas = container.querySelector('canvas')!
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 0, right: 300, bottom: 40, width: 200, height: 40, x: 100, y: 0,
      toJSON: () => ({})
    } as DOMRect)

    fireEvent.mouseDown(el, { button: 0, clientX: 110 })

    // Spatial hit-test iterates from end, finds clip-2 first
    expect(el.dataset.dragClipId).toBe('clip-2')
    expect(el.dataset.dragGrabX).toBeDefined()
  })

  it('skips custom drag image gracefully when ghost canvas getContext returns null', () => {
    const onDrag = vi.fn()
    const { container } = render(
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={onDrag}
        onClipContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-clip-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })

    // Override getContext to return null for any NEW canvas (the ghost)
    const origGetContext = HTMLCanvasElement.prototype.getContext
    let callNum = 0
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(function (this: HTMLCanvasElement) {
      callNum++
      // The lane canvas getContext was already called during render.
      // For dragStart, buildClipDragGhost creates a new canvas and calls getContext.
      // Return null to simulate failure.
      if (callNum > 0) return null
      return mockCtx
    })

    const setDragImage = vi.fn()
    fireEvent.dragStart(el, { dataTransfer: { setDragImage } })

    // onClipDragStart still fires even when ghost is null
    expect(onDrag).toHaveBeenCalledTimes(1)
    // setDragImage is NOT called because ghost is null
    expect(setDragImage).not.toHaveBeenCalled()

    HTMLCanvasElement.prototype.getContext = origGetContext
  })
})
