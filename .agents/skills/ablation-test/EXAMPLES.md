# Ablation Test Examples

## Example 1: Backend Call Returning Stale Data After Rescan

### Example 1 Symptom

- After a library rescan, the renderer still shows old sample counts until
the app is fully restarted.

### Example 1 Candidate Groups

1. backend worker call that queries sample counts
2. indexer in the backend worker that reports scan progress
3. renderer hook that caches the count from backend responses
4. worker protocol typing for the count call

### Example 1 Ablation Sequence

1. Restore only the backend call change -> test -> **PASS**.
2. Remove the indexer change and retest -> **PASS**.
3. Remove the renderer hook change -> **PASS**.
4. Confirm with a clean origin storage (OPFS + IndexedDB) -> **PASS**.

### Example 1 Conclusion

- Root cause is the backend call not invalidating cached counts, not the
  indexer or renderer hook.
- Minimal fix is the backend call change alone.
- The indexer and hook edits were incidental for this bug.

---

## Example 2: Import Resolution Regression

### Example 2 Symptom

- One sample still imports with unresolved metadata after a broad
  resolver fix.

### Example 2 Candidate Groups

1. parser normalization in `src/renderer/src/engine/`
2. sample metadata extraction in the backend indexer
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

1. renderer UI components
2. renderer CSS/theme files
3. clean rebuild / fresh renderer reload

### Example 3 Ablation Sequence

1. Run the repro against the currently running build -> **FAIL**.
2. Fresh renderer reload with no extra code changes -> **PASS**.
3. Remove the speculative style override while keeping the live reload ->
   **PASS**.

### Example 3 Conclusion

- The false variable was a stale renderer state, not missing UI logic.
- Minimal fix is the real source change plus a fresh renderer reload.
- The style override was unnecessary.

---

## Example 4: Tracker Sample Dropouts Across Engine Seams

### Example 4 Symptom

- A project still has audible dropouts around bar 19 even after several
  playback architecture edits.

### Example 4 Candidate Groups

1. scheduler horizon or dispatch logic in `src/renderer/src/engine/scheduler.ts`
2. voice materialization in `src/renderer/src/engine/voice.ts`
3. output buffering or mixer behavior in `src/renderer/src/engine/audio-engine.ts`
4. diagnostics or regression checks in tests

### Example 4 Ablation Sequence

1. Lock the validation loop to a regression test and a manual
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
- renderer reload required: yes/no
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
