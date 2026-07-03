import Database from 'better-sqlite3'
import { join } from 'path'

export type DB = Database.Database

const DB_FILE_NAME = 'library.db'
const SCHEMA_VERSION = 4

// The update trigger is version-managed (v3 scoped it to the FTS-indexed
// columns), so its definition lives outside the DDL string where the migration
// can re-create it.
const FTS_UPDATE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS samples_fts_au AFTER UPDATE OF filename, filepath ON samples BEGIN
  INSERT INTO samples_fts(samples_fts, rowid, filename, filepath) VALUES ('delete', old.id, old.filename, old.filepath);
  INSERT INTO samples_fts(rowid, filename, filepath) VALUES (new.id, new.filename, new.filepath);
END;
`

const DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

-- One row per Sample Folder that has ever been scanned. samples.root_id scopes
-- every sample to the root it was found under, so switching the active Sample
-- Folder switches the visible library instead of mixing rows across folders.
CREATE TABLE IF NOT EXISTS scan_roots (
  id   INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS samples (
  id          INTEGER PRIMARY KEY,
  filepath    TEXT NOT NULL UNIQUE,
  filename    TEXT NOT NULL,
  ext         TEXT,
  size_bytes  INTEGER,
  mtime       INTEGER,
  duration    REAL,
  sample_rate INTEGER,
  channels    INTEGER,
  bpm         REAL,
  musical_key TEXT,
  date_added  INTEGER NOT NULL,
  scan_state  INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  root_id     INTEGER REFERENCES scan_roots(id) ON DELETE SET NULL
);

-- Note: the category_id (v2) and root_id (v4) columns above are added to
-- pre-existing samples tables by the version-gated ALTER TABLE migrations in
-- openDatabase().

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

CREATE INDEX IF NOT EXISTS idx_samples_filename   ON samples(filename);
CREATE INDEX IF NOT EXISTS idx_samples_date_added ON samples(date_added);
CREATE INDEX IF NOT EXISTS idx_samples_bpm        ON samples(bpm);
CREATE INDEX IF NOT EXISTS idx_samples_key        ON samples(musical_key);
CREATE INDEX IF NOT EXISTS idx_sample_tags_tag    ON sample_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_sample_cats_cat    ON sample_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent  ON categories(parent_id);

CREATE VIRTUAL TABLE IF NOT EXISTS samples_fts USING fts5(
  filename, filepath,
  content='samples', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS samples_fts_ai AFTER INSERT ON samples BEGIN
  INSERT INTO samples_fts(rowid, filename, filepath) VALUES (new.id, new.filename, new.filepath);
END;

CREATE TRIGGER IF NOT EXISTS samples_fts_ad AFTER DELETE ON samples BEGIN
  INSERT INTO samples_fts(samples_fts, rowid, filename, filepath) VALUES ('delete', old.id, old.filename, old.filepath);
END;

${FTS_UPDATE_TRIGGER}
`

export function openDatabase(dbPath?: string): DB {
  let resolvedPath: string
  if (dbPath) {
    resolvedPath = dbPath
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    resolvedPath = join(app.getPath('userData'), DB_FILE_NAME)
  }
  const path = resolvedPath
  const db = new Database(path)

  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')

  db.exec(DDL)

  const row = db.prepare('SELECT version FROM schema_version').get() as
    | { version: number }
    | undefined

  if (!row) {
    // Fresh database: the DDL above already created the current schema.
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)
    return db
  }

  // Migrate v1 -> v2: add category_id column to samples
  if (row.version < 2) {
    try {
      db.exec('ALTER TABLE samples ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL')
    } catch {
      // Column already exists — ignore
    }
  }

  // Migrate v2 -> v3: scope the FTS update trigger to the indexed columns (the
  // unscoped trigger rewrote the FTS row on every samples update, including
  // scan-state and metadata writes) and drop the then-unused scan_roots table.
  if (row.version < 3) {
    db.exec('DROP TRIGGER IF EXISTS samples_fts_au')
    db.exec(FTS_UPDATE_TRIGGER)
    db.exec('DROP TABLE IF EXISTS scan_roots')
  }

  // Migrate v3 -> v4: reintroduce scan_roots (this time used) and scope samples
  // to their root. Existing rows keep root_id NULL until the next scan of their
  // folder adopts them (see ensureScanRoot in library.ts).
  if (row.version < 4) {
    // Recreate explicitly: on a v1/v2 database the v3 step above just dropped
    // the table the initial DDL created.
    db.exec('CREATE TABLE IF NOT EXISTS scan_roots (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE)')
    try {
      db.exec('ALTER TABLE samples ADD COLUMN root_id INTEGER REFERENCES scan_roots(id) ON DELETE SET NULL')
    } catch {
      // Column already exists — ignore
    }
  }

  // idx_samples_root is created here (not in the static DDL) because on a
  // pre-v4 database the root_id column does not exist yet when db.exec(DDL)
  // runs. The v4 migration above adds the column; this ensures the index
  // exists for both fresh and migrated databases.
  db.exec('CREATE INDEX IF NOT EXISTS idx_samples_root ON samples(root_id)')

  if (row.version < SCHEMA_VERSION) {
    db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION)
  }

  return db
}
