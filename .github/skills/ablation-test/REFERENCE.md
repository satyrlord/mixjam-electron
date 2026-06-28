# Ablation Test Reference

## Entry Criteria

Run this only after you already have:

1. one discriminating validation step that can produce PASS or FAIL
2. a bounded candidate set of changed paths or edit groups
3. a reason to think the current green state may contain extra edits

If you do not yet have item 1, use `diagnose` first.

## Web-Specific Controls

Before you interpret any result, control for the common false positives in
this project:

- **TypeScript or component changes:** validate with `npm run build` or the
  narrowest relevant test, not by editor state alone.
- **Vitest slices:** prefer focused `npm test -- --run src/.../test.ts` when
  you already know the target test.
- **UI changes:** make sure the dev server or build output is current. A
  stale Vite cache or a missed HMR can make an ablation look false-negative
  or false-positive.
- **Browser state issues:** full page reload (not just HMR) may be part of
  the repro contract.
- **Source artifacts:** keep input files read-only and write notes or logs
  under `tmp/`.

## Safe Setup

Do not start by stashing the whole repository if unrelated user work exists.

1. List only the relevant candidate paths.
2. Create a path-scoped stash for those paths.
3. Seed `tmp/ablation-<slug>.md` with the reusable log template or record
   the same fields manually.
4. Record the stash id, candidate groups, and validation command in that log.

Helper script example:

```PowerShell
VALIDATION='npm test -- --run src/engine/__tests__/Scheduler.test.ts'
```

If a candidate path overlaps with unrelated user edits and you cannot isolate
it safely, stop and ask before moving that path.

## Candidate Grouping

Prefer groups that map to project seams instead of random file batches:

- parser or decoder logic (`src/engine/`)
- sample resolver or product metadata
- tracker or transport scheduling (`src/engine/Scheduler.ts`)
- UI components (`src/ui/`)
- state stores (`src/state/`)
- bridge wiring (`src/bridge/`)
- tests or docs only

A good first cut is 2-4 groups, not 12 individual files.

## Standard Loop

1. Restore the smallest likely fix group from the stash.
2. Run the same validation step.
3. If the result is PASS, remove one group and retest.
4. If the result is FAIL, add back one group and retest.
5. When the result flips, note exactly what changed between the two runs.
6. After the minimal set is found, rerun the same check once more from a clean
   state for confirmation.

Tracked paths:

```PowerShell
git restore --source="stash@{0}" -- "path/to/file"
```

Untracked paths captured in the stash:

```PowerShell
git restore --source="stash@{0}^3" -- "path/to/new-file"
```

Remove an ablated candidate back to HEAD only after that path is safely
snapshotted:

```PowerShell
git restore --source=HEAD --staged --worktree -- "path/to/file"
```

Inspect what the stash holds:

```PowerShell
git stash list --max-count=5
git stash show -u --name-only "stash@{0}"
```

Drop the stash only after the final minimal fix is confirmed.

## Validation Order

Prefer the cheapest stable signal that can falsify the current hypothesis:

1. the exact failing unit test or focused `npm test -- --run` slice
2. a focused `npm run build` (TypeScript type-check + Vite build)
3. a narrow E2E (`npm run test:e2e`) or manual repro with explicit page reload steps
4. `git diff` only when no executable signal exists

Do not change the validation target halfway through the ablation unless the
original check was invalid.

## Interpretation Rules

- PASS with a smaller set means excluded groups are currently unproven.
- FAIL with a smaller set means at least one excluded group is required.
- PASS only after page reload or a clean build means runtime or build state
  was part of the bug surface.
- Mixed or unstable results mean the validation loop is not controlled tightly
  enough yet.

## Deliverable

End with a short evidence log that states:

- validation used
- focus window, bar range, or event ids when relevant
- final required files or groups
- groups removed as unnecessary
- any remaining ambiguity

After the final minimal set is identified, conclude the task.
