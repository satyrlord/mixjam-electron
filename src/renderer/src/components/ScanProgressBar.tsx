import type { ScanProgress } from '../../../shared/backend-api'

interface ScanProgressBarProps {
  progress: ScanProgress
}

export default function ScanProgressBar({ progress }: ScanProgressBarProps) {
  if (progress.status === 'idle') return null
  if (progress.status === 'error') {
    const message = progress.error ?? 'Unknown backend error'
    return (
      <span className="scan-err" aria-label={`Scan error: ${message}`}>
        Scan error: {message}
      </span>
    )
  }
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0
  return (
    <label className="scan-progress">
      <span>Ph{progress.phase} {pct}%</span>
      <progress
        max={Math.max(progress.total, 1)}
        value={progress.processed}
        aria-label={`Scanning phase ${progress.phase ?? 1}: ${progress.processed} of ${progress.total}`}
      />
    </label>
  )
}
