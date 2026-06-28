# MixJam Web — Agent Skills

Agent skills for the MixJam Web DAW project. Organised by invocation type.

## Development Workflow

| Skill | Invocation | Purpose |
|---|---|---|
| [`add-feature`](./add-feature/SKILL.md) | Model-invoked | Spec-driven development: create specs, acceptance criteria, ADRs, and documentation for new work. Run `markdownlint-cli2` on edited Markdown after changes. |
| [`ablation-test`](./ablation-test/SKILL.md) | Model-invoked | Prove which changed files are actually required for a fix. Use after `diagnose` when a discriminating PASS/FAIL check exists. |
| [`diagnose`](./diagnose/SKILL.md) | Model-invoked | Structured debugging loop for hard bugs and performance regressions. Build a feedback loop, hypothesise, instrument, fix. |
| [`dead-code-audit`](./dead-code-audit/SKILL.md) | Model-invoked | Audit TS/React code for dead code, orphan files, and unused symbols. Optionally remove provably dead code. |
| [`refactor`](./refactor/SKILL.md) | Model-invoked | Surgical, behavior-preserving cleanup. Watch for React stale closures, Zustand mutation bugs, and Web Audio lifecycle traps. |
| [`deslop`](./deslop/SKILL.md) | Model-invoked | Remove AI-generated code slop from the branch diff: unnecessary comments, defensive cruft, `any` casts, deep nesting, and style inconsistencies. |

## Design & Architecture

| Skill | Invocation | Purpose |
|---|---|---|
| [`claude-design-parity`](./claude-design-parity/SKILL.md) | Model-invoked | Extract design tokens from a Claude Design project and patch MixJam Web's CSS custom properties theming toward parity. |
| [`improve-codebase-architecture`](./improve-codebase-architecture/SKILL.md) | User-invoked | Scan for architectural friction, generate a visual HTML report, then grill through candidates. |

## Code Review

| Skill | Invocation | Purpose |
|---|---|---|
| [`full-code-review`](./full-code-review/SKILL.md) | User-invoked | Thermo-nuclear code quality review: code-judo restructurings, 1k-line rule, spaghetti-growth detection, abstraction quality, and maintainability. |

## Productivity & Meta

| Skill | Invocation | Purpose |
|---|---|---|
| [`grilling`](./grilling/SKILL.md) | Model-invoked | Interview the user relentlessly about a plan or design before building. |
| [`handoff`](./handoff/SKILL.md) | User-invoked | Compact the conversation into a handoff document for another agent to continue. |
| [`teach`](./teach/SKILL.md) | User-invoked | Multi-session teaching of a new skill or concept. |
| [`writing-great-skills`](./writing-great-skills/SKILL.md) | User-invoked | Reference for authoring skills: vocabulary and principles. |

> **Note:** Skills were originally imported from the native MixJam Desktop/Avalonia project and reworked for this web TypeScript/React codebase. If you encounter stale references, please update them.
