import { useCallback, useRef, useState } from 'react'

/** A generic undo/redo stack for immutable snapshots. Accepts an initial value
 *  so `current` and `currentRef` are never null after construction. */
export function useUndoHistory<T>(initialValue: T, limit = 100) {
  const historyRef = useRef<{ past: T[]; future: T[] }>({ past: [], future: [] })
  const [current, setCurrent] = useState<T>(initialValue)
  const [, setHistoryRevision] = useState(0)
  const currentRef = useRef<T>(initialValue)
  const groupStartRef = useRef<{ value: T; changed: boolean } | null>(null)

  const appendPast = useCallback((value: T) => {
    const history = historyRef.current
    history.past.push(value)
    if (history.past.length > limit) history.past.shift()
    history.future = []
  }, [limit])

  /** Applies an edit as one undoable step. Returns the new value. */
  const pushEdit = useCallback(
    (edit: (prev: T) => T) => {
      const group = groupStartRef.current
      if (group) {
        groupStartRef.current = null
        if (group.changed) appendPast(group.value)
      }
      const prev = currentRef.current
      const next = edit(prev)
      if (next === prev) {
        if (group?.changed) setHistoryRevision((revision) => revision + 1)
        return prev
      }

      appendPast(prev)
      currentRef.current = next
      setCurrent(next)
      return next
    },
    [appendPast]
  )

  /** Starts a continuous edit. Repeated calls keep the first snapshot. */
  const beginGroup = useCallback(() => {
    groupStartRef.current ??= { value: currentRef.current, changed: false }
  }, [])

  /** Publishes a live edit. Outside a group it is an ordinary undoable edit. */
  const applyGroupedEdit = useCallback((edit: (prev: T) => T) => {
    if (groupStartRef.current === null) return pushEdit(edit)
    const prev = currentRef.current
    const next = edit(prev)
    if (next === prev) return prev
    groupStartRef.current.changed = true
    currentRef.current = next
    setCurrent(next)
    return next
  }, [pushEdit])

  /** Applies a state synchronization that is not a user-authored history step. */
  const synchronize = useCallback((edit: (prev: T) => T) => {
    const prev = currentRef.current
    const next = edit(prev)
    const group = groupStartRef.current
    if (group) group.value = edit(group.value)
    if (next !== prev) {
      currentRef.current = next
      setCurrent(next)
    }
    return next
  }, [])

  /** Commits every live update since beginGroup as one undo entry. */
  const commitGroup = useCallback(() => {
    const group = groupStartRef.current
    if (group === null) return false
    groupStartRef.current = null
    if (!group.changed) return false
    appendPast(group.value)
    // Live edits already published the final value. Force a render so the
    // derived canUndo/canRedo flags include the new history entry.
    setHistoryRevision((revision) => revision + 1)
    return true
  }, [appendPast])

  const cancelGroup = useCallback(() => {
    const group = groupStartRef.current
    if (group === null) return false
    groupStartRef.current = null
    if (!group.changed) return false
    currentRef.current = group.value
    setCurrent(group.value)
    return true
  }, [])

  const undo = useCallback(() => {
    commitGroup()
    const history = historyRef.current
    const previous = history.past.pop()
    if (previous === undefined) return
    history.future.push(currentRef.current)
    currentRef.current = previous
    setCurrent(previous)
  }, [commitGroup])

  const redo = useCallback(() => {
    commitGroup()
    const history = historyRef.current
    const next = history.future.pop()
    if (next === undefined) return
    history.past.push(currentRef.current)
    currentRef.current = next
    setCurrent(next)
  }, [commitGroup])

  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0

  /** Replaces the document snapshot and clears every pending/history state. */
  const reset = useCallback((value: T) => {
    historyRef.current = { past: [], future: [] }
    groupStartRef.current = null
    currentRef.current = value
    setCurrent(value)
  }, [])

  return {
    current,
    currentRef,
    pushEdit,
    beginGroup,
    applyGroupedEdit,
    synchronize,
    commitGroup,
    cancelGroup,
    reset,
    undo,
    redo,
    canUndo,
    canRedo
  }
}
