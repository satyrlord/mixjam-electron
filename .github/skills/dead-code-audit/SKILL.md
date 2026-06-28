---
name: dead-code-audit
description: >
  Audits the MixJam Electron (MJE) codebase for dead TypeScript code,
  orphan files, and unused symbols across main and renderer processes,
  triages findings into live dead code or false positives, and optionally
  removes provably dead code with focused validation. Always starts with
  Fallow static analysis and fixing all issues, including pre-existing
  ones. Use when the user asks for a dead-code scan, unused-code audit,
  orphan-file scan, unused-symbol triage, or cleanup from analyzer findings.
---

# Dead Code Audit

## Goal

Gather deterministic **evidence** of dead code in the TypeScript codebase
(main + renderer processes) — hard proof, not suspicion. Inspect only the
reported findings and either:

- report live findings and validated false positives, or
- remove provably dead code when the user explicitly asked for cleanup.

Use this skill for dead-code work only. Use the `full-code-review` skill for ordinary
review, security review, performance review, or merge-readiness review.

## Read First

1. `AGENTS.md`

## Run Fallow Static Analysis First

Before any evidence gathering, run Fallow from the repository root and fix
**all** issues it reports, including pre-existing ones that are not related
to the dead-code task at hand:

```PowerShell
npm run fallow
```

Fallow scans for quality, risk, duplication, and architecture issues. Fix
every finding — refactor, suppress, or document each one as appropriate for
the codebase — before moving to the next step.

If Fallow fails to run (e.g. binary not found), report the failure and stop.

## Gather Evidence

Run from the repository root and collect findings from:

```PowerShell
# TypeScript compiler diagnostics (unused variables, unreachable code, unused parameters)
npm run typecheck

# ESLint diagnostics (unused imports, unused variables, dead code patterns)
npm run lint
```

For symbols the compiler cannot judge (unused exports, orphan files,
unreferenced CSS or assets), search for references with `grep` or `rg`
across the project.

If a build or lint step fails, report the exact failure and stop — do not
triage findings against a broken build, and do not delete anything.

## Weigh the Evidence

For each finding, gather the smallest local proof before editing:

- direct usages and references
- entrypoint wiring (main process, preload, renderer), React component
  tree, or IPC glue
- reflection, serialization, CSS class references, or dynamic imports
- contextBridge API surface — symbols exposed to the renderer may appear
  unused in the main process but are consumed over IPC
- tests or fixtures that rely on the symbol or file

If the evidence shows the finding is a false positive (still alive through
one of these paths), report the concrete reason rather than deleting.

## Act on the Evidence

1. If the request is audit-only, report findings and their evidence without
   editing.
2. If the request includes cleanup and the evidence meets the Deletion
   Standard (no static references, no entrypoint wiring, no dynamic lookup,
   no test dependency), delete the smallest slice that removes it.
3. After each deletion, run Audit Validation before widening scope.
4. For false positives, suggest the narrowest suppression or config
   refinement only when the same false positive is likely to recur.

## Completion Criterion

The audit is complete when:

- every reported finding has been triaged as live, false positive, or removed,
- the evidence for each decision is explicit,
- no cleanup was performed without proof,
- and validation commands were re-run after any edits.

## Deep Reference

Use [REFERENCE.md](REFERENCE.md) for the Deletion Standard, False Positive
Checklist, Reporting contract, and Audit Validation steps. Use
[EXAMPLES.md](EXAMPLES.md) for concrete audit and cleanup scenarios.
