# Spec 008 — Sample Analysis & Auto-Categorization

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** ⏳ NOT IMPLEMENTED
**Depends on:** spec-004 (Sample Library Browsing, Search & Tagging)

## Objective

Automatically analyze samples to detect BPM, musical key, and sample type
(kick, snare, hat, loop, etc.) using a heuristic classifier. Results populate
the sample library metadata and enable auto-categorization.

## User Stories

- **US-001:** As a user, my sample library is automatically analyzed for BPM
  and key without me doing anything manual.
- **US-002:** As a user, samples are auto-categorized (e.g. "Kick", "Snare",
  "Bass", "Loop") based on their acoustic properties.
- **US-003:** As a user, I see analysis progress while large batches of samples
  are being processed.
- **US-004:** As a user, I can manually override auto-detected BPM, key, and
  category for any sample.

## Scope

### Analysis Pipeline

- Runs in a background worker/thread — never blocks the UI.
- Triggered after indexing (spec-004 phase 2 completes).
- Processes samples where BPM/key/category are NULL.
- Reports progress: `{ analyzed: N, total: M }`.

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
- Classifies into categories: Kick, Snare, Hi-hat, Percussion, Bass, Synth,
  FX, Vocal, Loop, Atmosphere, Other.
- Classification runs after BPM/key detection (uses the same decoded buffer).
- User can manually override the auto-detected category.

### Manual Override

- Any auto-detected value can be overridden by the user.
- Overridden values are flagged as "manual" and are not re-analyzed on re-scan.
- Clearing a manual override resets the field to NULL, allowing re-analysis.

### Development Constraint

- Analysis targets the `tmp/test-samples` folder (~67 files).
- Algorithms are tuned for this dataset initially; broader accuracy is deferred.

## Acceptance Criteria (testable)

- [ ] **AC-001:** After indexing completes, analysis begins automatically and reports progress.
- [ ] **AC-002:** Analysis runs in a background worker — the UI remains responsive during processing.
- [ ] **AC-003:** BPM is detected for rhythmic samples; the value is reasonable (±5 BPM of true tempo for clear samples).
- [ ] **AC-004:** Musical key is detected for tonal samples (e.g. "Am", "C").
- [ ] **AC-005:** Sample type is classified (e.g. a kick drum sample is classified as "Kick" or "Percussion").
- [ ] **AC-006:** User can manually override BPM, key, or category for any sample.
- [ ] **AC-007:** A manual override is not overwritten by subsequent re-analysis.
- [ ] **AC-008:** Clearing a manual override allows the field to be re-analyzed.

## Non-Goals

- No waveform preview generation (deferred).
- No ML-based classification — purely heuristic.
- No cross-library analysis accuracy guarantees.
- No batch re-analysis trigger (individual only in v1).

## References

- [mixjam-webjam architectural-suggestion-notes §3](../_archived/mixjam-webjam/docs/architectural-suggestion-notes.md) — Heuristic classifier, Web Worker threading.
- [mixjam-webjam spec-004](../_archived/mixjam-webjam/specs/004-state-architecture/spec.md) — Library slice, analysis status tracking.
