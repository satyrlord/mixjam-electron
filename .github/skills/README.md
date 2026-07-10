# MixJam Electron — Agent Skills

Agent skills for the MixJam Electron desktop app. Organised by invocation type.

## Development Workflow

| Skill | Invocation | Purpose |
| --- | --- | --- |
| [`add-feature`](./add-feature/SKILL.md) | Model-invoked | Spec-driven development: create specs, acceptance criteria, ADRs, and documentation for new work. Run `markdownlint-cli2` on edited Markdown after changes. |
| [`ablation-test`](./ablation-test/SKILL.md) | Model-invoked | Prove which changed files are actually required for a fix. Use after `diagnose` when a discriminating PASS/FAIL check exists. |
| [`diagnose`](./diagnose/SKILL.md) | Model-invoked | Structured debugging loop for hard bugs and performance regressions. Build a feedback loop, hypothesise, instrument, fix. |
| [`dead-code-audit`](./dead-code-audit/SKILL.md) | Model-invoked | Audit TS code for dead code, orphan files, and unused symbols across main and renderer processes. Optionally remove provably dead code. |
| [`refactor`](./refactor/SKILL.md) | Model-invoked | Surgical, behavior-preserving cleanup. Watch for IPC lifecycle traps, React stale closures, Web Audio lifecycle, and SQLite query hazards. |
| [`deslop`](./deslop/SKILL.md) | Model-invoked | Full-repo slop removal across code, docs, config, and data: unnecessary comments, defensive cruft, `any` casts, prose tells, ghost artifacts, and style inconsistencies. |
| [`run-quality-gate`](./run-quality-gate/SKILL.md) | Model-invoked | Deterministic quality gate: clear Problems, markdownlint, ESLint, Fallow, unit/e2e tests, and enforce >=80% in every coverage cell without suppression by default. |
| [`verify`](./verify/SKILL.md) | Model-invoked | Build and drive the production renderer in Chromium to verify UI, theme, tracker, and canvas behavior at the real surface. |

## Design & Architecture

| Skill | Invocation | Purpose |
| --- | --- | --- |
| [`improve-codebase-architecture`](./improve-codebase-architecture/SKILL.md) | User-invoked | Scan for architectural friction, then suggest improvements. |
| [`design-router`](./design-router/SKILL.md) | Model-invoked | Route a requested visual direction to one of the bundled design-theme references. |

## Code Review

| Skill | Invocation | Purpose |
| --- | --- | --- |
| [`full-code-review`](./full-code-review/SKILL.md) | User-invoked | Thermo-nuclear code quality review: code-judo restructurings, 1k-line rule, spaghetti-growth detection, abstraction quality, and maintainability. |

## Productivity & Meta

| Skill | Invocation | Purpose |
| --- | --- | --- |
| [`grill-me`](./grill-me/SKILL.md) | Model-invoked | Interview the user relentlessly about a plan or design before building. |
| [`handoff`](./handoff/SKILL.md) | User-invoked | Compact the conversation into a handoff document for another agent to continue. Includes a self-critique phase that surfaces uninvestigated gaps, skipped work, and unstated assumptions. |
| [`teach`](./teach/SKILL.md) | User-invoked | Multi-session teaching of a new skill or concept. |
| [`writing-great-skills`](./writing-great-skills/SKILL.md) | User-invoked | Reference for authoring skills: vocabulary and principles. |
