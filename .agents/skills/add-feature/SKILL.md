---
name: add-feature
description: Create or revise feature specifications and lasting project decisions. Use for unclear scope, contract changes, or decisions that need documentation.
---

# Add Feature

Create the smallest documentation change that makes the requested work clear. Update an existing owner instead of creating a duplicate.

Use `grill-me` when the user requests interactive questions before documentation work.

## Procedure

1. Define the requested scope and the unresolved point.
   Complete this step when one sentence states the smallest documentation outcome.
2. Read `AGENTS.md`, `docs/README.md`, required project documents, the owning specification, and relevant implementation.
   Complete this step when you identify the current contract, its owner, and any conflict.
3. Apply the ownership and decision rules in [`REFERENCE.md`](REFERENCE.md).
   Complete this step when one document owns the change and no existing document duplicates it.
4. State the objective, user value, assumptions, contract, success criteria, non-goals, validation commands, and unresolved questions.
   Complete this step when each applicable item has specific and testable text.
5. Edit the owner, affected conflicting documents, and necessary local comments.
   Complete this step when the edit records each lasting decision, removes conflicts, and excludes obvious code behavior.
6. Use [`EXAMPLES.md`](EXAMPLES.md) when the correct document shape remains unclear.
   Complete this step when the selected example resolves the document shape or you report the remaining choice.
7. Run Markdown lint on every changed Markdown file.
   Complete this step when lint passes.
8. Compare the documentation with the implementation.
   Complete this step when both sources state the same contract.

## Completion Criterion

The work is complete when every in-scope decision has one owner, testable criteria, and no conflicting documentation.
