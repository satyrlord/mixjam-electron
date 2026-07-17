// SQL layer of the backend worker. Functions are synchronous (sqlite-wasm calls
// are sync once the VFS is open); the async boundary is the worker message
// protocol above this.

import type {
  AnalysisSource,
  LibraryRootState,
  SampleAnalysisPatch,
  SampleQueryRequest,
  SampleType
} from '../../../shared/backend-api'
import { isSampleType } from './analysis'
import { parseMusicalKey } from './musical-key'
import { ANALYSIS_REVISION, METADATA_REVISION } from './schema'
import type { BindValue, DB } from './sql'

export interface TagRow {
  id: number
  name: string
  color: string | null
}

export interface CategoryRow {
  id: number
  name: string
  parentId: number | null
}

export interface LibraryRow {
  id: number
  name: string
  createdAt: number
  ruleJson: string
}

export interface SampleRow {
  id: number
  relpath: string
  filename: string
  ext: string | null
  sizeBytes: number | null
  mtime: number | null
  duration: number | null
  sampleRate: number | null
  channels: number | null
  bpm: number | null
  bpmSource: AnalysisSource
  musicalKey: string | null
  musicalKeySource: AnalysisSource
  sampleType: SampleType | null
  sampleTypeSource: AnalysisSource
  dateAdded: number
  scanState: number
  categoryId: number | null
  tagIds: number[]
  tags: string[]
}

export type AnalysisCandidate = {
  id: number
  relpath: string
}

export type MetadataCandidate = {
  relpath: string
}

function analysisSource(value: string | null): AnalysisSource {
  return value === 'analysis' || value === 'manual' ? value : null
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

export function listMetadataCandidates(
  db: DB,
  rootId: number,
  retryUnavailable: boolean,
  metadataRevision: number = METADATA_REVISION
): MetadataCandidate[] {
  return db.prepare(
    `SELECT relpath FROM samples
     WHERE root_id = ? AND scan_state != 2 AND (
       scan_state = 0 OR
       metadata_revision < ? OR
       (? = 1 AND scan_state = 3)
     )
     ORDER BY id`
  ).all<MetadataCandidate>(rootId, metadataRevision, retryUnavailable ? 1 : 0)
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
  if (Object.prototype.hasOwnProperty.call(patch, 'bpm')) {
    const bpm = patch.bpm
    if (bpm !== null && (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < 20 || bpm > 400)) {
      throw new Error('BPM must be between 20 and 400')
    }
    db.prepare('UPDATE samples SET bpm = ?, bpm_source = ? WHERE id = ?').run(
      bpm ?? null, bpm === null ? null : 'manual', sampleId
    )
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'musicalKey')) {
    const key = patch.musicalKey
    if (key !== null && (typeof key !== 'string' || parseMusicalKey(key) === null)) {
      throw new Error('Musical key must look like C, C#, Am, or Bbm')
    }
    db.prepare('UPDATE samples SET musical_key = ?, musical_key_source = ? WHERE id = ?').run(
      key, key === null ? null : 'manual', sampleId
    )
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'sampleType')) {
    const sampleType = patch.sampleType
    if (sampleType !== null && !isSampleType(sampleType)) throw new Error('Invalid sample type')
    db.prepare('UPDATE samples SET sample_type = ?, sample_type_source = ? WHERE id = ?').run(
      sampleType ?? null, sampleType === null ? null : 'manual', sampleId
    )
  }
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function listTags(db: DB): TagRow[] {
  return db
    .prepare('SELECT id, name, color FROM tags ORDER BY name')
    .all<{ id: number; name: string; color: string | null }>()
    .map((r) => ({ id: r.id, name: r.name, color: r.color }))
}

export function createTag(db: DB, name: string, color?: string): TagRow {
  // Idempotent: a duplicate name (UNIQUE) returns the existing tag rather than
  // throwing a constraint error across the worker boundary.
  const result = db
    .prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)')
    .run(name, color ?? null)
  if (result.changes > 0) {
    return { id: result.lastInsertRowid, name, color: color ?? null }
  }
  const existing = db
    .prepare('SELECT id, name, color FROM tags WHERE name = ?')
    .get<{ id: number; name: string; color: string | null }>(name)!
  return { id: existing.id, name: existing.name, color: existing.color }
}

