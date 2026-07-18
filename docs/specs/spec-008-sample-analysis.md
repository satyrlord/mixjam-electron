# Spec 008 — Sample Analysis & Type Classification

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-004 (Sample Library Browsing, Search & Tagging)

## Objective

Automatically analyze samples to detect BPM, musical key, and sample type
(kick, snare, hat, loop, etc.) using a heuristic classifier. Results populate
the sample library's acoustic metadata without changing its organizational
category tree or tags.

## User Stories

- **US-001:** As a user, my sample library is automatically analyzed for BPM
  and key without me doing anything manual.
- **US-002:** As a user, samples receive an acoustic type (e.g. "Kick",
  "Snare", "Bass", "Loop") based on their acoustic properties.
- **US-003:** As a user, I see analysis progress while large batches of samples
  are being processed.
- **US-004:** As a user, I can manually override auto-detected BPM, key, and
  sample type without changing the sample's organizational category.

## Scope

### Analysis Pipeline

- Runs in a background worker/thread — never blocks the UI.
- Triggered after indexing (spec-004 phase 2 completes).
- Automatic library sync analyzes only new, changed, interrupted, or
  stale-revision samples. Per-field manual overrides are never replaced.
  Multi-field manual patches validate every supplied field before writing and
  commit as one transaction, so an invalid later field cannot partially persist.
  Readable unsupported or damaged bytes clear stale automatic values; a
  transient file-read failure preserves them for a later retry.
- Reports progress: `{ analyzed: N, total: M }`.
- `scan-done` exposes the indexed library before analysis begins. Analysis then
  reports its own progress and emits `analysis-done`, which refreshes the
  current windowed query without blocking the browser.
- Individual re-analysis has a typed sample/job identity, is serialized with
  library sync and calibration, and resolves only after its database write
  succeeds. Its completion refreshes the affected sample and its failure stays
  visible in the editor.
- Automatic decoding currently supports PCM and IEEE-float WAV, including
  WAVE_FORMAT_EXTENSIBLE variants. Other indexed formats remain available for
  manual overrides but retain NULL automatic fields.

### BPM Detection

- Onset detection + inter-onset interval (IOI) histogram analysis.
- Returns a BPM value (or NULL if confidence is too low).
- User can manually set/override BPM per sample.

### Musical Key Detection

- Chromagram analysis (Krumhansl-Schmuckler or similar key-finding algorithm).
- Returns key as string (e.g. "Am", "C#", "Fm") or NULL.
- User can manually set/override key per sample.

### Uniform Folder Calibration

- Per-file BPM and key detection remains the first pass. Ordinary library sync
  never applies whole-batch calibration. **Uniform Folder Calibration** is an
  advanced action in Samples analysis management. It asks the user to confirm
  that every sample in the folder shares one tempo and key before the batch
  runner may reconcile one-shots, partial phrases, and subdivision aliases.
- Calibration uses a distinct BackendAPI operation and progress lifecycle. It
  is not a filesystem scan variant, does not appear in the Middle Strip, and is
  not named Re-scan.
- Calibration state remains outside `LibrarySyncState`. The backend worker
  serializes calibration with library sync: starting calibration while a sync
  is active is disabled, and a new selected-root sync cancels calibration at its
  next safe checkpoint before it begins work on the new root.
- Calibration requires every indexed candidate to remain readable and supported
  by the analysis decoder, including metadata-unavailable candidates that remain
  visible in the library. If any current non-missing candidate cannot be
  inspected, the operation reports an error and does not apply a subset-based
  folder calibration.
- Confirmation is the uniform-library contract. The duration and acoustic
  guards below are additional error protection; they cannot distinguish every
  genuine mixed-tempo pair from a subdivision-alias pair.
- Tempo candidates come from integer beat counts over each decoded duration,
  limited to 80-180 BPM and grouped in 0.5 BPM bins. Calibration requires at
  least 16 decoded files, support from at least 90 percent of the batch, and a
  winning bin at least 1.05 times the runner-up support. A duration-grid winner
  must also have at least 16 acoustic BPM detections and agree with the
  detected-BPM alias family of at least 55 percent of those detections. This
  rejects a shared duration alias that is not supported by the audio.
- Key calibration is allowed only after uniform tempo is established. The
  leading per-file key must have at least 16 detections, at least 55 percent of
  detected-key votes, and at least twice the runner-up support.
