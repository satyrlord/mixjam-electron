# Data model

One SQLite database (sqlite-wasm over OPFS, opfs-sahpool VFS), owned by the
backend worker. The central design property:

> **A library is a saved query, not a copy of files.** Editing/retagging/deleting a
> sample automatically updates every library that references it, because libraries
> hold no physical or duplicated data.

## Schema

```sql
-- One row per Sample Folder that has ever been scanned. key is the FolderRef
-- id (the folder handle's IndexedDB key) — browsers have no absolute paths.
CREATE TABLE scan_roots (
  id  INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE
);

-- The master index. One row per file on disk.
CREATE TABLE samples (
  id           INTEGER PRIMARY KEY,
  root_id      INTEGER NOT NULL REFERENCES scan_roots(id) ON DELETE CASCADE,
  relpath      TEXT NOT NULL,          -- '/'-separated path relative to the scan root
  filename     TEXT NOT NULL,          -- basename, denormalized for sort/search
  ext          TEXT,                   -- 'wav', 'mp3', ... (lowercased)
  size_bytes   INTEGER,
  mtime        INTEGER,                -- file mtime (epoch ms); change-detection key
  duration     REAL,                   -- seconds; NULL until metadata extracted
  sample_rate  INTEGER,
  channels     INTEGER,
  bpm          REAL,                   -- NULL unless set manually / analyzed later
  musical_key  TEXT,                   -- e.g. 'Am'; NULL until set
  date_added   INTEGER NOT NULL,       -- epoch ms, first-indexed time
  scan_state   INTEGER NOT NULL DEFAULT 0,  -- 0=stub, 1=metadata-extracted, 2=missing
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,  -- one primary category per sample
  UNIQUE (root_id, relpath)               -- the dedup key
);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT                           -- optional hex for skinning
);

CREATE TABLE sample_tags (
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  PRIMARY KEY (sample_id, tag_id)
);

-- Self-referencing tree: categories and subcategories.
-- "Unsorted" is the only hardcoded root category (ensured at DB init).
-- All other root categories are derived from the sample-folder structure
-- (each top-level subdirectory becomes a root category) or created by
-- the user via the manage panel.
CREATE TABLE categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,  -- NULL = root
  UNIQUE (parent_id, name)
);

-- Many-to-many: subcategory assignments. A sample has exactly one primary
-- category (stored in samples.category_id) but may belong to multiple
-- subcategories of that category via this join table.
CREATE TABLE sample_categories (
  sample_id   INTEGER NOT NULL REFERENCES samples(id)    ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (sample_id, category_id)
);

CREATE TABLE libraries (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- The saved filter definition. See query-schema.md for the rule_json format.
CREATE TABLE library_rules (
  library_id INTEGER PRIMARY KEY REFERENCES libraries(id) ON DELETE CASCADE,
  rule_json  TEXT NOT NULL
);
```

`scan_roots` is load-bearing: one active Sample Folder is shown at a time (the
session's `sampleFolder`), but every folder ever scanned keeps its rows, scoped
by `root_id`, so switching folders switches the visible library instead of
mixing or losing rows (see [indexing.md](indexing.md#per-root-scoping-one-db-many-sample-folders)).

`PRAGMA foreign_keys = ON;` must be set per connection (SQLite default is off).
There is no WAL under opfs-sahpool — queries and the indexer share the single
worker connection. Phase-1 stub upserts and category assignments are batched in
transactions and yield to the worker event loop between batches. Phase-2
metadata updates currently autocommit one row at a time.

## Indexes for 100k-row performance

Filtering/sorting must stay in the millisecond range. Create at least:

```sql
CREATE INDEX idx_samples_root       ON samples(root_id);
CREATE INDEX idx_samples_filename   ON samples(filename);
CREATE INDEX idx_samples_date_added ON samples(date_added);
CREATE INDEX idx_samples_bpm        ON samples(bpm);
CREATE INDEX idx_samples_key        ON samples(musical_key);
CREATE INDEX idx_sample_tags_tag    ON sample_tags(tag_id);
CREATE INDEX idx_sample_cats_cat    ON sample_categories(category_id);
CREATE INDEX idx_categories_parent  ON categories(parent_id);
```

## Full-text search (FTS5)

Token-prefix name/path search uses an FTS5 virtual table kept in sync with
`samples` via triggers. It does not provide typo tolerance or approximate
matching:

```sql
CREATE VIRTUAL TABLE samples_fts USING fts5(
  filename, relpath,
  content='samples', content_rowid='id'
);
```

Use `content=`/`content_rowid=` (external-content) so the FTS index doesn't
duplicate the text, and maintain it with `AFTER INSERT/DELETE` triggers plus an
`AFTER UPDATE OF filename, relpath` trigger on `samples` — scoping the update
trigger to the indexed columns keeps scan-state and metadata writes from
rewriting the FTS row. The current `textSearch` request field compiles to a
`samples_fts MATCH ?` subquery with each whitespace-separated token quoted and
given a trailing `*`. See [query-schema.md](query-schema.md) for the current
saved-library subset and the target predicate-tree compiler.

## Category-tree queries

Filtering by a category "including descendants" needs the subtree. Use a recursive
CTE rather than walking the tree in JS:

```sql
WITH RECURSIVE subtree(id) AS (
  SELECT id FROM categories WHERE id = :rootId
  UNION ALL
  SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
)
SELECT sample_id FROM sample_categories WHERE category_id IN (SELECT id FROM subtree);
```

## Migrations

`rule_json` is versioned (see [query-schema.md](query-schema.md)); the schema
carries a `schema_version` table stamped at init. The OPFS database started at
schema v1 of the web-first world (the old Electron userData `library.db` and
its v1-v4 migration chain were abandoned; the index is rebuilt by the first
scan). Add forward-only, idempotent migration steps from v1 onward in
`src/renderer/src/backend/schema.ts`.