export function renameTag(db: DB, id: number, name: string): void {
  db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
}

export function setTagColor(db: DB, id: number, color: string | null): void {
  db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, id)
}

export function deleteTag(db: DB, id: number): void {
  db.prepare('DELETE FROM tags WHERE id = ?').run(id)
}

export function assignTag(db: DB, sampleId: number, tagId: number): void {
  db.prepare('INSERT OR IGNORE INTO sample_tags (sample_id, tag_id) VALUES (?, ?)').run(
    sampleId,
    tagId
  )
}

export function unassignTag(db: DB, sampleId: number, tagId: number): void {
  db.prepare('DELETE FROM sample_tags WHERE sample_id = ? AND tag_id = ?').run(sampleId, tagId)
}

export function tagsForSample(db: DB, sampleId: number): TagRow[] {
  return db
    .prepare(
      `SELECT t.id, t.name, t.color FROM tags t
       JOIN sample_tags st ON st.tag_id = t.id
       WHERE st.sample_id = ?
       ORDER BY t.name`
    )
    .all<{ id: number; name: string; color: string | null }>(sampleId)
    .map((r) => ({ id: r.id, name: r.name, color: r.color }))
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function listCategories(db: DB): CategoryRow[] {
  return db
    .prepare('SELECT id, name, parent_id FROM categories ORDER BY parent_id, name')
    .all<{ id: number; name: string; parent_id: number | null }>()
    .map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id }))
}

export function createCategory(db: DB, name: string, parentId?: number): CategoryRow {
  if (parentId === undefined) {
    // Guard against duplicate root categories (SQLite NULL != NULL in UNIQUE).
    const existing = db
      .prepare('SELECT id FROM categories WHERE parent_id IS NULL AND name = ?')
      .get<{ id: number }>(name)
    if (existing) return { id: existing.id, name, parentId: null }
  }
  const result = db
    .prepare('INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?, ?)')
    .run(name, parentId ?? null)
  // When INSERT OR IGNORE is a no-op (duplicate parent_id+name), lastInsertRowid
  // holds the previous insert's id, not the existing row's — so key off changes.
  const id =
    result.changes > 0
      ? result.lastInsertRowid
      : db
          .prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS ?')
          .get<{ id: number }>(name, parentId ?? null)!.id
  return { id, name, parentId: parentId ?? null }
}

export function deleteCategory(db: DB, id: number): void {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Scan roots (per-Sample-Folder scoping)
// ---------------------------------------------------------------------------

/** Resolves the scan_roots id for a Sample Folder ref id, or undefined when
 *  the folder has never been scanned. */
export function scanRootId(db: DB, rootKey: string): number | undefined {
  const row = db.prepare('SELECT id FROM scan_roots WHERE key = ?').get<{ id: number }>(rootKey)
  return row?.id
}

/** Resolves-or-creates the scan root for a Sample Folder ref id. */
export function ensureScanRoot(db: DB, rootKey: string): number {
  const result = db.prepare('INSERT OR IGNORE INTO scan_roots (key) VALUES (?)').run(rootKey)
  return result.changes > 0
    ? result.lastInsertRowid
    : db.prepare('SELECT id FROM scan_roots WHERE key = ?').get<{ id: number }>(rootKey)!.id
}

export function getLibraryRootState(db: DB, rootKey: string): LibraryRootState {
  const root = db.prepare(
    `SELECT id, last_completed_at, legacy_index_available
     FROM scan_roots
     WHERE key = ?`
  ).get<{
    id: number
    last_completed_at: number | null
    legacy_index_available: number
  }>(rootKey)

  if (!root) {
    return { rootKey, lastCompletedAt: null, hasUsableIndex: false }
  }

  return {
    rootKey,
    lastCompletedAt: root.last_completed_at,
    hasUsableIndex: root.last_completed_at !== null || root.legacy_index_available === 1
  }
}

export function completeScanRoot(
  db: DB,
  rootId: number,
  completedAt: number = Date.now()
): number {
  db.prepare('UPDATE scan_roots SET last_completed_at = ? WHERE id = ?').run(completedAt, rootId)
  return completedAt
}

export const UNSORTED_CATEGORY = 'Unsorted'

function unsortedCategoryId(db: DB): number {
  const row = db
    .prepare('SELECT id FROM categories WHERE parent_id IS NULL AND name = ?')
    .get<{ id: number }>(UNSORTED_CATEGORY)
  if (row) return row.id
  const result = db
    .prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)')
    .run(UNSORTED_CATEGORY)
  return result.lastInsertRowid
}

