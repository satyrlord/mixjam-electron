---
name: full-code-review
description: Review a change set for simpler code, clear ownership, clean contracts, file growth, and scattered control flow.
disable-model-invocation: true
---

# Full Code Review

Run a read-only **simplification review** by default.
Seek changes that remove concepts, branches, wrappers, or layers without changing behavior.
Edit files only when the user requests fixes.

## Review

1. Establish the review scope from the user request, current diff, and canonical documents.
   Complete this step when every file in scope has an owner.
2. Read each changed file with its relevant callers, tests, and contracts.
   Complete this step when each change has enough context for a judgment.
3. Evaluate every standard below with recorded evidence before you assign severity.
   Complete this step when every standard has a recorded result.
4. Report only findings with a concrete risk and remedy.
   Complete this step when each finding cites exact evidence.
5. If the user requested fixes, repair only findings inside the authorized scope.
   Complete this step when each requested finding has a verified result.

Preserve unrelated work throughout the review.
Run `run-quality-gate` after an authorized repair.

## Standards

### Simplification

- **Smell:** A change moves complexity without reducing what the reader must understand.
- **Remedy:** Change ownership or state so a branch, mode, wrapper, or layer disappears.

### File growth

- **Smell:** A change pushes a file from below 1,000 lines to above 1,000 lines.
- **Remedy:** Split the file unless one clear concept owns all its content.

### Scattered control flow

- **Smell:** Conditions, nullable modes, or special cases spread through unrelated flows.
- **Remedy:** Move the policy to its owner or use an explicit state model.

### Direct code

- **Smell:** Identity wrappers, generic machinery, or copied logic hide a simple shape.
- **Remedy:** Inline the wrapper, extract one pure function, or collapse duplicate paths.

### Clean contracts

- **Smell:** Casts, optional values, silent fallbacks, or custom shapes obscure an invariant.
- **Remedy:** Express the invariant at the type or process boundary.

### Canonical ownership

- **Smell:** Feature logic enters shared code or duplicates an existing contract.
- **Remedy:** Move the logic to the documented owner and reuse its contract.

### Atomic orchestration

- **Smell:** Independent work runs in sequence, or related updates can remain incomplete.
- **Remedy:** Run independent work concurrently or use one atomic state transition.

## Output

Order findings by severity.
Give each finding a location, risk, evidence, and actionable remedy.
State when no blocking findings remain.

## Completion Criterion

The read-only branch is complete when every review step meets its criterion.
The agent must not change files in that branch.

The repair branch is complete when each requested repair has objective evidence.
Report all `run-quality-gate` results without hiding blockers.
