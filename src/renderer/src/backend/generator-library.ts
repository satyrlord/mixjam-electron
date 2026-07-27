import type {
  MixJamGeneratorParameters,
  MixJamGeneratorReadiness,
  MixJamGeneratorTempoCluster,
  SampleType
} from '../../../shared/backend-api'
import { sourceGroupFromRelpath, sourceGroupSlot } from '../../../shared/sample-palette'
import { isSampleType } from './analysis'
import {
  getCanonicalRootAnalysisSummary,
  type CanonicalRootAnalysisSummary
} from './analysis-persistence'
import { analysisOwnsAnyFieldSql } from './analysis-provenance'
import { contextKeyContainsRelpath } from './context-key'
import { SCAN_STATE, SCAN_STATE_PRESENT_SQL, SCAN_STATE_READY_SQL } from './scan-state'
import { labeledPoolToken } from './filename-evidence'
import { compareCodeUnits } from './generator-determinism'
import { ANALYSIS_REVISION, METADATA_REVISION } from './schema'
import type { DB } from './sql'

export interface GeneratorCandidate {
  relpath: string
  filename: string
  sizeBytes: number
  mtime: number
  duration: number
  bpm: number | null
  musicalKey: string | null
  sampleType: SampleType
  sourceGroup: string
  paletteSlot: number
  /**
   * The `(bpm, keyToken)` pool the filename label states, e.g. `140/A`. Derived
   * from the relpath rather than stored: it is a pure function of the name, so
   * it needs no column and no analysis revision. Null when the file carries no
   * structured label.
   */
  poolToken: string | null
  metadataRevision: number
  analysisRevision: number
}

export interface GeneratorRootSnapshot {
  rootKey: string
  candidates: GeneratorCandidate[]
  analysisSummary: CanonicalRootAnalysisSummary
}

function rootRow(db: DB, rootKey: string): { id: number; last_completed_at: number | null } | undefined {
  return db.prepare(
    'SELECT id, last_completed_at FROM scan_roots WHERE key = ?'
  ).get<{ id: number; last_completed_at: number | null }>(rootKey)
}

function pendingWorkCount(db: DB, rootId: number): number {
  return db.prepare(
    `SELECT COUNT(*) AS count
     FROM samples
     WHERE root_id = ? AND ${SCAN_STATE_PRESENT_SQL} AND (
       scan_state = ${SCAN_STATE.STUB} OR
       metadata_revision < ? OR
       (${SCAN_STATE_READY_SQL} AND analysis_revision < ?
         AND (${analysisOwnsAnyFieldSql()}))
     )`
  ).get<{ count: number }>(rootId, METADATA_REVISION, ANALYSIS_REVISION)!.count
}

export function getStoredGeneratorReadiness(db: DB, rootKey: string): MixJamGeneratorReadiness {
  const root = rootRow(db, rootKey)
  if (!root || root.last_completed_at === null) {
    return { status: 'needs-preparation', message: 'Prepare the Sample Folder before generating.' }
  }
  if (pendingWorkCount(db, root.id) > 0) {
    return { status: 'needs-preparation', message: 'Finish library metadata and analysis before generating.' }
  }
  const candidates = listGeneratorCandidates(db, root.id)
  if (candidates.length === 0) {
    return { status: 'needs-preparation', message: 'No analyzed samples are available for generation.' }
  }
  const summary = getCanonicalRootAnalysisSummary(db, rootKey)
  if (!summary) {
    return { status: 'needs-preparation', message: 'Finish library analysis before generating.' }
  }
  return {
    status: 'ready',
    analysisState: summary.state,
    detectedBpm: summary.state === 'resolved' ? summary.bpm : null,
    eligibleSamples: candidates.length,
    tempoClusters: summary.clusters.map(toGeneratorTempoCluster)
  }
}

function toGeneratorTempoCluster(cluster: CanonicalRootAnalysisSummary['clusters'][number]): MixJamGeneratorTempoCluster {
  return {
    relpathPrefix: cluster.relpathPrefix,
    sampleCount: cluster.sampleCount,
    bpm: cluster.bpm,
    musicalKey: cluster.musicalKey,
    confidence: cluster.confidence
  }
}