export function ensureUnsortedCategory(db: DB): void {
  unsortedCategoryId(db)
}

/**
 * Synchronise root categories with the top-level subdirectories of the sample
 * folder. The indexer passes the subdirectory names it saw during traversal;
 * a category is created for every name (when one does not already exist) and
 * the hardcoded "Unsorted" category is always ensured. Returns the resulting
 * category names.
 */
export function syncCategoriesFromNames(db: DB, folderNames: readonly string[]): string[] {
  ensureUnsortedCategory(db)
  const names: string[] = [UNSORTED_CATEGORY]

  for (const name of folderNames) {
    if (name === UNSORTED_CATEGORY) continue // reserved

    const exists = db
      .prepare('SELECT 1 FROM categories WHERE parent_id IS NULL AND name = ?')
      .get(name)
    if (!exists) {
      db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)').run(name)
    }
    names.push(name)
  }

  return names
}

// ---------------------------------------------------------------------------
// Libraries
// ---------------------------------------------------------------------------

export function listLibraries(db: DB): LibraryRow[] {
  return db
    .prepare(
      `SELECT l.id, l.name, l.created_at, lr.rule_json
       FROM libraries l
       JOIN library_rules lr ON lr.library_id = l.id
       ORDER BY l.name`
    )
    .all<{ id: number; name: string; created_at: number; rule_json: string }>()
    .map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, ruleJson: r.rule_json }))
}

export function saveLibrary(db: DB, name: string, ruleJson: string): LibraryRow {
  const now = Date.now()
  const result = db.prepare('INSERT INTO libraries (name, created_at) VALUES (?, ?)').run(name, now)
  const libraryId = result.lastInsertRowid
  db.prepare('INSERT INTO library_rules (library_id, rule_json) VALUES (?, ?)').run(
    libraryId,
    ruleJson
  )
  return { id: libraryId, name, createdAt: now, ruleJson }
}

