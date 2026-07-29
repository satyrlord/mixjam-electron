---
name: dead-code-audit
description: Audit MixJam TypeScript for dead code, orphan files, and unused symbols. Remove proven dead code only when the user requests cleanup.
---

# Dead Code Audit

Use direct evidence to classify each reported finding. Treat tool output as a finding, not as permission to edit.

Do not use this skill for general review, security review, performance review, or merge readiness.
For those requests, recommend that the user invoke `full-code-review`.

## Procedure

1. Confirm whether the request authorizes an audit or cleanup.
   Complete this step when the allowed scope and edit authority are explicit.
2. Read `AGENTS.md` and the standards in [`REFERENCE.md`](REFERENCE.md).
   Complete this step when you can apply every evidence, deletion, validation, and reporting rule.
3. Run `npm run fallow` from the repository root.
   Complete this step when the command returns a usable report and you capture every finding.
   If execution prevents a usable report, report the exact failure and stop.
4. Run `npm run typecheck` from the repository root.
   Complete this step when you preserve every type diagnostic as evidence.
5. Run `npm run lint` from the repository root.
   Complete this step when you preserve every lint diagnostic as evidence.
6. Search project references for findings that static tools cannot classify.
   Complete this step when each such finding has evidence from every applicable path in the reference.
7. Classify every finding as live, false positive, removed, or unresolved.
   Complete this step when each classification satisfies the applicable evidence standard.
8. In audit mode, report the results without edits.
   Complete this step when the report covers every finding in the requested scope.
9. In cleanup mode, remove only findings that satisfy the deletion standard.
   Complete this step when each edit removes only the proven finding.
10. After each edit, run the validation sequence from the reference.
   Complete this step when every required check passes or the report states the exact blocker.
11. Format the result with the reporting contract from the reference.
    Complete this step when every finding contains every required report field.

Use [`EXAMPLES.md`](EXAMPLES.md) only when a finding matches one of its stated scenarios.

## Completion Criterion

The audit is complete when every in-scope finding has evidence, one classification, and the required validation result.
