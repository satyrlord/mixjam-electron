import { readdirSync } from 'node:fs'
import type { SampleQueryRequest } from '../shared/ipc'
import type { DB } from './db'
import { canonicalizePath } from './path-utils'

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
  filepath: string
  filename: string
  ext: string | null
  sizeBytes: number | null
  mtime: number | null
  duration: number | null
  sampleRate: number | null
  channels: number | null
  bpm: number | null
  musicalKey: string | null
  dateAdded: number
  scanState: number
  categoryId: number | null
  tagIds: number[]
  tags: string[]
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function listTags(db: DB): TagRow[] {
  return (
    db.prepare('SELECT id, name, color FROM tags ORDER BY name').all() as Array<{
      id: number
      name: string
      color: string | null
    }>
  ).map((r) => ({ id: r.id, name: r.name, color: r.color }))
}

export function createTag(db: DB, name: string, color?: string): TagRow {
  // Idempotent: a duplicate name (UNIQUE) returns the existing tag rather than
  // throwing a constraint error across IPC.
  const result = db
    .prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)')
    .run(name, color ?? null)
  if (result.changes > 0) {
    return { id: result.lastInsertRowid as number, name, color: color ?? null }
  }
  const existing = db
    .prepare('SELECT id, name, color FROM tags WHERE name = ?')
    .get(name) as { id: number; name: string; color: string | null }
  return { id: existing.id, name: existing.name, color: existing.color }
}

export function renameTag(db: DB, id: number, name: string): void {
  db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
}

export function deleteTag(db: DB, id: number): void {
  db.prepare('DELETE FROM tags WHERE id = ?').run(id)
}

export function assignTag(db: DB, sampleId: number, tagId: number): void {
  db.prepare(
    'INSERT OR IGNORE INTO sample_tags (sample_id, tag_id) VALUES (?, ?)'
  ).run(sampleId, tagId)
}

export function unassignTag(db: DB, sampleId: number, tagId: number): void {
  db.prepare('DELETE FROM sample_tags WHERE sample_id = ? AND tag_id = ?').run(sampleId, tagId)
}

export function tagsForSample(db: DB, sampleId: number): TagRow[] {
  return (
    db
      .prepare(
        `SELECT t.id, t.name, t.color FROM tags t
         JOIN sample_tags st ON st.tag_id = t.id
         WHERE st.sample_id = ?
         ORDER BY t.name`
      )
      .all(sampleId) as Array<{ id: number; name: string; color: string | null }>
  ).map((r) => ({ id: r.id, name: r.name, color: r.color }))
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function listCategories(db: DB): CategoryRow[] {
  return (
    db
      .prepare('SELECT id, name, parent_id FROM categories ORDER BY parent_id, name')
      .all() as Array<{ id: number; name: string; parent_id: number | null }>
  ).map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id }))
}

export function createCategory(db: DB, name: string, parentId?: number): CategoryRow {
  if (parentId === undefined) {
    // Guard against duplicate root categories (SQLite NULL ≠ NULL in UNIQUE).
    const existing = db
      .prepare('SELECT id FROM categories WHERE parent_id IS NULL AND name = ?')
      .get(name) as { id: number } | undefined
    if (existing) return { id: existing.id, name, parentId: null }
  }
  const result = db
    .prepare('INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?, ?)')
    .run(name, parentId ?? null)
  // When INSERT OR IGNORE is a no-op (duplicate parent_id+name), lastInsertRowid
  // holds the previous insert's id, not the existing row's — so key off changes.
  const id =
    result.changes > 0
      ? (result.lastInsertRowid as number)
      : (db
          .prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS ?')
          .get(name, parentId ?? null) as { id: number }).id
  return { id, name, parentId: parentId ?? null }
}

// ---------------------------------------------------------------------------
// Scan roots (per-Sample-Folder scoping)
// ---------------------------------------------------------------------------

/** LIKE-escapes a path prefix using '!' (backslash would collide with Windows
 *  separators in the prefix itself). */
function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[!%_]/g, (match) => `!${match}`)
}

