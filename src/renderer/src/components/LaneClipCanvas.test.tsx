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
    const computedSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: vi.fn().mockReturnValue('#2D8C6F')
    } as unknown as CSSStyleDeclaration)

    render(
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

    // getComputedAccent calls getComputedStyle on the document element
    expect(computedSpy).toHaveBeenCalled()
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

    // Selection highlight sets strokeStyle to white and lineWidth to 2
    // Since clip-1 is the only clip and is selected, the last stroke call is the selection border
    expect(mockCtx.strokeStyle).toBe('#FFFFFF')
    expect(mockCtx.lineWidth).toBe(2)
  })
})
