# AGENTS.md

Guidance for AI coding agents working in this repository.

This project is distinct from MixJam Native (WinUI) and MixJam Web (React/Vite, GitHub Pages). Do not share or copy schemas, docs, or code with them.

## Status

Specs 001-007 fully implemented and tested. Check individual spec files for AC status.

## Key docs

- [docs/architecture.md](docs/architecture.md) — stack, process model, non-goals
- [docs/data-model.md](docs/data-model.md) — SQLite schema, FTS5, indexes
- [docs/query-schema.md](docs/query-schema.md) — `rule_json` predicate-tree format
- [docs/indexing.md](docs/indexing.md) — first-run scan, incremental re-scan
- [docs/audio-engine.md](docs/audio-engine.md) — Web Audio scheduler, native-addon escape hatch

## Architecture (web-first, thin Electron shell)

The browser build is the primary app: SQLite runs as `@sqlite.org/sqlite-wasm`
(opfs-sahpool VFS) inside a backend Web Worker (`src/renderer/src/backend/`),
folder access uses the File System Access API with handles persisted in
IndexedDB, and the session lives in localStorage. The Electron main process is
a thin shell (window sizing, `app://` protocol, auto-granted `fileSystem`
permission, openExternal allowlist) exposing `window.shellAPI`; the same
renderer bundle runs unchanged in any Chromium browser (GitHub Pages) and in
the shell. Chromium-only is an accepted constraint. See
[docs/architecture.md](docs/architecture.md).

## Commands

```sh
npm run dev           # launch Electron with the dev-server renderer
npm run build         # production build (out/main, out/preload, out/renderer)
npm run preview       # preview the production build
npm test              # vitest run
npm run test:watch    # vitest in watch mode
npm run test:coverage # vitest with v8 coverage report
npm run typecheck     # tsc -b
npm run lint          # eslint .
npm run fallow        # dead-code audit
npm run package:electron  # package with electron-builder (portable/AppImage/dmg)
```

Before running `dev` or `build`, remove the `ELECTRON_RUN_AS_NODE` env var if set — it breaks Electron launch.

The browser build is `out/renderer` — a static bundle; serve it from any plain
static server (no COOP/COEP headers required).

## Session and handoff conventions

- **The working tree is shared.** The user may edit files or commit while you work. Re-read a file
  before editing it if any time or any scripted bulk change has passed since your last read; check
  `git log`/`git status` before summarizing what changed, and never assume a mid-session snapshot is
  still current. If you script a bulk rewrite (rename sweeps), your own in-session read state is stale
  afterward too — re-read before hand-editing the same files.
- **Conflicts between a plan/handoff doc and this file:** the newer, more specific document wins.
  Do not stall on the contradiction — follow the handoff, and update AGENTS.md and the affected
  docs/specs in the same change so the contradiction does not outlive the session.
- **Multi-phase plans executed in one session:** scaffolding whose only purpose is keeping
  intermediate states shippable across sessions (temporary adapters, compatibility shims scheduled
  for deletion in a later phase) should be skipped when all phases land in one pass. Say so in the
  report. When *writing* a handoff, state whether phases are expected to land across sessions.
- **Performance claims need real data.** For scan/indexing throughput work, use the real fixtures in
  `tmp/test-samples` (or ask for a pointer to a real library subset) instead of synthetic files.
  If a perf-sensitive change ships with only synthetic or functional verification, flag the missing
  measurement explicitly in the report rather than implying it was measured.
- **Deploy-origin checks:** verifying the browser build on a local static server (no COOP/COEP
  headers) is the accepted stand-in for a real GitHub Pages origin. Do not push branches or trigger
  deploys just to test an origin unless the task explicitly authorizes it; note that the real-origin
  confirmation happens on the next push to main.
