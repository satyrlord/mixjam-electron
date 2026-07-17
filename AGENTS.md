# AGENTS.md

Imperative rules for AI coding agents. For background and rationale, see [docs/README.md](docs/README.md).

Use simple English: short sentences, common words, plain structure. No idioms or jargon unless defined in the glossary.

## Spec status

See [docs/README.md#specs](docs/README.md#specs). Specs 001-011 are implemented;
check individual spec files for acceptance wording and evidence. Specs 012-018
status is documented in their individual files and in docs/README.md.

## Always consult these docs

- [docs/glossary.md](docs/glossary.md) — terminology
- [docs/architecture.md](docs/architecture.md) — stack, process model, non-goals
- [docs/data-model.md](docs/data-model.md) — SQLite schema, FTS5, indexes
- [docs/query-schema.md](docs/query-schema.md) — `rule_json` subset and target compiler
- [docs/indexing.md](docs/indexing.md) — scan and re-scan logic
- [docs/audio-engine.md](docs/audio-engine.md) — Web Audio scheduler

## Commands

See [docs/README.md](docs/README.md) for the full command table. Key commands:

```sh
npm run dev           # Electron with hot reload
npm run build         # production build
npm test              # vitest (single pass)
npm run typecheck     # tsc -b
npm run lint          # eslint .
npm run fallow        # dead-code audit
```

Before `dev` or `build`: unset `ELECTRON_RUN_AS_NODE` or Electron will not launch.

## Hard rules

- Virtualize large sample lists (TanStack Virtual or react-window). Never render the full dataset as real DOM nodes.
- Filter and sort in SQLite (backend worker). UI requests windowed pages through BackendAPI only.
- A library is a saved `rule_json` query, not copied files or symlinks.
- Use parameterized SQL statements. Never concatenate user input into SQL.
- All DB access stays in `src/renderer/src/backend/` (opfs-sahpool, worker-only, single-connection). Never open a second connection or touch DB from the UI thread.
- No absolute paths. Folders are `FolderRef` (persisted directory handles); samples are `(root_id, relpath)`.
- Electron renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Preload exposes only `ShellAPI` via `contextBridge`. Everything must work without the shell.
- Audio on the renderer main thread (Web Audio API). Load bytes via `readSampleBytes(rootId, relpath)`.
- No emoji in code, docs, specs, or skills.
- Update specs after each bug fix or change request. User requests overrule spec decisions.
- Sample bubbles must be identical everywhere in the UI: same height, same width, in every view.
- No archaeological data. The current implementation is the only implementation. Do not keep or reference prior iterations, dead code paths, or historical artifacts that do not serve the end user.

## Resolved decisions — do not reopen

- Web-first: one browser backend, thin Electron shell. No demo/mock mode
  (onboarding without samples is spec-013).
- `@sqlite.org/sqlite-wasm` with opfs-sahpool VFS. One tab, enforced by Web Lock.
- `rule_json` predicate tree compiles to parameterized SQL. Current executable subset:
  one `and` group with optional text, one category, tag-any leaves.
  Do not extend before validator and full compiler land (see `docs/query-schema.md`).
- Two-phase background indexer, `(size, mtime)` change detection, soft-delete for missing files.
- Web Audio API lookahead scheduler for v1; native addon only if latency triggers it.
- Library export out of scope for v1.

## Session conventions

- **Parallel subagents first.** Prefer dispatching independent work (search, file reads, research, audits)
  to parallel `Explore` subagents. The main agent is the orchestrator — keep it free and interactive
  for the user to interrupt without blocking background work.
- **Working tree is shared.** Re-read files before editing if any time has
  passed since your last read. Check `git log`/`git status` before summarizing
  changes. Avoid overlapping edits unless ownership and merge order are
  explicit. Assume concurrent workers may share the same workspace.
- **Newer, more specific doc wins** in conflicts with this file. Follow the newer doc, then update both.
- **Skip scaffolding** that only exists to keep intermediate states shippable
  across sessions when all phases land in one session. Retain temporary
  compatibility or migration work only when it serves a real deployment,
  review, rollback, or risk-control need.
- **Performance claims need real data.** Use `tmp/test-samples` fixtures, not synthetic files. Flag missing measurements explicitly.
- **Deploy-origin checks:** verify browser build on a local static server (no COOP/COEP headers). Do not push branches just to test an origin.
- **Close-out before finishing:** run a self-critique pass. List: (1) least confident items with concrete verification commands, (2) skipped or deferred work, (3) unstated assumptions,
  (4) biggest blind spot for the user. Log results in the handoff. Do not start fixing gaps — let the handoff carry them.
- **Fresh-eyes audit** for large/risky changes: paste the handoff into a new agent context and ask
  "Evaluate this. Anything missed?"
- **Anti-pattern:** asking the agent to investigate its own doubts without a concrete check. Always pair uncertainty with a specific verification step.
- **Anti-pattern:** repeated "are you sure?" — use the concrete verification step instead.

## Evidence and uncertainty

- Distinguish clearly between:
  - Verified facts.
  - Evidence-supported inferences.
  - Assumptions.
  - Unresolved questions.
- Do not speculate about material facts. Resolve uncertainty by:
  1. Inspecting the system or source material directly.
  2. Checking authoritative documentation.
  3. Running a specific test, command, query, or experiment.
  4. Asking the user when the ambiguity cannot be resolved from available evidence.
- State any uncertainty that remains after verification.

## Test gotchas

- `globals: false` — testing-library auto-cleanup is off. `setup.ts` calls `cleanup()` in `afterEach`.
- Vitest has two projects: `renderer` (jsdom) and `backend` (node, in-memory sqlite-wasm).
- `setup.ts` stubs `HTMLCanvasElement.getContext` with a no-op 2D context. Tests that assert drawing must install their own mock.
- On Windows: call `setSize()` before `setResizable(false)` or the size call is silently ignored.