/** Resolves the scan_roots id for a Sample Folder path, or undefined when the
 *  folder has never been scanned. */
export function scanRootId(db: DB, rootPath: string): number | undefined {
  const row = db
    .prepare('SELECT id FROM scan_roots WHERE path = ?')
    .get(canonicalizePath(rootPath)) as { id: number } | undefined
  return row?.id
}

/**
 * Resolves-or-creates the scan root for a Sample Folder and adopts any samples
 * indexed before per-root scoping existed (root_id NULL after the v4
 * migration) whose filepath lives under the folder. Adoption matters so the
 * per-root missing-file prune and root-scoped queries see pre-v4 rows after
 * one rescan instead of stranding them invisible forever.
 */
export function ensureScanRoot(db: DB, sampleFolder: string): number {
  const key = canonicalizePath(sampleFolder)
  const result = db.prepare('INSERT OR IGNORE INTO scan_roots (path) VALUES (?)').run(key)
  const id =
    result.changes > 0
      ? (result.lastInsertRowid as number)
      : (db.prepare('SELECT id FROM scan_roots WHERE path = ?').get(key) as { id: number }).id

  const base = escapeLikePrefix(sampleFolder.replace(/[\\/]+$/, ''))
  db.prepare(
    `UPDATE samples SET root_id = ?
     WHERE root_id IS NULL AND (filepath LIKE ? ESCAPE '!' OR filepath LIKE ? ESCAPE '!')`
  ).run(id, `${base}\\%`, `${base}/%`)

  return id
}

export const UNSORTED_CATEGORY = 'Unsorted'

function unsortedCategoryId(db: DB): number {
  const row = db
    .prepare('SELECT id FROM categories WHERE parent_id IS NULL AND name = ?')
    .get(UNSORTED_CATEGORY) as { id: number } | undefined
  if (row) return row.id
  const result = db
    .prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)')
    .run(UNSORTED_CATEGORY)
  return result.lastInsertRowid as number
}

export function ensureUnsortedCategory(db: DB): void {
  unsortedCategoryId(db)
}

/**
 * Synchronise root categories with the top-level subdirectories of the
 * sample folder.  Creates a category for every subdirectory (when one
 * does not already exist) and always ensures the hardcoded "Unsorted"
 * category is present.  Returns the set of category names that were
 * created or reused so the caller can map folder paths to category ids.
 */
export function syncCategoriesFromFolder(db: DB, sampleFolder: string): string[] {
  ensureUnsortedCategory(db)
  const names: string[] = [UNSORTED_CATEGORY]

  let entries: import('node:fs').Dirent<string>[]
  try {
    entries = readdirSync(sampleFolder, { withFileTypes: true })
  } catch (err) {
    console.error('syncCategoriesFromFolder: failed to read sample folder', sampleFolder, err)
    return names
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === UNSORTED_CATEGORY) continue // reserved

    const exists = db
      .prepare('SELECT 1 FROM categories WHERE parent_id IS NULL AND name = ?')
      .get(entry.name)
    if (!exists) {
      db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)').run(entry.name)
    }
    names.push(entry.name)
  }

  return names
}

export function deleteCategory(db: DB, id: number): void {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Libraries
// ---------------------------------------------------------------------------

export function listLibraries(db: DB): LibraryRow[] {
  return (
    db
      .prepare(
        `SELECT l.id, l.name, l.created_at, lr.rule_json
         FROM libraries l
         JOIN library_rules lr ON lr.library_id = l.id
         ORDER BY l.name`
      )
      .all() as Array<{ id: number; name: string; created_at: number; rule_json: string }>
  ).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, ruleJson: r.rule_json }))
}

