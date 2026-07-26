import type { LibraryRootState } from '../../../shared/backend-api'
import {
  UNSORTED_NAME,
  folderTagNamesFromRelpath as folderTagNames,
  pathSegments
} from '../../../shared/sample-palette'
import { clearAnalyzedFieldSql } from './analysis-provenance'
import { SCAN_STATE, SCAN_STATE_PRESENT_SQL } from './scan-state'
import { ANALYSIS_REVISION, METADATA_REVISION } from './schema'
import type { DB } from './sql'

export interface MetadataCandidate {
  [key: string]: string
  relpath: string
}

export function listMetadataCandidates(db: DB, rootId: number, retryUnavailable: boolean, metadataRevision: number = METADATA_REVISION): MetadataCandidate[] {
  return db.prepare(
    `SELECT relpath FROM samples
     WHERE root_id = ? AND ${SCAN_STATE_PRESENT_SQL} AND (
       scan_state = ${SCAN_STATE.STUB} OR metadata_revision < ?
       OR (? = 1 AND scan_state = ${SCAN_STATE.METADATA_UNAVAILABLE})
     ) ORDER BY id`
  ).all<MetadataCandidate>(rootId, metadataRevision, retryUnavailable ? 1 : 0)
}

export function scanRootId(db: DB, rootKey: string): number | undefined {
  return db.prepare('SELECT id FROM scan_roots WHERE key = ?').get<{ id: number }>(rootKey)?.id
}

export function ensureScanRoot(db: DB, rootKey: string): number {
  const result = db.prepare('INSERT OR IGNORE INTO scan_roots (key) VALUES (?)').run(rootKey)
  return result.changes > 0 ? result.lastInsertRowid : scanRootId(db, rootKey)!
}

export function getLibraryRootState(db: DB, rootKey: string): LibraryRootState {
  const root = db.prepare(
    `SELECT last_completed_at, legacy_index_available FROM scan_roots WHERE key = ?`
  ).get<{ last_completed_at: number | null; legacy_index_available: number }>(rootKey)
  return root
    ? { rootKey, lastCompletedAt: root.last_completed_at, hasUsableIndex: root.last_completed_at !== null || root.legacy_index_available === 1 }
    : { rootKey, lastCompletedAt: null, hasUsableIndex: false }
}

export function completeScanRoot(db: DB, rootId: number, completedAt: number = Date.now()): number {
  db.prepare('UPDATE scan_roots SET last_completed_at = ? WHERE id = ?').run(completedAt, rootId)
  return completedAt
}

export const UNSORTED_TAG = UNSORTED_NAME

function ensureFolderTag(db: DB, name: string): number {
  db.prepare(
    `INSERT INTO tags (name, color, user_created) VALUES (?, NULL, 0)
     ON CONFLICT(name) DO NOTHING`
  ).run(name)
  return db.prepare('SELECT id FROM tags WHERE name = ?').get<{ id: number }>(name)!.id
}

export function ensureFolderTags(
  db: DB,
  directoryRelpaths: readonly string[]
): ReadonlySet<number> {
  const ids = new Set<number>([ensureFolderTag(db, UNSORTED_TAG)])
  // These are directory paths, so every segment names a tag (unlike a file
  // relpath, whose last segment is the filename).
  const names = new Set(directoryRelpaths.flatMap(pathSegments))
  const orderedNames = [...names].sort((left, right) => left.localeCompare(right))
  for (const name of orderedNames) ids.add(ensureFolderTag(db, name))
  return ids
}

function replaceFolderTagSources(db: DB, rootId: number, activeTagIds: readonly number[]): void {
  const insert = db.prepare(
    'INSERT INTO folder_tag_sources (tag_id, root_id) VALUES (?, ?)'
  )
  db.prepare('DELETE FROM folder_tag_sources WHERE root_id = ?').run(rootId)
  for (const id of activeTagIds) insert.run(id, rootId)
}

/** The staging table is TEMP, so it does not survive a reconnect and cannot be
 *  part of the persistent DDL. Every function that touches it calls this first,
 *  which makes "the stage exists" an invariant of this module rather than an
 *  ordering contract callers have to honor. */
