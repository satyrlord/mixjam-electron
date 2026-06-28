# AGENTS.md

Guidance for AI coding agents working in this repository.

## Status: pre-implementation

Architecture is decided and design questions are resolved; no code is scaffolded yet.
See [docs/README.md](docs/README.md) for the full design. Key docs:

- [docs/architecture.md](docs/architecture.md) — stack, process model, non-goals
- [docs/data-model.md](docs/data-model.md) — SQLite schema, FTS5, indexes
- [docs/query-schema.md](docs/query-schema.md) — `rule_json` predicate-tree format
- [docs/indexing.md](docs/indexing.md) — first-run scan + incremental re-scan
- [docs/audio-engine.md](docs/audio-engine.md) — Web Audio scheduler + native-addon trigger
- [docs/decisions.md](docs/decisions.md) — resolved trade-offs and revisit triggers

## What this app is

A Windows Electron desktop app:

1. A **sample-library browser/tagger** — 35GB+, 100k+ samples, 850+ folders — with
   dynamic tags, a category/subcategory tree, sorting, and filtering.
2. A **tracker/player** — deliberately eJay/Acid-simple, **not** a full DAW.

Performance at that data scale and pixel-perfect CSS skinning are the two hard
requirements that constrain every architectural choice.

## Non-negotiables

- **All large-sample lists must be virtualized** (TanStack Virtual or react-window).
  Rendering the full dataset as real DOM nodes was the root cause of the prior React
  slowness — do not revert to that.
- **All filtering/sorting hits SQLite** in the main process, never in-memory JS
  array work. The renderer asks for windowed pages over IPC.
- **A library is a saved query** (`rule_json`), not copied files or symlinks.
  Deleting/retagging a sample updates every library automatically. See
  [docs/query-schema.md](docs/query-schema.md) for the format.
- **Do not reintroduce a non-webview UI layer.** Electron's real Chromium webview is
  the direct fix for the prior WPF skinning failure.
- **Never string-concatenate user input into SQL.** All query compilation uses
  parameterized statements.

## Resolved decisions — do not relitigate without a stated trigger

Full rationale and revisit conditions in [docs/decisions.md](docs/decisions.md):

- `rule_json`: versioned recursive predicate tree compiling to parameterized SQL.
- Indexing: two-phase background worker, `(size, mtime)` change detection,
  soft-delete for missing files, BPM/key auto-analysis deferred.
- Audio: Web Audio API + lookahead scheduler for v1; native addon only on a measured
  latency trigger.
- Electron for v1; revisit Tauri only on a measured memory/size problem.
- Library export: out of scope for v1.

## Hard boundary: do not conflate with sibling projects

This project is distinct from **MixJam Native** (WinUI) and **MixJam Web**
(React/Vite, GitHub Pages). Do not share or copy schemas, docs, or code with them.
