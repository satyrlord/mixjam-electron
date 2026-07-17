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
UI thread --startLibrarySync(FolderRef, trigger)--> backend worker
   ^                                                 | load handle from IndexedDB
   |                                                 | walk + upsert stubs (phase 1)
   +-- root/job-scoped progress and done events <----+ metadata and analysis
```

The traversal walks the Sample Folder's `FileSystemDirectoryHandle`; file
identity is the `(root_id, relpath)` pair, and `File.size`/`File.lastModified`
replace `stat()`.

## Sync trigger policy

Library sync starts automatically after an accessible Sample Folder is selected
or restored and at most once for that root during an app session. The backend
worker owns this scheduling and keys roots by the string `FolderRef.id`; React
hooks only request work and render the returned job state. Sync does not wait
for Player entry, and Home/Player navigation never starts or restarts a job.

The worker runs one library job at a time. A duplicate request for the active or
queued root returns the existing job identity. Picking a different Sample Folder
cancels the prior root at its next checkpoint, removes its queued automatic
request, prioritizes the new root, and invalidates UI events from the previous
root. A completed app-owned mutation, including a spec-013 download, bypasses
the once-per-session suppression. If the same root is active, the worker sets a
dirty bit and guarantees one follow-up reconciliation after the active job;
multiple mutation events collapse into that one follow-up. If the root is idle,
the mutation schedules work immediately.

The first sync and later refreshes use the same incremental pipeline. Existing
indexed rows remain queryable while a refresh runs. A first-time folder shows
an empty syncing state until `scan-done`; it does not apply an app-wide modal
overlay or block navigation. Progress appears in the Home Sample Folder card
while Home is visible and in the Middle Strip library-status region while the
Player is visible.

The UI exposes one low-prominence manual **Re-scan Sample Folder** recovery
action for files changed after the session's automatic sync. Automatic and
manual triggers are single-flight and root-scoped: duplicate requests coalesce,
the start call returns the owning job identity, and every progress/done event
carries the string root key and job identity that owns it.

## Incremental sync pipeline

**Phase 1 — enumerate.**
Recursively walk the root's directory handle. For every audio file, upsert a *stub* row:
`relpath, filename, ext, size_bytes, mtime, date_added`, with `scan_state = 0`
(stub) and metadata columns NULL. Stub upserts and category assignments use
transactions of 500 files and yield between batches. Progress uses the shared
`ScanProgress` shape: `{ status, phase, found, processed, total }`.

The browser query is issued only after a first-time root reaches `scan-done`,
so phase-1 stubs do not appear incrementally. During refresh of an indexed root,
the existing browser remains available while progress appears in the current
Home or Player status surface.

**Phase 2 — extract metadata.**
Walk rows where `scan_state = 0` or the persisted metadata revision is stale,
read audio headers to fill `duration`, `sample_rate`, and `channels`, then set
`scan_state = 1` and stamp the current metadata revision. A terminal unsupported
or damaged-file result sets `scan_state = 3` (metadata unavailable) and also
stamps the revision. It also clears stale non-manual BPM, key, and type values
and stamps the analysis revision for those bytes; manual overrides remain
unchanged. Automatic sync skips unchanged current-revision rows in both states;
manual Re-scan explicitly retries state 3. Four metadata parses run
concurrently; SQLite updates remain serialized on the worker in transactions of
up to 200 rows. `music-metadata.parseBlob` reads headers without decoding whole
files. Progress is emitted every 50 rows and at completion.
If a state-3 retry later extracts metadata successfully, its analysis revision
returns to pending so the recovered sample is analyzed again.

The scan can be cancelled but not paused. Cancellation increments a generation
counter and is observed at phase boundaries and phase-1 batch boundaries; phase
2 checks it before taking the next stub. Already committed rows are retained,
and the UI enters a cancelled state immediately. A later Retry or Re-scan
resumes naturally by re-upserting phase-1 rows and processing remaining stubs.

**Phase 3 — sample analysis.** After phase 2, `scan-done` makes indexed samples
available immediately. The same backend worker then decodes PCM/IEEE-float WAV
files sequentially and extracts BPM, musical key, and acoustic sample type.
Analysis has its own `{ status, analyzed, total }` progress events and yields to
the worker event loop after every file so library queries continue to interleave.
Each per-file result is committed before its progress count advances.
Automatic and manual sync analyze only files that are new, changed,
interrupted, or stale for the current analysis revision. Unchanged attempted
files are not decoded again, including files whose valid result was NULL.
Manual fields are never replaced. The worker retains only compact result
summaries; decoded PCM remains bounded to one sample. `analysis-done` refreshes
the current windowed renderer query.

**Uniform Folder Calibration** is a separate advanced analysis action owned by
spec-008. It intentionally analyzes the full root after explicit confirmation
and may commit guarded whole-batch BPM/key calibration in one transaction. It
is not a scan variant and is not exposed beside the manual Re-scan action.
Calibration has a separate UI lifecycle. The backend worker serializes it with
library sync; it cannot start while sync is active, and a newly selected-root
sync cancels calibration at its next safe checkpoint.
Individual re-analysis uses its own typed job identity and is serialized with
both library sync and calibration. Its request completes only after the worker
has committed the result or reported the operation error.
MixJam Generator planning is another typed, root-scoped worker job. It is
serialized with library sync, calibration, and individual re-analysis. It reads
and decodes only its bounded candidate set, stores no transient analysis in the
database, and returns a neutral plan for renderer-owned project serialization
and commit. Cancellation is checked between reads and before the plan returns.
An automatic sync requested for a newly selected root during individual
analysis is queued and starts when that analysis finishes; the folder-selection
request is not discarded.

Readable unsupported or damaged bytes clear stale non-manual analysis. A
transient failure to read the file preserves prior metadata for a later retry.

Manual values carry per-field `manual` provenance and survive sync and
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
and its automatic session sync establishes the first index. Later syncs are
scoped the same way: marking missing files only touches rows under the root
being scanned, so rows belonging to other roots survive untouched.

## Change detection and incremental sync

The cheap, reliable change key is **`(size_bytes, mtime)`**. On sync of a root:

1. Walk the filesystem, building the set of current paths.
2. For each file:
   - **new path** → insert stub (phase 1), queue for phase 2.
   - **known path, `mtime`/`size` changed** → reset to stub and re-extract
     metadata, while preserving tags, bpm/key fields, and the original
     `date_added`; reset metadata and analysis revisions; filesystem-derived
     category assignments are recomputed.
   - **known path, unchanged** → skip.
3. **Deletions:** any `samples` row whose path was not seen in the walk is marked
   `scan_state = 2` (missing) rather than hard-deleted, so its tags/library
   memberships survive a temporarily-disconnected drive. Missing rows are hidden
   from normal browsing by default. No purge-missing UI exists yet.

Content hashing (for move/rename detection and true dedup) is **out of scope for
v1**; `UNIQUE(root_id, relpath)` is the dedup key. Hashing can be added later as
opt-in because it is expensive at 35GB.

## Live watching (optional, later)

Chromium desktop ships `FileSystemObserver`, but the API remains non-standard.
A later feature-detected watcher may debounce change events into this same
incremental pipeline. It must fall back to the once-per-session automatic sync
and the single manual recovery action. Periodic full-tree polling is not part of
the approved update because its cost against a 100k-file root is unmeasured.

## Failure & resume

- Completed phase-1 batches remain committed after cancellation or interruption.
  The next scan re-upserts them idempotently on `(root_id, relpath)` and phase 2
  finds the remaining `scan_state = 0` rows.
- `scan_roots.last_completed_at` advances only after phase 2 has committed every
  terminal metadata outcome for the current job. The worker updates it in the
  final database transaction immediately before emitting `scan-done`. A
  completed empty folder is ready; cancellation or fatal failure does not
  advance it.
- Terminal unsupported or damaged metadata sets `scan_state = 3` and stamps the
  metadata and analysis revisions. It clears stale automatic analysis fields
  while preserving manual overrides. Transient permission or I/O failure fails
  the job without stamping the row, so contextual Retry can resume it. Manual
  Re-scan also retries unchanged state-3 rows.
- A cancelled or failed first sync has no usable index and shows contextual
  **Retry library sync** in the active Home or Player status surface. Failure
  during refresh preserves the prior usable index and shows a warning plus the
  single manual Re-scan recovery route.
- Fatal sync or analysis failure carries its backend message to the renderer
  console and active status surface under the correct root/job lifecycle.