- In a confirmed Uniform Folder Calibration, inferred BPM and key replace all automatic
  results when their guards pass. This whole-batch relabeling is deliberate:
  the user's uniform-folder contract is stronger than known one-shot and
  subdivision aliases in the per-file heuristics. Manual overrides remain
  protected by per-field provenance checks. A batch that is not confirmed, or
  that fails a guard, keeps its per-file result for that field.
- Per-file results are persisted before analysis progress advances. The final
  calibration rewrite is one SQLite transaction, so cancellation cannot leave
  only a calibrated prefix. Later automatic sync reprocesses only pending or
  stale-revision files and naturally resumes after an interrupted pass.
- Individual re-analysis has no batch context and therefore keeps the per-file
  acoustic result.

### Sample Type Classification

- Heuristic classifier based on extracted features:
  - **RMS energy** (loudness profile)
  - **Spectral centroid** (brightness)
  - **Zero-crossing rate** (noisiness)
  - **Onset/transient detection** (percussiveness)
  - **Duration** (short = one-shot, long = loop)
- Classifies into sample types: Kick, Snare, Hi-hat, Percussion, Bass, Synth,
  FX, Vocal, Loop, Atmosphere, Other.
- Classification runs after BPM/key detection (uses the same decoded buffer).
- User can manually override the auto-detected sample type.

`sample_type` is deliberately separate from `samples.category_id`. The latter
is the organizational folder/user category contract implemented by spec-004
and is never replaced by acoustic analysis. The renderer labels the acoustic
field "Type" to keep the two concepts distinct.

### Manual Override

- Any auto-detected value can be overridden by the user.
- Overridden values are flagged as "manual" and are not re-analyzed on re-scan.
- Clearing a manual override resets the field to NULL, allowing re-analysis.
- The sample context menu opens an analysis editor showing each value and its
  `analysis`, `manual`, or unset provenance. "Analyze blank fields" is the v1
  individual re-analysis trigger.
- The editor is a modal, collision-aware popover anchored to the selected
  sample bubble. Escape closes it and focus is managed independently of the
  context menu that launched it.
- Batch analysis status uses a native progress element with visible analyzed and
  total text plus an accessible label.
- Fatal scan and analysis errors retain their backend message, are logged by
  the renderer facade, and appear in the toolbar under the correct lifecycle.
  Analysis failures never overwrite scan state with a misleading scan error.

### Development Constraint

- Analysis targets the changing real fixture corpus under `tmp/test-samples`.
  Record the fixture count and corpus revision with each accuracy result rather
  than treating a fixed count as part of the contract.
- Algorithms are tuned for this dataset initially; broader accuracy is deferred.

## Acceptance Criteria (testable)

- [x] **AC-001:** After indexing completes, analysis begins automatically and reports progress.
- [x] **AC-002:** Analysis runs in a background worker — the UI remains responsive during processing.
- [x] **AC-003:** BPM is detected for rhythmic samples; the value is reasonable (±5 BPM of true tempo for clear samples).
- [x] **AC-004:** Musical key is detected for tonal samples (e.g. "Am", "C").
- [x] **AC-005:** Sample type is classified (e.g. a kick drum sample is classified as "Kick" or "Percussion").
- [x] **AC-006:** User can manually override BPM, key, or sample type for any sample.
- [x] **AC-007:** A manual override is not overwritten by subsequent re-analysis.
- [x] **AC-008:** Clearing a manual override allows the field to be re-analyzed.
- [x] **AC-009:** The per-sample editor opens in a viewport-aware modal popover
  from the sample context menu, and batch status exposes native progress
  semantics with a visible text equivalent.
- [x] **AC-010:** On the user-confirmed 140 BPM/A-minor corpus under
  `tmp/test-samples`, at least 90 percent of all WAV files are within 5 BPM of
  140 and at least 90 percent are exactly `Am`; NULL results count as misses.
  The uniform-batch guards must still leave controlled mixed-tempo, mixed-key
  batches unchanged, including a duration-alias batch split evenly between 80
  and 90 BPM. Ordinary automatic sync must preserve a controlled 100/150 BPM
  alias-family mix, while confirmed Uniform Folder Calibration may calibrate
  the known uniform corpus. Pending-file analysis must replace stale
  `analysis` values, clear confirmed unsupported automatic results, and
  preserve every manual field.
