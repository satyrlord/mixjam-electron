// SQL layer of the backend worker. Functions are synchronous (sqlite-wasm calls
// are sync once the VFS is open); the async boundary is the worker message
// protocol above this.

import {
  isTagEditable,
  isTagRenameable,
  type AnalysisSource,
  type SampleQueryRequest,
  type SampleType,
  type TagOrigin
} from '../../../shared/backend-api'
import { isSampleType } from './analysis'
import { getLibraryRootState, scanRootId } from './indexed-sample-persistence'
import type { BindValue, DB } from './sql'

export interface TagRow {
  id: number
  name: string
  color: string | null
  origin: TagOrigin
  folderDerived: boolean
}

interface RawTagRow {
  [key: string]: string | number | null
  id: number
  name: string
  color: string | null
  user_created: number
  /** Whether any root derives this name — global, unlike `folder_derived`. */
  any_folder_source: number
  folder_derived: number
}

/** The one place a stored tag row becomes a {@link TagOrigin}. */
function toTagRow(raw: RawTagRow): TagRow {
  const userCreated = raw.user_created === 1
  const anyFolderSource = raw.any_folder_source === 1
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color,
    origin: userCreated ? (anyFolderSource ? 'shared' : 'user') : 'folder',
    folderDerived: raw.folder_derived === 1
  }
}

/** Selects the provenance columns {@link toTagRow} consumes. Takes one bound
 *  parameter: the active root id (or null for "no active root"). */
const TAG_PROVENANCE_COLUMNS = `t.id, t.name, t.color, t.user_created,
       EXISTS(SELECT 1 FROM folder_tag_sources any_source
              WHERE any_source.tag_id = t.id) AS any_folder_source,
       EXISTS(SELECT 1 FROM folder_tag_sources active_source
              WHERE active_source.tag_id = t.id AND active_source.root_id IS ?)
         AS folder_derived`

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
  tagIds: number[]
  folderTagIds: number[]
  userTagIds: number[]
  tags: string[]
}

function analysisSource(value: string | null): AnalysisSource {
  return value === 'analysis' || value === 'manual' ? value : null
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function listTags(db: DB, rootKey?: string): TagRow[] {
  const rootId = rootKey === undefined ? undefined : scanRootId(db, rootKey)
  return db
    .prepare(
      `SELECT ${TAG_PROVENANCE_COLUMNS}
       FROM tags t
       WHERE t.user_created = 1
          OR EXISTS(SELECT 1 FROM folder_tag_sources visible
                    WHERE visible.tag_id = t.id AND visible.root_id IS ?)
       ORDER BY t.name`
    )
    .all<RawTagRow>(rootId ?? null, rootId ?? null)
    .map(toTagRow)
}

export function createTag(db: DB, name: string, color?: string, rootKey?: string): TagRow {
  // Idempotent: a duplicate name (UNIQUE) returns the existing tag rather than
  // throwing a constraint error across the worker boundary. An existing
  // folder-only tag is promoted to user-owned, which may make it `shared`.
  const inserted = db
    .prepare('INSERT OR IGNORE INTO tags (name, color, user_created) VALUES (?, ?, 1)')
    .run(name, color ?? null)
  if (inserted.changes === 0) {
    db.prepare('UPDATE tags SET user_created = 1, color = COALESCE(?, color) WHERE name = ?')
      .run(color ?? null, name)
  }
  const rootId = rootKey === undefined ? undefined : scanRootId(db, rootKey)
  return db
    .prepare(`SELECT ${TAG_PROVENANCE_COLUMNS} FROM tags t WHERE t.name = ?`)
    .all<RawTagRow>(rootId ?? null, name)
    .map(toTagRow)[0]!
}

/** Resolves a tag's global origin. `folderDerived` is deliberately not part of
 *  this: mutation guards are root-independent. */
function tagOrigin(db: DB, id: number): TagOrigin {
  const row = db.prepare(
    `SELECT user_created,
            EXISTS(SELECT 1 FROM folder_tag_sources WHERE tag_id = tags.id) AS any_folder_source
     FROM tags WHERE id = ?`
  ).get<{ user_created: number; any_folder_source: number }>(id)
  if (row?.user_created !== 1) return 'folder'
  return row.any_folder_source === 1 ? 'shared' : 'user'
}

function assertEditableTag(db: DB, id: number): TagOrigin {
  const origin = tagOrigin(db, id)
  if (!isTagEditable(origin)) {
    throw new Error('Folder-only tags are managed automatically and cannot be edited.')
  }
  return origin
}

export function renameTag(db: DB, id: number, name: string): void {
  if (!isTagRenameable(tagOrigin(db, id))) {
    throw new Error('Folder-derived tag names are managed automatically.')
  }
  db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
}

export function setTagColor(db: DB, id: number, color: string | null): void {
  assertEditableTag(db, id)
  db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, id)
}

