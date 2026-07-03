import { useCallback, useRef, useState } from 'react'

/** A generic undo/redo stack for immutable snapshots. Accepts an initial value
 *  so `current` and `currentRef` are never null after construction. */
export function useUndoHistory<T>(initialValue: T, limit = 100) {
  const historyRef = useRef<{ past: T[]; future: T[] }>({ past: [], future: [] })
  const [current, setCurrent] = useState<T>(initialValue)
  const currentRef = useRef<T>(initialValue)

  /** Applies an edit as one undoable step. Returns the new value. */
  const pushEdit = useCallback(
    (edit: (prev: T) => T) => {
      const prev = currentRef.current
      const next = edit(prev)
      if (next === prev) return prev

      const history = historyRef.current
      history.past.push(prev)
      if (history.past.length > limit) history.past.shift()
      history.future = []

      currentRef.current = next
      setCurrent(next)
      return next
    },
    [limit]
  )

  const undo = useCallback(() => {
    const history = historyRef.current
    const previous = history.past.pop()
    if (!previous) return
    history.future.push(currentRef.current)
    currentRef.current = previous
    setCurrent(previous)
  }, [])

  const redo = useCallback(() => {
    const history = historyRef.current
    const next = history.future.pop()
    if (!next) return
    history.past.push(currentRef.current)
    currentRef.current = next
    setCurrent(next)
  }, [])

  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0

  /** Directly sets the current value without pushing to undo history — used
   *  for non-undoable state changes like mute/solo/pan toggles. */
  const setCurrentValue = useCallback((value: T) => {
    currentRef.current = value
    setCurrent(value)
  }, [])

  return { current, currentRef, pushEdit, setCurrent: setCurrentValue, undo, redo, canUndo, canRedo }
}