function listGeneratorCandidates(db: DB, rootId: number): GeneratorCandidate[] {
  const rows = db.prepare(
    `SELECT samples.relpath, samples.filename, samples.size_bytes, samples.mtime,
            samples.duration, samples.bpm, samples.musical_key, samples.sample_type,
            samples.metadata_revision, samples.analysis_revision
     FROM samples
     WHERE root_id = ?
       AND ${SCAN_STATE_READY_SQL}
       AND metadata_revision = ?
       AND duration > 0
       AND sample_type IS NOT NULL
     ORDER BY relpath`
  ).all<{
    relpath: string
    filename: string
    size_bytes: number | null
    mtime: number | null
    duration: number
    bpm: number | null
    musical_key: string | null
    sample_type: string
    metadata_revision: number
    analysis_revision: number
  }>(rootId, METADATA_REVISION)
  return rows.flatMap((row) => {
    if (!isSampleType(row.sample_type)) return []
    const sourceGroup = sourceGroupFromRelpath(row.relpath)
    return [{
      relpath: row.relpath,
      filename: row.filename,
      sizeBytes: row.size_bytes ?? 0,
      mtime: row.mtime ?? 0,
      duration: row.duration,
      bpm: row.bpm !== null && Number.isFinite(row.bpm) && row.bpm > 0 ? row.bpm : null,
      musicalKey: row.musical_key,
      sampleType: row.sample_type,
      sourceGroup,
      paletteSlot: sourceGroupSlot(sourceGroup),
      poolToken: labeledPoolToken(row.relpath),
      metadataRevision: row.metadata_revision,
      analysisRevision: row.analysis_revision
    }]
  })
}

export function loadGeneratorSnapshot(db: DB, rootKey: string): GeneratorRootSnapshot {
  const root = rootRow(db, rootKey)
  if (!root || root.last_completed_at === null) {
    throw new Error('The Sample Folder has not completed preparation.')
  }
  if (pendingWorkCount(db, root.id) > 0) {
    throw new Error('The Sample Folder still has metadata or analysis work pending.')
  }
  const candidates = listGeneratorCandidates(db, root.id)
  if (candidates.length === 0) throw new Error('No analyzed samples are available for generation.')
  const analysisSummary = getCanonicalRootAnalysisSummary(db, rootKey)
  if (!analysisSummary) throw new Error('Library analysis has not produced a canonical summary.')
  return { rootKey, candidates, analysisSummary }
}

export interface GeneratorAnalysisSelection {
  candidates: GeneratorCandidate[]
  parameters: MixJamGeneratorParameters
  detectedBpm: number
}

export function selectGeneratorAnalysisGroup(
  snapshot: GeneratorRootSnapshot,
  parameters: MixJamGeneratorParameters
): GeneratorAnalysisSelection {
  const { analysisSummary } = snapshot
  let cluster: CanonicalRootAnalysisSummary['clusters'][number] | undefined

  if (analysisSummary.state === 'mixed') {
    if (parameters.tempoClusterPrefix === undefined) {
      throw new Error('Select an analyzer group before generating from a mixed Sample Folder.')
    }
    cluster = analysisSummary.clusters.find(
      (candidate) => candidate.relpathPrefix === parameters.tempoClusterPrefix
    )
    if (!cluster) throw new Error('The selected analyzer group is no longer available.')
  } else if (analysisSummary.state === 'resolved') {
    cluster = analysisSummary.clusters[0]
    if (!cluster && parameters.tempoClusterPrefix !== undefined) {
      throw new Error('The selected analyzer group is no longer available.')
    }
    if (cluster && parameters.tempoClusterPrefix !== undefined &&
        parameters.tempoClusterPrefix !== cluster.relpathPrefix) {
      throw new Error('The selected analyzer group is no longer available.')
    }
  } else if (parameters.tempoClusterPrefix !== undefined) {
    throw new Error('The selected analyzer group is no longer available.')
  }

  const candidates = cluster
    ? snapshot.candidates.filter((candidate) =>
        contextKeyContainsRelpath(cluster.relpathPrefix, candidate.relpath))
    : snapshot.candidates
  if (candidates.length === 0) throw new Error('The selected analyzer group has no generator-ready samples.')

  const detectedBpm = cluster?.bpm ?? analysisSummary.bpm
  if (parameters.bpmMode === 'follow-detected' && detectedBpm === null) {
    throw new Error('No confident analyzer tempo is available; choose Fixed BPM.')
  }
  const selectedParameters = cluster
    ? { ...parameters, tempoClusterPrefix: cluster.relpathPrefix }
    : { ...parameters, tempoClusterPrefix: undefined }
  return {
    candidates,
    parameters: parameters.bpmMode === 'follow-detected'
      ? { ...selectedParameters, bpm: detectedBpm! }
      : selectedParameters,
    detectedBpm: detectedBpm ?? parameters.bpm!
  }
}

export async function fingerprintGeneratorSnapshot(snapshot: GeneratorRootSnapshot): Promise<string> {
  const candidates = [...snapshot.candidates]
    .sort((left, right) => compareCodeUnits(left.relpath, right.relpath))
    .map((candidate) => ({
      relpath: candidate.relpath,
      sizeBytes: candidate.sizeBytes,
      mtime: candidate.mtime,
      metadataRevision: candidate.metadataRevision,
      analysisRevision: candidate.analysisRevision,
      duration: candidate.duration,
      bpm: candidate.bpm,
      musicalKey: candidate.musicalKey,
      sampleType: candidate.sampleType,
      sourceGroup: candidate.sourceGroup,
      paletteSlot: candidate.paletteSlot
    }))
  const canonical = JSON.stringify({
    version: 1,
    rootKey: snapshot.rootKey,
    analysisSummary: snapshot.analysisSummary,
    candidates
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
