import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'

interface SongProgressBarProps {
  scrollportRef: RefObject<HTMLDivElement>
  scrollportId: string
}

interface ScrollMetrics {
  clientWidth: number
  scrollWidth: number
  scrollLeft: number
  maxScroll: number
}

interface PointerDrag {
  pointerId: number
  startClientX: number
  startScrollLeft: number
  thumbTravel: number
  maxScroll: number
}

const EMPTY_METRICS: ScrollMetrics = {
  clientWidth: 0,
  scrollWidth: 0,
  scrollLeft: 0,
  maxScroll: 0
}

function readScrollMetrics(scrollport: HTMLDivElement): ScrollMetrics {
  const clientWidth = Math.max(0, scrollport.clientWidth)
  const scrollWidth = Math.max(clientWidth, scrollport.scrollWidth)
  const maxScroll = Math.max(0, scrollWidth - clientWidth)
  const scrollLeft = Math.min(maxScroll, Math.max(0, scrollport.scrollLeft))
  return { clientWidth, scrollWidth, scrollLeft, maxScroll }
}

export default function SongProgressBar({ scrollportRef, scrollportId }: SongProgressBarProps) {
  const [metrics, setMetrics] = useState<ScrollMetrics>(EMPTY_METRICS)
  const metricsRef = useRef(metrics)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<PointerDrag | null>(null)

  const syncMetrics = useCallback(() => {
    const scrollport = scrollportRef.current
    if (!scrollport) return
    const next = readScrollMetrics(scrollport)
    metricsRef.current = next
    setMetrics((current) => (
      current.clientWidth === next.clientWidth &&
      current.scrollWidth === next.scrollWidth &&
      current.scrollLeft === next.scrollLeft &&
      current.maxScroll === next.maxScroll
        ? current
        : next
    ))
  }, [scrollportRef])

  useEffect(() => {
    const scrollport = scrollportRef.current
    if (!scrollport) return

    syncMetrics()
    scrollport.addEventListener('scroll', syncMetrics, { passive: true })
    const resizeObserver = new ResizeObserver(syncMetrics)
    resizeObserver.observe(scrollport)
    if (scrollport.firstElementChild) resizeObserver.observe(scrollport.firstElementChild)

    return () => {
      scrollport.removeEventListener('scroll', syncMetrics)
      resizeObserver.disconnect()
    }
  }, [scrollportRef, syncMetrics])

  const setScrollPosition = useCallback((position: number) => {
    const scrollport = scrollportRef.current
    if (!scrollport) return
    const { maxScroll } = readScrollMetrics(scrollport)
    scrollport.scrollLeft = Math.min(maxScroll, Math.max(0, position))
    syncMetrics()
  }, [scrollportRef, syncMetrics])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = metricsRef.current
    if (current.maxScroll <= 0) return

    const arrowStep = Math.max(42, current.clientWidth / 10)
    const pageStep = Math.max(42, current.clientWidth * 0.9)
    let next: number
    switch (event.key) {
      case 'ArrowLeft':
        next = current.scrollLeft - arrowStep
        break
      case 'ArrowRight':
        next = current.scrollLeft + arrowStep
        break
      case 'PageUp':
        next = current.scrollLeft - pageStep
        break
      case 'PageDown':
        next = current.scrollLeft + pageStep
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = current.maxScroll
        break
      default:
        return
    }
    event.preventDefault()
    setScrollPosition(next)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = metricsRef.current
    if (event.button !== 0 || current.maxScroll <= 0) return

    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const trackWidth = rect.width
    if (!(trackWidth > 0)) return

    const visibleFraction = current.scrollWidth > 0
      ? Math.min(1, current.clientWidth / current.scrollWidth)
      : 1
    const thumbTravel = trackWidth * (1 - visibleFraction)
    const targetIsThumb = event.target instanceof Element &&
      event.target.classList.contains('song-progress-thumb')
    const nextScrollLeft = targetIsThumb
      ? current.scrollLeft
      : Math.min(1, Math.max(0, (event.clientX - rect.left) / trackWidth)) * current.maxScroll

    if (!targetIsThumb) setScrollPosition(nextScrollLeft)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: nextScrollLeft,
      thumbTravel,
      maxScroll: current.maxScroll
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !(drag.thumbTravel > 0)) return
    const delta = event.clientX - drag.startClientX
    setScrollPosition(drag.startScrollLeft + delta / drag.thumbTravel * drag.maxScroll)
  }

  const endPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const disabled = metrics.maxScroll <= 0
  const visibleFraction = metrics.scrollWidth > 0
    ? Math.min(1, metrics.clientWidth / metrics.scrollWidth)
    : 1
  const thumbWidthPercent = visibleFraction * 100
  const thumbLeftPercent = metrics.scrollWidth > 0
    ? metrics.scrollLeft / metrics.scrollWidth * 100
    : 0
  const roundedPosition = Math.round(metrics.scrollLeft)
  const roundedMaximum = Math.round(metrics.maxScroll)

  return (
    <div
      className="song-progress-bar"
      role="scrollbar"
      aria-label="Song Progress Bar"
      aria-controls={scrollportId}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={roundedMaximum}
      aria-valuenow={roundedPosition}
      aria-valuetext={`${roundedPosition} of ${roundedMaximum} pixels`}
      aria-disabled={disabled}
      data-disabled={disabled ? 'true' : 'false'}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerDrag}
      onPointerCancel={endPointerDrag}
    >
      <div className="song-progress-track" ref={trackRef} aria-hidden="true">
        <div
          className="song-progress-thumb"
          style={{ left: `${thumbLeftPercent}%`, width: `${thumbWidthPercent}%` }}
        />
      </div>
    </div>
  )
}
