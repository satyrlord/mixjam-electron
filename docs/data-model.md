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
  id                     INTEGER PRIMARY KEY,
  key                    TEXT NOT NULL UNIQUE,
  last_completed_at      INTEGER,
  legacy_index_available INTEGER NOT NULL DEFAULT 0
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
  bpm          REAL,                   -- NULL until analyzed or manually set
  bpm_source   TEXT,                   -- 'analysis', 'manual', or NULL
  musical_key  TEXT,                   -- e.g. 'Am'; NULL until analyzed/set
  musical_key_source TEXT,             -- 'analysis', 'manual', or NULL
  sample_type  TEXT,                   -- acoustic class; separate from category_id
  sample_type_source TEXT,             -- 'analysis', 'manual', or NULL
  date_added   INTEGER NOT NULL,       -- epoch ms, first-indexed time
  scan_state   INTEGER NOT NULL DEFAULT 0,  -- 0=stub, 1=metadata-ready, 2=missing, 3=metadata-unavailable
  metadata_revision INTEGER NOT NULL DEFAULT 0,
  analysis_revision INTEGER NOT NULL DEFAULT 0,
  raw_bpm      REAL,                   -- direct per-file analyzer evidence
  raw_musical_key TEXT,                -- direct per-file analyzer evidence
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,  -- one primary category per sample
  UNIQUE (root_id, relpath)               -- the dedup key
);

