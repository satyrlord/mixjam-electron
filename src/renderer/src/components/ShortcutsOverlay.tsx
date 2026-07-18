import { DialogClose, DialogContent, DialogRoot, DialogTitle } from './ui/Dialog'
import { useRef } from 'react'
import { PLAYER_SHORTCUT_SECTIONS } from '../hooks/usePlayerShortcuts'

interface ShortcutsOverlayProps {
  onClose: () => void
}

/** Modal listing every keyboard and mouse shortcut. Opened from the Middle
 *  Strip More menu or the "?" key; closed by Esc, the close button, or a
 *  click on the backdrop. */
export default function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  const returnFocusRef = useRef<HTMLElement>(
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body
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
          returnFocusRef.current.focus()
        }}
      >
        <div className="shortcuts-head">
          <DialogTitle asChild><h2 className="shortcuts-title">Keyboard Shortcuts</h2></DialogTitle>
          <DialogClose asChild>
            <button type="button" className="shortcuts-close" aria-label="Close shortcuts">×</button>
          </DialogClose>
        </div>
        <div className="shortcuts-sections">
          {PLAYER_SHORTCUT_SECTIONS.map((section) => (
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
