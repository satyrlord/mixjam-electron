import type { CalibrationProgress, LibrarySyncState } from '../../../shared/backend-api'

interface SampleAnalysisManagementProps {
  librarySyncState: LibrarySyncState
  progress: CalibrationProgress
  onStart: () => void
  onCancel: () => void
}

const CONFIRMATION =
  'Uniform Folder Calibration replaces automatic BPM and key results using the whole folder. Continue only if every sample shares one tempo and key.'

function syncIsActive(state: LibrarySyncState): boolean {
  return state.status === 'checking' ||
    state.status === 'syncing' ||
    state.status === 'analyzing'
}

export default function SampleAnalysisManagement({
  librarySyncState,
  progress,
  onStart,
  onCancel
}: SampleAnalysisManagementProps) {
  const calibrating = progress.status === 'calibrating'
  const missingUsableIndex = (librarySyncState.status === 'cancelled' ||
    librarySyncState.status === 'error') && !librarySyncState.hasUsableIndex
  const disabled = calibrating || syncIsActive(librarySyncState) ||
    librarySyncState.status === 'unavailable' ||
    librarySyncState.status === 'unindexed' ||
    missingUsableIndex

  const start = () => {
    if (disabled || !window.confirm(CONFIRMATION)) return
    onStart()
  }

  return (
    <details className="sample-analysis-management">
      <summary>Analysis</summary>
      <div className="sample-analysis-management-content">
        <strong>Uniform Folder Calibration</strong>
        <span>For folders where every sample shares one tempo and key.</span>
        <button type="button" disabled={disabled} onClick={start}>
          Start Uniform Folder Calibration
        </button>
        {calibrating && (
          <>
            <progress
              aria-label="Uniform Folder Calibration"
              max={Math.max(1, progress.total)}
              value={progress.total > 0 ? Math.min(progress.analyzed, progress.total) : undefined}
            />
            <span>
              {progress.total > 0
                ? `${progress.analyzed} of ${progress.total} samples`
                : 'Preparing calibration'}
            </span>
            <button type="button" onClick={onCancel}>Cancel calibration</button>
          </>
        )}
        {progress.status === 'cancelled' && <span>Calibration cancelled.</span>}
        {progress.status === 'error' && (
          <span role="alert">{progress.error ?? 'Calibration failed.'}</span>
        )}
      </div>
    </details>
  )
}
