import type { AnalysisProgress, CalibrationProgress } from '../../../shared/backend-api'
import { analyzeWav, calibrateConfirmedUniformBatch, type SampleAnalysisResult } from './analysis'
import {
  applyAnalysisResult,
  listAnalysisCandidates,
  listCalibrationCandidates
} from './library'
import type { DB } from './sql'

export type AnalysisPhaseProgress = Omit<AnalysisProgress, 'identity'>
export type AnalysisEmit = (progress: AnalysisPhaseProgress) => void
export type CalibrationPhaseProgress = Omit<CalibrationProgress, 'identity'>
export type CalibrationEmit = (progress: CalibrationPhaseProgress) => void

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
  isCurrent: () => boolean
): Promise<void> {
  const candidates = listAnalysisCandidates(db, rootId)
  const total = candidates.length
  let analyzed = 0
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
    } else if (clearStaleAnalysis) {
      applyAnalysisResult(db, candidate.id, EMPTY_ANALYSIS_RESULT)
    }
    analyzed++
    if (analyzed < total) emit({ status: 'analyzing', analyzed, total })
    await yieldToEvents()
  }

  if (!isCurrent()) return
  if (total > 0) emit({ status: 'analyzing', analyzed, total })
}

/** Explicit whole-folder analysis and guarded calibration. This is deliberately
 * separate from ordinary library sync and ignores analysis revisions so the
 * user-confirmed operation can inspect the complete current folder. */
export async function runUniformFolderCalibration(
  db: DB,
  rootId: number,
  files: ReadonlyMap<string, File>,
  emit: CalibrationEmit,
  isCurrent: () => boolean
): Promise<void> {
  const candidates = listCalibrationCandidates(db, rootId)
  const total = candidates.length
  let analyzed = 0
  const rawResults: Array<{ sampleId: number; result: SampleAnalysisResult }> = []
  emit({ status: 'calibrating', analyzed, total })

  for (const candidate of candidates) {
    if (!isCurrent()) return
    const file = files.get(candidate.relpath)
    if (!file) {
      throw new Error(`Calibration requires a readable file: ${candidate.relpath}`)
    }
    let bytes: ArrayBuffer
    try {
      bytes = await file.arrayBuffer()
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`Calibration could not read ${candidate.relpath}: ${detail}`, { cause })
    }
    let result: SampleAnalysisResult | null
    try {
      result = analyzeWav(bytes)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`Calibration could not analyze ${candidate.relpath}: ${detail}`, { cause })
    }
    if (!result) {
      throw new Error(`Calibration does not support ${candidate.relpath}`)
    }

    if (!isCurrent()) return
    applyAnalysisResult(db, candidate.id, result)
    rawResults.push({ sampleId: candidate.id, result })
    analyzed++
    if (analyzed < total) emit({ status: 'calibrating', analyzed, total })
    await yieldToEvents()
  }

  if (!isCurrent()) return
  const calibrated = calibrateConfirmedUniformBatch(rawResults.map(({ result }) => result))
  if (!isCurrent()) return
  const applyCalibration = db.transaction(() => {
    for (let index = 0; index < calibrated.results.length; index++) {
      applyAnalysisResult(db, rawResults[index].sampleId, calibrated.results[index])
    }
  })
  applyCalibration()
  if (total > 0) emit({ status: 'calibrating', analyzed, total })
}

export async function runSingleAnalysis(
  db: DB,
  sampleId: number,
  file: File,
  emit: AnalysisEmit
): Promise<void> {
  emit({ status: 'analyzing', analyzed: 0, total: 1 })
  const result = analyzeWav(await file.arrayBuffer())
  applyAnalysisResult(db, sampleId, result ?? EMPTY_ANALYSIS_RESULT)
  emit({ status: 'analyzing', analyzed: 1, total: 1 })
}
