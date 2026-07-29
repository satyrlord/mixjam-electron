---
name: improve-codebase-architecture
description: >
  Review project architecture and find deep-module candidates. Use for a
  full architecture review or when diagnose finds weak test seams or hidden coupling.
---

# Improve Codebase Architecture

Find architecture changes that hide complexity behind small interfaces.
Use this skill after `diagnose` reports a missing test seam or hidden coupling.

## Design Terms

- A **module** is code with one clear responsibility.
- An **interface** is the surface that callers use.
- **Depth** compares hidden complexity with interface size.
- A **seam** is the contract between two modules.
- An **adapter** translates between two seams.
- **Leverage** compares module work with required caller knowledge.
- **Locality** keeps code together when it changes together.

Use exact project terms from `docs/glossary.md` and the owning documents.
Keep exact names such as `BackendAPI` when the project defines them.

Apply the deletion test to a suspected shallow module.
Deletion must concentrate complexity rather than move the same complexity.

## 1. Review the Project

- Read `docs/architecture.md`, `docs/data-model.md`, and `docs/glossary.md`.
- Read other documents that own each inspected area.
- For a full review, map every source area, entry point, interface, and test surface.
- For a diagnose handoff, map the reported flow, connected callers, interfaces, and tests.
- Delegate independent read-only areas when worker tools are available.
- Trace representative data and control flows across each selected area.
- Record each navigation or testability problem with file evidence.
- Apply the deletion test to each suspected shallow module.

This step is complete when the selected scope has mapped evidence and each candidate passes the deletion test.

## 2. Present Candidates

For each candidate, report these fields.

- **Files**: Name every involved file and module.
- **Problem**: State the measured navigation, ownership, or testability cost.
- **Change**: State the proposed responsibility shift.
- **Benefits**: State the expected locality, leverage, and test effects.
- **Decision conflict**: Name any existing decision that conflicts.
- **Strength**: Use `Strong`, `Worth exploring`, or `Speculative`.

End with one top recommendation and its evidence.
Do not propose detailed interfaces before the user selects a candidate.
Ask which candidate the user wants to explore.

The review branch is complete when each candidate includes file evidence and every required field.
One recommendation must rank first.

## 3. Deepen a Chosen Candidate

- Define the module responsibility and excluded responsibilities.
- Define the smallest interface that hides the required complexity.
- Compare two interfaces when more than one interface remains credible.
- Apply the deletion test and leverage test to each interface.
- Present the selected interface and rejected alternatives.
- If the user authorizes document edits, invoke `add-feature`.
- Record new cross-cutting terms only when authorized document edits require them.
- Run `markdownlint-cli2` on each changed Markdown file.

The branch is complete when one testable interface and all rejected alternatives have evidence.
Record them only when the user authorizes document edits.

Do not change code unless the user also authorizes that change.
