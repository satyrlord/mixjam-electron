# AGENTS.md

Imperative rules for AI coding agents. For background and rationale, see [docs/README.md](docs/README.md).

## Writing style

Write all prose in ASD-STE100 Simplified Technical English. This covers documentation, specs,
READMEs, pull-request text, error messages, release notes, commit messages, comments, and chat
replies. It does not cover code, identifiers, or command syntax.

Use two modes:

- **Strict** for procedures, runbooks, safety text, and error messages. Apply every rule and both
  length caps.
- **STE-flavored** for general prose. Apply the sentence, paragraph, and active-voice rules. Relax
  the controlled dictionary so the text keeps enough range to read naturally.

Words:

- Use one name for one thing. Do not call the same item by two different names.
- Use these short common words:
  - Use *start*. Do not use *begin*, *commence*, or *initiate*.
  - Use *use*. Do not use *utilize*.
  - Use *help*. Do not use *facilitate*.
  - Use *make sure*. Do not use *ensure*.
  - Use *before*. Do not use *prior to*.
  - Use *after*. Do not use *subsequent to*.
  - Use *about*. Do not use *regarding*.
  - Use *get*. Do not use *obtain*.
  - Use *show*. Do not use *demonstrate*.
  - Use *also*. Do not use *additionally*, *furthermore*, or *moreover*.
- Give each word one meaning. "Fall" means to move down. It does not mean to decrease.
- No marketing adjectives: seamless, robust, powerful, cutting-edge, effortless, world-class,
  next-generation, revolutionary.
- American spelling.

Verbs:

- Use active voice. Write "the parser reads the file", not "the file is read by the parser".
- Use a verb for an action. Write "analyze the log", not "perform an analysis of the log".
- Do not stack auxiliaries. Write "this improves X", not "it is important to note that this may help
  to improve X".
- Do not use an "-ing" main verb where a simple tense works.
- Do not use a phrasal verb where a plain verb works. Write "start the server", not "spin up the
  server".

Sentences and structure:

- One instruction per sentence. Maximum 20 words for an instruction. Maximum 25 words for a
  descriptive sentence.
- No contractions. Use the articles a, an, the, this, and these.
- No semicolons. Write two sentences instead.
- One topic per paragraph. Maximum six sentences.
- For steps, use a numbered vertical list. One action per item, in imperative form.
- Put a condition before its command.
- No idioms or jargon unless the glossary defines the term.

Run this self-lint before you return text:

1. Split any sentence over 20 words.
2. Replace any semicolon with a period.
3. Expand any contraction.
4. Convert any passive voice with a known actor to active voice.
5. Replace any "-ing" main verb, nominalization, or phrasal verb with a plain verb.
6. Pick one name when the same thing is named two ways.

