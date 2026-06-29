import type { ScanProgress } from '../../../shared/ipc'

interface ScanOverlayProps {
  progress: ScanProgress
}

export default function ScanOverlay({ progress }: ScanOverlayProps) {
  if (progress.status !== 'scanning') return null

  const pct = progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0

  return (
    <div className="scan-overlay" role="alert" aria-live="polite">
      <div className="scan-overlay-content">
        <div className="scan-overlay-spinner" aria-hidden="true" />
        <h2 className="scan-overlay-title">Scanning sample folder...</h2>
        <p className="scan-overlay-phase">
          Phase {progress.phase ?? 1}: {progress.processed} / {progress.total} files
        </p>
        {progress.total > 0 && (
          <div
            className="scan-overlay-bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="scan-overlay-bar-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
