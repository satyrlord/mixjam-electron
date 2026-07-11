import { useCallback, useRef, useEffect } from 'react'

/**
 * Tracks window-level mouse listeners for every in-progress drag (rectangle
 * select, splitter, pan knobs, placement drag) so they are torn down if the
 * owning component unmounts mid-drag (e.g. the user navigates Home while
 * still holding the mouse button).
 */
export function useDragCleanups() {
  const cleanups = useRef(new Set<() => void>())

  const track = useCallback((cleanup: () => void) => {
    cleanups.current.add(cleanup)
    return () => { cleanups.current.delete(cleanup) }
  }, [])

  useEffect(() => {
    const saved = cleanups.current
    return () => {
      for (const cleanup of [...saved]) cleanup()
      saved.clear()
    }
  }, [])

  return track
}
