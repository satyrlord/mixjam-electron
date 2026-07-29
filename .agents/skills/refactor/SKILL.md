---
name: refactor
description: >
  Refactors MixJam code when the user requests simpler structure without new
  features, contract changes, or behavior changes.
---

# Refactor

Use a **surgical** scope.
Each change must remove a named source of complexity without changing behavior.

## Process

1. Define the exact behavior, contracts, files, and validation in scope.
   Complete this step when the scope has no unresolved boundary.
2. Read the affected code, callers, tests, and canonical documents.
   Complete this step when each current invariant has evidence.
3. If a listed hazard applies, read [REFERENCE.md](REFERENCE.md) before editing.
   Complete this step when every applicable hazard has a control.
4. Add focused regression evidence before a risky structural change.
   Complete this step when the evidence passes before the structural change.
5. Apply one coherent structural change.
   Complete this step when the diff removes a named branch, concept, dependency, or duplicate.
6. Run the narrow validation after each coherent change.
   Complete this step when the affected checks pass.
7. Run the final applicable quality gates.
   Complete this step when each gate has a recorded result.

Use `dead-code-audit` when the request includes a broad dead-code sweep.
Stop when a requested change would alter a documented contract or behavior.

## Completion Criterion

Complete the refactor only when every process step meets its criterion.
The final diff must contain only changes that serve the stated refactor.
Record unchanged contracts and all validation results.