These rules fix the form of the text. They cannot make a hollow paragraph true. The free official
standard is on the [ASD-STE100 website](https://asd-ste100.org). Do not paste the standard because it is copyrighted.

## Roles and capability levels

- Use a reasoning-focused configuration for planning and a delivery-focused configuration for implementation.
- Keep planning, implementation, integration, and critical review distinct, even when one worker performs several roles.
- The root coordinator owns the plan, integrates all work, resolves conflicts, and performs the final critical review.
- Use the standard reasoning level by default.
  - Use a higher level for complex implementation, debugging, and review.
  - Use a very high level for architecture, security, concurrency, or major ambiguity.
  - Use the highest available level only as an escalation.
- Delegated workers should normally use a lower-cost capability level than the worker that delegated the task. Raise the level only when task complexity or risk requires it.

### Worker types

- Use exploration workers for read-heavy and context-heavy tasks. Examples:
  - Mapping components and dependencies.
  - Tracing execution and data flow.
  - Inspecting large files, datasets, or logs.
  - Finding relevant tests and documentation.
  - Compressing evidence into a clear report for the coordinator.
- Use the standard reasoning level for exploration. Raise it only for difficult but bounded analysis.
- Use execution workers for narrow, high-volume, and automatically verifiable tasks. Examples:
  - Inventories and searches.
  - Classification and extraction.
  - Test partitioning.
  - Repetitive checks.
  - Documentation updates.
  - Mechanical edits.
- Use a low reasoning level only for purely mechanical work. Use the standard level by default. Use a higher level only when batch work has a strong, objective verifier.

## Before material work

- Use authoritative, current, primary documentation. Use the available documentation, search, and
  retrieval tools rather than relying on memory.
- Inspect all applicable project documentation that exists. This may include:
  - Overview and setup documentation.
  - Terminology or glossary documentation.
  - Architecture and component documentation.
  - Data models and schemas.
  - Interfaces and contracts.
  - Search or indexing behavior.
  - Core processing or service behavior.
  - User interface and user experience documentation.
  - Testing, deployment, and operations documentation.
- Do not assume every project uses these document names or has every document type.
- When instructions conflict, follow the newer and more specific instruction unless a higher-priority
  instruction overrides it.
- After resolving a documentation conflict, update the affected documents so they no longer disagree.
- Use the Microsoft Learn MCP server for the most up-to-date coding information and advice on Microsoft and Azure technologies.

## Spec status

See [docs/README.md#specs](docs/README.md#specs). Check each individual spec
file for its validation status, implementation status, acceptance wording, and
evidence.

## Always consult these docs

- [docs/glossary.md](docs/glossary.md) — terminology
- [docs/architecture.md](docs/architecture.md) — stack, process model, non-goals
- [docs/data-model.md](docs/data-model.md) — SQLite schema, FTS5, indexes
- [docs/query-schema.md](docs/query-schema.md) — `rule_json` subset and target compiler
- [docs/indexing.md](docs/indexing.md) — scan and re-scan logic
- [docs/audio-engine.md](docs/audio-engine.md) — Web Audio scheduler
- [DESIGN.md](DESIGN.md) — design token manifest, component patterns, Emerald defaults
- [docs/style-guide.md](docs/style-guide.md) — design intent, layout, interaction, accessibility

## Commands

See [docs/README.md](docs/README.md) for the full command table and
[package.json](package.json) for the script definitions.

Before `dev` or `build`: unset `ELECTRON_RUN_AS_NODE` or Electron will not launch.

## Hard rules

- Virtualize large sample lists (TanStack Virtual or react-window). Never render the full dataset as real DOM nodes.
- Filter and sort in SQLite (backend worker). UI requests windowed pages through BackendAPI only.
- A library is a saved `rule_json` query, not copied files or symlinks.
- Use parameterized SQL statements. Never concatenate user input into SQL.
- All DB access stays in `src/renderer/src/backend/` (opfs-sahpool, worker-only, single-connection). Never open a second connection or touch DB from the UI thread.
- Do not use absolute paths. Folders use `FolderRef` values for saved directory handles.
- Samples use `(root_id, relpath)` values.
- Electron renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Preload exposes only `ShellAPI` via `contextBridge`. Everything must work without the shell.
- Audio on the renderer main thread (Web Audio API). Load bytes via `readSampleBytes(rootId, relpath)`.
- No emoji in code, docs, specs, or skills.
- The user's latest explicit request overrides earlier specification choices, subject to higher-priority
  safety and system constraints.
- After each bug fix or change request, update the relevant specifications and documentation.
- Keep implementation, tests, specifications, and user-facing behavior consistent.
- Sample bubbles must be identical everywhere in the UI: same height, same width, in every view.
- No archaeological data. The current implementation is the only implementation. Do not keep or reference prior iterations, dead code paths, or historical artifacts that do not serve the end user.
- Do not consider backward compatibility. Ignore legacy code and libraries.

## Resolved decisions — do not reopen

- Electron-only: one renderer backend inside the Electron desktop app. The
  renderer loads from `app://`. There is no browser deployment. No demo/mock mode
  (onboarding without samples is spec-020).
- `@sqlite.org/sqlite-wasm` with opfs-sahpool VFS. One tab, enforced by Web Lock.
- `rule_json` predicate tree compiles to parameterized SQL. Current executable subset:
  one `and` group with optional text and one tag-all leaf.
  Do not extend before validator and full compiler land (see `docs/query-schema.md`).
- Two-phase background indexer, `(size, mtime)` change detection, soft-delete for missing files.
- Use the Web Audio API lookahead scheduler for v1.
- Use a native addon only if latency triggers it.
- Library export out of scope for v1.

## Session conventions

- **Parallel subagents first.** Prefer dispatching independent work (search, file reads, research, audits)
  to parallel `Explore` subagents. The main agent is the orchestrator — keep it free and interactive
  for the user to interrupt without blocking background work.
- **Delegation.** Give each delegated worker a clear scope, expected output, and verification method.
  Delegate independent work concurrently when the environment supports it.
- **Code Mode batching.** Within each bounded stage, run independent, `functions.exec`-available tool
  calls concurrently in one `functions.exec` call. Use `await Promise.allSettled([...])` when partial
  results are useful, and inspect every result. Use `await Promise.all([...])` only when any failure
  should abort the batch. Keep dependencies, waits/resumes, approvals, conflicting or interdependent
  mutations, and adaptive investigations where each result may change the next step sequential. Do not
  split otherwise batchable inspections across outer tool calls.
- **Working tree is shared.** Assume concurrent workers may share the same workspace. Avoid overlapping
  edits unless ownership and merge order are explicit. Re-read a file immediately before editing when:
  - Time has passed since the last read.
  - Another worker may have changed it.
  - Related changes have landed.
- **Current-state review.** Before summarizing completed work, inspect the current workspace state and
  recent change history using the available version-control or change-tracking system.
- **Skip scaffolding** that only exists to keep intermediate states shippable
  across sessions when all phases land in one session. Retain temporary
  compatibility or migration work only when it serves a real deployment,
  review, rollback, or risk-control need.

## Testing and performance

- Every implementation task must have an objective verification method.
- Prefer automated checks when practical.
- Use representative, real-world fixtures for performance measurements. Use `tmp/test-samples`, not
  synthetic files.
- Do not make performance claims from invented or unrepresentative inputs.
- Record the test environment, workload, method, and result for each performance claim.
- When a required measurement is missing, state that explicitly. Do not replace it with an estimate
  presented as fact.
- For environment-sensitive behavior, test the built artifact in a minimal local runtime that reflects
  the least-capable supported production environment. Verify the built renderer inside Electron at the
  `app://bundle` origin.
- Do not rely on development-only behavior, permissions, configuration, or infrastructure unless the
  target environment guarantees them.
- Do not publish changes solely to reproduce an environment condition that can be tested locally.

## Uncertainty and verification

- Never assign a worker to investigate a vague doubt without defining a concrete verification step.
- Pair every uncertainty with at least one specific check, such as:
  - A command to run.
  - A test to execute.
  - A file or record to inspect.
  - A query to perform.
  - A source to consult.
  - A behavior to reproduce.
- Do not repeatedly ask whether a result is correct. Replace repeated confirmation requests with direct,
  objective verification.

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

## Close-out and handoff

- Before finishing, run a self-critique pass.
- Record the following in the handoff:
  1. The least-confident findings or changes, each paired with a concrete verification command or procedure.
  2. Any skipped, incomplete, or deferred work.
  3. Any assumptions that were not previously stated.
  4. The largest remaining blind spot for the user.
- Do not begin a new remediation cycle during the close-out pass. Carry newly identified gaps into the handoff.
- For large, high-risk, or difficult changes, request an independent review from a clean context.
- Give the independent reviewer the plan, evidence, changes, verification results, and handoff.
- Ask the reviewer: **“Evaluate this work. What may have been missed?”**
- Include the independent review findings in the final handoff.

## Test gotchas

- `globals: false` — testing-library auto-cleanup is off. `setup.ts` calls `cleanup()` in `afterEach`.
- Vitest has two projects: `renderer` (jsdom) and `backend` (node, in-memory sqlite-wasm).
- `setup.ts` stubs `HTMLCanvasElement.getContext` with a no-op 2D context. Tests that assert drawing must install their own mock.
- On Windows: call `setSize()` before `setResizable(false)` or the size call is silently ignored.
