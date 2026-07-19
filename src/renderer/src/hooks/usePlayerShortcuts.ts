import { useEffect, useRef } from 'react'
import type { RuntimeTransportState } from './useTransportRuntime'

interface ShortcutEntry {
  keys: string
  action: string
}

interface ShortcutSection {
  title: string
  entries: readonly ShortcutEntry[]
}

export const PLAYER_SHORTCUT_HINTS = Object.freeze({
  save: 'Ctrl+S',
  saveAs: 'Ctrl+Shift+S',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  playPause: 'Space',
  help: '?'
})

export const PLAYER_SHORTCUT_SECTIONS: readonly ShortcutSection[] = [
  {
    title: 'Project',
    entries: [
      { keys: PLAYER_SHORTCUT_HINTS.save, action: 'Save project' },
      { keys: PLAYER_SHORTCUT_HINTS.saveAs, action: 'Save project as' }
    ]
  },
  {
    title: 'Transport',
    entries: [
      { keys: PLAYER_SHORTCUT_HINTS.playPause, action: 'Play / pause / cancel preparation' },
      { keys: PLAYER_SHORTCUT_HINTS.undo, action: 'Undo placement edit' },
      { keys: 'Ctrl+Y / Ctrl+Shift+Z', action: 'Redo placement edit' }
    ]
  },
  {
    title: 'Placements',
    entries: [
      { keys: 'Drag tile onto a lane', action: 'Place sample (snaps to beat)' },
      { keys: 'Alt+Drop', action: 'Freeform placement — no beat snap' },
      { keys: 'Shift+Drop', action: 'Duplicate instead of move' },
      { keys: 'Ctrl+Drag on lanes', action: 'Rectangle-select placements' },
      { keys: 'Delete', action: 'Remove selected placements' },
      { keys: 'Right-click sample bubble', action: 'Delete / locate in browser' }
    ]
  },
  {
    title: 'Browser',
    entries: [
      { keys: 'Click tile', action: 'Preview sample (quantised while playing)' },
      { keys: 'Click category', action: 'Filter by category' }
    ]
  },
  {
    title: 'Help',
    entries: [
      { keys: PLAYER_SHORTCUT_HINTS.help, action: 'Show this overlay' },
      { keys: 'Esc', action: 'Close' }
    ]
  }
]

/** True when a global Player command must defer to a text-entry control. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

interface PlayerShortcutHandlers {
  selectedPlacementIdsRef: React.MutableRefObject<ReadonlySet<string>>
  clearSelection: () => void
  transportStateRef: React.MutableRefObject<RuntimeTransportState>
  projectBusyRef: React.MutableRefObject<boolean>
  onRemovePlacements: (placementIds: string[]) => void
  onUndo: () => void
  onRedo: () => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onTransportStop: () => void
  onSave: () => unknown
  onSaveAs: () => unknown
  onOpenShortcuts: () => void
}

/** Owns matching, suppression, and dispatch for every global Player command. */
export function usePlayerShortcuts(handlers: PlayerShortcutHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.body.dataset.mixjamModalBlocking === '1') return
      if (isEditableTarget(event.target)) return
      const current = handlersRef.current
      const primaryModifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (primaryModifier && !event.altKey && key === 's') {
        if (event.repeat || current.projectBusyRef.current) return
        event.preventDefault()
        if (event.shiftKey) void current.onSaveAs()
        else void current.onSave()
        return
      }
      if (event.key === 'Delete') {
        const ids = current.selectedPlacementIdsRef.current
        if (ids.size === 0) return
        current.onRemovePlacements([...ids])
        current.clearSelection()
        return
      }
      if (primaryModifier && !event.altKey && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) current.onRedo()
        else current.onUndo()
        return
      }
      if (primaryModifier && !event.altKey && !event.shiftKey && key === 'y') {
        event.preventDefault()
        current.onRedo()
        return
      }
      if (event.key === ' ' && !primaryModifier && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        if (current.transportStateRef.current === 'preparing') current.onTransportStop()
        else if (current.transportStateRef.current === 'playing') current.onTransportPause()
        else current.onTransportPlay()
        return
      }
      if (event.key === '?' && !primaryModifier && !event.altKey) {
        event.preventDefault()
        current.onOpenShortcuts()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
