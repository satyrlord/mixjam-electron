import { useEffect } from 'react'

interface ShortcutEntry {
  keys: string
  action: string
}

interface ShortcutSection {
  title: string
  entries: ShortcutEntry[]
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Transport',
    entries: [
      { keys: 'Space', action: 'Play / pause' },
      { keys: 'Ctrl+Z', action: 'Undo clip edit' },
      { keys: 'Ctrl+Y / Ctrl+Shift+Z', action: 'Redo clip edit' }
    ]
  },
  {
    title: 'Clips',
    entries: [
      { keys: 'Drag tile onto a lane', action: 'Place sample (snaps to beat)' },
      { keys: 'Alt+Drop', action: 'Freeform placement — no beat snap' },
      { keys: 'Shift+Drop', action: 'Duplicate instead of move' },
      { keys: 'Ctrl+Drag on lanes', action: 'Rectangle-select clips' },
      { keys: 'Delete', action: 'Remove selected clips' },
      { keys: 'Right-click clip', action: 'Delete / locate in browser' }
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
      { keys: '?', action: 'Show this overlay' },
      { keys: 'Esc', action: 'Close' }
    ]
  }
]

interface ShortcutsOverlayProps {
  onClose: () => void
}

/** Modal listing every keyboard and mouse shortcut. Opened from the "?" button
 *  in the middle strip or the "?" key; closed by Esc, the close button, or a
 *  click on the backdrop. */
export default function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div
        className="shortcuts-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-head">
          <h2 className="shortcuts-title">Keyboard Shortcuts</h2>
          <button
            type="button"
            className="shortcuts-close"
            aria-label="Close shortcuts"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="shortcuts-sections">
          {SHORTCUT_SECTIONS.map((section) => (
            <section key={section.title} className="shortcuts-section">
              <h3 className="shortcuts-section-title">{section.title}</h3>
              <dl className="shortcuts-list">
                {section.entries.map((entry) => (
                  <div key={entry.keys} className="shortcuts-entry">
                    <dt className="shortcuts-keys">{entry.keys}</dt>
                    <dd className="shortcuts-action">{entry.action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
