// SQL layer of the backend worker. Functions are synchronous (sqlite-wasm calls
// are sync once the VFS is open); the async boundary is the worker message
// protocol above this.

import type {
  AnalysisSource,
  SampleQueryRequest,
  SampleType
} from '../../../shared/backend-api'
import { isSampleType } from './analysis'
import { getLibraryRootState, scanRootId } from './indexed-sample-persistence'
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

function analysisSource(value: string | null): AnalysisSource {
  return value === 'analysis' || value === 'manual' ? value : null
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
  let libraryId = 0
  const persistLibrary = db.transaction(() => {
    const result = db.prepare('INSERT INTO libraries (name, created_at) VALUES (?, ?)').run(name, now)
    libraryId = result.lastInsertRowid
    db.prepare('INSERT INTO library_rules (library_id, rule_json) VALUES (?, ?)').run(
      libraryId,
      ruleJson
    )
  })
  persistLibrary()
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

