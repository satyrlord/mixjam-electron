# AGENTS.md

Guidance for AI coding agents working in this repository.

This project is distinct from MixJam Native (WinUI) and MixJam Web (React/Vite, GitHub Pages). Do not share or copy schemas, docs, or code with them.

## Status

Specs 001-006 fully implemented and tested. Check individual spec files for AC status.

## Key docs

- [docs/architecture.md](docs/architecture.md) — stack, process model, non-goals
- [docs/data-model.md](docs/data-model.md) — SQLite schema, FTS5, indexes
- [docs/query-schema.md](docs/query-schema.md) — `rule_json` predicate-tree format
- [docs/indexing.md](docs/indexing.md) — first-run scan, incremental re-scan
- [docs/audio-engine.md](docs/audio-engine.md) — Web Audio scheduler, native-addon escape hatch
- [docs/decisions.md](docs/decisions.md) — resolved trade-offs and revisit triggers

## Commands

```sh
npm run dev           # launch Electron (rebuilds better-sqlite3 for Electron ABI first)
npm run build         # production build
npm test              # vitest run (rebuilds better-sqlite3 for Node ABI first)
npm run test:watch    # vitest in watch mode
npm run typecheck     # tsc -b
npm run lint          # eslint .
```

Before running `dev` or `build`, remove the `ELECTRON_RUN_AS_NODE` env var if set — it breaks Electron launch.

The `better-sqlite3` native binary differs between Electron and Node. The `pre*` scripts handle rebuilding per context automatically. Do not cross-rebuild manually.

## Hard rules — do not violate

- Virtualize all large sample lists (TanStack Virtual or react-window). Never render the full dataset as real DOM nodes.
- All filtering and sorting hits SQLite in the main process. The renderer requests windowed pages over IPC, never full result sets.
- A library is a saved `rule_json` query, not copied files or symlinks.
- Never string-concatenate user input into SQL. All queries use parameterized statements.
- All DB access stays in the main process. `better-sqlite3` is synchronous and native; it must not run in the renderer.
- Keep the renderer sandboxed: `contextIsolation: true`, `nodeIntegration: false`, `contextBridge` preload with a narrow typed API.
- Audio stays in the renderer (Web Audio API). Only file paths and metadata cross IPC.
- No emoji in code, docs, specs, or skills.
- Update specs after each bug fix or change request in the chat. Specific user requests overrule spec decisions.
- A sample bubble is merely the snaphsot of a WAV file, the visual representation of a WAV file, regardless of context.
This is why they have to be PERFECTLY identical EVERYWHERE IN THE UI and have exactly the same height and width everywhere, including the tracker, sample browser
or any other view, window or interface in the app.

## Do not relitigate

These decisions are resolved. See [docs/decisions.md](docs/decisions.md) for rationale and revisit triggers:

- `rule_json` versioned predicate tree compiling to parameterized SQL
- Two-phase background indexer, `(size, mtime)` change detection, soft-delete for missing files
- Web Audio API lookahead scheduler for v1; native addon only on a measured latency trigger
- Electron for v1; Tauri only on a measured memory/size problem
- Library export out of scope for v1

## Test setup notes

- `globals: false` in vitest config means testing-library auto-cleanup is off. `setup.ts` calls `cleanup()` in `afterEach`. Shared renderer mock is in `test/electronApi.ts`.
- On Windows, `setSize()` must come before `setResizable(false)` or the size call is silently ignored.
