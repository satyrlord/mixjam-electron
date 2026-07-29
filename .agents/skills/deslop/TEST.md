# Test Slop

Test slop gives no unique defect signal, gives false confidence, or checks an unowned contract.
An unreliable test or a test with excessive maintenance cost can also be slop.
Judge the test, not its presumed author.

## Qualification

Read the production owner, owning spec, complete test file, and one current sibling.
If these sources support one listed finding, classify the test.
If these sources support no listed finding, keep the test.

- **No signal:** The test has no observable result or checks its own mock value.
- **False signal:** The expected result repeats the production algorithm or production literal.
- **Wrong contract:** The test checks a private step that no owned contract promises.
- **Unreliable signal:** The test depends on leaked state, random data, external state, or unrelated delays.
- **Duplicate signal:** Another test catches the same defect and this test adds no distinct boundary.
- **Excessive cost:** The test adds maintenance or runtime without a distinct contract claim.

Do not use coverage, counts, file size, or a static smell as proof.
If a simple test protects a real invariant, keep it.
If mocks control a slow, destructive, random, or external boundary, keep them.
If an interaction is the public contract, keep its exact checks.

## Process

1. Read the configured runner, shared setup, production owner, owning spec, complete test, and one sibling.
   Finish when you know the environment, fixtures, and claimed contract.
2. Run the unchanged candidate with the narrowest command that discovers it.
   Finish when you record its baseline and all existing failures.
3. State the unique behavior and relevant defect for each candidate.
   Finish when each proposed edit has evidence beyond a smell name.
4. If static evidence cannot prove the signal, inject one controlled fault.
   Finish when the test response proves its signal and you restore the source.
5. Select the smallest safe result for each candidate.
   Finish when you assign each result `keep`, `refactor`, `merge`, `delete`, or `replace`.
6. Run every edited test.
   Finish when each edited test passes or retains only a recorded existing failure.
7. Run each edited test file with its owning project.
   Finish when each owning project passes or retains only recorded existing failures.
8. Report each result category separately.
   Finish when the report names skipped fault checks, missing discovery, existing failures, and unverified surfaces.

## Result Rules

- If the signal is unique or uncertainty remains, keep the test.
- If a public outcome can replace a private assertion, refactor the test.
- If tests duplicate setup and each distinct case remains visible, merge them.
- If evidence proves no distinct signal remains, delete the test.
- Replace a weak sole test instead of removing the only intended protection.

## Commands

Use `npx vitest run <file> --project=<renderer|backend>` for Vitest files.
Use `npx playwright test <file> --project=<name>` for Playwright files.
Run `npm test` after Vitest cleanup.
Build the app before an affected Electron project runs.

## Primary References

Use these sources to interpret a candidate.
Do not treat a source as a universal ban.

- [Vitest: Writing Tests with AI](https://main.vitest.dev/guide/learn/writing-tests-with-ai)
- [Vitest: Testing in Practice](https://main.vitest.dev/guide/learn/testing-in-practice)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Software Unit Test Smells](https://testsmells.org/pages/testsmells.html)
- [Stryker mutation testing](https://stryker-mutator.io/docs/)
- [Martin Fowler: Test Coverage](https://martinfowler.com/bliki/TestCoverage.html)
