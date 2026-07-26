import type { DB } from './sql'

// Schema of the OPFS-backed database. Bump SCHEMA_VERSION and add
// version-gated migrations below.
const SCHEMA_VERSION = 6

/** In-progress marker for the v5 -> v6 migration. The category-to-tag swap
 *  drops and recreates tables in one transaction; that transaction stamps this
 *  sentinel so an interrupted run resumes at the derived-schema rebuild instead
 *  of re-deriving its position from which tables survived. Deliberately far
 *  above any real version so it can never collide with one. */
const V6_SWAP_DONE = 5006

function schemaVersion(db: DB): number | undefined {
  return db.prepare('SELECT version FROM schema_version').get<{ version: number }>()?.version
}

function hasColumn(db: DB, table: string, column: string): boolean {
  return db.prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string }>().some(({ name }) => name === column)
}

/** True once the v6 structural swap has actually landed: it is the swap that
 *  recreates `sample_tags` with a `source` column and drops the legacy
 *  `categories` table. Both are checked because the swap does them in one
 *  transaction, so neither can be true alone. */
function swapAlreadyCommitted(db: DB): boolean {
  const legacyCategories = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'categories'"
  ).get()
  return legacyCategories === undefined && hasColumn(db, 'sample_tags', 'source')
}

/** Bump when metadata parsing semantics change for unchanged file bytes. */
export const METADATA_REVISION = 1

/**
 * Bump when automatic BPM, key, or sample-type analysis semantics change.
 * Revision 3: whole-bar loop tempo snapping in detectBpm and the confidence
 * margin gate in detectMusicalKey.
 */
export const ANALYSIS_REVISION = 3

const PRE_CONTEXT_ANALYSIS_REVISION = 1

const DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

-- One row per Sample Folder that has ever been scanned. key is the FolderRef
-- id (the folder handle's IndexedDB key). samples.root_id scopes every sample
-- to the root it was found under, so switching the active Sample Folder
-- switches the visible library instead of mixing rows across folders.
CREATE TABLE IF NOT EXISTS scan_roots (
  id                INTEGER PRIMARY KEY,
  key               TEXT NOT NULL UNIQUE,
  last_completed_at INTEGER,
  legacy_index_available INTEGER NOT NULL DEFAULT 0
);

-- relpath is the file's path relative to its scan root, '/'-separated.
-- Containment is structural (a directory handle can only reach its own
-- subtree), so no absolute paths exist anywhere in this schema.
CREATE TABLE IF NOT EXISTS samples (
  id          INTEGER PRIMARY KEY,
  root_id     INTEGER NOT NULL REFERENCES scan_roots(id) ON DELETE CASCADE,
  relpath     TEXT NOT NULL,
  filename    TEXT NOT NULL,
  ext         TEXT,
  size_bytes  INTEGER,
  mtime       INTEGER,
  duration    REAL,
  sample_rate INTEGER,
  channels    INTEGER,
  bpm         REAL,
  bpm_source  TEXT,
  musical_key TEXT,
  musical_key_source TEXT,
  sample_type TEXT,
  sample_type_source TEXT,
  date_added  INTEGER NOT NULL,
  scan_state  INTEGER NOT NULL DEFAULT 0,
  metadata_revision INTEGER NOT NULL DEFAULT 0,
  analysis_revision INTEGER NOT NULL DEFAULT 0,
  raw_bpm REAL,
  raw_musical_key TEXT,
  UNIQUE (root_id, relpath)
);

CREATE TABLE IF NOT EXISTS analysis_groups (
  root_id INTEGER NOT NULL REFERENCES scan_roots(id) ON DELETE CASCADE,
  relpath_prefix TEXT NOT NULL,
  depth INTEGER NOT NULL,
  sample_count INTEGER NOT NULL,
  state TEXT NOT NULL,
  bpm REAL,
  musical_key TEXT,
  bpm_support REAL NOT NULL,
  key_support REAL NOT NULL,
  confidence REAL NOT NULL,
  analysis_revision INTEGER NOT NULL,
  PRIMARY KEY (root_id, relpath_prefix)
);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT,
  user_created INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sample_tags (
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  source    TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('folder', 'user')),
  PRIMARY KEY (sample_id, tag_id, source)
);

CREATE TABLE IF NOT EXISTS folder_tag_sources (
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  root_id     INTEGER NOT NULL REFERENCES scan_roots(id) ON DELETE CASCADE,
  PRIMARY KEY (tag_id, root_id)
);

