import { useEffect, useRef } from 'react'

/** True when the event originates in a text-entry control, where global
 *  shortcuts (Space, Delete, Ctrl+Z…) must not fire. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

interface TrackerShortcutHandlers {
  /** Mutable ref so the handler never re-subscribes on selection changes. */
  selectedClipIdsRef: React.MutableRefObject<ReadonlySet<string>>
  clearSelection: () => void
  transportStateRef: React.MutableRefObject<string>
  onRemoveClips: (clipIds: string[]) => void
  onUndo: () => void
  onRedo: () => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onOpenShortcuts: () => void
}

/**
 * Installs a single global keydown listener for tracker-level shortcuts:
 * Delete (remove selection), Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (undo/redo),
 * Space (play/pause), and "?" (shortcuts overlay). All handlers are read
 * through a stable ref so the effect subscribes exactly once per mount.
 *
 * Extracted from TrackerView to keep that component under 1k lines and to
 * isolate shortcut policy from rendering concerns.
 */
export function useTrackerShortcuts(handlers: TrackerShortcutHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const h = handlersRef.current

      if (e.key === 'Delete') {
        const ids = h.selectedClipIdsRef.current
        if (ids.size === 0) return
        h.onRemoveClips([...ids])
        h.clearSelection()
        return
      }
      if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) h.onRedo()
        else h.onUndo()
        return
      }
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        h.onRedo()
        return
      }
      if (e.key === ' ' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        if (h.transportStateRef.current === 'playing') h.onTransportPause()
        else h.onTransportPlay()
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        h.onOpenShortcuts()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
