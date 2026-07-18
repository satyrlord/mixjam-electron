import type { SampleAnalysisPatch, SampleType } from '../../../shared/backend-api'
import { isSampleType } from './analysis'
import { parseMusicalKey } from './musical-key'
import { ANALYSIS_REVISION } from './schema'
import type { DB } from './sql'

export interface AnalysisCandidate {
  [key: string]: string | number
  id: number
  relpath: string
}

export function listAnalysisCandidates(
  db: DB,
  rootId: number,
  analysisRevision: number = ANALYSIS_REVISION
): AnalysisCandidate[] {
  return db.prepare(
    `SELECT id, relpath FROM samples
     WHERE root_id = ? AND scan_state = 1 AND analysis_revision < ? AND (
       COALESCE(bpm_source, '') != 'manual' OR
       COALESCE(musical_key_source, '') != 'manual' OR
       COALESCE(sample_type_source, '') != 'manual'
     ) ORDER BY id`
  ).all<AnalysisCandidate>(rootId, analysisRevision)
}

export function listCalibrationCandidates(db: DB, rootId: number): AnalysisCandidate[] {
  return db.prepare(
    `SELECT id, relpath FROM samples
     WHERE root_id = ? AND scan_state != 2
     ORDER BY id`
  ).all<AnalysisCandidate>(rootId)
}

export function applyAnalysisResult(
  db: DB,
  sampleId: number,
  result: { bpm: number | null; musicalKey: string | null; sampleType: SampleType | null },
  analysisRevision: number = ANALYSIS_REVISION
): void {
  db.prepare(
    `UPDATE samples SET
       bpm = CASE WHEN COALESCE(bpm_source, '') != 'manual' THEN ? ELSE bpm END,
       bpm_source = CASE WHEN COALESCE(bpm_source, '') != 'manual'
         THEN CASE WHEN ? IS NULL THEN NULL ELSE 'analysis' END ELSE bpm_source END,
       musical_key = CASE WHEN COALESCE(musical_key_source, '') != 'manual'
         THEN ? ELSE musical_key END,
       musical_key_source = CASE WHEN COALESCE(musical_key_source, '') != 'manual'
         THEN CASE WHEN ? IS NULL THEN NULL ELSE 'analysis' END ELSE musical_key_source END,
       sample_type = CASE WHEN COALESCE(sample_type_source, '') != 'manual'
         THEN ? ELSE sample_type END,
       sample_type_source = CASE WHEN COALESCE(sample_type_source, '') != 'manual'
         THEN CASE WHEN ? IS NULL THEN NULL ELSE 'analysis' END ELSE sample_type_source END,
       analysis_revision = ?
     WHERE id = ?`
  ).run(
    result.bpm,
    result.bpm,
    result.musicalKey,
    result.musicalKey,
    result.sampleType,
    result.sampleType,
    analysisRevision,
    sampleId
  )
}

export function updateSampleAnalysis(db: DB, sampleId: number, patch: SampleAnalysisPatch): void {
  const hasBpm = Object.prototype.hasOwnProperty.call(patch, 'bpm')
  const hasMusicalKey = Object.prototype.hasOwnProperty.call(patch, 'musicalKey')
  const hasSampleType = Object.prototype.hasOwnProperty.call(patch, 'sampleType')

  if (hasBpm) {
    const bpm = patch.bpm
    if (bpm !== null && (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < 20 || bpm > 400)) {
      throw new Error('BPM must be between 20 and 400')
    }
  }
  if (hasMusicalKey) {
    const key = patch.musicalKey
    if (key !== null && (typeof key !== 'string' || parseMusicalKey(key) === null)) {
      throw new Error('Musical key must look like C, C#, Am, or Bbm')
    }
  }
  if (hasSampleType) {
    const sampleType = patch.sampleType
    if (sampleType !== null && !isSampleType(sampleType)) throw new Error('Invalid sample type')
  }

  if (!hasBpm && !hasMusicalKey && !hasSampleType) return

  const applyPatch = db.transaction(() => {
    if (hasBpm) {
      const bpm = patch.bpm
      db.prepare('UPDATE samples SET bpm = ?, bpm_source = ? WHERE id = ?').run(
        bpm ?? null, bpm === null ? null : 'manual', sampleId
      )
    }
    if (hasMusicalKey) {
      const key = patch.musicalKey
      db.prepare('UPDATE samples SET musical_key = ?, musical_key_source = ? WHERE id = ?').run(
        key ?? null, key === null ? null : 'manual', sampleId
      )
    }
    if (hasSampleType) {
      const sampleType = patch.sampleType
      db.prepare('UPDATE samples SET sample_type = ?, sample_type_source = ? WHERE id = ?').run(
        sampleType ?? null, sampleType === null ? null : 'manual', sampleId
      )
    }
  })
  applyPatch()
}
