# Indexing & scanning

How 850 folders / 100k+ files get into the database on first run and stay in sync
afterward, without freezing the UI.

> **Resolves open item #5.** The first-run indexing/re-scan strategy was undesigned.
> This is that design.

## Where it runs

Indexing runs in a **Node `worker_thread`** (or Electron `utilityProcess`) spawned
by the main process — never on the UI thread and never in the renderer. The worker
owns its own `better-sqlite3` connection (WAL mode lets it write while the UI reads).
Progress and lifecycle events are posted to main, which relays them to the renderer
over IPC.

```
renderer ──"start scan(root)"──▶ main ──spawn──▶ indexer worker
   ▲                              │                  │ walk + insert (phase 1)
   └──progress/done events◀───────┘◀──postMessage────┘ extract metadata (phase 2)
```

## Two-phase scan (so the browser is usable fast)

**Phase 1 — enumerate (fast, makes the library appear quickly).**
Recursively walk each `scan_roots` path. For every audio file, upsert a *stub* row:
`filepath, filename, ext, size_bytes, mtime, date_added`, with `scan_state = 0`
(stub) and metadata columns NULL. Insert in **batched transactions** (e.g. 1–5k
rows per transaction) — this is the difference between seconds and minutes at 100k
files. Report progress as `{ found, inserted }`.

After phase 1 the user can already browse, tag, and search by name/path/folder.

**Phase 2 — extract metadata (background, incremental).**
Walk rows where `scan_state = 0`, read audio headers to fill `duration`,
`sample_rate`, `channels`, set `scan_state = 1`, and commit in batches. Use a
header-parsing library (e.g. `music-metadata`) — do **not** decode whole files.
This phase can be paused/resumed and run at lower priority; the UI shows per-file
metadata "filling in" as it completes.

**BPM/key are not auto-detected in v1** (a non-goal — see
[architecture.md](architecture.md#non-goals-for-this-phase)). They stay NULL until
set manually. Automatic analysis is a possible later phase 3 that only updates rows
where the columns are NULL; nothing else needs to change to add it.

## Change detection & incremental re-scan

The cheap, reliable change key is **`(size_bytes, mtime)`**. On re-scan of a root:

1. Walk the filesystem, building the set of current paths.
2. For each file:
   - **new path** → insert stub (phase 1), queue for phase 2.
   - **known path, `mtime`/`size` changed** → reset to stub, re-extract metadata,
     but **preserve user data** (tags, category memberships, manual bpm/key, and the
     original `date_added`).
   - **known path, unchanged** → skip.
3. **Deletions:** any `samples` row whose path was not seen in the walk is marked
   `scan_state = 2` (missing) rather than hard-deleted, so its tags/library
   memberships survive a temporarily-disconnected drive. A separate explicit
   "purge missing" action hard-deletes them. Missing rows are hidden from normal
   browsing by default.

Content hashing (for move/rename detection and true dedup) is **out of scope for
v1**; `filepath` UNIQUE is the dedup key. Hashing can be added later as opt-in
because it is expensive at 35GB.

## Live watching (optional, later)

A `chokidar` watcher on the scan roots could trigger incremental updates without a
manual re-scan. Deferred for v1 — watching 850 folders has its own resource cost and
the manual/startup re-scan covers the common case.

## Failure & resume

- The walk and each batch are independent transactions, so an interrupted first run
  resumes cleanly: phase 1 re-upserts (idempotent on `filepath`), phase 2 simply
  finds the remaining `scan_state = 0` rows.
- Unreadable/locked files are logged and left as stubs (or marked missing); one bad
  file never aborts the scan.
