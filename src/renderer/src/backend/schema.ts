import type { DB } from './sql'

// Schema of the OPFS-backed database. Bump SCHEMA_VERSION and add
// version-gated migrations below.
const SCHEMA_VERSION = 3

/** Bump when metadata parsing semantics change for unchanged file bytes. */
export const METADATA_REVISION = 1

/** Bump when automatic BPM, key, or sample-type analysis semantics change. */
export const ANALYSIS_REVISION = 1

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
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  UNIQUE (root_id, relpath)
);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT
);

CREATE TABLE IF NOT EXISTS sample_tags (
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  PRIMARY KEY (sample_id, tag_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE (parent_id, name)
);

CREATE TABLE IF NOT EXISTS sample_categories (
  sample_id   INTEGER NOT NULL REFERENCES samples(id)    ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (sample_id, category_id)
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
CREATE INDEX IF NOT EXISTS idx_sample_cats_cat    ON sample_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent  ON categories(parent_id);

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

  let version = row.version

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
    ).run(ANALYSIS_REVISION)
    db.prepare('UPDATE schema_version SET version = ?').run(3)
  }
}
