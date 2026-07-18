import type { AnalysisProgress } from '../../../shared/backend-api'
import { analyzeWav, type SampleAnalysisResult } from './analysis'
import {
  applyAnalysisResult,
  applyContextualAnalysisResult,
  listAnalysisCandidates,
  listStoredAnalysisEvidence,
  reconcileAnalysisGroups
} from './analysis-persistence'
import { resolveContextualAnalysis } from './contextual-analysis'
import type { DB } from './sql'

export type AnalysisPhaseProgress = Omit<AnalysisProgress, 'identity'>
export type AnalysisEmit = (progress: AnalysisPhaseProgress) => void

const EMPTY_ANALYSIS_RESULT = {
  bpm: null,
  musicalKey: null,
  sampleType: null
}

function yieldToEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function persistContextualFolderAnalysis(
  db: DB,
  rootId: number,
  preservedSampleIds: ReadonlySet<number> = new Set()
): void {
  const contextual = resolveContextualAnalysis(listStoredAnalysisEvidence(db, rootId))
  const persist = db.transaction(() => {
    for (const result of contextual.samples) {
      if (preservedSampleIds.has(result.sampleId)) continue
      applyContextualAnalysisResult(db, result.sampleId, result)
    }
    reconcileAnalysisGroups(db, rootId, contextual.groups)
  })
  persist()
}

function persistRawResult(db: DB, sampleId: number, result: SampleAnalysisResult | null): void {
  const persisted = result ?? EMPTY_ANALYSIS_RESULT
  applyAnalysisResult(db, sampleId, persisted)
}

/** Reconciles stale per-file evidence, then applies the same hierarchy-aware
 * folder policy used by individual refreshes. Unchanged files are read from
 * stored raw evidence and are never decoded again. */
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
  const preservedSampleIds = new Set<number>()
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
        if (!isCurrent()) return
        preservedSampleIds.add(candidate.id)
        analyzed++
        if (analyzed < total) emit({ status: 'analyzing', analyzed, total })
        await yieldToEvents()
        continue
      }
      try {
        result = analyzeWav(bytes)
        clearStaleAnalysis = result === null
      } catch {
        clearStaleAnalysis = true
      }
    } else {
      preservedSampleIds.add(candidate.id)
    }
    if (!isCurrent()) return
    if (result) persistRawResult(db, candidate.id, result)
    else if (clearStaleAnalysis) persistRawResult(db, candidate.id, null)
    analyzed++
    if (analyzed < total) emit({ status: 'analyzing', analyzed, total })
    await yieldToEvents()
  }

  if (!isCurrent()) return
  persistContextualFolderAnalysis(db, rootId, preservedSampleIds)
  if (total > 0) emit({ status: 'analyzing', analyzed, total })
}

export async function runSingleAnalysis(
  db: DB,
  sampleId: number,
  file: File,
  emit: AnalysisEmit
): Promise<void> {
  const sample = db.prepare(
    'SELECT root_id FROM samples WHERE id = ? AND scan_state = 1'
  ).get<{ root_id: number }>(sampleId)
  if (!sample) throw new Error('The sample is not available for analysis')
  emit({ status: 'analyzing', analyzed: 0, total: 1 })
  persistRawResult(db, sampleId, analyzeWav(await file.arrayBuffer()))
  persistContextualFolderAnalysis(db, sample.root_id)
  emit({ status: 'analyzing', analyzed: 1, total: 1 })
}