function ensureFolderTagStage(db: DB): void {
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS folder_tag_stage (
      root_id INTEGER NOT NULL,
      sample_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (root_id, sample_id, tag_id)
    );
  `)
}

export function resetFolderTagStage(db: DB): void {
  ensureFolderTagStage(db)
  db.exec('DELETE FROM folder_tag_stage;')
}

export function stageFolderTagsFromPath(db: DB, rootId: number, relpath: string): void {
  ensureFolderTagStage(db)
  const sample = db.prepare(
    'SELECT id FROM samples WHERE root_id = ? AND relpath = ?'
  ).get<{ id: number }>(rootId, relpath)
  if (!sample) return
  const insert = db.prepare(
    'INSERT OR IGNORE INTO folder_tag_stage (root_id, sample_id, tag_id) VALUES (?, ?, ?)'
  )
  for (const name of folderTagNames(relpath)) {
    insert.run(rootId, sample.id, ensureFolderTag(db, name))
  }
}

export function commitFolderTagProjection(
  db: DB,
  rootId: number,
  activeTagIds: ReadonlySet<number>,
  missingRelpaths: readonly string[] = []
): void {
  ensureFolderTagStage(db)
  // One transaction: samples that vanished retire (soft delete) in the same
  // commit that swaps the folder-tag projection. Without this, a reader mid-
  // scan could see folder-derived tags whose backing samples are already
  // hidden — phantom tags.
  db.transaction((ids: readonly number[], missing: readonly string[]) => {
    const markStmt = db.prepare(
      `UPDATE samples SET scan_state = ${SCAN_STATE.MISSING} WHERE root_id = ? AND relpath = ?`
    )
    for (const relpath of missing) markStmt.run(rootId, relpath)
    db.prepare(
      `DELETE FROM sample_tags
       WHERE source = 'folder'
         AND sample_id IN (SELECT id FROM samples WHERE root_id = ?)`
    ).run(rootId)
    db.prepare(
      `INSERT OR IGNORE INTO sample_tags (sample_id, tag_id, source)
       SELECT sample_id, tag_id, 'folder'
       FROM folder_tag_stage
       WHERE root_id = ?`
    ).run(rootId)
    replaceFolderTagSources(db, rootId, ids)
    db.prepare('DELETE FROM folder_tag_stage WHERE root_id = ?').run(rootId)
  })([...activeTagIds], missingRelpaths)
}

export function upsertStub(db: DB, rootId: number, relpath: string, filename: string, ext: string, sizeBytes: number, mtime: number): void {
  const existing = db.prepare(
    'SELECT id, scan_state, size_bytes, mtime FROM samples WHERE root_id = ? AND relpath = ?'
  ).get<{ id: number; scan_state: number; size_bytes: number | null; mtime: number | null }>(rootId, relpath)
  if (!existing) {
    db.prepare(
      `INSERT INTO samples (root_id, relpath, filename, ext, size_bytes, mtime, date_added, scan_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${SCAN_STATE.STUB})`
    ).run(rootId, relpath, filename, ext, sizeBytes, mtime, Date.now())
    return
  }
  if ((existing.scan_state === SCAN_STATE.METADATA_READY ||
       existing.scan_state === SCAN_STATE.METADATA_UNAVAILABLE) &&
      existing.size_bytes === sizeBytes && existing.mtime === mtime) return
  db.prepare(
    `UPDATE samples SET filename=?, ext=?, size_bytes=?, mtime=?, scan_state=${SCAN_STATE.STUB},
     duration=NULL, sample_rate=NULL, channels=NULL, metadata_revision=0, analysis_revision=0
     WHERE id=?`
  ).run(filename, ext, sizeBytes, mtime, existing.id)
}

export function updateMetadata(db: DB, rootId: number, relpath: string, duration: number | null, sampleRate: number | null, channels: number | null, metadataRevision: number = METADATA_REVISION): void {
  db.prepare(
    `UPDATE samples SET duration=?, sample_rate=?, channels=?,
       analysis_revision = CASE WHEN scan_state = ${SCAN_STATE.METADATA_UNAVAILABLE}
         THEN 0 ELSE analysis_revision END,
       scan_state=${SCAN_STATE.METADATA_READY}, metadata_revision=?
     WHERE root_id=? AND relpath=?`
  ).run(duration, sampleRate, channels, metadataRevision, rootId, relpath)
}

export function markMetadataUnavailable(db: DB, rootId: number, relpath: string, metadataRevision: number = METADATA_REVISION, analysisRevision: number = ANALYSIS_REVISION): void {
  db.prepare(
    `UPDATE samples SET duration=NULL, sample_rate=NULL, channels=NULL,
       ${clearAnalyzedFieldSql('bpm')},
       ${clearAnalyzedFieldSql('musical_key')},
       ${clearAnalyzedFieldSql('sample_type')},
       scan_state=${SCAN_STATE.METADATA_UNAVAILABLE}, metadata_revision=?, analysis_revision=?
     WHERE root_id=? AND relpath=?`
  ).run(metadataRevision, analysisRevision, rootId, relpath)
}
