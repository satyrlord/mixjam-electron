# /goal Reference

Disclosed reference for [`/goal`](SKILL.md). Loaded when the agent needs the
layered template, anti-patterns, or worked examples.

## Layered Template

For complex, multi-hour goals, use this format:

```text
/goal <One-sentence high-level objective.>

## Breakdown
1. <Step 1 — what to investigate / produce>
2. <Step 2 — what to implement>
3. <Step 3 — what to verify>

## Measurable end state (the agent will verify exactly these)
- [ ] Command `<cmd>` exits 0.
- [ ] File `<path>` exists and contains `<regex or string>`.
- [ ] Metric `<name>` >= `<threshold>` per `<measurement command>`.
- [ ] Artifact: `<path>` matches the structure in `<schema/example>`.

## Success proof (what the agent must show you)
- Pasted output of the verification commands.
- A short diff summary per affected module.

## Constraints & non-goals
- MUST: <e.g., keep public API stable, run formatter after each edit>.
- MUST NOT: <e.g., delete migrations, touch config/, call paid APIs>.
- Style: <e.g., Conventional Commits, 2-space indent, no `any`>.
- Scope: <e.g., only files under src/main/ and src/shared/>.

## Verification loop
After each major change:
1. Run `npm run lint` and `npm test`.
2. Only declare done when ALL end-state checks pass on a clean run.

## Stop conditions
- Hard stop after N iterations — write `BLOCKERS.md` instead of guessing.
- Stop and ask if a destructive action is required (drop table, force push…).
```

## Anti-patterns

| Don't | Why | Do instead |
|-------|-----|------------|
| «Make the code better.» | No measurable end state. | Tie to tests, coverage %, or specific refactors. |
| End state = «agent says it's done.» | Worker grades itself. | Use commands/regex the agent can re-run. |
| No file/scope constraint. | Agent edits package.json, CI, secrets. | Whitelist directories. |
| Goal includes 7 unrelated tasks. | Can't verify cleanly; agent thrashes. | Split into separate goals. |
| No stop condition. | Burns tokens forever. | «Max N iterations, then write BLOCKERS.md.» |
| Goal launched on dirty working tree. | Hard to roll back. | Always branch + commit first. |
| Vague constraint like «be careful.» | No-ops the agent ignores. | Concrete: «do not modify package.json.» |
| End state has no negative checks. | Regressions slip through. | Add: «`rg "TODO\|FIXME" src/ \| wc -l` is unchanged or lower.» |

## Examples

### Example 1: IPC Contract Change

```text
/goal Migrate sample-browser IPC from raw row batches to keyset-paginated queries.

End state:
- src/shared/ipc.ts defines the new keyset-paginated channel signatures.
- src/main/sample-browser.ts accepts `{afterId, limit}` and returns `{rows, nextCursor}`.
- src/preload/index.ts exposes the new API shape.
- Renderer consumer in src/renderer/ uses the new paginated fetch.
- npm run lint exits 0.
- npm test exits 0.
- npm run typecheck passes.

Constraints:
- Only edit files under src/main/, src/preload/, src/shared/, src/renderer/.
- Keep contextBridge API narrow — no raw IPC access in the renderer.
- Preserve existing test coverage levels.
- No new `any` type annotations.
```

### Example 2: UI Feature — Theme Skin

```text
/goal Add an emerald-green theme variant to the theme system.

End state:
- Theme is selectable in the header theme dropdown and applies immediately.
- CSS custom properties are defined in public/themes/emerald.json.
- Both light and dark base modes work with the emerald accent.
- npm test exits 0.
- Manual check: all themed elements (header, footer, sample browser, tracker) render without visual regressions.

Constraints:
- Follow the existing theme JSON schema from public/themes/.
- Do not modify theme selection UI (only add the new option).
- No emoji in code, docs, or theme names.
```

### Example 3: Test Coverage

```text
/goal Bring src/main/library.ts test coverage above the 80% threshold.

End state:
- npx vitest run --coverage reports >=80% for Statements, Branches, Functions, Lines on src/main/library.ts.
- npm run lint exits 0.
- npm test exits 0.

Constraints:
- Only add/modify tests in src/main/library.test.ts.
- Do not modify src/main/library.ts to cheat coverage (no `/* istanbul ignore */` without explicit approval).
- No snapshot tests — use explicit assertions.
```

## Pro Tips

1. **Define «done» ruthlessly.** Vague goals fail. Tie completion to tests,
   files, regex matches, exit codes, or numeric thresholds.
2. **Start small, then scale.** Test with a 5-minute goal before launching a
   5-hour one. Watch with `/goal status`.
3. **Iterate on the goal itself.** If the agent drifts twice, `/goal clear`,
   then add a constraint that targets the failure mode.
4. **Use negative checks.** «…and `rg "TODO|FIXME" src/ | wc -l` is unchanged
   or lower» catches sneaky regressions.
5. **Prime context first.** Before `/goal`, make sure the agent has read the
   relevant docs in `AGENTS.md` and `docs/`. Cheap upfront context saves
   expensive mid-loop confusion.