export function deleteLibrary(db: DB, id: number): void {
  db.prepare('DELETE FROM libraries WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Sample queries
// ---------------------------------------------------------------------------

/**
 * Compatibility query for lower-level callers. Readiness is completion-based
 * so an empty completed root is ready. Roots with browseable rows from a prior
 * schema version remain usable while their first post-migration sync reconciles.
 */
export function hasSamples(db: DB, rootKey?: string): boolean {
  if (rootKey !== undefined) {
    return getLibraryRootState(db, rootKey).hasUsableIndex
  }
  return db.prepare(
    `SELECT 1
     FROM scan_roots
     WHERE last_completed_at IS NOT NULL
        OR legacy_index_available = 1
     LIMIT 1`
  ).get() !== undefined
}

/**
 * Relpaths of every missing sample (scan_state = 2) under the given root.
 * Drives the tracker's hazard-stripe treatment on placements whose file vanished
 * between scans (spec-002 AC-013). Missing rows are soft-deleted stubs, so
 * the result is bounded by library size, not placement count.
 */
export function listMissingRelpaths(db: DB, rootKey: string): string[] {
  const rootId = scanRootId(db, rootKey)
  if (rootId === undefined) return []
  return db
    .prepare('SELECT relpath FROM samples WHERE root_id = ? AND scan_state = 2')
    .all<{ relpath: string }>(rootId)
    .map((row) => row.relpath)
}

// The query options are exactly the request shape — one definition, no drift.
export type SampleQueryOptions = SampleQueryRequest

export interface SampleQueryResult {
  rows: SampleRow[]
  total: number
}

/**
 * Builds a safe FTS5 prefix query from raw user input. Each whitespace-separated
 * token is wrapped in double quotes (a quoted FTS5 string treats every character
 * literally, so operators like -, ", (, :, OR, NEAR cannot break the syntax) and
 * given a trailing `*` for prefix matching. Returns '' when there are no tokens.
 */
export function toFtsPrefixQuery(textSearch: string): string {
  return textSearch
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' ')
}

function buildSubtreeCTE(db: DB, categoryId: number): number[] {
  return db
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
      )
      SELECT id FROM subtree`
    )
    .all<{ id: number }>(categoryId)
    .map((r) => r.id)
}

export function querySamples(db: DB, opts: SampleQueryOptions = {}): SampleQueryResult {
  const {
    textSearch,
    categoryId,
    tagIds,
    rootId: rootKey,
    limit = 200,
    offset = 0,
    sortBy = 'filename',
    sortDir = 'asc'
  } = opts

  const conditions: string[] = ['s.scan_state != 2']
  const params: BindValue[] = []

  if (rootKey !== undefined) {
    const rootId = scanRootId(db, rootKey)
    // A folder that has never been scanned has no rows by definition.
    if (rootId === undefined) return { rows: [], total: 0 }
    conditions.push('s.root_id = ?')
    params.push(rootId)
  }

  if (textSearch && textSearch.trim()) {
    const match = toFtsPrefixQuery(textSearch)
    if (match) {
      conditions.push(`s.id IN (SELECT rowid FROM samples_fts WHERE samples_fts MATCH ?)`)
      params.push(match)
    }
  }

  if (categoryId !== undefined) {
    const ids = buildSubtreeCTE(db, categoryId)
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ')
      // Match the sample's root assignment (category_id) OR any subcategory
      // membership recorded in the sample_categories join table, so selecting a
      // subcategory chip finds samples whose deeper-folder membership lives only
      // in the join table (see docs/data-model.md).
      conditions.push(
        `(s.category_id IN (${placeholders})
          OR EXISTS (SELECT 1 FROM sample_categories sc
                     WHERE sc.sample_id = s.id AND sc.category_id IN (${placeholders})))`
      )
      params.push(...ids, ...ids)
    }
  }

  if (tagIds && tagIds.length > 0) {
    const placeholders = tagIds.map(() => '?').join(', ')
    conditions.push(
      `EXISTS (SELECT 1 FROM sample_tags st WHERE st.sample_id = s.id AND st.tag_id IN (${placeholders}))`
    )
    params.push(...tagIds)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const orderCol =
    sortBy === 'duration' ? 's.duration' : sortBy === 'dateAdded' ? 's.date_added' : 's.filename'
  const order = `${orderCol} ${sortDir.toUpperCase()}`

  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM samples s ${where}`)
    .get<{ cnt: number }>(...params)!
  const total = countRow.cnt

  // Tags ride along as aggregated subqueries so the browser and footer can show
  // per-sample tags without an N+1 query. Names join on the unit separator
  // (char(31)) because tag names may contain commas.
  const rows = db
    .prepare(
      `SELECT s.id, s.relpath, s.filename, s.ext, s.size_bytes, s.mtime,
              s.duration, s.sample_rate, s.channels, s.bpm, s.bpm_source,
              s.musical_key, s.musical_key_source, s.sample_type, s.sample_type_source,
              s.date_added, s.scan_state, s.category_id,
              (SELECT GROUP_CONCAT(st.tag_id) FROM sample_tags st
                WHERE st.sample_id = s.id) AS tag_ids,
              (SELECT GROUP_CONCAT(t.name, char(31)) FROM sample_tags st
                JOIN tags t ON t.id = st.tag_id
                WHERE st.sample_id = s.id) AS tag_names
       FROM samples s ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all<{
      id: number
      relpath: string
      filename: string
      ext: string | null
      size_bytes: number | null
      mtime: number | null
      duration: number | null
      sample_rate: number | null
      channels: number | null
      bpm: number | null
      bpm_source: string | null
      musical_key: string | null
      musical_key_source: string | null
      sample_type: string | null
      sample_type_source: string | null
      date_added: number
      scan_state: number
      category_id: number | null
      tag_ids: string | null
      tag_names: string | null
    }>(...params, limit, offset)

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      relpath: r.relpath,
      filename: r.filename,
      ext: r.ext,
      sizeBytes: r.size_bytes,
      mtime: r.mtime,
      duration: r.duration,
      sampleRate: r.sample_rate,
      channels: r.channels,
      bpm: r.bpm,
      bpmSource: analysisSource(r.bpm_source),
      musicalKey: r.musical_key,
      musicalKeySource: analysisSource(r.musical_key_source),
      sampleType: isSampleType(r.sample_type) ? r.sample_type : null,
      sampleTypeSource: analysisSource(r.sample_type_source),
      dateAdded: r.date_added,
      scanState: r.scan_state,
      categoryId: r.category_id,
      tagIds: r.tag_ids ? r.tag_ids.split(',').map(Number).sort((a, b) => a - b) : [],
      tags: r.tag_names ? r.tag_names.split('\u001F').sort((a, b) => a.localeCompare(b)) : []
    }))
  }
}

// ---------------------------------------------------------------------------
// Stub upsert (used by indexer)
// ---------------------------------------------------------------------------

export function upsertStub(
  db: DB,
  rootId: number,
  relpath: string,
  filename: string,
  ext: string,
  sizeBytes: number,
  mtime: number
): void {
  const existing = db
    .prepare(
      'SELECT id, scan_state, size_bytes, mtime FROM samples WHERE root_id = ? AND relpath = ?'
    )
    .get<{ id: number; scan_state: number; size_bytes: number | null; mtime: number | null }>(
      rootId,
      relpath
    )

  if (!existing) {
    db.prepare(
      `INSERT INTO samples (root_id, relpath, filename, ext, size_bytes, mtime, date_added, scan_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(rootId, relpath, filename, ext, sizeBytes, mtime, Date.now())
    return
  }

  // Incremental change detection: a fully-scanned row whose size and mtime are
  // unchanged is left as-is so phase2 does not needlessly re-extract metadata
  // (see AGENTS.md "(size, mtime) change detection"). A previously-missing row
  // (scan_state=2) is treated as changed so it is re-scanned.
  if (
    (existing.scan_state === 1 || existing.scan_state === 3) &&
    existing.size_bytes === sizeBytes &&
    existing.mtime === mtime
  ) {
    return
  }

  // User data (tags, categories, bpm, key) always survives a re-scan; only the
  // extracted audio metadata is reset for phase 2 to re-extract.
  db.prepare(
    `UPDATE samples SET filename=?, ext=?, size_bytes=?, mtime=?, scan_state=0,
     duration=NULL, sample_rate=NULL, channels=NULL,
     metadata_revision=0, analysis_revision=0
     WHERE id=?`
  ).run(filename, ext, sizeBytes, mtime, existing.id)
}

