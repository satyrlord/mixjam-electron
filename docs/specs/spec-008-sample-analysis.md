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
- Processes samples where BPM/key/sample type are NULL and not manually
  overridden.
- Reports progress: `{ analyzed: N, total: M }`.
- `scan-done` exposes the indexed library before analysis begins. Analysis then
  reports its own progress and emits `analysis-done`, which refreshes the
  current windowed query without blocking the browser.
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

## Implementation Evidence

- `analysis.test.ts` uses controlled PCM fixtures to verify ±5 BPM detection,
  C-major key detection, kick classification, and WAV decoding.
- `analysis-library.test.ts` verifies automatic/manual provenance, preservation
  of all three manual fields, and clear-then-reanalyze behavior in SQLite.
- `analysis-runner.test.ts` verifies batch and single-sample progress,
  cancellation, persistence, and per-file read-failure isolation.
- `schema.test.ts` verifies the v1-to-v2 provenance migration is restart-safe.
- `SampleBrowser.test.tsx` verifies the per-sample editor, clearing, and the
  individual re-analysis action, including that numerically equivalent BPM
  input does not replace analysis provenance with a manual override.
- `SampleAnalysisEditor.test.tsx` and `useLibraryData.test.ts` verify blank
  metadata defaults plus non-null, cleared, and absent manual patch fields.
- `worker-proxy.test.ts` verifies analysis progress/done event fan-out.
- Validation commands: `npm run typecheck`, `npm test`, `npm run lint`, and
  `npm run build`; the production bundle also passes
  `npx playwright test --project=browser-e2e`.

### Real Fixture Measurement

The current corpus contains 8,014 WAV files (2,748,710,958 bytes) with SHA-256
`a67f38f505f7e52f6b26d45ac4b706014035fdf09452bd44f9b1033731f16dbc`.
The corpus owner confirms that every file is 140 BPM and A minor. A sequential
production `analyzeWav` measurement on an Intel i7-11700 with Node 24.18.0
found:

- all 8,014 files decoded; none were unsupported or failed;
- BPM was non-NULL for 7,363 files (91.88 percent coverage), but only 1,290
  detected values (17.52 percent) were within the AC-003 plus or minus 5 BPM
  window around 140 BPM;
- key was non-NULL for 6,264 files (78.16 percent coverage), and 3,651 detected
  values (58.29 percent) were exactly `Am`;
- sample type was non-NULL for all 8,014 files; no classification-accuracy
  claim is made because folder names are not ground truth;
- three timed passes took 141.627, 141.534, and 142.276 seconds. Their average
  was 141.812 seconds, 56.51 files per second, and 19.38 MB per second.

These results establish current-corpus coverage, accuracy limitations, and
sequential throughput; they do not change the algorithm or claim a 100k-file
performance result. `npm run measure:analysis-corpus` reproduces the
measurement, and `tmp/measure-analysis-corpus/` contains raw per-file evidence.

The earlier historical baseline measured 684 WAV files (379,291,366 bytes) at
corpus revision `37735a88cf9f9c5ca6186b24aafb03c61416eb11`:

- all 684 files decoded;
- BPM was non-NULL for 585 files and key was non-NULL for 482 files;
- two of three filenames containing an explicit `N BPM` label were within the
  AC-003 ±5 BPM window (`126 -> 126`, `140 -> 140`);
- `splash saturation 126 BPM techno3.wav` resolved to 65.4 BPM and remains a
  known half-tempo/subdivision limitation;
- the sequential Node measurement took 12.9 seconds. This is a corpus result,
  not a 100k-library throughput claim.

Folder names were not accepted as type ground truth: exact agreement for the
coarse Bass/Loop/Voice/Keys mapping was 101/379, but those folders mix loops,
one-shots, and instruments and therefore do not establish classifier accuracy.

## Non-Goals

- No precomputed waveform asset generation. The existing decoded footer
  waveform remains a playback/browser feature, not analysis output.
- No ML-based classification — purely heuristic.
- No cross-library analysis accuracy guarantees.
- No batch re-analysis trigger (individual only in v1).
- No automatic decoding for MP3, FLAC, OGG, or AIFF in v1.
