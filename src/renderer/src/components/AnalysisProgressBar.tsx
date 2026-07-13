import type { AnalysisProgress } from '../../../shared/backend-api'

export default function AnalysisProgressBar({ progress }: { progress: AnalysisProgress }) {
  if (progress.status === 'idle') return null
  if (progress.status === 'error') {
    const message = progress.error ?? 'Unknown backend error'
    return (
      <span className="scan-err" aria-label={`Analysis error: ${message}`}>
        Analysis error: {message}
      </span>
    )
  }
  const pct = progress.total > 0 ? Math.round((progress.analyzed / progress.total) * 100) : 100
  return (
    <label className="scan-progress">
      <span>Analyze {pct}%</span>
      <progress
        max={Math.max(progress.total, 1)}
        value={progress.total > 0 ? progress.analyzed : 0}
        aria-label={`Analyzing samples: ${progress.analyzed} of ${progress.total}`}
      />
    </label>
  )
}
