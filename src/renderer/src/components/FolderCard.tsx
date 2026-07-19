import type { ReactNode } from 'react'
import type { FolderCardStatus } from '../hooks/useFolderSetup'

const PICK_ERROR = 'Cannot access this folder. Check permissions and try again.'
const RESTORE_ERROR = 'Folder not accessible — pick a new one.'
const NEEDS_PERMISSION = 'Access to this folder needs to be restored.'

interface FolderCardProps {
  label: string
  icon: ReactNode
  folderName: string | null
  status: FolderCardStatus
  disabled: boolean
  emptyPrompt: string
  children?: ReactNode
  onPick: () => void
  /** Re-requests permission if Chromium reports an unexpected prompt state. */
  onRestore: () => void
}

function resolveStatus(
  status: FolderCardStatus,
  folderName: string | null,
  emptyPrompt: string
): { text: string; tone: 'path' | 'error' | 'prompt' } {
  switch (status) {
    case 'set':
      return { text: folderName ?? '', tone: 'path' }
    case 'pick-error':
      return { text: PICK_ERROR, tone: 'error' }
    case 'restore-error':
      return { text: RESTORE_ERROR, tone: 'error' }
    case 'needs-permission':
      return { text: NEEDS_PERMISSION, tone: 'prompt' }
    default:
      return { text: emptyPrompt, tone: 'prompt' }
  }
}

export default function FolderCard({
  label,
  icon,
  folderName,
  status,
  disabled,
  emptyPrompt,
  children,
  onPick,
  onRestore
}: FolderCardProps) {
  const { text, tone } = resolveStatus(status, folderName, emptyPrompt)

  return (
    <div className={`folder-card${disabled ? ' folder-card-disabled' : ''}`} aria-disabled={disabled}>
      <div className="folder-card-head">
        <span className="folder-card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="folder-card-label">{label}</span>
        {status === 'needs-permission' ? (
          <button type="button" className="folder-card-pick" onClick={onRestore} disabled={disabled}>
            {`Restore access to ${folderName ?? 'folder'}`}
          </button>
        ) : null}
        <button type="button" className="folder-card-pick" onClick={onPick} disabled={disabled}>
          Pick Folder
        </button>
      </div>
      <p className={`folder-card-status folder-card-status-${tone}`}>{text}</p>
      {children && <div className="folder-card-detail">{children}</div>}
    </div>
  )
}
