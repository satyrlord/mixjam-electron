import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTrackerShortcuts } from './useTrackerShortcuts'

function createRef<T>(initial: T): React.MutableRefObject<T> {
  return { current: initial }
}

function fireKeyDown(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('useTrackerShortcuts', () => {
  let selectedClipIdsRef: React.MutableRefObject<ReadonlySet<string>>
  let transportStateRef: React.MutableRefObject<string>
  let clearSelection: ReturnType<typeof vi.fn>
  let onRemoveClips: ReturnType<typeof vi.fn>
  let onUndo: ReturnType<typeof vi.fn>
  let onRedo: ReturnType<typeof vi.fn>
  let onTransportPlay: ReturnType<typeof vi.fn>
  let onTransportPause: ReturnType<typeof vi.fn>
  let onOpenShortcuts: ReturnType<typeof vi.fn>

  function mount() {
    return renderHook(() =>
      useTrackerShortcuts({
        selectedClipIdsRef,
        clearSelection,
        transportStateRef,
        onRemoveClips,
        onUndo,
        onRedo,
        onTransportPlay,
        onTransportPause,
        onOpenShortcuts
      })
    )
  }

  beforeEach(() => {
    selectedClipIdsRef = createRef(new Set<string>())
    transportStateRef = createRef('stopped')
    clearSelection = vi.fn()
    onRemoveClips = vi.fn()
    onUndo = vi.fn()
    onRedo = vi.fn()
    onTransportPlay = vi.fn()
    onTransportPause = vi.fn()
    onOpenShortcuts = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Delete key ──

  it('calls onRemoveClips and clearSelection on Delete when clips are selected', () => {
    selectedClipIdsRef.current = new Set(['clip-1', 'clip-2'])
    mount()

    fireKeyDown('Delete')

    expect(onRemoveClips).toHaveBeenCalledWith(['clip-1', 'clip-2'])
    expect(clearSelection).toHaveBeenCalledTimes(1)
  })

  it('does nothing on Delete when no clips are selected', () => {
    selectedClipIdsRef.current = new Set()
    mount()

    fireKeyDown('Delete')

    expect(onRemoveClips).not.toHaveBeenCalled()
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
    selectedClipIdsRef.current = new Set(['clip-1'])
    mount()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    document.body.removeChild(input)

    expect(onRemoveClips).not.toHaveBeenCalled()
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
    selectedClipIdsRef.current = new Set(['clip-1'])
    mount()

    // Dispatch directly on window — window is not an HTMLElement, so
    // isEditableTarget returns false and the shortcut fires normally.
    fireKeyDown('Delete')

    expect(onRemoveClips).toHaveBeenCalledWith(['clip-1'])
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

    // Initially no clips selected
    fireKeyDown('Delete')
    expect(onRemoveClips).not.toHaveBeenCalled()

    // Update the ref to have clips (simulating a selection change)
    selectedClipIdsRef.current = new Set(['clip-3'])

    // Rerender with new ref — the hook reads refs, so it should pick up the change
    rerender()

    fireKeyDown('Delete')
    expect(onRemoveClips).toHaveBeenCalledWith(['clip-3'])
    expect(clearSelection).toHaveBeenCalledTimes(1)
  })
})