- [x] **AC-011:** Uniform Folder Calibration is exposed only as an advanced
  Samples analysis-management action with explicit confirmation, its own API
  and progress lifecycle, and no Middle Strip or Re-scan label.
- [x] **AC-012:** Individual re-analysis exposes a typed job identity, cannot
  overlap library sync or calibration in either start order, refreshes the
  affected sample after its committed result, and keeps worker errors visible
  in the editor.

## Implementation Evidence

- `analysis.test.ts` uses controlled PCM fixtures to verify ±5 BPM detection,
  C-major key detection, kick classification, WAV decoding, uniform-batch
  calibration, and refusal to flatten a mixed-tempo/mixed-key batch.
- `analysis-library.test.ts` verifies automatic/manual provenance, preservation
  of all three manual fields, and clear-then-reanalyze behavior in SQLite.
- `analysis-runner.test.ts` verifies batch and single-sample progress,
  cancellation, durable per-file persistence, atomic calibration, replacement
  of stale automatic values, regular versus confirmed-uniform behavior,
  clearing confirmed unsupported results, transient read-failure isolation,
  and manual-field preservation.
- `schema.test.ts` verifies the provenance migration, v3 revision bookkeeping,
  root browseability marker, and early-v3 repair are restart-safe.
- `SampleBrowser.test.tsx` verifies the per-sample editor, clearing, and the
  individual re-analysis action, including that numerically equivalent BPM
  input does not replace analysis provenance with a manual override.
- `SampleAnalysisEditor.test.tsx` and `useLibraryData.test.ts` verify blank
  metadata defaults plus non-null, cleared, and absent manual patch fields.
- `worker-proxy.test.ts` verifies analysis progress/done event fan-out.
- `worker-scheduler.test.ts` verifies mutual exclusion among library sync,
  calibration, and individual re-analysis, queued automatic sync after
  individual analysis, and the individual operation's committed success and
  error lifecycle.
- Validation commands: `npm run typecheck`, `npm test`, `npm run lint`, and
  `npm run build`; the production bundle also passes
  `npx playwright test --project=browser-e2e`.

### Real Fixture Measurement

The current corpus contains 8,014 WAV files (2,748,710,958 bytes) with SHA-256
`a67f38f505f7e52f6b26d45ac4b706014035fdf09452bd44f9b1033731f16dbc`.
The corpus owner confirms that every file is 140 BPM and A minor. A sequential
production `decodeWav` plus `analyzeDecodedAudio` pass followed by the same
uniform-batch calibration used by `analysis-runner.ts` found:

- all 8,014 files decoded; none were unsupported or failed;
- the duration-grid vote inferred 140 BPM from 7,856 files (98.03 percent),
  ahead of the 6,527-vote runner-up, while 4,484/7,363 acoustic BPM
  detections (60.90 percent) supported its alias family; the guarded key vote
  inferred `Am` from 3,651 raw detections, ahead of 1,366 `Dm` runner-up
  detections;
- final BPM coverage and accuracy were 8,014/8,014 (100 percent overall within
  plus or minus 5 BPM), and final key coverage and accuracy were 8,014/8,014
  (100 percent overall exact `Am`);
- before calibration, the same pass produced 7,363 non-NULL BPM values with
  only 1,290/8,014 (16.10 percent overall) within the target window, plus 6,264
  non-NULL keys with 3,651/8,014 (45.56 percent overall) exactly `Am`;
- sample type was non-NULL for all 8,014 files; no classification-accuracy
  claim is made because folder names are not ground truth;
- the correctness-only pass took 154.417 seconds, 51.90 files per second, and
  17.80 MB per second on the recorded machine.

These results establish the current-corpus target and guarded calibration
behavior; they do not claim cross-library or 100k-file performance.
`ANALYSIS_TIMED_RUNS=0 npm run measure:analysis-corpus` reproduces the
correctness pass and writes raw and calibrated per-file evidence under
`tmp/measure-analysis-corpus/`.

## Non-Goals

- No precomputed waveform asset generation. The existing decoded footer
  waveform remains a playback/browser feature, not analysis output.
- No ML-based classification — purely heuristic.
- No cross-library analysis accuracy guarantees.
- No inferred or automatic whole-batch relabeling. Uniform Folder Calibration
  is an explicit advanced folder-wide action; the context-menu action remains
  individual.
- No automatic decoding for MP3, FLAC, OGG, or AIFF in v1.