CREATE TABLE IF NOT EXISTS libraries (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS library_rules (
  library_id INTEGER PRIMARY KEY REFERENCES libraries(id) ON DELETE CASCADE,
  rule_json  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_samples_root       ON samples(root_id);
CREATE INDEX IF NOT EXISTS idx_samples_filename   ON samples(filename);
CREATE INDEX IF NOT EXISTS idx_samples_date_added ON samples(date_added);
CREATE INDEX IF NOT EXISTS idx_samples_bpm        ON samples(bpm);
CREATE INDEX IF NOT EXISTS idx_samples_key        ON samples(musical_key);
CREATE INDEX IF NOT EXISTS idx_sample_tags_tag    ON sample_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_folder_tag_sources_root ON folder_tag_sources(root_id);
CREATE INDEX IF NOT EXISTS idx_analysis_groups_root ON analysis_groups(root_id, depth);

CREATE VIRTUAL TABLE IF NOT EXISTS samples_fts USING fts5(
  filename, relpath,
  content='samples', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS samples_fts_ai AFTER INSERT ON samples BEGIN
  INSERT INTO samples_fts(rowid, filename, relpath) VALUES (new.id, new.filename, new.relpath);
END;

CREATE TRIGGER IF NOT EXISTS samples_fts_ad AFTER DELETE ON samples BEGIN
  INSERT INTO samples_fts(samples_fts, rowid, filename, relpath) VALUES ('delete', old.id, old.filename, old.relpath);
END;

-- Scoped to the FTS-indexed columns so scan-state and metadata writes do not
-- rewrite the FTS row.
CREATE TRIGGER IF NOT EXISTS samples_fts_au AFTER UPDATE OF filename, relpath ON samples BEGIN
  INSERT INTO samples_fts(samples_fts, rowid, filename, relpath) VALUES ('delete', old.id, old.filename, old.relpath);
  INSERT INTO samples_fts(rowid, filename, relpath) VALUES (new.id, new.filename, new.relpath);
END;
`

const LEGACY_CATEGORY_DDL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE (parent_id, name)
);
CREATE TABLE IF NOT EXISTS category_sources (
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  root_id INTEGER NOT NULL REFERENCES scan_roots(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('folder', 'custom')),
  PRIMARY KEY (category_id, root_id, source)
);
CREATE TABLE IF NOT EXISTS sample_categories (
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (sample_id, category_id)
);
`

interface LegacyCategoryNode {
  [key: string]: string | number
  id: number
  name: string
  user_created: number
}

function rewriteCategoryLeaves(value: unknown, categoryTagIds: ReadonlyMap<number, number>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteCategoryLeaves(item, categoryTagIds))
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  if (record.kind === 'category' && Array.isArray(record.categoryIds)) {
    const tagIds = record.categoryIds.flatMap((id) =>
      typeof id === 'number' && categoryTagIds.has(id) ? [categoryTagIds.get(id)!] : []
    )
    return { kind: 'tag', quantifier: 'all', tagIds }
  }
  if (record.kind === 'tag' && Array.isArray(record.tagIds)) {
    return { ...record, quantifier: 'all' }
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, rewriteCategoryLeaves(child, categoryTagIds)])
  )
}

