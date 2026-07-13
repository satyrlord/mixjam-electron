import { DialogClose, DialogContent, DialogRoot, DialogTitle } from './ui/Dialog'
import { useRef } from 'react'

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
      { keys: 'Space', action: 'Play / pause / cancel preparation' },
      { keys: 'Ctrl+Z', action: 'Undo placement edit' },
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
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  )
  return (
    <DialogRoot open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="shortcuts-panel"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        aria-describedby={undefined}
        onOverlayClick={onClose}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
      >
        <div className="shortcuts-head">
          <DialogTitle asChild><h2 className="shortcuts-title">Keyboard Shortcuts</h2></DialogTitle>
          <DialogClose asChild>
            <button type="button" className="shortcuts-close" aria-label="Close shortcuts">×</button>
          </DialogClose>
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
      </DialogContent>
    </DialogRoot>
  )
}
