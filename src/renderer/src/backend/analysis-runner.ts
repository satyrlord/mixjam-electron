import type { AnalysisProgress } from '../../../shared/backend-api'
import { analyzeWav } from './analysis'
import { applyAnalysisResult, listAnalysisCandidates } from './library'
import type { DB } from './sql'

export type AnalysisEmit = (progress: AnalysisProgress) => void

function yieldToEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Analyzes missing, non-manual fields sequentially. Audio decoding is CPU and
 * memory heavy rather than I/O bound, so one sample at a time keeps peak memory
 * bounded while the event-loop yield lets worker DB requests interleave. */
export async function runPendingAnalysis(
  db: DB,
  rootId: number,
  files: ReadonlyMap<string, File>,
  emit: AnalysisEmit,
  isCurrent: () => boolean
): Promise<void> {
  const candidates = listAnalysisCandidates(db, rootId)
  const total = candidates.length
  let analyzed = 0
  emit({ status: 'analyzing', analyzed, total })

  for (const candidate of candidates) {
    if (!isCurrent()) return
    const file = files.get(candidate.relpath)
    if (file) {
      try {
        const result = analyzeWav(await file.arrayBuffer())
        if (result) applyAnalysisResult(db, candidate.id, result)
      } catch {
        // Unsupported or damaged audio leaves its fields NULL. A later scan or
        // individual re-analysis can try again without aborting the batch.
      }
    }
    analyzed++
    emit({ status: 'analyzing', analyzed, total })
    await yieldToEvents()
  }
}

export async function runSingleAnalysis(
  db: DB,
  sampleId: number,
  file: File,
  emit: AnalysisEmit
): Promise<void> {
  emit({ status: 'analyzing', analyzed: 0, total: 1 })
  const result = analyzeWav(await file.arrayBuffer())
  if (result) applyAnalysisResult(db, sampleId, result)
  emit({ status: 'analyzing', analyzed: 1, total: 1 })
}
