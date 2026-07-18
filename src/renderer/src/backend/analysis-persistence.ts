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

export type AnalysisGroupState = 'resolved' | 'mixed' | 'uncertain'

export interface AnalysisTempoCluster {
  relpathPrefix: string
  sampleCount: number
  bpm: number
  musicalKey: string | null
  bpmSupport: number
  keySupport: number
  confidence: number
}

export interface CanonicalRootAnalysisSummary {
  state: AnalysisGroupState
  sampleCount: number
  bpm: number | null
  musicalKey: string | null
  bpmSupport: number
  keySupport: number
  confidence: number
  clusters: AnalysisTempoCluster[]
}

export interface StoredAnalysisEvidence {
  id: number
  relpath: string
  durationSeconds: number
  bpm: number | null
  musicalKey: string | null
  sampleType: SampleType | null
}

export interface PersistedAnalysisGroup {
  relpathPrefix: string
  depth: number
  sampleCount: number
  state: AnalysisGroupState
  bpm: number | null
  musicalKey: string | null
  bpmSupport: number
  keySupport: number
  confidence: number
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

export function listStoredAnalysisEvidence(db: DB, rootId: number): StoredAnalysisEvidence[] {
  return db.prepare(
    `SELECT id, relpath, COALESCE(duration, 0) AS duration_seconds,
            raw_bpm AS evidence_bpm,
            raw_musical_key AS evidence_key,
            sample_type
     FROM samples
     WHERE root_id = ? AND scan_state = 1
     ORDER BY relpath`
  ).all<{
    id: number
    relpath: string
    duration_seconds: number
    evidence_bpm: number | null
    evidence_key: string | null
    sample_type: string | null
  }>(rootId).map((row) => ({
    id: row.id,
    relpath: row.relpath,
    durationSeconds: row.duration_seconds,
    bpm: row.evidence_bpm,
    musicalKey: row.evidence_key,
    sampleType: isSampleType(row.sample_type) ? row.sample_type : null
  }))
}

export function applyContextualAnalysisResult(
  db: DB,
  sampleId: number,
  result: { bpm: number | null; musicalKey: string | null }
): void {
  db.prepare(
    `UPDATE samples SET
       bpm = CASE WHEN COALESCE(bpm_source, '') != 'manual' THEN ? ELSE bpm END,
       bpm_source = CASE WHEN COALESCE(bpm_source, '') != 'manual'
         THEN CASE WHEN ? IS NULL THEN NULL ELSE 'analysis' END ELSE bpm_source END,
       musical_key = CASE WHEN COALESCE(musical_key_source, '') != 'manual'
         THEN ? ELSE musical_key END,
       musical_key_source = CASE WHEN COALESCE(musical_key_source, '') != 'manual'
         THEN CASE WHEN ? IS NULL THEN NULL ELSE 'analysis' END ELSE musical_key_source END
     WHERE id = ? AND (
       (COALESCE(bpm_source, '') != 'manual' AND NOT (bpm IS ?)) OR
       (COALESCE(musical_key_source, '') != 'manual' AND NOT (musical_key IS ?))
     )`
  ).run(
    result.bpm,
    result.bpm,
    result.musicalKey,
    result.musicalKey,
    sampleId,
    result.bpm,
    result.musicalKey
  )
}

export function reconcileAnalysisGroups(
  db: DB,
  rootId: number,
  groups: readonly PersistedAnalysisGroup[],
  analysisRevision: number = ANALYSIS_REVISION
): void {
  const existing = db.prepare(
    `SELECT relpath_prefix, depth, sample_count, state, bpm, musical_key,
            bpm_support, key_support, confidence, analysis_revision
     FROM analysis_groups WHERE root_id = ?`
  ).all<{
    relpath_prefix: string
    depth: number
    sample_count: number
    state: string
    bpm: number | null
    musical_key: string | null
    bpm_support: number
    key_support: number
    confidence: number
    analysis_revision: number
  }>(rootId)
  const currentByPrefix = new Map(existing.map((row) => [row.relpath_prefix, row]))
  const nextPrefixes = new Set(groups.map((group) => group.relpathPrefix))
  for (const row of existing) {
    if (!nextPrefixes.has(row.relpath_prefix)) {
      db.prepare('DELETE FROM analysis_groups WHERE root_id = ? AND relpath_prefix = ?')
        .run(rootId, row.relpath_prefix)
    }
  }
  const insert = db.prepare(
    `INSERT OR REPLACE INTO analysis_groups (
       root_id, relpath_prefix, depth, sample_count, state, bpm, musical_key,
       bpm_support, key_support, confidence, analysis_revision
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const group of groups) {
    const current = currentByPrefix.get(group.relpathPrefix)
    if (current && current.depth === group.depth && current.sample_count === group.sampleCount &&
        current.state === group.state && current.bpm === group.bpm &&
        current.musical_key === group.musicalKey && current.bpm_support === group.bpmSupport &&
        current.key_support === group.keySupport && current.confidence === group.confidence &&
        current.analysis_revision === analysisRevision) continue
    insert.run(
      rootId,
      group.relpathPrefix,
      group.depth,
      group.sampleCount,
      group.state,
      group.bpm,
      group.musicalKey,
      group.bpmSupport,
      group.keySupport,
      group.confidence,
      analysisRevision
    )
  }
}

export function analysisGroupContainsRelpath(relpathPrefix: string, relpath: string): boolean {
  if (relpathPrefix.startsWith('@cohort/')) {
    const [, topLevel = '', token = ''] = relpathPrefix.split('/')
    const segments = relpath.split('/').filter(Boolean)
    if ((segments.length > 1 ? segments[0]! : '') !== topLevel) return false
    return new RegExp(`(?:^|_)${token}(?=$|[_.(])`, 'i').test(segments.at(-1) ?? '')
  }
  return relpathPrefix === '' || relpath === relpathPrefix || relpath.startsWith(`${relpathPrefix}/`)
}

export function getCanonicalRootAnalysisSummary(
  db: DB,
  rootKey: string,
  analysisRevision: number = ANALYSIS_REVISION
): CanonicalRootAnalysisSummary | null {
  const rows = db.prepare(
    `SELECT groups.relpath_prefix, groups.depth, groups.sample_count, groups.state,
            groups.bpm, groups.musical_key, groups.bpm_support, groups.key_support,
            groups.confidence
     FROM analysis_groups AS groups
     JOIN scan_roots AS roots ON roots.id = groups.root_id
     WHERE roots.key = ? AND groups.analysis_revision = ?
     ORDER BY groups.depth, groups.relpath_prefix`
  ).all<{
    relpath_prefix: string
    depth: number
    sample_count: number
    state: AnalysisGroupState
    bpm: number | null
    musical_key: string | null
    bpm_support: number
    key_support: number
    confidence: number
  }>(rootKey, analysisRevision)
  const root = rows.find((row) => row.relpath_prefix === '')
  if (!root) return null

  const clusters: AnalysisTempoCluster[] = []
  for (const row of rows) {
    if (row.bpm === null || row.state !== 'resolved') continue
    if (row.relpath_prefix.startsWith('@cohort/')) {
      const topLevel = row.relpath_prefix.split('/')[1] ?? ''
      if (clusters.some((cluster) =>
        cluster.relpathPrefix === topLevel || cluster.relpathPrefix.startsWith(`${topLevel}/`)
      )) continue
    }
    if (clusters.some((cluster) =>
      analysisGroupContainsRelpath(cluster.relpathPrefix, row.relpath_prefix)
    )) continue
    clusters.push({
      relpathPrefix: row.relpath_prefix,
      sampleCount: row.sample_count,
      bpm: row.bpm,
      musicalKey: row.musical_key,
      bpmSupport: row.bpm_support,
      keySupport: row.key_support,
      confidence: row.confidence
    })
  }

  return {
    state: root.state,
    sampleCount: root.sample_count,
    bpm: root.bpm,
    musicalKey: root.musical_key,
    bpmSupport: root.bpm_support,
    keySupport: root.key_support,
    confidence: root.confidence,
    clusters
  }
}

export function applyAnalysisResult(
  db: DB,
  sampleId: number,
  result: { bpm: number | null; musicalKey: string | null; sampleType: SampleType | null },
  analysisRevision: number = ANALYSIS_REVISION
): void {
  db.prepare(
    `UPDATE samples SET
       raw_bpm = ?,
       raw_musical_key = ?,
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
    result.musicalKey,
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
