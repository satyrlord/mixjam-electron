# Run Quality Gate Reference

## Discovery

Read `package.json` scripts once.
Prefer a repository script over a direct tool command.

Use this command order for each gate.

- **Problems:** Use the available whole-workspace diagnostics source. Otherwise record `N-A`.
- **Markdown:** Try `npm run lint:md`, then `npm run markdownlint`, then `npx markdownlint-cli2 "**/*.md"`.
- **ESLint:** Try `npm run lint`, then `npm run eslint`, then `npx eslint .`.
- **Fallow:** Try `npm run fallow`, then `npx fallow dead-code`.
- **Typecheck:** Try `npm run typecheck`, then `npx tsc -b`.
- **Build:** Try `npm run build`.
- **Unit:** Try `npm run test`, then `npm test`, then `npx vitest run`.
- **E2E:** Try `npm run test:e2e`, then `npx playwright test`.
- **Unit coverage:** Try `npm run test:coverage`.
- **E2E coverage:** Try `npm run test:e2e:coverage`.
- **Combined report:** Try `npm run coverage:report`.
- **Package:** Run `npm run package:electron`.
- **Packaged smoke:** Run the Windows packaged-smoke command from `.github/workflows/production.yml`.

Use ESLint automatic repair only in repair mode.
Inspect its diff before continuing.

## Coverage Policy

Apply the 70 percent threshold to every unit coverage cell.
Check Statements, Branches, Functions, and Lines globally and per reported module.

Treat E2E coverage as supplementary integration evidence.
Do not apply the unit threshold to E2E coverage.
Do not combine unit and E2E statement identifiers.

Add targeted tests or improve testability to close gaps.
Record each failing cell and value.
Require approval for exclusions, ignores, or threshold changes.

## Stop Conditions

Stop repair when a command requires secrets, manual login, or unavailable interactive access.
Stop when the repair requires an out-of-scope change or an unapproved suppression.
Report the smallest action that can remove the blocker.

## Report Contract

Report these items.

1. Give each gate a `PASS`, `FAIL`, `BLOCKED`, or `N-A` status.
2. List commands and exit outcomes in execution order.
3. List changed files or report `none` in verify mode.
4. Give each blocker its smallest next action.
