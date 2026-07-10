import type { AnalysisProgress } from '../../../shared/backend-api'

export default function AnalysisProgressBar({ progress }: { progress: AnalysisProgress }) {
  if (progress.status === 'idle') return null
  if (progress.status === 'error') {
    const message = progress.error ?? 'Unknown backend error'
    return (
      <span className="scan-err" title={message} aria-label={`Analysis error: ${message}`}>
        Analysis error: {message}
      </span>
    )
  }
  const pct = progress.total > 0 ? Math.round((progress.analyzed / progress.total) * 100) : 100
  return (
    <span
      className="scan-progress"
      aria-label={`Analyzing samples: ${progress.analyzed} of ${progress.total}`}
    >
      Analyze {pct}%
    </span>
  )
}
