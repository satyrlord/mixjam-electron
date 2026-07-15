import type { AnalysisProgress } from '../../../shared/backend-api'
import { analyzeWav, calibrateConfirmedUniformBatch, type SampleAnalysisResult } from './analysis'
import { applyAnalysisResult, listAnalysisCandidates } from './library'
import type { DB } from './sql'

export type AnalysisEmit = (progress: AnalysisProgress) => void

const EMPTY_ANALYSIS_RESULT = {
  bpm: null,
  musicalKey: null,
  sampleType: null
}

function yieldToEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Refreshes non-manual analysis fields sequentially. Audio decoding is CPU
 * and memory heavy rather than I/O bound, so one sample at a time keeps peak
 * memory bounded while the event-loop yield lets worker DB requests interleave. */
export async function runPendingAnalysis(
  db: DB,
  rootId: number,
  files: ReadonlyMap<string, File>,
  emit: AnalysisEmit,
  isCurrent: () => boolean,
  uniformBatchConfirmed = false
): Promise<void> {
  const candidates = listAnalysisCandidates(db, rootId)
  const total = candidates.length
  let analyzed = 0
  const rawResults: Array<{ sampleId: number; result: SampleAnalysisResult }> = []
  emit({ status: 'analyzing', analyzed, total })

  for (const candidate of candidates) {
    if (!isCurrent()) return
    const file = files.get(candidate.relpath)
    let result: SampleAnalysisResult | null = null
    let clearStaleAnalysis = false
    if (file) {
      let bytes: ArrayBuffer
      try {
        bytes = await file.arrayBuffer()
      } catch {
        // A transient file read failure preserves prior analysis. A later scan
        // can retry without discarding usable metadata.
        if (!isCurrent()) return
        analyzed++
        if (analyzed < total) emit({ status: 'analyzing', analyzed, total })
        await yieldToEvents()
        continue
      }
      try {
        result = analyzeWav(bytes)
        clearStaleAnalysis = result === null
      } catch {
        // Bytes were read, so unsupported or damaged current content clears
        // stale automatic fields while applyAnalysisResult protects manual ones.
        clearStaleAnalysis = true
      }
    }
    if (!isCurrent()) return
    if (result) {
      // This synchronous write commits before progress advances. Persistence
      // errors escape to the worker instead of being mistaken for decode errors.
      applyAnalysisResult(db, candidate.id, result)
      rawResults.push({ sampleId: candidate.id, result })
    } else if (clearStaleAnalysis) {
      applyAnalysisResult(db, candidate.id, EMPTY_ANALYSIS_RESULT)
    }
    analyzed++
    // Hold the 100% event until the final calibration transaction commits.
    if (analyzed < total) emit({ status: 'analyzing', analyzed, total })
    await yieldToEvents()
  }

  if (!isCurrent()) return
  if (uniformBatchConfirmed) {
    const calibrated = calibrateConfirmedUniformBatch(rawResults.map(({ result }) => result))
    if (!isCurrent()) return
    const applyCalibration = db.transaction(() => {
      for (let index = 0; index < calibrated.results.length; index++) {
        applyAnalysisResult(db, rawResults[index].sampleId, calibrated.results[index])
      }
    })
    applyCalibration()
  }
  if (total > 0) emit({ status: 'analyzing', analyzed, total })
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
