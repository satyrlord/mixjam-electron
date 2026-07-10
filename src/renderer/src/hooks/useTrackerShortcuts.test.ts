import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTrackerShortcuts } from './useTrackerShortcuts'
import type { RuntimeTransportState } from './useTransportRuntime'

function createRef<T>(initial: T): React.MutableRefObject<T> {
  return { current: initial }
}

function fireKeyDown(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('useTrackerShortcuts', () => {
  let selectedPlacementIdsRef: React.MutableRefObject<ReadonlySet<string>>
  let transportStateRef: React.MutableRefObject<RuntimeTransportState>
  let clearSelection: ReturnType<typeof vi.fn<() => void>>
  let onRemovePlacements: ReturnType<typeof vi.fn<(placementIds: string[]) => void>>
  let onUndo: ReturnType<typeof vi.fn<() => void>>
  let onRedo: ReturnType<typeof vi.fn<() => void>>
  let onTransportPlay: ReturnType<typeof vi.fn<() => void>>
  let onTransportPause: ReturnType<typeof vi.fn<() => void>>
  let onTransportStop: ReturnType<typeof vi.fn<() => void>>
  let onOpenShortcuts: ReturnType<typeof vi.fn<() => void>>

  function mount() {
    return renderHook(() =>
      useTrackerShortcuts({
        selectedPlacementIdsRef,
        clearSelection,
        transportStateRef,
        onRemovePlacements,
        onUndo,
        onRedo,
        onTransportPlay,
        onTransportPause,
        onTransportStop,
        onOpenShortcuts
      })
    )
  }

  beforeEach(() => {
    selectedPlacementIdsRef = createRef(new Set<string>())
    transportStateRef = createRef('stopped')
    clearSelection = vi.fn<() => void>()
    onRemovePlacements = vi.fn<(placementIds: string[]) => void>()
    onUndo = vi.fn<() => void>()
    onRedo = vi.fn<() => void>()
    onTransportPlay = vi.fn<() => void>()
    onTransportPause = vi.fn<() => void>()
    onTransportStop = vi.fn<() => void>()
    onOpenShortcuts = vi.fn<() => void>()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Delete key ──

  it('calls onRemovePlacements and clearSelection on Delete when placements are selected', () => {
    selectedPlacementIdsRef.current = new Set(['placement-1', 'placement-2'])
    mount()

    fireKeyDown('Delete')

    expect(onRemovePlacements).toHaveBeenCalledWith(['placement-1', 'placement-2'])
    expect(clearSelection).toHaveBeenCalledTimes(1)
  })

  it('does nothing on Delete when no placements are selected', () => {
    selectedPlacementIdsRef.current = new Set()
    mount()

    fireKeyDown('Delete')

    expect(onRemovePlacements).not.toHaveBeenCalled()
    expect(clearSelection).not.toHaveBeenCalled()
  })

  // ── Undo / Redo ──

  it('calls onUndo on Ctrl+Z', () => {
    mount()

    fireKeyDown('z', { ctrlKey: true })

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).not.toHaveBeenCalled()
  })

  it('calls onRedo on Ctrl+Shift+Z', () => {
    mount()

    fireKeyDown('z', { ctrlKey: true, shiftKey: true })

    expect(onRedo).toHaveBeenCalledTimes(1)
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('calls onRedo on Ctrl+Y', () => {
    mount()

    fireKeyDown('y', { ctrlKey: true })

    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('does not call onUndo when Ctrl+Z has Alt modifier', () => {
    mount()

    fireKeyDown('z', { ctrlKey: true, altKey: true })

    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
  })

  // ── Space (play / pause) ──

  it('calls onTransportPlay on Space when stopped', () => {
    transportStateRef.current = 'stopped'
    mount()

    fireKeyDown(' ')

    expect(onTransportPlay).toHaveBeenCalledTimes(1)
    expect(onTransportPause).not.toHaveBeenCalled()
  })

  it('calls onTransportPause on Space when playing', () => {
    transportStateRef.current = 'playing'
    mount()

    fireKeyDown(' ')

    expect(onTransportPause).toHaveBeenCalledTimes(1)
    expect(onTransportPlay).not.toHaveBeenCalled()
  })

  it('cancels preparation on Space while preparing', () => {
    transportStateRef.current = 'preparing'
    mount()

    fireKeyDown(' ')

    expect(onTransportStop).toHaveBeenCalledTimes(1)
    expect(onTransportPlay).not.toHaveBeenCalled()
    expect(onTransportPause).not.toHaveBeenCalled()
  })

  it('does not fire Space when Ctrl is held', () => {
    transportStateRef.current = 'stopped'
    mount()

    fireKeyDown(' ', { ctrlKey: true })

    expect(onTransportPlay).not.toHaveBeenCalled()
  })

  // ── ? (shortcuts overlay) ──

  it('calls onOpenShortcuts on ? key', () => {
    mount()

    fireKeyDown('?')

    expect(onOpenShortcuts).toHaveBeenCalledTimes(1)
  })

  // ── Editable target suppression ──

  it('suppresses Delete when target is an INPUT', () => {
    selectedPlacementIdsRef.current = new Set(['placement-1'])
    mount()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    document.body.removeChild(input)

    expect(onRemovePlacements).not.toHaveBeenCalled()
  })

  it('suppresses Space when target is a TEXTAREA', () => {
    transportStateRef.current = 'stopped'
    mount()

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    document.body.removeChild(textarea)

    expect(onTransportPlay).not.toHaveBeenCalled()
  })

  it('suppresses Ctrl+Z when target is a SELECT', () => {
    mount()

    const select = document.createElement('select')
    document.body.appendChild(select)
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    document.body.removeChild(select)

    expect(onUndo).not.toHaveBeenCalled()
  })

  it('suppresses shortcuts when target is contentEditable', () => {
    mount()

    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    // jsdom does not natively derive isContentEditable from the attribute, so
    // stub it on the instance.
    Object.defineProperty(div, 'isContentEditable', { value: true, writable: true })
    document.body.appendChild(div)
    div.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    document.body.removeChild(div)

    expect(onOpenShortcuts).not.toHaveBeenCalled()
  })

  it('does not suppress shortcuts when target is not an HTMLElement', () => {
    selectedPlacementIdsRef.current = new Set(['placement-1'])
    mount()

    // Dispatch directly on window — window is not an HTMLElement, so
    // isEditableTarget returns false and the shortcut fires normally.
    fireKeyDown('Delete')

    expect(onRemovePlacements).toHaveBeenCalledWith(['placement-1'])
  })

  // ── Cleanup on unmount ──

  it('stops listening after unmount', () => {
    const { unmount } = mount()

    unmount()

    fireKeyDown('z', { ctrlKey: true })
    expect(onUndo).not.toHaveBeenCalled()
  })

  // ── Handlers read latest refs ──

  it('reads updated ref values without re-subscribing', () => {
    const { rerender } = mount()

    // Initially no placements selected
    fireKeyDown('Delete')
    expect(onRemovePlacements).not.toHaveBeenCalled()

    // Update the ref to have placements (simulating a selection change)
    selectedPlacementIdsRef.current = new Set(['placement-3'])

    // Rerender with new ref — the hook reads refs, so it should pick up the change
    rerender()

    fireKeyDown('Delete')
    expect(onRemovePlacements).toHaveBeenCalledWith(['placement-3'])
    expect(clearSelection).toHaveBeenCalledTimes(1)
  })
})
