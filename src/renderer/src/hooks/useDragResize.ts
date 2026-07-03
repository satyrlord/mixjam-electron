import { useCallback, useRef, useEffect } from 'react'

/** Returns an onMouseDown handler that drives a window-level drag. The
 *  `captureStart` callback runs at mousedown and its return value is passed to
 *  every `onDelta(dx, dy, start)` call so the caller can capture state (e.g.
 *  a flex ratio, a CSS custom property) at the moment the drag begins. The
 *  drag is automatically cleaned up on component unmount. */
export function useDragResize<T>(
  captureStart: (e: React.MouseEvent) => T,
  onDelta: (dx: number, dy: number, start: T) => void,
  onEnd?: () => void
): (e: React.MouseEvent) => void {
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => cleanupRef.current?.()
  }, [])

  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startY = e.clientY
      const start = captureStart(e)

      const onMove = (moveEvent: MouseEvent) => {
        onDelta(moveEvent.clientX - startX, moveEvent.clientY - startY, start)
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        cleanupRef.current = null
        onEnd?.()
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      cleanupRef.current = onUp
    },
    [captureStart, onDelta, onEnd]
  )
}
