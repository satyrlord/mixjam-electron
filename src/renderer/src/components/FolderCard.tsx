import type { ReactNode } from 'react'
import type { FolderCardStatus } from '../hooks/useFolderSession'

const PICK_ERROR = 'Cannot access this folder. Check permissions and try again.'
const RESTORE_ERROR = 'Folder not accessible — pick a new one.'

interface FolderCardProps {
  label: string
  icon: ReactNode
  path: string | null
  status: FolderCardStatus
  disabled: boolean
  emptyPrompt: string
  onPick: () => void
}

function resolveStatus(
  status: FolderCardStatus,
  path: string | null,
  emptyPrompt: string
): { text: string; tone: 'path' | 'error' | 'prompt' } {
  switch (status) {
    case 'set':
      return { text: path ?? '', tone: 'path' }
    case 'pick-error':
      return { text: PICK_ERROR, tone: 'error' }
    case 'restore-error':
      return { text: RESTORE_ERROR, tone: 'error' }
    default:
      return { text: emptyPrompt, tone: 'prompt' }
  }
}

export default function FolderCard({
  label,
  icon,
  path,
  status,
  disabled,
  emptyPrompt,
  onPick
}: FolderCardProps) {
  const { text, tone } = resolveStatus(status, path, emptyPrompt)

  return (
    <div className={`folder-card${disabled ? ' folder-card-disabled' : ''}`} aria-disabled={disabled}>
      <div className="folder-card-head">
        <span className="folder-card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="folder-card-label">{label}</span>
        <button type="button" className="folder-card-pick" onClick={onPick} disabled={disabled}>
          Pick Folder
        </button>
      </div>
      <p className={`folder-card-status folder-card-status-${tone}`}>{text}</p>
    </div>
  )
}
