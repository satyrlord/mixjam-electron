---
name: run-quality-gate
description: >
  Quality-gate execution for repository hygiene and release readiness. Use when
  the user asks to run a quality gate, clean all Problems panel issues, fix
  lint/test/coverage failures, or verify the branch meets strict 80%+ coverage
  thresholds without suppression.
---

# Run Quality Gate

Run a deterministic gate in fixed order. The leading word is **gate**:
close each gate completely before moving on.

Do not suppress diagnostics unless the user explicitly approves suppression.
The default action is to fix root causes in code, config, tests, or tooling.

## Deep Reference

Use [REFERENCE.md](REFERENCE.md) for gate command fallbacks, discovery checks,
coverage policy details, final report template, and stop conditions.

## Gates

1. **Problems gate**
   - Collect diagnostics from the VS Code Problems pipeline for the whole
     workspace (`get_errors` without file filter).
   - Fix all valid errors and warnings.
   - Re-run diagnostics until either:
     - no problems remain, or
     - only proven false positives remain with evidence captured in the final
       report.
   - Completion criterion: Problems output is empty, or each remaining item is
     explicitly listed as a verified false positive.

2. **Markdown gate**
   - Run markdown linting across repository Markdown files.
   - Preferred command: `npx markdownlint-cli2 "**/*.md"`.
   - Fix every valid finding by editing Markdown.
   - Do not add ignores/rule disables without explicit user permission.
   - Completion criterion: markdownlint exits clean with zero findings.

3. **ESLint gate**
   - Run ESLint for the workspace (`npm run lint` if available).
   - Apply safe auto-fixes first, then fix remaining findings manually.
   - Do not disable rules without explicit user permission.
   - Completion criterion: ESLint exits clean with zero findings.

4. **Fallow gate**
   - Run dead-code audit command (`npm run fallow` when present).
   - Fix every valid issue (remove dead code, unused exports, orphan references,
     or update code paths).
   - Do not suppress findings without explicit user permission.
   - Completion criterion: Fallow exits clean with zero findings.

5. **Unit-test gate**
   - Discover and run unit tests using repository scripts (`npm test`,
     `npm run test:unit`, or project-specific equivalents).
   - If no unit-test target exists, record that explicitly and continue.
   - Fix failing tests and production code issues where feasible.
   - Completion criterion: all discovered unit tests pass, or no unit-test suite
     exists and that absence is reported.

6. **E2E gate**
   - Discover and run E2E tests (`npm run test:e2e`, Playwright targets, or
     project-specific equivalents).
   - If no E2E suite exists, record that explicitly and continue.
   - Fix failures where feasible.
   - Completion criterion: all discovered E2E tests pass, or no E2E suite exists
     and that absence is reported.

7. **Coverage gate**
   - Run unit coverage (`npm run test:coverage`).
   - Run e2e coverage (`npm run test:e2e:coverage`) — collects V8 coverage from
     Playwright browser tests via `page.coverage.startJSCoverage()`, converts
     raw V8 data to Istanbul format with `scripts/convert-e2e-coverage.mjs`,
     and writes `coverage-e2e/coverage-final.json`.
   - Generate the combined coverage report (`npm run coverage:report` or
     `node scripts/merge-coverage.mjs`). This script presents unit and e2e
     coverage side-by-side; **unit coverage is the primary quality-gate check**
     because it instruments source TSX/TS directly. E2E coverage instruments
     the production bundle via source maps, so statement/branch IDs differ and
     cannot be naively merged.
   - Fix low-coverage gaps by adding or improving tests, not by excluding code,
     unless the user explicitly approves exclusions.
   - **Threshold rule (unit coverage only):** each reported cell in the unit
     coverage report must be at least 80%. Treat Statements, Branches,
     Functions, and Lines as separate cells wherever reported (global and
     per-file/module tables).
   - **The 80% threshold does NOT apply to e2e coverage.** E2E coverage
     instruments the entire production bundle (including node_modules) and
     typically lands around 50-70%. Do not attempt to push e2e coverage to
     80% — it is supplementary, validating that the integrated app boots and
     core flows work. Only unit coverage is gated.
   - Completion criterion: unit coverage report shows >=80% in every reported
     cell, and the combined report is generated, or blockers are explicitly
     documented with exact cells and values.

## Failure handling

If a gate cannot be closed in the current turn, stop at that gate and report:

- exact command run,
- exact failure output,
- attempted fixes,
- remaining blockers,
- smallest next change to close the gate.

Never claim the full quality gate passed when any gate remains open.

## Final report format

Return results in this order:

1. Gate status table (Problems, Markdown, ESLint, Fallow, Unit, E2E, Coverage).
2. Files changed.
3. Commands run.
4. Remaining blockers (if any).

## Completion Criterion

This skill run is complete only when:

- every gate has been executed in order,
- every valid issue was fixed or documented as a verified false positive,
- no suppression was introduced without explicit user permission,
- and the final report lists objective evidence for each gate outcome.
