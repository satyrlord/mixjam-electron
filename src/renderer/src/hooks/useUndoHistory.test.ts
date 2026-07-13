import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUndoHistory } from './useUndoHistory'

describe('useUndoHistory', () => {
  it('pushEdit no-ops when the edit returns the same reference', () => {
    const initial = { value: 1 }
    const { result } = renderHook(() => useUndoHistory(initial))

    // Return the exact same object — should short-circuit without pushing to history.
    act(() => { result.current.pushEdit((prev) => prev) })

    expect(result.current.current).toBe(initial)
    expect(result.current.canUndo).toBe(false)
  })

  it('trims past history when exceeding the limit', () => {
    const { result } = renderHook(() => useUndoHistory(0, 3))

    // Push 4 edits (limit is 3 — the 4th push trims the oldest from past).
    act(() => { result.current.pushEdit(() => 1) })
    act(() => { result.current.pushEdit(() => 2) })
    act(() => { result.current.pushEdit(() => 3) })
    act(() => { result.current.pushEdit(() => 4) })

    expect(result.current.current).toBe(4)
    // Undo 3 times should bring us to 1 (oldest undo entry after trimming).
    act(() => { result.current.undo() })
    expect(result.current.current).toBe(3)
    act(() => { result.current.undo() })
    expect(result.current.current).toBe(2)
    act(() => { result.current.undo() })
    expect(result.current.current).toBe(1)
    // No more undo available — the initial 0 was trimmed.
    expect(result.current.canUndo).toBe(false)
  })

  it('undo does nothing when history is empty', () => {
    const { result } = renderHook(() => useUndoHistory('start'))
    act(() => { result.current.undo() })
    expect(result.current.current).toBe('start')
  })

  it('redo does nothing when future is empty', () => {
    const { result } = renderHook(() => useUndoHistory('start'))
    act(() => { result.current.redo() })
    expect(result.current.current).toBe('start')
  })

  it('setCurrent does not push to undo history', () => {
    const { result } = renderHook(() => useUndoHistory(0))
    act(() => { result.current.setCurrent(5) })
    expect(result.current.current).toBe(5)
    expect(result.current.canUndo).toBe(false)
  })

  it('pushEdit clears future on new edit after undo', () => {
    const { result } = renderHook(() => useUndoHistory(0))
    act(() => { result.current.pushEdit(() => 1) })
    act(() => { result.current.pushEdit(() => 2) })
    act(() => { result.current.undo() })
    expect(result.current.canRedo).toBe(true)
    // A new edit after undo clears redo history.
    act(() => { result.current.pushEdit(() => 99) })
    expect(result.current.canRedo).toBe(false)
    expect(result.current.current).toBe(99)
  })

  it('reset replaces the document and clears both undo and redo history', () => {
    const { result } = renderHook(() => useUndoHistory(0))
    act(() => { result.current.pushEdit(() => 1) })
    act(() => { result.current.pushEdit(() => 2) })
    act(() => { result.current.undo() })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(true)

    act(() => { result.current.reset(42) })

    expect(result.current.current).toBe(42)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})
