# Run Quality Gate Reference

Command resolution, fallback order, and reporting templates for the
run-quality-gate skill.

## Execution model

- Run gates strictly in order.
- Do not execute later gates if an earlier gate is still open.
- Prefer repository scripts first, then direct tool commands.
- Every gate must produce command evidence in the final report.

## Gate command matrix

Use the first command that exists and succeeds for each gate.

### Problems gate

1. Use VS Code diagnostics API via get_errors for whole workspace.

2. If scoped checks are needed while fixing, run get_errors on edited files.

3. Final check must be a whole-workspace get_errors call.

### Markdown gate

Preferred script order:

1. npm run lint:md

2. npm run markdownlint

3. npx markdownlint-cli2 "**/*.md"

Notes:

- Fix findings in files.

- No suppressions unless user explicitly approves.

### ESLint gate

Preferred script order:

1. npm run lint

2. npm run eslint

3. npx eslint .

Auto-fix pass before manual edits:

- npx eslint . --fix

Notes:

- No rule disable comments/config suppression unless user explicitly approves.

### Fallow gate

Preferred script order:

1. npm run fallow

2. npx fallow dead-code

Notes:

- Treat findings as fix-first; suppression requires explicit permission.

### Unit-test gate

Preferred script order:

1. npm run test:unit

2. npm run test

3. npx vitest run

If none exists:

- Mark gate as not-applicable and include discovery evidence.

### E2E gate

Preferred script order:

1. npm run test:e2e

2. npm run e2e

3. npx playwright test

If none exists:

- Mark gate as not-applicable and include discovery evidence.

### Coverage gate

Preferred script order:

1. npm run test:coverage (unit coverage — primary gate check)
2. npm run test:e2e:coverage (e2e V8 coverage — supplementary)
3. npm run coverage:report (side-by-side summary via scripts/merge-coverage.mjs)

E2E coverage pipeline:

- Playwright collects V8 JS coverage via page.coverage.startJSCoverage()
  (wired in tests/e2e/fixtures.ts)
- Raw coverage is written per-test to coverage-e2e/raw/<test>.json
- scripts/convert-e2e-coverage.mjs converts raw V8 data to Istanbul format
  using v8-to-istanbul, producing coverage-e2e/coverage-final.json
- The production build must include source maps (build.sourcemap: true in
  electron.vite.config.ts) for v8-to-istanbul to map bundled coverage back
  to source files
- scripts/merge-coverage.mjs presents unit and e2e coverage side-by-side;
  unit coverage is the quality-gate check, e2e is supplementary

Coverage policy:

- Minimum 80% for each reported cell (unit coverage only).
- Cells include Statements, Branches, Functions, Lines.
- Apply threshold to unit coverage summary and per-file/module table rows
  when reported.
- **The 80% threshold does NOT apply to e2e coverage.** E2E coverage
  instruments the full production bundle (including node_modules) and
  typically lands around 50-70%. It is supplementary — validating the
  integrated app — and should never be pushed toward 80%.
- Backend glue files (client.ts, folder-access.ts, handle-store.ts,
  worker.ts) depend on browser APIs and are excluded from unit coverage;
  they are exercised by the e2e suite.

Allowed remediation:

- Add targeted tests.

- Fix production logic that blocks testability.

Not allowed by default:

- Lower thresholds.

- Add exclusions/ignore patterns to hide uncovered code.

- Mark files ignored for coverage.

Any of the above requires explicit user permission.

## Discovery checks

Before unit/e2e/coverage gates, inspect scripts once:

- Read package.json scripts.

- Prefer existing script names over raw npx commands.

## Final report template

1. Gate status:
   - Problems: PASS/FAIL/BLOCKED
   - Markdown: PASS/FAIL/BLOCKED/N-A
   - ESLint: PASS/FAIL/BLOCKED/N-A
   - Fallow: PASS/FAIL/BLOCKED/N-A
   - Unit: PASS/FAIL/BLOCKED/N-A
   - E2E: PASS/FAIL/BLOCKED/N-A
   - Coverage: PASS/FAIL/BLOCKED/N-A
2. Commands run in order.
3. Files changed.
4. Remaining blockers with exact failing output snippets.

## Stop conditions

Stop and report immediately when:

- a command requires secrets or manual login,

- a command hangs or requires interactive input that cannot be automated,

- or a gate requires suppression but user has not granted permission.

In all stop cases, include the smallest next action to close the gate.
