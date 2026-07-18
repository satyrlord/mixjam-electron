import type { LibraryRootState } from '../../../shared/backend-api'
import { ANALYSIS_REVISION, METADATA_REVISION } from './schema'
import type { DB } from './sql'

export interface MetadataCandidate {
  [key: string]: string
  relpath: string
}

export function listMetadataCandidates(db: DB, rootId: number, retryUnavailable: boolean, metadataRevision: number = METADATA_REVISION): MetadataCandidate[] {
  return db.prepare(
    `SELECT relpath FROM samples
     WHERE root_id = ? AND scan_state != 2 AND (
       scan_state = 0 OR metadata_revision < ? OR (? = 1 AND scan_state = 3)
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

export const UNSORTED_CATEGORY = 'Unsorted'

function unsortedCategoryId(db: DB): number {
  const row = db.prepare('SELECT id FROM categories WHERE parent_id IS NULL AND name = ?').get<{ id: number }>(UNSORTED_CATEGORY)
  if (row) return row.id
  return db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)').run(UNSORTED_CATEGORY).lastInsertRowid
}

export function ensureUnsortedCategory(db: DB): void { unsortedCategoryId(db) }

export function syncCategoriesFromNames(db: DB, folderNames: readonly string[]): string[] {
  ensureUnsortedCategory(db)
  const names = [UNSORTED_CATEGORY]
  for (const name of folderNames) {
    if (name === UNSORTED_CATEGORY) continue
    if (!db.prepare('SELECT 1 FROM categories WHERE parent_id IS NULL AND name = ?').get(name)) {
      db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)').run(name)
    }
    names.push(name)
  }
  return names
}

export function upsertStub(db: DB, rootId: number, relpath: string, filename: string, ext: string, sizeBytes: number, mtime: number): void {
  const existing = db.prepare(
    'SELECT id, scan_state, size_bytes, mtime FROM samples WHERE root_id = ? AND relpath = ?'
  ).get<{ id: number; scan_state: number; size_bytes: number | null; mtime: number | null }>(rootId, relpath)
  if (!existing) {
    db.prepare(
      `INSERT INTO samples (root_id, relpath, filename, ext, size_bytes, mtime, date_added, scan_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(rootId, relpath, filename, ext, sizeBytes, mtime, Date.now())
    return
  }
  if ((existing.scan_state === 1 || existing.scan_state === 3) && existing.size_bytes === sizeBytes && existing.mtime === mtime) return
  db.prepare(
    `UPDATE samples SET filename=?, ext=?, size_bytes=?, mtime=?, scan_state=0,
     duration=NULL, sample_rate=NULL, channels=NULL, metadata_revision=0, analysis_revision=0
     WHERE id=?`
  ).run(filename, ext, sizeBytes, mtime, existing.id)
}

export function markMissing(db: DB, rootId: number, relpath: string): void {
  db.prepare('UPDATE samples SET scan_state = 2 WHERE root_id = ? AND relpath = ?').run(rootId, relpath)
}

export function updateMetadata(db: DB, rootId: number, relpath: string, duration: number | null, sampleRate: number | null, channels: number | null, metadataRevision: number = METADATA_REVISION): void {
  db.prepare(
    `UPDATE samples SET duration=?, sample_rate=?, channels=?,
       analysis_revision = CASE WHEN scan_state = 3 THEN 0 ELSE analysis_revision END,
       scan_state=1, metadata_revision=? WHERE root_id=? AND relpath=?`
  ).run(duration, sampleRate, channels, metadataRevision, rootId, relpath)
}

export function markMetadataUnavailable(db: DB, rootId: number, relpath: string, metadataRevision: number = METADATA_REVISION, analysisRevision: number = ANALYSIS_REVISION): void {
  db.prepare(
    `UPDATE samples SET duration=NULL, sample_rate=NULL, channels=NULL,
       bpm = CASE WHEN bpm_source = 'manual' THEN bpm ELSE NULL END,
       bpm_source = CASE WHEN bpm_source = 'manual' THEN bpm_source ELSE NULL END,
       musical_key = CASE WHEN musical_key_source = 'manual' THEN musical_key ELSE NULL END,
       musical_key_source = CASE WHEN musical_key_source = 'manual' THEN musical_key_source ELSE NULL END,
       sample_type = CASE WHEN sample_type_source = 'manual' THEN sample_type ELSE NULL END,
       sample_type_source = CASE WHEN sample_type_source = 'manual' THEN sample_type_source ELSE NULL END,
       scan_state=3, metadata_revision=?, analysis_revision=? WHERE root_id=? AND relpath=?`
  ).run(metadataRevision, analysisRevision, rootId, relpath)
}

export function assignCategoryFromPath(db: DB, rootId: number, relpath: string): void {
  const segments = relpath.split('/').filter(Boolean)
  if (segments.length < 2) {
    db.prepare('UPDATE samples SET category_id = ? WHERE root_id = ? AND relpath = ?').run(unsortedCategoryId(db), rootId, relpath)
    return
  }
  const root = db.prepare('SELECT id FROM categories WHERE parent_id IS NULL AND name = ?').get<{ id: number }>(segments[0])
  if (!root) {
    db.prepare('UPDATE samples SET category_id = ? WHERE root_id = ? AND relpath = ?').run(unsortedCategoryId(db), rootId, relpath)
    return
  }
  const sample = db.prepare('SELECT id FROM samples WHERE root_id = ? AND relpath = ?').get<{ id: number }>(rootId, relpath)
  if (!sample) return
  db.prepare('UPDATE samples SET category_id = ? WHERE id = ?').run(root.id, sample.id)
  db.prepare('DELETE FROM sample_categories WHERE sample_id = ?').run(sample.id)
  db.prepare('INSERT OR IGNORE INTO sample_categories (sample_id, category_id) VALUES (?, ?)').run(sample.id, root.id)
  let parentId = root.id
  for (let i = 1; i < segments.length - 1; i++) {
    const name = segments[i]
    let sub = db.prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?').get<{ id: number }>(parentId, name)
    if (!sub) {
      const inserted = db.prepare('INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?, ?)').run(name, parentId)
      sub = inserted.changes > 0
        ? { id: inserted.lastInsertRowid }
        : db.prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?').get<{ id: number }>(parentId, name)!
    }
    db.prepare('INSERT OR IGNORE INTO sample_categories (sample_id, category_id) VALUES (?, ?)').run(sample.id, sub.id)
    parentId = sub.id
  }
}