-- One row for each analyzed context key. '' is the root; ordinary keys are
-- relative-directory prefixes; @cohort/<top>/<SC|SL> keys cross subfolders.
CREATE TABLE analysis_groups (
  root_id           INTEGER NOT NULL REFERENCES scan_roots(id) ON DELETE CASCADE,
  relpath_prefix    TEXT NOT NULL,
  depth             INTEGER NOT NULL,
  sample_count      INTEGER NOT NULL,
  state             TEXT NOT NULL,  -- 'resolved', 'mixed', or 'uncertain'
  bpm               REAL,
  musical_key       TEXT,
  bpm_support       REAL NOT NULL,
  key_support       REAL NOT NULL,
  confidence        REAL NOT NULL,
  analysis_revision INTEGER NOT NULL,
  PRIMARY KEY (root_id, relpath_prefix)
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
app state's `sampleFolder`), but every folder ever scanned keeps its rows, scoped
by `root_id`, so switching folders switches the visible library instead of
mixing or losing rows (see [indexing.md](indexing.md#per-root-scoping-one-db-many-sample-folders)).

## Library-sync and analysis bookkeeping

Schema version 3 introduced four facts retained by schema v4 for automatic
library sync:

- `scan_roots.last_completed_at INTEGER` is NULL until a complete filesystem
  pass finishes. A non-NULL value means the root has a valid index even when it
  contains zero audio files. Cancellation and fatal failure do not advance it.
- `scan_roots.legacy_index_available INTEGER` is set when a root already has
  non-missing rows from a prior schema version. It keeps those rows browseable
  during the first reconciliation without treating partial rows from a new
  first scan as a usable index.
- `samples.metadata_revision INTEGER NOT NULL DEFAULT 0` records the metadata
  parser revision attempted for the current file bytes. A terminal parse failure
  sets `scan_state = 3` (metadata unavailable) and stamps the revision, so an
  unchanged damaged or unsupported file is not retried on every automatic sync.
  A manual Re-scan retries unavailable metadata, and new bytes or a newer parser
  revision reset the row to pending.
- `samples.analysis_revision INTEGER NOT NULL DEFAULT 0` records the analysis
  projection revision attempted for the current file bytes. New or changed
  files reset it to 0. Automatic analysis stamps the current revision even when
  a valid result is NULL, so later app launches do not repeatedly decode
  unchanged unsupported or low-confidence samples.

`samples.raw_bpm` and `samples.raw_musical_key` preserve the analyzer's direct
per-file result. `samples.bpm` and `samples.musical_key` remain the contextual
user-facing projections. This separation lets group inference rerun from stored
raw evidence, duration, sample type, and relative-path labels without decoding
unchanged audio. `analysis_groups` stores one summary for each directory or
virtual cohort context key. A resolved child group is a generator cluster; mixed
and uncertain rows explain why no single BPM/key was projected.

Changing one sample resets its analysis revision, making its retained raw
evidence stale. After pending files are decoded, the analyzer rebuilds the
affected root's group summaries and automatic projections from stored raw
evidence in one transaction. Manual
projections are never replaced. A grouping-only algorithm revision may rebuild
all group rows from raw evidence without reading audio bytes.

Migration from schema versions before v3 preserves uncertainty:

- roots from prior versions keep `last_completed_at = NULL` because a prior
  schema cannot prove enumeration and metadata work completed; existing rows
  remain browseable while the required first post-upgrade sync reconciles them.
  Root usability is based on the presence of existing non-missing rows, not on
  whether any row already has a current analysis revision;
- existing `scan_state = 1` rows are stamped with the current metadata revision;
  the analysis revision is stamped only when a prior `analysis` source proves
  the per-file analysis write completed. Entirely NULL prior results are
  retried once because NULL alone cannot distinguish them from interrupted work;
- existing `scan_state = 0` rows remain pending with revision 0, so interrupted
  work resumes and previously failed metadata receives one classified attempt;
- missing rows remain missing and keep revision 0 until restored.

Schema v4 adds `raw_bpm`, `raw_musical_key`, and `analysis_groups`, then bumps
the analysis revision. Existing projected BPM/key values cannot prove the direct
per-file evidence that produced them, so current readable WAV rows receive one
intentional analyzer pass to populate raw evidence and the contextual model.
This is the one exception to the normal grouping-only reuse rule. Manual fields
remain protected during that pass.

These fields let automatic sync distinguish an empty completed folder from an
unscanned folder and select only new, changed, parser-stale, or analysis-stale
candidates. They are app/index state, not project data.

Analysis provenance is stored per field so a manual BPM does not prevent a
missing key or sample type from being analyzed. Clearing a manual value clears
both its value and source. Re-analysis refreshes each non-manual field and may
clear a stale automatic value when readable bytes do not produce that field;
fields whose source is `manual` remain unchanged. `sample_type` is acoustic
metadata; `category_id` remains the
spec-004 organizational folder/user category and analysis never overwrites it.

`samples.bpm`, `musical_key`, and `sample_type` are the current user-facing
projections. Manual projections are authoritative only for their sample.
Generate MixJam may select a resolved `analysis_groups` prefix and keep its
existing bounded audio scoring pass. The selected value is a context key, so
cohort keys use their deterministic cohort-membership matcher instead of path
containment. Planner scoring must not recompute semantic BPM, key, or sample
type.

`PRAGMA foreign_keys = ON;` must be set per connection (SQLite default is off).
There is no WAL under opfs-sahpool — queries and the indexer share the single
worker connection. Phase-1 stub upserts and category assignments are batched in
transactions and yield to the worker event loop between batches. Phase-2
metadata updates use serialized transactions of up to 200 rows.

## Indexes for 100k-row performance

Filtering/sorting must stay in the millisecond range. Create at least:

```sql
CREATE INDEX idx_samples_root       ON samples(root_id);
CREATE INDEX idx_samples_filename   ON samples(filename);
CREATE INDEX idx_samples_date_added ON samples(date_added);
CREATE INDEX idx_samples_bpm        ON samples(bpm);
CREATE INDEX idx_samples_key        ON samples(musical_key);
CREATE INDEX idx_analysis_groups_root ON analysis_groups(root_id, depth);
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
carries a `schema_version` table stamped at init. Add forward-only, idempotent
migration steps from v1 onward in
`src/renderer/src/backend/schema.ts`.