function migrateCategoriesToTags(db: DB): void {
  // The structural swap below drops five tables inside one transaction, so a
  // crash mid-migration is a real state. The swap stamps V6_SWAP_DONE as its
  // last statement, but that stamp alone cannot be trusted to mean the swap
  // committed: initSchema runs the CREATE TABLE IF NOT EXISTS DDL before
  // reading the version, so a v5-shaped database carrying the sentinel would
  // otherwise skip straight to the derived rebuild and stay v5-shaped forever
  // while stamped v6. Confirm against the shape the swap actually produces.
  if (schemaVersion(db) === V6_SWAP_DONE && swapAlreadyCommitted(db)) {
    finishV6DerivedSchema(db)
    return
  }
  const tagColumns = new Set(
    db.prepare('PRAGMA table_info(tags)').all<{ name: string }>().map(({ name }) => name)
  )
  if (!tagColumns.has('user_created')) {
    db.exec('ALTER TABLE tags ADD COLUMN user_created INTEGER NOT NULL DEFAULT 1')
  }

  const categories = db.prepare(
    `SELECT c.id, c.name,
            EXISTS(SELECT 1 FROM category_sources cs
                   WHERE cs.category_id = c.id AND cs.source = 'custom') AS user_created
     FROM categories c ORDER BY c.id`
  ).all<LegacyCategoryNode>()

  const categoryTagIds = new Map<number, number>()
  for (const category of categories) {
    db.prepare(
      `INSERT INTO tags (name, color, user_created) VALUES (?, NULL, ?)
       ON CONFLICT(name) DO UPDATE SET
         user_created = MAX(tags.user_created, excluded.user_created)`
    ).run(category.name, category.user_created)
    const tagId = db.prepare('SELECT id FROM tags WHERE name = ?').get<{ id: number }>(category.name)!.id
    categoryTagIds.set(category.id, tagId)
  }

  for (const source of db.prepare(
    `SELECT category_id, root_id FROM category_sources WHERE source = 'folder'`
  ).all<{ category_id: number; root_id: number }>()) {
    const tagId = categoryTagIds.get(source.category_id)
    if (tagId !== undefined) {
      db.prepare('INSERT OR IGNORE INTO folder_tag_sources (tag_id, root_id) VALUES (?, ?)')
        .run(tagId, source.root_id)
    }
  }

  const hasLegacyCategoryColumn = db.prepare('PRAGMA table_info(samples)')
    .all<{ name: string }>().some(({ name }) => name === 'category_id')
  const assignments = hasLegacyCategoryColumn ? db.prepare(
    `WITH RECURSIVE memberships(sample_id, root_id, category_id) AS (
       SELECT id, root_id, category_id FROM samples WHERE category_id IS NOT NULL
       UNION
       SELECT sc.sample_id, s.root_id, sc.category_id
       FROM sample_categories sc JOIN samples s ON s.id = sc.sample_id
     ), expanded(sample_id, root_id, category_id) AS (
       SELECT sample_id, root_id, category_id FROM memberships
       UNION
       SELECT e.sample_id, e.root_id, c.parent_id
       FROM expanded e JOIN categories c ON c.id = e.category_id
       WHERE c.parent_id IS NOT NULL
     )
     SELECT DISTINCT sample_id, root_id, category_id FROM expanded`
  ).all<{ sample_id: number; root_id: number; category_id: number }>() : []

  const existingAssignments = db.prepare(
    'SELECT sample_id, tag_id FROM sample_tags'
  ).all<{ sample_id: number; tag_id: number }>()
  const migratedAssignments: Array<{ sampleId: number; tagId: number; source: 'folder' | 'user' }> =
    existingAssignments.map(({ sample_id, tag_id }) => ({ sampleId: sample_id, tagId: tag_id, source: 'user' }))
  for (const assignment of assignments) {
    const tagId = categoryTagIds.get(assignment.category_id)
    if (tagId === undefined) continue
    const folderDerived = db.prepare(
      `SELECT 1 FROM category_sources
       WHERE category_id = ? AND root_id = ? AND source = 'folder'`
    ).get(assignment.category_id, assignment.root_id) !== undefined
    migratedAssignments.push({
      sampleId: assignment.sample_id,
      tagId,
      source: folderDerived ? 'folder' : 'user'
    })
  }

  for (const rule of db.prepare(
    'SELECT library_id, rule_json FROM library_rules'
  ).all<{ library_id: number; rule_json: string }>()) {
    try {
      const rewritten = rewriteCategoryLeaves(JSON.parse(rule.rule_json), categoryTagIds)
      db.prepare('UPDATE library_rules SET rule_json = ? WHERE library_id = ?')
        .run(JSON.stringify(rewritten), rule.library_id)
    } catch {
      // Invalid legacy rules were already non-executable. Preserve them verbatim.
    }
  }

  db.exec('PRAGMA foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE samples_v6 (
          id INTEGER PRIMARY KEY,
          root_id INTEGER NOT NULL REFERENCES scan_roots(id) ON DELETE CASCADE,
          relpath TEXT NOT NULL, filename TEXT NOT NULL, ext TEXT,
          size_bytes INTEGER, mtime INTEGER, duration REAL, sample_rate INTEGER,
          channels INTEGER, bpm REAL, bpm_source TEXT, musical_key TEXT,
          musical_key_source TEXT, sample_type TEXT, sample_type_source TEXT,
          date_added INTEGER NOT NULL, scan_state INTEGER NOT NULL DEFAULT 0,
          metadata_revision INTEGER NOT NULL DEFAULT 0,
          analysis_revision INTEGER NOT NULL DEFAULT 0,
          raw_bpm REAL, raw_musical_key TEXT,
          UNIQUE (root_id, relpath)
        );
        INSERT INTO samples_v6 (
          id, root_id, relpath, filename, ext, size_bytes, mtime, duration,
          sample_rate, channels, bpm, bpm_source, musical_key, musical_key_source,
          sample_type, sample_type_source, date_added, scan_state,
          metadata_revision, analysis_revision, raw_bpm, raw_musical_key
        ) SELECT
          id, root_id, relpath, filename, ext, size_bytes, mtime, duration,
          sample_rate, channels, bpm, bpm_source, musical_key, musical_key_source,
          sample_type, sample_type_source, date_added, scan_state,
          metadata_revision, analysis_revision, raw_bpm, raw_musical_key
        FROM samples;
        DROP TABLE sample_tags;
        DROP TABLE sample_categories;
        DROP TABLE category_sources;
        DROP TABLE categories;
        DROP TABLE samples;
        ALTER TABLE samples_v6 RENAME TO samples;
        CREATE TABLE sample_tags (
          sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
          tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('folder', 'user')),
          PRIMARY KEY (sample_id, tag_id, source)
        );
      `)
      const insertAssignment = db.prepare(
        'INSERT OR IGNORE INTO sample_tags (sample_id, tag_id, source) VALUES (?, ?, ?)'
      )
      for (const assignment of migratedAssignments) {
        insertAssignment.run(assignment.sampleId, assignment.tagId, assignment.source)
      }
      // Last statement in the transaction: durable proof the swap committed.
      db.prepare('UPDATE schema_version SET version = ?').run(V6_SWAP_DONE)
    })()
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  finishV6DerivedSchema(db)
}

/** Rebuilds the indexes, triggers, and FTS content that the structural swap
 *  dropped. Separate from the swap so an interrupted migration can resume
 *  here without redoing the data movement. */
function finishV6DerivedSchema(db: DB): void {
  db.exec(DDL)
  db.prepare("INSERT INTO samples_fts(samples_fts) VALUES ('rebuild')").run()
}

/** Creates the current schema on a fresh database and stamps the version.
 *  Idempotent for an existing database of the same version. */
export function initSchema(db: DB): void {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(DDL)

  const row = db.prepare('SELECT version FROM schema_version').get<{ version: number }>()
  if (!row) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)
    return
  }

  // A database still stamped V6_SWAP_DONE was interrupted after the structural
  // swap committed. The swap already ran, so treat it as v5 to re-enter the v6
  // migration, which detects the sentinel and resumes at the rebuild.
  let version = row.version === V6_SWAP_DONE ? 5 : row.version

  // Early v3 databases may lack the legacy_index_available column. Repair
  // them in place so the unchanged version number does not cause
  // getLibraryRootState to query a missing column.
  if (version >= 3) {
    const rootColumns = new Set(
      db.prepare('PRAGMA table_info(scan_roots)').all<{ name: string }>().map((column) => column.name)
    )
    if (!rootColumns.has('legacy_index_available')) {
      db.exec(
        'ALTER TABLE scan_roots ADD COLUMN legacy_index_available INTEGER NOT NULL DEFAULT 0'
      )
    }
  }

  if (version < 2) {
    const columns = new Set(
      db.prepare('PRAGMA table_info(samples)').all<{ name: string }>().map((column) => column.name)
    )
    if (!columns.has('bpm_source')) db.exec('ALTER TABLE samples ADD COLUMN bpm_source TEXT')
    if (!columns.has('musical_key_source')) {
      db.exec('ALTER TABLE samples ADD COLUMN musical_key_source TEXT')
    }
    if (!columns.has('sample_type')) db.exec('ALTER TABLE samples ADD COLUMN sample_type TEXT')
    if (!columns.has('sample_type_source')) {
      db.exec('ALTER TABLE samples ADD COLUMN sample_type_source TEXT')
    }
    db.prepare('UPDATE schema_version SET version = ?').run(2)
    version = 2
  }

  if (version < 3) {
    const sampleColumns = new Set(
      db.prepare('PRAGMA table_info(samples)').all<{ name: string }>().map((column) => column.name)
    )
    const rootColumns = new Set(
      db.prepare('PRAGMA table_info(scan_roots)').all<{ name: string }>().map((column) => column.name)
    )

    if (!rootColumns.has('last_completed_at')) {
      db.exec('ALTER TABLE scan_roots ADD COLUMN last_completed_at INTEGER')
    }
    if (!rootColumns.has('legacy_index_available')) {
      db.exec(
        'ALTER TABLE scan_roots ADD COLUMN legacy_index_available INTEGER NOT NULL DEFAULT 0'
      )
    }
    if (!sampleColumns.has('metadata_revision')) {
      db.exec('ALTER TABLE samples ADD COLUMN metadata_revision INTEGER NOT NULL DEFAULT 0')
    }
    if (!sampleColumns.has('analysis_revision')) {
      db.exec('ALTER TABLE samples ADD COLUMN analysis_revision INTEGER NOT NULL DEFAULT 0')
    }

    // Pre-v3 databases did not persist root completion. Keep the timestamp
    // unknown while preserving browseability for roots that already contain
    // current, non-missing rows. New roots keep the default false marker
    // until their first scan completes.
    db.prepare(
      `UPDATE scan_roots
       SET legacy_index_available = 1
       WHERE EXISTS (
         SELECT 1
         FROM samples
         WHERE samples.root_id = scan_roots.id
           AND samples.scan_state != 2
       )`
    ).run()

    // Metadata-ready rows are stamped current because scan_state proves that
    // phase completed. Analysis ran after scan-done and could be interrupted,
    // so stamp only rows with evidence that applyAnalysisResult ran. Rows whose
    // prior result was entirely NULL are retried once because NULL alone cannot
    // distinguish "attempted" from "never reached".
    db.prepare(
      `UPDATE samples
       SET metadata_revision = ?
       WHERE scan_state = 1`
    ).run(METADATA_REVISION)
    db.prepare(
      `UPDATE samples
       SET analysis_revision = ?
       WHERE scan_state = 1 AND (
         bpm_source = 'analysis' OR
         musical_key_source = 'analysis' OR
         sample_type_source = 'analysis'
       )`
    ).run(PRE_CONTEXT_ANALYSIS_REVISION)
    db.prepare('UPDATE schema_version SET version = ?').run(3)
    version = 3
  }

  if (version < 4) {
    const sampleColumns = new Set(
      db.prepare('PRAGMA table_info(samples)').all<{ name: string }>().map((column) => column.name)
    )
    if (!sampleColumns.has('raw_bpm')) db.exec('ALTER TABLE samples ADD COLUMN raw_bpm REAL')
    if (!sampleColumns.has('raw_musical_key')) {
      db.exec('ALTER TABLE samples ADD COLUMN raw_musical_key TEXT')
    }
    db.prepare(
      `UPDATE samples SET
         raw_bpm = CASE WHEN bpm_source = 'analysis' THEN bpm ELSE raw_bpm END,
         raw_musical_key = CASE
           WHEN musical_key_source = 'analysis' THEN musical_key
           ELSE raw_musical_key
         END`
    ).run()
    db.prepare('UPDATE schema_version SET version = ?').run(4)
    version = 4
  }

  if (version < 5) {
    db.exec(LEGACY_CATEGORY_DDL)
    const hasLegacyCategoryColumn = db.prepare('PRAGMA table_info(samples)')
      .all<{ name: string }>().some(({ name }) => name === 'category_id')
    if (hasLegacyCategoryColumn) {
    // Existing sample/category memberships are the only root evidence in v4.
    // Do not invent ownership for unassigned legacy rows: the old schema could
    // not distinguish stale folder nodes from empty custom organization.
    db.prepare(
      `INSERT OR IGNORE INTO category_sources (category_id, root_id, source)
       SELECT category_id, root_id, 'folder'
       FROM (
          SELECT s.category_id, s.root_id
          FROM samples s
          WHERE s.category_id IS NOT NULL AND s.scan_state != 2
          UNION
          SELECT sc.category_id, s.root_id
          FROM sample_categories sc
          JOIN samples s ON s.id = sc.sample_id
          WHERE s.scan_state != 2
        )`
    ).run()
    db.prepare(
      `WITH RECURSIVE ancestors(category_id, root_id) AS (
         SELECT category_id, root_id FROM category_sources
         UNION
         SELECT c.parent_id, a.root_id
         FROM categories c
         JOIN ancestors a ON a.category_id = c.id
         WHERE c.parent_id IS NOT NULL
       )
       INSERT OR IGNORE INTO category_sources (category_id, root_id, source)
       SELECT category_id, root_id, 'folder' FROM ancestors`
    ).run()
    db.prepare(
      `INSERT OR IGNORE INTO category_sources (category_id, root_id, source)
       SELECT c.id, r.id, 'folder'
       FROM categories c
       CROSS JOIN scan_roots r
       WHERE c.parent_id IS NULL AND c.name = 'Unsorted'`
    ).run()
    db.prepare(
      `DELETE FROM categories
       WHERE id NOT IN (SELECT category_id FROM category_sources)`
    ).run()
    }
    db.prepare('UPDATE schema_version SET version = ?').run(5)
    version = 5
  }

  if (version < 6) {
    migrateCategoriesToTags(db)
    db.prepare('UPDATE schema_version SET version = ?').run(6)
  }
}