export function deleteTag(db: DB, id: number): void {
  // A shared tag keeps its identity and folder assignments; only the user's
  // ownership and assignments are withdrawn, demoting it to a folder tag.
  if (assertEditableTag(db, id) === 'shared') {
    db.transaction(() => {
      db.prepare('UPDATE tags SET user_created = 0, color = NULL WHERE id = ?').run(id)
      db.prepare("DELETE FROM sample_tags WHERE tag_id = ? AND source = 'user'").run(id)
    })()
  } else {
    db.prepare('DELETE FROM tags WHERE id = ?').run(id)
  }
}

export function assignTag(db: DB, sampleId: number, tagId: number): void {
  assertEditableTag(db, tagId)
  db.prepare("INSERT OR IGNORE INTO sample_tags (sample_id, tag_id, source) VALUES (?, ?, 'user')").run(
    sampleId,
    tagId
  )
}

export function unassignTag(db: DB, sampleId: number, tagId: number): void {
  assertEditableTag(db, tagId)
  db.prepare("DELETE FROM sample_tags WHERE sample_id = ? AND tag_id = ? AND source = 'user'").run(sampleId, tagId)
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

export function querySamples(db: DB, opts: SampleQueryOptions = {}): SampleQueryResult {
  const {
    textSearch,
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

  if (tagIds && tagIds.length > 0) {
    for (const tagId of [...new Set(tagIds)]) {
      conditions.push(
        'EXISTS (SELECT 1 FROM sample_tags st WHERE st.sample_id = s.id AND st.tag_id = ?)'
      )
      params.push(tagId)
    }
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
              s.date_added, s.scan_state,
              (SELECT GROUP_CONCAT(DISTINCT st.tag_id) FROM sample_tags st
                WHERE st.sample_id = s.id) AS tag_ids,
              (SELECT GROUP_CONCAT(DISTINCT st.tag_id) FROM sample_tags st
                WHERE st.sample_id = s.id AND st.source = 'folder') AS folder_tag_ids,
              (SELECT GROUP_CONCAT(DISTINCT st.tag_id) FROM sample_tags st
                WHERE st.sample_id = s.id AND st.source = 'user') AS user_tag_ids,
              (SELECT GROUP_CONCAT(name, char(31)) FROM (
                 SELECT DISTINCT t.name AS name FROM sample_tags st
                 JOIN tags t ON t.id = st.tag_id
                 WHERE st.sample_id = s.id
               )) AS tag_names
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
      tag_ids: string | null
      folder_tag_ids: string | null
      user_tag_ids: string | null
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
      tagIds: r.tag_ids ? r.tag_ids.split(',').map(Number).sort((a, b) => a - b) : [],
      folderTagIds: r.folder_tag_ids ? r.folder_tag_ids.split(',').map(Number).sort((a, b) => a - b) : [],
      userTagIds: r.user_tag_ids ? r.user_tag_ids.split(',').map(Number).sort((a, b) => a - b) : [],
      tags: r.tag_names ? r.tag_names.split('\u001F').sort((a, b) => a.localeCompare(b)) : []
    }))
  }
}
