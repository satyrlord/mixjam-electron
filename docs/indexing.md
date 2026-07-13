# Indexing & scanning

How 850 folders / 100k+ files get into the database on first run and stay in sync
afterward, without freezing the UI.

## Where it runs

Indexing runs inside the **backend Web Worker** (`src/renderer/src/backend/`) —
never on the UI thread. opfs-sahpool allows exactly one DB connection, so the
indexer shares the query connection: phase-1 work is batched in transactions
and yields to the worker's event loop between batches, letting worker requests
interleave with an in-flight scan. Progress and lifecycle events are posted to
the BackendAPI facade on the UI thread.

```text
UI thread --startScan(FolderRef)--> backend worker
   ^                                  | load handle from IndexedDB
   |                                  | walk handle + upsert stubs (phase 1)
   +-- progress/done events <---------+ metadata (phase 2), analysis (phase 3)
```

The traversal walks the Sample Folder's `FileSystemDirectoryHandle`; file
identity is the `(root_id, relpath)` pair, and `File.size`/`File.lastModified`
replace `stat()`.

## Two-phase scan

**Phase 1 — enumerate.**
Recursively walk the root's directory handle. For every audio file, upsert a *stub* row:
`relpath, filename, ext, size_bytes, mtime, date_added`, with `scan_state = 0`
(stub) and metadata columns NULL. Stub upserts and category assignments use
transactions of 500 files and yield between batches. Progress uses the shared
`ScanProgress` shape: `{ status, phase, found, processed, total }`.

On a folder's first scan, the full-screen loader remains in place through both
phases. The browser query is issued only after `scan-done`, so phase-1 stubs do
not appear incrementally. During a manual re-scan of an already indexed folder,
the existing browser remains available and scan progress appears in the toolbar;
there is no full-screen re-scan overlay.

**Phase 2 — extract metadata.**
Walk rows where `scan_state = 0`, read audio headers to fill `duration`,
`sample_rate`, `channels`, and set `scan_state = 1`. Four metadata parses run
concurrently; SQLite updates remain serialized on the worker and currently
autocommit one row at a time. `music-metadata.parseBlob` reads headers without
decoding whole files. Progress is emitted every 50 rows and at completion.

The scan can be cancelled but not paused. Cancellation increments a generation
counter and is observed at phase boundaries and phase-1 batch boundaries; phase
2 checks it before taking the next stub. Already committed rows are retained,
and the UI resets progress to idle immediately. A later scan resumes naturally
by re-upserting phase-1 rows and processing remaining stubs.

**Phase 3 — sample analysis.** After phase 2, `scan-done` makes indexed samples
available immediately. The same backend worker then decodes PCM/IEEE-float WAV
files sequentially and extracts BPM, musical key, and acoustic sample type.
Analysis has its own `{ status, analyzed, total }` progress events and yields to
the worker event loop after every file so library queries continue to interleave.
Only NULL, non-manual fields are written. Peak memory stays bounded to one
decoded sample; `analysis-done` refreshes the current windowed renderer query.

Manual values carry per-field `manual` provenance and survive re-scan and
re-analysis. Clearing an override clears its source and permits the individual
re-analysis action to fill that field again. Automatic decoding of MP3, FLAC,
OGG, and AIFF is deferred; those formats retain manual analysis controls.

## Category auto-assignment

Before processing individual files, the indexer synchronises root categories with
the sample-folder structure: each top-level subdirectory becomes a root category
(created if it does not already exist). The hardcoded **"Unsorted"** category is
always present and serves as the fallback.

During phase 1, each sample is assigned to a primary category by matching the
first relative path segment against existing root categories. Deeper path
segments become subcategories (auto-created under the matched root if needed).

For example, `Drums/Kicks/kick_808.wav` → primary category `Drums`, subcategory
`Kicks`. Samples directly in the sample-folder root (no subdirectory) are
assigned to **"Unsorted"**.

See `syncCategoriesFromNames()` and `assignCategoryFromPath()` in
`src/renderer/src/backend/library.ts`. A sample belongs to exactly one primary category but may
have multiple subcategory assignments (via the `sample_categories` join table).

## Per-root scoping (one DB, many Sample Folders)

Every Sample Folder that has ever been scanned gets a row in `scan_roots`
(keyed by its FolderRef id), and each `samples` row carries the `root_id` of
the root it was found under. Browser queries (`querySamples`, `hasSamples`) are
scoped to the active Sample Folder's root, so switching folders never shows
another folder's rows — a folder that has not been scanned yet reads as empty
and triggers the first-entry scan. Re-scans are scoped the same way: marking
missing files only touches rows under the root being scanned, so rows belonging
to other roots survive untouched.

## Change detection & incremental re-scan

The cheap, reliable change key is **`(size_bytes, mtime)`**. On re-scan of a root:

1. Walk the filesystem, building the set of current paths.
2. For each file:
   - **new path** → insert stub (phase 1), queue for phase 2.
   - **known path, `mtime`/`size` changed** → reset to stub and re-extract
     metadata, while preserving tags, bpm/key fields, and the original
     `date_added`; filesystem-derived category assignments are recomputed.
   - **known path, unchanged** → skip.
3. **Deletions:** any `samples` row whose path was not seen in the walk is marked
   `scan_state = 2` (missing) rather than hard-deleted, so its tags/library
   memberships survive a temporarily-disconnected drive. Missing rows are hidden
   from normal browsing by default. No purge-missing UI exists yet.

Content hashing (for move/rename detection and true dedup) is **out of scope for
v1**; `UNIQUE(root_id, relpath)` is the dedup key. Hashing can be added later as
opt-in because it is expensive at 35GB.

## Live watching (optional, later)

The Chromium `FileSystemObserver` API (or a periodic incremental re-scan) could
trigger updates without a manual re-scan. Deferred for v1 — watching 850 folders
has its own resource cost. A folder that has never been indexed scans on first
entry; an already indexed folder changes only after the user selects Re-scan.

## Failure & resume

- Completed phase-1 batches remain committed after cancellation or interruption.
  The next scan re-upserts them idempotently on `(root_id, relpath)` and phase 2
  finds the remaining `scan_state = 0` rows.
- Unreadable directories and files are skipped. Metadata failures leave the row
  as a stub. These per-entry failures are currently silent; a fatal scan or
  analysis failure carries its backend message to the renderer console and
  toolbar under the correct lifecycle.
