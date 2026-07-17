import type { MixJamGeneratorReadiness, SampleType } from '../../../shared/backend-api'
import { categorySlot } from '../../../shared/sample-palette'
import { isSampleType } from './analysis'
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
  categoryName: string
  paletteSlot: number
  metadataRevision: number
  analysisRevision: number
}

interface GeneratorRootSnapshot {
  rootKey: string
  candidates: GeneratorCandidate[]
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
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
     WHERE root_id = ? AND scan_state != 2 AND (
       scan_state = 0 OR
       metadata_revision < ? OR
       (scan_state = 1 AND analysis_revision < ? AND (
         COALESCE(bpm_source, '') != 'manual' OR
         COALESCE(musical_key_source, '') != 'manual' OR
         COALESCE(sample_type_source, '') != 'manual'
       ))
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
  return {
    status: 'ready',
    detectedBpm: detectedGeneratorBpm(candidates),
    eligibleSamples: candidates.length
  }
}

function listGeneratorCandidates(db: DB, rootId: number): GeneratorCandidate[] {
  const rows = db.prepare(
    `SELECT samples.relpath, samples.filename, samples.size_bytes, samples.mtime,
            samples.duration, samples.bpm, samples.musical_key, samples.sample_type,
            COALESCE(primary_category.name, 'Unsorted') AS category_name,
            samples.metadata_revision, samples.analysis_revision
     FROM samples
     LEFT JOIN categories AS primary_category ON primary_category.id = samples.category_id
     WHERE root_id = ?
       AND scan_state = 1
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
    category_name: string
    metadata_revision: number
    analysis_revision: number
  }>(rootId, METADATA_REVISION)
  return rows.flatMap((row) => isSampleType(row.sample_type) ? [{
    relpath: row.relpath,
    filename: row.filename,
    sizeBytes: row.size_bytes ?? 0,
    mtime: row.mtime ?? 0,
    duration: row.duration,
    bpm: row.bpm !== null && Number.isFinite(row.bpm) && row.bpm > 0 ? row.bpm : null,
    musicalKey: row.musical_key,
    sampleType: row.sample_type,
    categoryName: row.category_name,
    paletteSlot: categorySlot(row.category_name),
    metadataRevision: row.metadata_revision,
    analysisRevision: row.analysis_revision
  }] : [])
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
  return { rootKey, candidates }
}

export function detectedGeneratorBpm(candidates: readonly GeneratorCandidate[]): number {
  const bpms = candidates
    .flatMap((candidate) => candidate.bpm === null ? [] : [candidate.bpm])
    .sort((left, right) => left - right)
  if (bpms.length === 0) return 128
  const middle = Math.floor(bpms.length / 2)
  const median = bpms.length % 2 === 1
    ? Math.round(bpms[middle]!)
    : Math.round((bpms[middle - 1]! + bpms[middle]!) / 2)
  return Math.max(60, Math.min(180, median))
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
      categoryName: candidate.categoryName,
      paletteSlot: candidate.paletteSlot
    }))
  const canonical = JSON.stringify({ version: 1, rootKey: snapshot.rootKey, candidates })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