export function saveLibrary(db: DB, name: string, ruleJson: string): LibraryRow {
  const now = Date.now()
  const result = db
    .prepare('INSERT INTO libraries (name, created_at) VALUES (?, ?)')
    .run(name, now)
  const libraryId = result.lastInsertRowid as number
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
 * Returns true when the given Sample Folder has been populated by at least one
 * completed scan. Without a rootPath the check spans every root (used by
 * tooling/tests, not the browser).
 */
export function hasSamples(db: DB, rootPath?: string): boolean {
  if (rootPath !== undefined) {
    const rootId = scanRootId(db, rootPath)
    if (rootId === undefined) return false
    const row = db
      .prepare('SELECT 1 FROM samples WHERE root_id = ? LIMIT 1')
      .get(rootId) as { 1: number } | undefined
    return row !== undefined
  }
  const row = db.prepare('SELECT 1 FROM samples LIMIT 1').get() as { 1: number } | undefined
  return row !== undefined
}

// The query options are exactly the IPC request shape — one definition, no drift.
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
  const rows = db
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
      )
      SELECT id FROM subtree`
    )
    .all(categoryId) as Array<{ id: number }>
  return rows.map((r) => r.id)
}

export function querySamples(db: DB, opts: SampleQueryOptions = {}): SampleQueryResult {
  const {
    textSearch,
    categoryId,
    tagIds,
    rootPath,
    limit = 200,
    offset = 0,
    sortBy = 'filename',
    sortDir = 'asc'
  } = opts

  const conditions: string[] = ['s.scan_state != 2']
  const params: (string | number)[] = []

  if (rootPath !== undefined) {
    const rootId = scanRootId(db, rootPath)
    // A folder that has never been scanned has no rows by definition.
    if (rootId === undefined) return { rows: [], total: 0 }
    conditions.push('s.root_id = ?')
    params.push(rootId)
  }

  if (textSearch && textSearch.trim()) {
    const match = toFtsPrefixQuery(textSearch)
    if (match) {
      conditions.push(
        `s.id IN (SELECT rowid FROM samples_fts WHERE samples_fts MATCH ?)`
      )
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
    .get(...params) as { cnt: number }
  const total = countRow.cnt

  // Tags ride along as aggregated subqueries so the browser and footer can show
  // per-sample tags without an N+1 query. Names join on the unit separator
  // (char(31)) because tag names may contain commas.
  const rows = db
    .prepare(
      `SELECT s.id, s.filepath, s.filename, s.ext, s.size_bytes, s.mtime,
              s.duration, s.sample_rate, s.channels, s.bpm, s.musical_key,
              s.date_added, s.scan_state, s.category_id,
              (SELECT GROUP_CONCAT(st.tag_id) FROM sample_tags st
                WHERE st.sample_id = s.id) AS tag_ids,
              (SELECT GROUP_CONCAT(t.name, char(31)) FROM sample_tags st
                JOIN tags t ON t.id = st.tag_id
                WHERE st.sample_id = s.id) AS tag_names
       FROM samples s ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<{
    id: number
    filepath: string
    filename: string
    ext: string | null
    size_bytes: number | null
    mtime: number | null
    duration: number | null
    sample_rate: number | null
    channels: number | null
    bpm: number | null
    musical_key: string | null
    date_added: number
    scan_state: number
    category_id: number | null
    tag_ids: string | null
    tag_names: string | null
  }>

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      filepath: r.filepath,
      filename: r.filename,
      ext: r.ext,
      sizeBytes: r.size_bytes,
      mtime: r.mtime,
      duration: r.duration,
      sampleRate: r.sample_rate,
      channels: r.channels,
      bpm: r.bpm,
      musicalKey: r.musical_key,
      dateAdded: r.date_added,
      scanState: r.scan_state,
      categoryId: r.category_id,
      tagIds: r.tag_ids ? r.tag_ids.split(',').map(Number).sort((a, b) => a - b) : [],
      tags: r.tag_names ? r.tag_names.split('\u001F').sort((a, b) => a.localeCompare(b)) : []
    }))
  }
}

// ---------------------------------------------------------------------------
// Stubs for stub upsert (used by indexer)
// ---------------------------------------------------------------------------

