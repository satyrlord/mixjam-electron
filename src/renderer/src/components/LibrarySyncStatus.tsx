import type { LibrarySyncState } from '../../../shared/backend-api'
import { getLibrarySyncPresentation } from '../lib/library-sync-presentation'

interface LibrarySyncStatusProps {
  state: LibrarySyncState
  compact?: boolean
  showReady?: boolean
  onRetry?: () => void
  onCancel?: () => void
}

function phaseLabel(phase: 1 | 2 | null): string {
  if (phase === 1) return 'Finding samples'
  if (phase === 2) return 'Reading metadata'
  return 'Syncing library'
}

function progressValue(processed: number, total: number): number | undefined {
  if (total <= 0) return undefined
  return Math.max(0, Math.min(total, processed))
}

export default function LibrarySyncStatus({
  state,
  compact = false,
  showReady = true,
  onRetry,
  onCancel
}: LibrarySyncStatusProps) {
  const presentation = getLibrarySyncPresentation(state)
  if (!presentation.hasStatus || (state.status === 'ready' && !showReady)) return null

  let label = ''
  let detail: string | null = null
  let progress: { value?: number; max: number; label: string } | null = null

  switch (state.status) {
    case 'unindexed':
      label = 'Library not indexed'
      break
    case 'checking':
      label = 'Checking library'
      progress = { max: 1, label }
      break
    case 'syncing': {
      label = phaseLabel(state.phase)
      detail = state.total > 0
        ? `${state.processed} of ${state.total} files`
        : state.found > 0
          ? `${state.found} files found`
          : 'Preparing file list'
      progress = {
        value: progressValue(state.processed, state.total),
        max: Math.max(1, state.total),
        label
      }
      break
    }
    case 'analyzing':
      label = 'Analyzing samples'
      detail = state.total > 0
        ? `${state.analyzed} of ${state.total} samples`
        : 'Preparing analysis'
      progress = {
        value: progressValue(state.analyzed, state.total),
        max: Math.max(1, state.total),
        label
      }
      break
    case 'ready':
      label = 'Library ready'
      break
    case 'cancelled':
      label = 'Library sync cancelled'
      detail = state.hasUsableIndex ? 'Existing samples are still available.' : null
      break
    case 'error':
      label = 'Library sync failed'
      detail = state.message
      break
  }

  return (
    <div
      className={`library-sync-status library-sync-${state.status}${compact ? ' library-sync-compact' : ''}`}
    >
      <span
        className="library-sync-copy"
        role={state.status === 'error' ? 'alert' : 'status'}
        aria-live={state.status === 'error' ? 'assertive' : 'polite'}
      >
        <strong>{label}</strong>
        {!compact && detail && <span title={detail}>{detail}</span>}
      </span>
      {progress && (
        <progress
          aria-label={progress.label}
          max={progress.max}
          value={progress.value}
        />
      )}
      {presentation.canCancel && onCancel && (
        <button type="button" onClick={onCancel}>Cancel</button>
      )}
      {presentation.canRetry && onRetry && (
        <button type="button" onClick={onRetry}>Retry library sync</button>
      )}
    </div>
  )
}