export function markMissing(db: DB, rootId: number, relpath: string): void {
  db.prepare('UPDATE samples SET scan_state = 2 WHERE root_id = ? AND relpath = ?').run(
    rootId,
    relpath
  )
}

export function updateMetadata(
  db: DB,
  rootId: number,
  relpath: string,
  duration: number | null,
  sampleRate: number | null,
  channels: number | null,
  metadataRevision: number = METADATA_REVISION
): void {
  db.prepare(
    `UPDATE samples
     SET duration=?, sample_rate=?, channels=?,
         analysis_revision = CASE WHEN scan_state = 3 THEN 0 ELSE analysis_revision END,
         scan_state=1, metadata_revision=?
     WHERE root_id=? AND relpath=?`
  ).run(duration, sampleRate, channels, metadataRevision, rootId, relpath)
}

export function markMetadataUnavailable(
  db: DB,
  rootId: number,
  relpath: string,
  metadataRevision: number = METADATA_REVISION,
  analysisRevision: number = ANALYSIS_REVISION
): void {
  db.prepare(
    `UPDATE samples
     SET duration=NULL, sample_rate=NULL, channels=NULL,
         bpm = CASE WHEN bpm_source = 'manual' THEN bpm ELSE NULL END,
         bpm_source = CASE WHEN bpm_source = 'manual' THEN bpm_source ELSE NULL END,
         musical_key = CASE
           WHEN musical_key_source = 'manual' THEN musical_key ELSE NULL
         END,
         musical_key_source = CASE
           WHEN musical_key_source = 'manual' THEN musical_key_source ELSE NULL
         END,
         sample_type = CASE
           WHEN sample_type_source = 'manual' THEN sample_type ELSE NULL
         END,
         sample_type_source = CASE
           WHEN sample_type_source = 'manual' THEN sample_type_source ELSE NULL
         END,
         scan_state=3, metadata_revision=?, analysis_revision=?
     WHERE root_id=? AND relpath=?`
  ).run(metadataRevision, analysisRevision, rootId, relpath)
}

