# Spec 009 — Time-Stretching

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
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

- Wraps `bungee-pitch-shift` 1.0.8, an MIT-licensed Bungee phase-vocoder
  AudioWorklet with embedded WASM.
- `stretch(buffer: AudioBuffer, ratio: number): Promise<AudioBuffer>`.
- Speed-ratio calculation: `projectBPM / nativeBPM`.
  - Ratio > 1: speed up (sample plays faster).
  - Ratio < 1: slow down (sample plays slower).
  - Ratio = 1: no stretching (native rate).
- The earlier validated draft stated `nativeBPM / projectBPM`, which was the
  reciprocal of the ratio required to match the project tempo. The implemented
  formula follows the objective and the speed semantics above.
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
- A project or native BPM change selects a different ratio key. Prior ratios
  remain available until LRU eviction so returning to an earlier BPM reuses the
  previous buffer.
- LRU eviction to bound memory usage.

### WASM Loading

- The stretch WASM module is loaded asynchronously on first use.
- Vite emits the self-contained AudioWorklet/WASM processor as a hashed static
  asset for both the browser and Electron renderer builds.
- If WASM fails to load, the engine falls back to native-rate playback and logs
  one warning. Stretching is disabled for the rest of that player session so a
  broken module does not retry on every trigger.

### UI and Playback Contract

- Every lane header exposes a compact native-BPM editor. Empty input commits
  `null`; a positive finite number enables stretching for that lane.
- Lane state is read at scheduling time, so edits affect later triggers without
  rebuilding the Player.
- Sample-browser preview remains native-rate playback; stretch preview is a
  non-goal.
- A trigger waits for its pre-stretched buffer before creating the voice. Stop,
  pause, and close generation guards also cover that asynchronous stretch so a
  late result cannot create a stray voice.

## Acceptance Criteria (testable)

- [x] **AC-001:** Changing project BPM from 120 to 140 stretches all samples
  with `nativeBPM` set — they play faster but at the same pitch.
- [x] **AC-002:** A lane with `nativeBPM: 100` at `projectBPM: 120` plays
  stretched at speed ratio `120/100 = 1.2`. The sample is shorter and matches
  the higher project tempo.
- [x] **AC-003:** A lane with `nativeBPM: null` plays at native rate regardless
  of project BPM changes.
- [x] **AC-004:** Stretched output preserves pitch — a 440Hz sine wave stays
  440Hz after stretching.
- [x] **AC-005:** Stretched buffers are cached — changing BPM back to a
  previous value reuses the cached buffer without re-stretching.
- [x] **AC-006:** If the WASM module fails to load, samples play at native rate
  and a warning is logged — no crash.

## Verification Evidence

- `time-stretch.test.ts` covers ratio math, null/equal passthrough, cache reuse,
  concurrent request deduplication, LRU eviction, and WASM failure fallback.
- `player.test.ts` covers pre-stretching before voice creation, native-rate
  lanes, BPM changes, and reuse when returning to a prior BPM.
- `arrangement.test.ts` and `LaneRow.test.tsx` cover lane-state normalization
  and the native-BPM editor.
- Production Chromium verification on both localhost and Electron's secure
  `app://bundle` origin rendered a 48,000-frame, 440Hz sine at a 1.2 speed
  ratio into 40,000 frames. The measured output pitch was 440.003Hz; an
  Electron stereo pass also preserved its second 660Hz channel at 660.005Hz.
- The same Chromium run verified the committed `128.5 BPM` control, all lane
  header controls inside the 43px header, and no identity/control overlap.
- Verification commands: `npm run typecheck`, targeted `vitest`, `npm run
  build`, `node tmp/verify-time-stretch.mjs` against the static production
  renderer, and `node tmp/verify-time-stretch-electron.mjs` against the Electron
  production renderer.

## Non-Goals

- No real-time stretching (pre-computed only).
- No per-clip stretch ratio — ratio is per-lane, derived from BPM.
- No formant preservation for vocal samples.
- No time-stretch quality comparison across multiple WASM libraries in this
  spec — use one, swap later if needed.
- No stretch preview in the sample browser.
- Manual listening against the full real sample library remains the subjective
  quality check for melodic artifacts and drum transients; the automated pitch
  and duration checks do not replace that listening pass.
