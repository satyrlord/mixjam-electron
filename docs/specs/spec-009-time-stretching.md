# Spec 009 — Time-Stretching

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement WASM-based time-stretching so samples automatically match the project
BPM during playback. Support per-lane BPM override for samples with known
native tempos.

## User Stories

- **US-001:** As a user, when I change the project BPM, all samples stretch to
  match — the arrangement stays musically coherent.
- **US-002:** As a user, I can set a per-lane native BPM so the engine
  calculates the correct stretch ratio automatically.
- **US-003:** As a user, time-stretching quality is good enough that drums
  stay punchy and melodic loops stay in tune.

## Scope

### Stretch Engine

- Wraps a WASM time-stretch library (e.g. Rubber Band or SoundTouch compiled
  to WASM).
- `stretch(buffer: AudioBuffer, ratio: number): Promise<AudioBuffer>`.
- Ratio calculation: `nativeBPM / projectBPM`.
  - Ratio > 1: speed up (sample plays faster).
  - Ratio < 1: slow down (sample plays slower).
  - Ratio = 1: no stretching (native rate).
- The engine uses pre-stretched buffers — stretching happens once when a sample
  is loaded or when BPM changes, not on every voice trigger.

### Native BPM Per Lane

- Each lane (spec-005) has an optional `nativeBPM` field.
  - `null` → no stretching, sample plays at native rate regardless of project
    BPM (default for one-shots like kicks).
  - A positive number → the engine stretches to match `nativeBPM → projectBPM`.
- The user sets `nativeBPM` per lane in the UI.
- If `nativeBPM` is set and equals `projectBPM`, no stretching occurs (ratio =
  1.0, passthrough).

### Stretch Quality

- The stretch algorithm preserves pitch (no "chipmunk effect").
- Transient preservation for drums (onset detection within the stretch engine).
- Quality is validated by ear against the test sample library — noticeable
  artifacts on melodic material are a failure.

### Caching

- Stretched buffers are cached by `(sampleId, ratio)` key.
- Cache is invalidated when project BPM or lane native BPM changes.
- LRU eviction to bound memory usage.

### WASM Loading

- The stretch WASM module is loaded asynchronously on first use.
- If WASM fails to load, the engine falls back to native-rate playback and logs
  a warning — the app does not crash.

## Acceptance Criteria (testable)

- [ ] **AC-001:** Changing project BPM from 120 to 140 stretches all samples
  with `nativeBPM` set — they play faster but at the same pitch.
- [ ] **AC-002:** A lane with `nativeBPM: 100` at `projectBPM: 120` plays
  stretched (ratio 100/120 ≈ 0.833). The sample is audibly longer and lower
  tempo.
- [ ] **AC-003:** A lane with `nativeBPM: null` plays at native rate regardless
  of project BPM changes.
- [ ] **AC-004:** Stretched output preserves pitch — a 440Hz sine wave stays
  440Hz after stretching.
- [ ] **AC-005:** Stretched buffers are cached — changing BPM back to a
  previous value reuses the cached buffer without re-stretching.
- [ ] **AC-006:** If the WASM module fails to load, samples play at native rate
  and a warning is logged — no crash.

## Non-Goals

- No real-time stretching (pre-computed only).
- No per-clip stretch ratio — ratio is per-lane, derived from BPM.
- No formant preservation for vocal samples.
- No time-stretch quality comparison across multiple WASM libraries in this
  spec — use one, swap later if needed.
- No stretch preview in the sample browser.

## References

- mixjam-webjam architectural-suggestion-notes §2 — archived predecessor-project doc, not tracked in this repo — Time-stretch library options, quality A/B testing.
- mixjam-webjam spec-002 — archived predecessor-project doc, not tracked in this repo — StretchEngine interface.
