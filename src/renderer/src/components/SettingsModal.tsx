import { useRef } from 'react'
import type { FolderView } from '../hooks/useFolderSetup'
import {
  MAX_CLIP_EDGE_FADE_MS,
  MIN_CLIP_EDGE_FADE_MS,
  type ClipEdgeMicroFadeSettings
} from '../engine/clip-edge-fades'
import { UI_SIZE_LABELS, UI_SIZE_OPTIONS, type UiSize } from '../ui-size'
import {
  BlockingDialogContent,
  DialogClose,
  DialogCloseIcon,
  DialogRoot,
  DialogTitle
} from './ui/Dialog'

interface SettingsModalProps {
  userFolder: FolderView
  uiSize: UiSize
  clipEdgeMicroFades: ClipEdgeMicroFadeSettings
  onSelectUserFolder: () => void
  onUiSizeChange: (size: UiSize) => void
  onSetClipEdgeMicroFades: (settings: ClipEdgeMicroFadeSettings) => void
  onClose: () => void
  onRestoreFocus: () => void
}

function userFolderStatus(userFolder: FolderView): string {
  if (userFolder.status === 'set') return userFolder.ref?.name ?? 'Selected folder'
  if (userFolder.status === 'needs-permission') return 'Folder access needs to be restored.'
  if (userFolder.status === 'pick-error') return 'The selected folder could not be accessed.'
  if (userFolder.status === 'restore-error') return 'The saved folder is no longer accessible.'
  return 'No User Folder selected.'
}

export default function SettingsModal({
  userFolder,
  uiSize,
  clipEdgeMicroFades,
  onSelectUserFolder,
  onUiSizeChange,
  onSetClipEdgeMicroFades,
  onClose,
  onRestoreFocus
}: SettingsModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  const setFadeDuration = (edge: 'fadeInMs' | 'fadeOutMs', value: number) => {
    if (!Number.isFinite(value)) return
    onSetClipEdgeMicroFades({
      ...clipEdgeMicroFades,
      [edge]: Math.max(MIN_CLIP_EDGE_FADE_MS, Math.min(MAX_CLIP_EDGE_FADE_MS, value))
    })
  }

  const fadeControlsDisabled = !clipEdgeMicroFades.enabled

  return (
    <DialogRoot
      open
      modal
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <BlockingDialogContent
        className="settings-modal"
        restoreFocus={onRestoreFocus}
        aria-modal="true"
        aria-describedby="settings-description"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          closeRef.current?.focus()
        }}
      >
        <header className="settings-heading">
          <div>
            <p className="settings-kicker">Application and project preferences</p>
            <DialogTitle asChild><h2>Settings</h2></DialogTitle>
            <p id="settings-description">
              Choose where MixJam saves files, adjust the interface, and tune project playback.
            </p>
          </div>
          <DialogClose asChild>
            <button ref={closeRef} type="button" className="settings-close" aria-label="Close Settings">
              <DialogCloseIcon />
            </button>
          </DialogClose>
        </header>

        <div className="settings-content">
          <section className="settings-card" aria-labelledby="settings-user-folder-title">
            <div className="settings-card-copy">
              <h2 id="settings-user-folder-title">User Folder</h2>
              <p>Choose where MixJam saves projects, exports, and app settings.</p>
              <output className="settings-current-value" aria-label="Current User Folder">
                {userFolderStatus(userFolder)}
              </output>
            </div>
            <button
              type="button"
              className="settings-action"
              onClick={onSelectUserFolder}
            >
              Select User Folder
            </button>
          </section>

          <section className="settings-card" aria-labelledby="settings-zoom-title">
            <div className="settings-card-copy">
              <h2 id="settings-zoom-title">Zoom Level</h2>
              <p>Scale controls, text, lanes, and sample bubbles across the app.</p>
            </div>
            <div className="settings-zoom-level" role="group" aria-label="Zoom Level">
              {UI_SIZE_OPTIONS.map((size) => (
                <button
                  type="button"
                  key={size}
                  aria-pressed={uiSize === size}
                  onClick={() => onUiSizeChange(size)}
                >
                  {UI_SIZE_LABELS[size]}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-card settings-clip-edge-card" aria-labelledby="settings-clip-edge-title">
            <div className="settings-card-copy">
              <h2 id="settings-clip-edge-title">Clip Edge Fades</h2>
              <p>Apply short fades only at clip boundaries next to silence.</p>
            </div>
            <div className="settings-clip-edge-controls">
              <label className="settings-clip-edge-toggle">
                <input
                  type="checkbox"
                  aria-label="Enable automatic clip-edge fades"
                  checked={clipEdgeMicroFades.enabled}
                  onChange={(event) => onSetClipEdgeMicroFades({
                    ...clipEdgeMicroFades,
                    enabled: event.currentTarget.checked
                  })}
                />
                <span>{clipEdgeMicroFades.enabled ? 'On' : 'Off'}</span>
              </label>
              <div className="settings-clip-edge-fields">
                <label>
                  <span>Fade in</span>
                  <span className="settings-number-input">
                    <input
                      type="number"
                      aria-label="Automatic clip fade-in milliseconds"
                      min={MIN_CLIP_EDGE_FADE_MS}
                      max={MAX_CLIP_EDGE_FADE_MS}
                      step={0.1}
                      value={clipEdgeMicroFades.fadeInMs}
                      disabled={fadeControlsDisabled}
                      onChange={(event) => setFadeDuration('fadeInMs', event.currentTarget.valueAsNumber)}
                    />
                    <span>ms</span>
                  </span>
                </label>
                <label>
                  <span>Fade out</span>
                  <span className="settings-number-input">
                    <input
                      type="number"
                      aria-label="Automatic clip fade-out milliseconds"
                      min={MIN_CLIP_EDGE_FADE_MS}
                      max={MAX_CLIP_EDGE_FADE_MS}
                      step={0.1}
                      value={clipEdgeMicroFades.fadeOutMs}
                      disabled={fadeControlsDisabled}
                      onChange={(event) => setFadeDuration('fadeOutMs', event.currentTarget.valueAsNumber)}
                    />
                    <span>ms</span>
                  </span>
                </label>
              </div>
            </div>
            <p className="settings-card-note">
              This setting belongs to the active MixJam and is saved with the project.
            </p>
          </section>
        </div>
      </BlockingDialogContent>
    </DialogRoot>
  )
}
