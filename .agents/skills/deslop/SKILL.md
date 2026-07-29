---
name: deslop
description: Remove unsupported repository content without changing valid behavior or information.
disable-model-invocation: true
---

# Deslop

Slop conflicts with its file, sibling files, repository rules, or current behavior.
This skill reviews the full requested scope, not only the current diff.

## Branch References

Load each applicable rule set before you judge a file.

- Code: [CODE.md](CODE.md)
- Prose and documentation: [PROSE.md](PROSE.md)
- Data and configuration: [DATA.md](DATA.md)
- Tests: [TEST.md](TEST.md)

If one file has multiple content types, apply all applicable rule sets.
A listed sign starts an inspection. It does not prove slop.

## Process

1. List every file in scope and record its content type and source status.
   Finish when the inventory classifies each file as source, generated, vendored, locked, or binary.
2. Select one current sibling or owning reference for each file family.
   Finish when each family has a valid comparison source.
3. Read one file and its comparison source completely.
   Finish when you know their current purpose, behavior, and local style.
4. Load every branch reference that applies to the file.
   Finish when every applicable rule has informed the inspection.
5. If the file is a test, record the unchanged baseline that [TEST.md](TEST.md) requires.
   Finish when the configured test runner has produced a recorded result.
6. Mark only content that lacks a valid behavior, information, contract, or style reason.
   Finish when each candidate has specific repository evidence.
7. Remove the smallest proven slop.
   Finish when the edit preserves valid behavior, information, contracts, constraints, and voice.
8. Validate each coherent edit group with the narrowest applicable check.
   Finish when each affected behavior has a passing result or a recorded existing failure.
9. Re-read every scoped file after all edits.
   Finish when every file has an unchanged or edited result.

## Boundaries

- Do not convert a style preference into a universal ban.
- If static search finds no reference, use `dead-code-audit` to test reachability.
- Unless sibling documents prove a different intended voice, preserve the user voice.
- If the request excludes them, exclude generated output, vendored code, lockfiles, and binary assets.
- If an included generated file has no known source path, do not change it.
- If an included generated file has a known source path, change its source instead.
- Require the evidence in [TEST.md](TEST.md) before you change a test.
- Add no test code before you understand the production contract.
- Confirm test discovery after you merge or divide test files.

## Completion Criterion

The pass is complete when every scoped file has an unchanged or edited result.
Each edit must cite repository evidence and have an applicable validation result.
The report must give edit counts, exclusions, existing failures, and unverified behavior.
