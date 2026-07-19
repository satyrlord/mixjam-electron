import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LaneSampleBubbleCanvas from './LaneSampleBubbleCanvas'
import {
  LANE_HEAD_WIDTH_PX,
  TRACKER_TIMELINE_MIN_WIDTH_PX,
  TRACKER_TOTAL_TICKS,
  type ClipPlacement
} from '../lib/arrangement'

const PLACEMENTS: ClipPlacement[] = [
  {
    id: 'placement-1',
    samplePath: 'kick.wav',
    sampleName: 'kick.wav',
    startTick: 0,
    durationTicks: 16,
    durationSeconds: 0.5,
    slot: 0
  },
  {
    id: 'placement-2',
    samplePath: 'snare.wav',
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

describe('LaneSampleBubbleCanvas', () => {
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

  it('renders a canvas and data attributes for placements', () => {
    render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const container = document.querySelector('.lane-sample-bubble-canvas-container')
    expect(container).toBeTruthy()
    expect(container?.getAttribute('data-placement-count')).toBe('2')
    expect(container?.getAttribute('data-placement-sample-names')).toBe('kick.wav,snare.wav')
  })

  it('draws placements onto the canvas context', () => {
    render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    // fill is called twice per sample bubble (fill + flash if applicable, plus border stroke)
    // Each bubble: roundRect + fill (body), roundRect + stroke (border), fillText (label)
    expect(mockCtx.fill).toHaveBeenCalled()
    expect(mockCtx.stroke).toHaveBeenCalled()
    expect(mockCtx.fillText).toHaveBeenCalledWith('kick.wav', expect.any(Number), expect.any(Number))
    expect(mockCtx.fillText).toHaveBeenCalledWith('snare.wav', expect.any(Number), expect.any(Number))
  })

  it('bounds the 999-bar backing canvas to the visible lane viewport', () => {
    const pendingFrames: FrameRequestCallback[] = []
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      pendingFrames.push(callback)
      return pendingFrames.length
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.classList.contains('lane-sample-bubble-canvas-container')
        ? TRACKER_TIMELINE_MIN_WIDTH_PX - LANE_HEAD_WIDTH_PX
        : 1_200
      return {
        x: 0, y: 0, width, height: 52, top: 0, right: width, bottom: 52, left: 0,
        toJSON: () => ({})
      }
    })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('tracker-lanes') ? 1_200 : 0
    })

    const { container } = render(
      <div className="tracker-lanes">
        <LaneSampleBubbleCanvas
          placements={PLACEMENTS}
          totalTicks={TRACKER_TOTAL_TICKS}
          laneIndex={0}
          flashSamplePath={null}
          selectedPlacementIds={new Set()}
          onPlacementDragStart={vi.fn()}
          onPlacementContextMenu={vi.fn()}
        />
      </div>
    )

    const scrollport = container.querySelector('.tracker-lanes') as HTMLElement
    const canvas = container.querySelector('.lane-sample-bubble-canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(1_200 - LANE_HEAD_WIDTH_PX)
    expect(canvas.width).toBeLessThan(TRACKER_TIMELINE_MIN_WIDTH_PX - LANE_HEAD_WIDTH_PX)

    scrollport.scrollLeft = 50_000
    fireEvent.scroll(scrollport)
    scrollport.scrollLeft = 51_000
    fireEvent.scroll(scrollport)

    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(canvas.style.left).toBe('0px')
    act(() => pendingFrames.shift()?.(0))
    expect(canvas.style.left).toBe('51000px')
    expect(canvas.width).toBe(1_200 - LANE_HEAD_WIDTH_PX)
  })

  it('draws placement duration at the shared timeline scale', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 480, height: 44, top: 0, right: 480, bottom: 44, left: 0,
      toJSON: () => ({})
    })
    render(
      <LaneSampleBubbleCanvas
        placements={[{ ...PLACEMENTS[0]!, durationSeconds: 1 }]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    expect(mockCtx.rect).toHaveBeenCalledWith(8, expect.any(Number), 104, 33)
  })

  it('draws a flash overlay when flashSamplePath matches a placement', () => {
    render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath="kick.wav"
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    // The flash path sets globalAlpha to 0.4 then back to 1.0
    expect(mockCtx.globalAlpha).toBe(1.0)
    // fill called at least 3 times: body, flash overlay, border
    expect(mockCtx.fill.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('draws missing samples with a clipped diagonal hatch', () => {
    render(
      <LaneSampleBubbleCanvas
        placements={[PLACEMENTS[0]!]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        missingSamplePaths={new Set(['kick.wav'])}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    expect(mockCtx.save).toHaveBeenCalled()
    expect(mockCtx.clip).toHaveBeenCalled()
    expect(mockCtx.moveTo).toHaveBeenCalled()
    expect(mockCtx.lineTo).toHaveBeenCalled()
    expect(mockCtx.restore).toHaveBeenCalled()
  })

  it('uses the placement color or falls back to the accent CSS variable', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={[PLACEMENTS[1]!]} // placement without explicit color
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const canvas = container.querySelector('canvas')!
    const ctx = canvas.getContext('2d')! as unknown as { fillStyle: string }
    expect(ctx.fillStyle).toBeDefined()
  })

  it('falls back to the accent when a saved palette slot no longer exists', () => {
    const fillStyles: string[] = []
    mockCtx.fill.mockImplementation(() => { fillStyles.push(mockCtx.fillStyle) })
    render(
      <LaneSampleBubbleCanvas
        placements={[{ ...PLACEMENTS[0]!, slot: 99 }]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    expect(fillStyles).toContain(
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    )
  })

  it('calls onPlacementContextMenu with placement info on right-click', () => {
    const onCtx = vi.fn()
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={3}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={onCtx}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')!
    fireEvent.contextMenu(el)

    expect(onCtx).toHaveBeenCalledTimes(1)
    const info = onCtx.mock.calls[0]![0]
    expect(info.laneIndex).toBe(3)
    // In jsdom, canvas has 0 width so hitTest returns the first placement
    expect(info.placementId).toBe('placement-1')
    expect(info.samplePath).toBe('kick.wav')
  })

  it('does not call onPlacementContextMenu when there are no placements', () => {
    const onCtx = vi.fn()
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={[]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={onCtx}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')!
    fireEvent.contextMenu(el)

    expect(onCtx).not.toHaveBeenCalled()
  })

  it('stores placement id on mouse down with left button', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })

    expect(el.dataset.dragPlacementId).toBe('placement-1')
  })

  it('ignores mouse down with non-left button', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 2 })

    expect(el.dataset.dragPlacementId).toBeUndefined()
  })

  it('calls onPlacementDragStart when drag starts after mouse down', () => {
    const onDrag = vi.fn()
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={onDrag}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })
    fireEvent.dragStart(el)

    expect(onDrag).toHaveBeenCalledTimes(1)
    expect(onDrag.mock.calls[0]![0]).toBe('placement-1')
  })

  it('sets a custom drag image showing only the grabbed sample bubble', () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 168, height: 44, top: 0, right: 168, bottom: 44, left: 0,
      toJSON: () => ({})
    })
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })
    mockCtx.fillText.mockClear()
    mockCtx.rect.mockClear()

    const setDragImage = vi.fn()
    fireEvent.dragStart(el, { dataTransfer: { setDragImage } })

    expect(setDragImage).toHaveBeenCalledTimes(1)
    const ghost = setDragImage.mock.calls[0]![0]
    expect(ghost).toBeInstanceOf(HTMLCanvasElement)
    expect(document.body.contains(ghost)).toBe(true)
    // The drag-image canvas keeps a 48px usable surface, but the sample bubble
    // inside it retains the canonical 16 ticks * 2.625px/tick = 42px width.
    expect(ghost.style.width).toBe('48px')
    expect(mockCtx.rect).toHaveBeenCalledWith(8, 0, 26, 33)
    // The ghost renders only the grabbed bubble's label, not the lane's other placements
    expect(mockCtx.fillText).toHaveBeenCalledWith('kick.wav', expect.any(Number), expect.any(Number))
    expect(mockCtx.fillText).not.toHaveBeenCalledWith('snare.wav', expect.any(Number), expect.any(Number))

    // The helper element is cleaned up right after the browser snapshots it
    vi.runAllTimers()
    expect(document.body.contains(ghost)).toBe(false)
    vi.useRealTimers()
  })

  it('adds a count badge to the drag image for group drags', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set(['placement-1', 'placement-2'])}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })
    mockCtx.fillText.mockClear()

    fireEvent.dragStart(el, { dataTransfer: { setDragImage: vi.fn() } })

    expect(mockCtx.fillText).toHaveBeenCalledWith('×2', expect.any(Number), expect.any(Number))
  })

  it('prevents default on drag start when no placement was mouse-downed', () => {
    const onDrag = vi.fn()
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={onDrag}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    // Drag without a prior mouse-down: no placement id is stored
    fireEvent.dragStart(el)

    expect(onDrag).not.toHaveBeenCalled()
  })

  it('uses spatial hit-test when the lane container has non-zero width', () => {
    const onCtx = vi.fn()
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={onCtx}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40, x: 0, y: 0,
      toJSON: () => ({})
    } as DOMRect)

    // clientX=10 falls within placement hit rects (x=0, width=48)
    fireEvent.contextMenu(el, { clientX: 10 })

    expect(onCtx).toHaveBeenCalledTimes(1)
    // Iterating from end, placement-2 is found first
    expect(onCtx.mock.calls[0]![0].placementId).toBe('placement-2')
  })

  it('returns null from spatial hit-test when clientX misses all placements', () => {
    const onCtx = vi.fn()
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={onCtx}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40, x: 0, y: 0,
      toJSON: () => ({})
    } as DOMRect)

    // clientX=100 is outside all placement hit rects (max x+width = 48)
    fireEvent.contextMenu(el, { clientX: 100 })

    expect(onCtx).not.toHaveBeenCalled()
  })

  it('draws selection highlight border when a placement is selected', () => {
    // Use one placement so its selection highlight is the last drawing operation
    render(
      <LaneSampleBubbleCanvas
        placements={[PLACEMENTS[0]!]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set(['placement-1'])}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    // Selection highlight strokes with the theme's --sample-bubble-select token (not a
    // hardcoded white, which would be invisible against a white sample bubble/accent
    // in themes like Club PA) and lineWidth 2. Since placement-1 is the only placement
    // and is selected, the last stroke call is the selection border.
    expect(mockCtx.strokeStyle).toBe('#FDE047')
    expect(mockCtx.lineWidth).toBe(2)
  })

  it('ignores Ctrl+click on mousedown (rectangle-select handled at PlayerView level)', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0, ctrlKey: true })

    expect(el.dataset.dragPlacementId).toBeUndefined()
  })

  it('stops propagation on mousedown when the placement is already selected', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set(['placement-1'])}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    const event = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true })
    const stopSpy = vi.spyOn(event, 'stopPropagation')
    el.dispatchEvent(event)

    expect(stopSpy).toHaveBeenCalled()
  })

  it('does not stop propagation on mousedown when the placement is not selected', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set(['placement-2'])}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    const event = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true })
    const stopSpy = vi.spyOn(event, 'stopPropagation')
    el.dispatchEvent(event)

    expect(stopSpy).not.toHaveBeenCalled()
  })

  it('calls onPlacementDragStart without custom drag image when dataTransfer lacks setDragImage', () => {
    const onDrag = vi.fn()
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={onDrag}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })
    // Fire dragstart with dataTransfer that has no setDragImage
    fireEvent.dragStart(el, { dataTransfer: {} })

    expect(onDrag).toHaveBeenCalledTimes(1)
    expect(onDrag.mock.calls[0]![0]).toBe('placement-1')
  })

  it('clears stale drag data on fresh mousedown when no placement is hit', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={[]}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    // Simulate stale state
    el.dataset.dragPlacementId = 'old-placement'
    el.dataset.dragGrabX = '10'

    fireEvent.mouseDown(el, { button: 0 })

    // Stale data cleared because no placement was hit
    expect(el.dataset.dragPlacementId).toBeUndefined()
    expect(el.dataset.dragGrabX).toBeUndefined()
  })

  it('stores grabX offset relative to the placement position on mousedown', () => {
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={vi.fn()}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 0, right: 300, bottom: 40, width: 200, height: 40, x: 100, y: 0,
      toJSON: () => ({})
    } as DOMRect)

    fireEvent.mouseDown(el, { button: 0, clientX: 110 })

    // Spatial hit-test iterates from end, finds placement-2 first
    expect(el.dataset.dragPlacementId).toBe('placement-2')
    expect(el.dataset.dragGrabX).toBeDefined()
  })

  it('skips custom drag image gracefully when ghost canvas getContext returns null', () => {
    const onDrag = vi.fn()
    const { container } = render(
      <LaneSampleBubbleCanvas
        placements={PLACEMENTS}
        totalTicks={64}
        laneIndex={0}
        flashSamplePath={null}
        selectedPlacementIds={new Set()}
        onPlacementDragStart={onDrag}
        onPlacementContextMenu={vi.fn()}
      />
    )

    const el = container.querySelector('.lane-sample-bubble-canvas-container')! as HTMLElement
    fireEvent.mouseDown(el, { button: 0 })

    // The lane canvas already got its context during render; from here on only
    // the ghost canvas calls getContext, so returning null simulates its failure.
    const origGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null)

    const setDragImage = vi.fn()
    fireEvent.dragStart(el, { dataTransfer: { setDragImage } })

    // onPlacementDragStart still fires even when ghost is null
    expect(onDrag).toHaveBeenCalledTimes(1)
    // setDragImage is NOT called because ghost is null
    expect(setDragImage).not.toHaveBeenCalled()

    HTMLCanvasElement.prototype.getContext = origGetContext
  })
})
