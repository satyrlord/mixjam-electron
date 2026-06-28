# Ablation Test Examples

## Example 1: Folder Permission Re-prompt on Every Page Load

### Example 1 Symptom

- The File System Access folder picker re-appears on every page load even
  though the user granted permission in a previous session.

### Example 1 Candidate Groups

1. handle persistence logic in `src/files/handlePersistence.ts` (IndexedDB
   store and permission re-request flow)
2. folder setup dialog in `src/ui/shell/FolderSetupDialog.tsx` (UI triggers
   and state management)
3. library or project store initialization in `src/state/`

### Example 1 Ablation Sequence

1. Restore only the handle-persistence change -> test -> **PASS**.
2. Remove the dialog UI change and retest -> **PASS**.
3. Remove the store initialization change -> **PASS**.
4. Confirm with a clean browser profile -> **PASS**.

### Example 1 Conclusion

- Root cause is IndexedDB handle persistence, not UI or store wiring.
- Minimal fix is the `handlePersistence.ts` change alone.
- The dialog and store edits were incidental for this bug.

---

## Example 2: Import Resolution Regression

### Example 2 Symptom

- One sample still imports with unresolved metadata after a broad
  resolver fix.

### Example 2 Candidate Groups

1. parser normalization in `src/engine/`
2. sample metadata mapping in analysis/
3. resolver logging or diagnostics
4. test expectation updates

### Example 2 Ablation Sequence

1. Restore parser normalization only -> focused import test -> **FAIL**.
2. Restore metadata mapping only -> same test -> **PASS**.
3. Keep metadata mapping and drop logging or test-only changes -> **PASS**.

### Example 2 Conclusion

- Root cause is sample metadata, not parser logic.
- Minimal fix is the metadata mapping update.
- Logging and test expectation edits did not contribute to the fix.

---

## Example 3: UI Fix Masked by Stale Build Output

### Example 3 Symptom

- Tracker UI still looks broken even after a CSS/component patch that seems
  correct in source.

### Example 3 Candidate Groups

1. `src/ui/tracker/...`
2. `src/ui/mixer/...`
3. clean rebuild / full page reload

### Example 3 Ablation Sequence

1. Run the repro against the currently running dev server -> **FAIL**.
2. Full page reload with no extra code changes -> **PASS**.
3. Remove the speculative style override while keeping the HMR cycle ->
   **PASS**.

### Example 3 Conclusion

- The false variable was a stale HMR state, not missing UI logic.
- Minimal fix is the real source change plus a full page reload.
- The style override was unnecessary.

---

## Example 4: Tracker Sample Dropouts Across Engine Seams

### Example 4 Symptom

- A project still has audible dropouts around bar 19 even after several
  playback architecture edits.

### Example 4 Candidate Groups

1. scheduler horizon or dispatch logic in `src/engine/Scheduler.ts`
2. voice materialization in `src/engine/Voice.ts`
3. output buffering or mixer behavior in `src/engine/AudioEngine.ts`
4. diagnostics or regression checks in tests

### Example 4 Ablation Sequence

1. Lock the validation loop to a vitest regression test and a manual
   listening pass.
2. Restore diagnostics or test-only edits first -> telemetry is easier to
  read, but the audible dropout remains -> **FAIL**.
3. Restore scheduler changes only -> low-signal windows narrow, but bar 19
  still drops -> **FAIL**.
4. Add the output-buffering change -> the regression passes and
  the manual bar-19 listening pass is clean -> **PASS**.
5. Remove scheduler changes while keeping the output-buffering fix -> **PASS**.

### Example 4 Conclusion

- Root cause is in the output seam, not the scheduler or diagnostics.
- Minimal fix is the output-buffering change plus the guard test that proves it.
- Scheduler tuning improved telemetry but was not required for this bug.

---

## Reusable Run Log Template

```text
Run ID: AB-<date>-<index>
Validation:
- command or manual repro:
- target bar range or event ids:
- page reload required: yes/no
- clean build: yes/no

State:
- included files or groups:
- excluded files or groups:

Result:
- PASS/FAIL
- observed behavior:

Inference:
- what this run proves:
- next ablation step:
```