/**
 * Assign a sample to a category based on its relpath.  The first path segment
 * is matched against existing root categories (which must have been created by
 * syncCategoriesFromNames beforehand).  Deeper segments become subcategories
 * under the root.  Samples directly in the sample folder root (no subfolder)
 * are assigned to the hardcoded "Unsorted" category.
 */
export function assignCategoryFromPath(db: DB, rootId: number, relpath: string): void {
  const segments = relpath.split('/').filter(Boolean)

  // The last segment is the filename; fewer than two segments means the file
  // sits directly in the sample folder root -> Unsorted.
  if (segments.length < 2) {
    db.prepare('UPDATE samples SET category_id = ? WHERE root_id = ? AND relpath = ?').run(
      unsortedCategoryId(db),
      rootId,
      relpath
    )
    return
  }

  const rootName = segments[0]

  // Try to match the first segment to an existing root category
  const root = db
    .prepare('SELECT id FROM categories WHERE parent_id IS NULL AND name = ?')
    .get<{ id: number }>(rootName)

  if (root) {
    const sampleRow = db
      .prepare('SELECT id FROM samples WHERE root_id = ? AND relpath = ?')
      .get<{ id: number }>(rootId, relpath)
    if (!sampleRow) return

    db.prepare('UPDATE samples SET category_id = ? WHERE id = ?').run(root.id, sampleRow.id)

    // Clear any prior subcategory memberships so a file that moved between
    // folders on rescan does not retain stale associations.
    db.prepare('DELETE FROM sample_categories WHERE sample_id = ?').run(sampleRow.id)

    // Walk the intermediate path segments (folders only, excluding the filename
    // which is always the last segment), nesting each subcategory under the
    // previous one so the subtree CTE descends correctly. Record a
    // sample_categories row for every category in the chain (root included) so
    // subtree filtering on any ancestor matches this sample.
    db.prepare(
      'INSERT OR IGNORE INTO sample_categories (sample_id, category_id) VALUES (?, ?)'
    ).run(sampleRow.id, root.id)

    let parentId = root.id
    for (let i = 1; i < segments.length - 1; i++) {
      const subName = segments[i]
      let sub = db
        .prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?')
        .get<{ id: number }>(parentId, subName)
      if (!sub) {
        const result = db
          .prepare('INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?, ?)')
          .run(subName, parentId)
        if (result.changes > 0) {
          sub = { id: result.lastInsertRowid }
        } else {
          sub = db
            .prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?')
            .get<{ id: number }>(parentId, subName)!
        }
      }
      db.prepare(
        'INSERT OR IGNORE INTO sample_categories (sample_id, category_id) VALUES (?, ?)'
      ).run(sampleRow.id, sub.id)
      parentId = sub.id
    }
    return
  }

  db.prepare('UPDATE samples SET category_id = ? WHERE root_id = ? AND relpath = ?').run(
    unsortedCategoryId(db),
    rootId,
    relpath
  )
}
