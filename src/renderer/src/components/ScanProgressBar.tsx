import type { ScanProgress } from '../../../shared/backend-api'

interface ScanProgressBarProps {
  progress: ScanProgress
}

export default function ScanProgressBar({ progress }: ScanProgressBarProps) {
  if (progress.status === 'idle') return null
  if (progress.status === 'error') {
    const message = progress.error ?? 'Unknown backend error'
    return (
      <span className="scan-err" title={message} aria-label={`Scan error: ${message}`}>
        Scan error: {message}
      </span>
    )
  }
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0
  return (
    <span
      className="scan-progress"
      aria-label={`Scanning phase ${progress.phase ?? 1}: ${progress.processed} of ${progress.total}`}
    >
      Ph{progress.phase} {pct}%
    </span>
  )
}