- **Close-out ritual before finishing or writing a handoff.** Run a self-critique pass:
  1. **What are you least confident about?** List what you did not properly investigate. For
     each item, name a concrete command or test that would verify or disprove it (not "investigate
     this"). If you cannot name a cheap check, the uncertainty is likely filler.
  2. **What did you skip, defer, or not investigate?** Be explicit — not "the tests pass" but
     "edge case X was never tested; error path Y was not exercised."
  3. **What assumptions went unstated?** Surface reasoning shortcuts you took for granted.
     Overconfident errors are harder to spot than uncertain ones.
  4. **What is the biggest thing the user might be missing?** Surface blind spots you see but
     they have not considered.
  Log the results in the session handoff. Do not start fixing uncovered gaps in the close-out
  — that turns two minutes into another hour. Let the handoff carry them forward.
- **Fresh-eyes audit for critical work.** When a session produces a large or risky change, the
  agent should recommend a fresh-eyes review: paste the final output or handoff doc into a new
  agent context and ask it to "Evaluate this. Anything missed?" A clean-room audit (different
  provider, no skills/memories) catches confidently-wrong assumptions the original agent cannot
  see.
- **Anti-pattern: asking the agent to investigate its own doubts without concrete verification
  steps.** The agent will use the same assumptions that created the doubt and return reassured.
  Always pair an uncertainty with a specific check.
- **Anti-pattern: repeated "are you sure?"** The agent will just double down. Use the concrete
  verification step instead.

## Hard rules — do not violate

- Virtualize all large sample lists (TanStack Virtual or react-window). Never render the full dataset as real DOM nodes.
- All filtering and sorting hits SQLite in the backend worker. The UI requests windowed pages through the BackendAPI facade, never full result sets.
- A library is a saved `rule_json` query, not copied files or symlinks.
- Never string-concatenate user input into SQL. All queries use parameterized statements.
- All DB access stays in the backend worker (`src/renderer/src/backend/`) — opfs-sahpool is worker-only and single-connection. Never open a second connection or touch the DB from the UI thread.
- No absolute paths in the data model or contract. Folders are `FolderRef`s keying persisted directory handles; samples are `(root_id, relpath)`.
- Keep the Electron renderer sandboxed: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `contextBridge` preload exposing only the narrow `ShellAPI`.
Everything else must work without the shell.
- Audio stays on the renderer main thread (Web Audio API); the engine loads bytes via `readSampleBytes(rootId, relpath)`.
- No emoji in code, docs, specs, or skills.
- Update specs after each bug fix or change request in the chat. Specific user requests overrule spec decisions.
- A sample bubble is merely the snapshot of a WAV file, the visual representation of a WAV file, regardless of context.
This is why they have to be PERFECTLY identical EVERYWHERE IN THE UI and have exactly the same height and width everywhere, including the tracker, sample browser
or any other view, window or interface in the app.

## Do not relitigate

These decisions are resolved:

- Web-first architecture: one browser backend, thin Electron shell; no demo/mock mode on any host (onboarding without samples is spec-013).
- `@sqlite.org/sqlite-wasm` with the opfs-sahpool VFS (not wa-sqlite — GPL; not the plain `opfs` VFS — needs COOP/COEP, which GitHub Pages cannot set). One tab, enforced by a Web Lock.
- `rule_json` versioned predicate tree compiling to parameterized SQL
- Two-phase background indexer, `(size, mtime)` change detection, soft-delete for missing files
- Web Audio API lookahead scheduler for v1; native addon only on a measured latency trigger
- Library export out of scope for v1

## Test setup notes

- `globals: false` in vitest config means testing-library auto-cleanup is off. `setup.ts` calls `cleanup()` in `afterEach`. Shared renderer mock is in `test/backendApi.ts` (installed as `window.backendAPI`).
- Vitest runs two projects: `renderer` (jsdom) for UI and session tests, and `backend` (node environment)
for the sqlite-wasm suites (`backend/library.test.ts`, `backend/indexer.test.ts`) using an in-memory database.
- Indexer tests use a map-backed fake `FileSystemDirectoryHandle` plus generated minimal WAV files, so `parseBlob` extracts real metadata.
- `setup.ts` stubs `HTMLCanvasElement.getContext` with a silent no-op 2D context (jsdom's own throws/logs "Not implemented"); tests that assert drawing install their own mock over it.
- On Windows, `setSize()` must come before `setResizable(false)` or the size call is silently ignored.
