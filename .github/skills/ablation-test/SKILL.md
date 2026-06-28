---
name: ablation-test
description: >
  Runs a disciplined ablation workflow for MixJam Electron (MJE) bugs to
  prove which changed files or layers are actually required for a fix. Use
  when an MJE import, playback, or UI bug has a known pass/fail check but
  several edits may be involved, or when the user asks which change actually
  fixed it, what can be removed, or for the smallest proven fix.
argument-hint: >
  Optionally include the repro check, candidate paths, and any restart/build
  constraints.
---

# Ablation Test

Use this after `diagnose` when MJE
already has a discriminating PASS/FAIL check and the remaining question is
which **candidates** — the changed files or groups — are actually required.

## Good Fits

- a bug only went green after a broad change set with many candidates
- import, playback, or UI fixes may span several files
- the user wants the smallest proven fix set or wants unnecessary candidates removed
- caching, Electron reload, or stale-build-output questions are muddying the result

## Not For

- there is no stable repro or validation loop yet
- the main problem is localizing the owning code path for the first time
- the work is a refactor or design task rather than a root-cause ablation

In those cases, start with `diagnose`.

## Candidate Rules

1. **Preserve** — save user work before slicing candidates.
2. **Scope** — ablate only relevant candidates; do not disturb unrelated dirty state.
3. **Isolate** — change one candidate group at a time and keep the same
   validation check. A candidate group is a set of files that map to one
   project seam (engine, state, bridge, UI, config, tests).
4. **Log** — record each run in `tmp/ablation-<slug>.md`; use a markdown
   template (see the reusable log template in EXAMPLES.md).
5. **Confirm** — stop once the minimal candidate set is proven, then rerun
   the focused check from a clean state.

## Candidate Grouping Hints

- Import and parser code plus resolver/parser tests
- Tracker and playback services (renderer engine)
- IPC handlers, main-process services, or SQLite query builders
- UI components, state, or preload bridge wiring
- tests, docs, or config that may have masked the real fix

## Output

Report:

1. root cause
2. minimal required candidate set
3. candidates proven unnecessary
4. confidence level and any residual uncertainty

## Completion Criterion

The ablation run is complete when:

- the initial hypothesis and candidate groups are recorded,
- each candidate group has been tested with the same validation check,
- the minimal candidate set that still satisfies the pass/fail check is identified,
- unnecessary candidates are listed with evidence, and
- the result is captured in `tmp/ablation-<slug>.md`.

## Deep Reference

Use [REFERENCE.md](REFERENCE.md) for the full workflow and safe Git commands.
Use [EXAMPLES.md](EXAMPLES.md) for repo-shaped ablation scenarios.
