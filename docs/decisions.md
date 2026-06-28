# Decision log

Resolved trade-offs and the concrete conditions for revisiting them. Each entry is
the answer to one of the questions that was open during the architecture handoff.

---

## D-001 — `rule_json` schema

**Status:** Resolved. See [query-schema.md](query-schema.md).

A versioned recursive predicate tree (AND/OR/NOT groups + typed leaf conditions)
that compiles to a single parameterized SQL `WHERE` clause. New filter types are
added as new leaf `kind`s without breaking stored rules; breaking changes bump
`version` and run a lazy migration. This had to be settled before building the
query engine, which is why it's now a hard contract.

---

## D-002 — Electron for v1

**Status:** Resolved (Electron), with a revisit trigger.

Electron is the v1 shell: a real Chromium webview is the direct fix for the WPF
skinning failure, and a Node backend keeps the whole app in JS/TS.

**Revisit Tauri only if** a *measured* resource problem materializes that users
actually feel — concretely:

- idle resident memory sustained above ~400 MB, or
- installed size / installer size becomes a real distribution complaint.

Migration is kept cheap on purpose: the frontend is plain HTML/CSS/JS/React with no
Electron-specific UI assumptions, and all native access is behind the IPC boundary,
so a Tauri (Rust) backend could replace the main process without a UI rewrite.

---

## D-003 — Native audio addon threshold

**Status:** Resolved. See
[audio-engine.md](audio-engine.md#native-addon-escape-hatch--when-to-leave-web-audio).

Stay on the Web Audio API + lookahead scheduler for v1 (playback-only). Drop to a
native addon only on a measured trigger: output jitter >~10 ms that the scheduler
can't fix, a need for live monitoring under ~20 ms round-trip, or DSP that an
`AudioWorklet` can't express. Try `AudioWorklet` before a native addon.

---

## D-004 — First-run indexing / re-scan UX

**Status:** Resolved. See [indexing.md](indexing.md).

Two-phase background scan in a worker thread: phase 1 enumerates files into stub rows
(library is browsable in seconds), phase 2 fills metadata incrementally.
`(size, mtime)` is the change-detection key; re-scans preserve user data (tags,
categories, manual bpm/key, `date_added`); deletions are soft-marked `missing`
rather than hard-deleted. BPM/key auto-analysis and live `chokidar` watching are
explicitly deferred.

---

## D-005 — Library export / materialization

**Status:** Resolved as **out of scope for v1**, design pre-specified.

"Export this library as a standalone folder" (for sharing/backup) is a *separate*
feature from the library concept — libraries are non-physical by design, and export
is the one place that materializes them. It needs filesystem I/O + a progress UI, a
different code path from the SQLite-only query work, so bundling it into v1 would
widen scope without strengthening the core.

**When built**, the design is straightforward precisely because of D-001:

1. Compile the library's `rule_json` to the matching `samples` rows.
2. Copy those files to a chosen destination folder (optionally mirroring or
   flattening the category tree), reporting progress over IPC like the indexer.
3. Optionally emit a sidecar manifest (the rule + tag/category metadata) so the
   export can be re-imported.

No schema change is required to add it later.
