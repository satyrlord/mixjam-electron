# Ablation Test Reference

## Entry Criteria

Run this only after you already have:

1. one discriminating validation step that can produce PASS or FAIL
2. a bounded candidate set of changed paths or edit groups
3. a reason to think the current green state may contain extra edits

If you do not yet have item 1, use `diagnose` first.

## Electron-Specific Controls

Before you interpret any result, control for the common false positives in
this project:

- **TypeScript changes:** validate with the project's build command or the
  narrowest relevant test, not by editor state alone.
- **Test slices:** prefer focused test runs when you already know the
  target test file.
- **UI changes:** make sure the build output is current. A stale build
  cache or missed rebuild can make an ablation look false-negative or
  false-positive.
- **Renderer state issues:** a fresh renderer process reload (not just
  hot-reload) may be part of the repro contract.
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
$Validation = 'npm test -- src/renderer/src/components/TrackerView.test.tsx'
./.github/skills/ablation-test/scripts/New-AblationLog.ps1 `
  -Slug scheduler-dropout `
  -Validation $Validation `
  -CandidateGroup engine,state,tests
```

If a candidate path overlaps with unrelated user edits and you cannot isolate
it safely, stop and ask before moving that path.

## Candidate Grouping

Prefer groups that map to project seams instead of random file batches:

- IPC handlers and main-process services
- SQLite query builders or indexing logic
- renderer engine (tracker, playback, scheduler)
- UI components and state (renderer)
- preload / contextBridge wiring
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