export function upsertStub(
  db: DB,
  rootId: number,
  filepath: string,
  filename: string,
  ext: string,
  sizeBytes: number,
  mtime: number
): void {
  const existing = db
    .prepare('SELECT id, scan_state, size_bytes, mtime FROM samples WHERE filepath = ?')
    .get(filepath) as
    | { id: number; scan_state: number; size_bytes: number | null; mtime: number | null }
    | undefined

  if (!existing) {
    db.prepare(
      `INSERT INTO samples (filepath, filename, ext, size_bytes, mtime, date_added, scan_state, root_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(filepath, filename, ext, sizeBytes, mtime, Date.now(), rootId)
    return
  }

  // Incremental change detection: a fully-scanned row whose size and mtime are
  // unchanged is left as-is so phase2 does not needlessly re-extract metadata
  // (see AGENTS.md "(size, mtime) change detection"). A previously-missing row
  // (scan_state=2) is treated as changed so it is re-scanned.
  if (
    existing.scan_state === 1 &&
    existing.size_bytes === sizeBytes &&
    existing.mtime === mtime
  ) {
    return
  }

  // User data (tags, categories, bpm, key) always survives a re-scan; only the
  // extracted audio metadata is reset for phase 2 to re-extract.
  db.prepare(
    `UPDATE samples SET filename=?, ext=?, size_bytes=?, mtime=?, scan_state=0, root_id=?,
     duration=NULL, sample_rate=NULL, channels=NULL WHERE id=?`
  ).run(filename, ext, sizeBytes, mtime, rootId, existing.id)
}

export function markMissing(db: DB, filepath: string): void {
  db.prepare('UPDATE samples SET scan_state = 2 WHERE filepath = ?').run(filepath)
}

export function updateMetadata(
  db: DB,
  filepath: string,
  duration: number | null,
  sampleRate: number | null,
  channels: number | null
): void {
  db.prepare(
    'UPDATE samples SET duration=?, sample_rate=?, channels=?, scan_state=1 WHERE filepath=?'
  ).run(duration, sampleRate, channels, filepath)
}

/**
 * Assign a sample to a category based on its path relative to the sample
 * folder.  The first relative path segment is matched against existing
 * root categories (which must have been created by syncCategoriesFromFolder
 * beforehand).  Deeper segments become subcategories under the root.
 * Samples directly in the sample folder root (no subfolder) are assigned
 * to the hardcoded "Unsorted" category.
 */
export function assignCategoryFromPath(db: DB, filepath: string, sampleFolder: string): void {
  const relative = filepath.startsWith(sampleFolder)
    ? filepath.slice(sampleFolder.length).replace(/^[\\/]+/, '')
    : filepath
  const segments = relative.split(/[\\/]/).filter(Boolean)

  if (segments.length === 0) {
    // File is directly in the sample folder root → Unsorted
    db.prepare('UPDATE samples SET category_id = ? WHERE filepath = ?').run(
      unsortedCategoryId(db),
      filepath
    )
    return
  }

  const rootName = segments[0]

  // Try to match the first segment to an existing root category
  const root = db
    .prepare('SELECT id FROM categories WHERE parent_id IS NULL AND name = ?')
    .get(rootName) as { id: number } | undefined

  if (root) {
    const sampleRow = db
      .prepare('SELECT id FROM samples WHERE filepath = ?')
      .get(filepath) as { id: number } | undefined
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
    db.prepare('INSERT OR IGNORE INTO sample_categories (sample_id, category_id) VALUES (?, ?)')
      .run(sampleRow.id, root.id)

    let parentId = root.id
    for (let i = 1; i < segments.length - 1; i++) {
      const subName = segments[i]
      let sub = db
        .prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?')
        .get(parentId, subName) as { id: number } | undefined
      if (!sub) {
        const result = db
          .prepare('INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?, ?)')
          .run(subName, parentId)
        if (result.changes > 0) {
          sub = { id: result.lastInsertRowid as number }
        } else {
          sub = db
            .prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?')
            .get(parentId, subName) as { id: number }
        }
      }
      db.prepare('INSERT OR IGNORE INTO sample_categories (sample_id, category_id) VALUES (?, ?)')
        .run(sampleRow.id, sub.id)
      parentId = sub.id
    }
    return
  }

  // No matching category found → fall back to Unsorted
  db.prepare('UPDATE samples SET category_id = ? WHERE filepath = ?').run(
    unsortedCategoryId(db),
    filepath
  )
}
