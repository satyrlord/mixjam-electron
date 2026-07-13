# Spec 009 — Time-Stretching

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement time-stretching so samples automatically match the project BPM during
playback. Samples in the sample browser are stretched using their auto-detected
native BPM (via resampling or time-stretching algorithms such as Elastique).
Sample preview also respects the project BPM — previewed samples are stretched
to match.

## User Stories

- **US-001:** As a user, when I change the project BPM, all samples in the
  tracker and sample browser stretch to match — the arrangement stays
  musically coherent.
- **US-002:** As a user, sample preview in the browser also matches the
  project BPM so I can hear how a sample will sound in the arrangement before
  placing it.
- **US-003:** As a user, time-stretching quality is good enough that drums
  stay punchy and melodic loops stay in tune.

## Scope

### Stretch Engine

- Uses a phase-vocoder time-stretching algorithm (Bungee, equivalent in
  approach to Elastique) compiled to WASM and embedded in an AudioWorklet.
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

### Native BPM

- Each sample has an auto-detected `nativeBPM` from analysis (spec-008).
  - `null` → no stretching, sample plays at native rate regardless of project
    BPM (default for one-shots like kicks).
  - A positive number → the engine stretches to match `nativeBPM → projectBPM`.
- If `nativeBPM` equals `projectBPM`, no stretching occurs (ratio = 1.0,
  passthrough).
- The native BPM is detected automatically during sample analysis; there is no
  manual per-lane BPM editor in the UI.
- Each tracker placement captures the sample's current native BPM when it is
  added. Native BPM is placement-owned rather than lane-owned, so loops with
  different tempos can coexist on one lane. Existing placements keep their
  captured value if sample analysis is edited later.

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
  one warning. Stretching is disabled for the rest of that playback runtime so a
  broken module does not retry on every trigger.

### UI and Playback Contract

- The project BPM is set from the Song panel (spec-006). There is no per-lane
  BPM editor — samples use their auto-detected native BPM from analysis
  (spec-008).
- Placement state is read at scheduling time, so moving or duplicating a
  placement preserves its captured native BPM without rebuilding the Player.
- Play, playing seek/skip-back, and project-BPM changes
  enter a non-reentrant `preparing` state while required buffers are decoded and
  stretched. The scheduler, audible `playing` state, and elapsed timer resume
  together only after preparation succeeds. Stop or Space cancels preparation.
- Sample-browser preview is stretched to match the project BPM using the
  sample's auto-detected native BPM, so previewed samples sound the same as
  they will when placed in the tracker.
- A trigger waits for its pre-stretched buffer before creating the voice. Stop,
  pause, and close generation guards also cover that asynchronous stretch so a
  late result cannot create a stray voice.

## Acceptance Criteria (testable)

- [x] **AC-001:** Changing project BPM from 120 to 140 stretches all samples
  with `nativeBPM` set — they play faster but at the same pitch.
- [x] **AC-002:** A placement with `nativeBPM: 100` at `projectBPM: 120` plays
  stretched at speed ratio `120/100 = 1.2`. The sample is shorter and matches
  the higher project tempo.
- [x] **AC-003:** A placement with `nativeBPM: null` plays at native rate
  regardless of project BPM changes.
- [x] **AC-004:** Stretched output preserves pitch — a 440Hz sine wave stays
  440Hz after stretching.
- [x] **AC-005:** Stretched buffers are cached — changing BPM back to a
  previous value reuses the cached buffer without re-stretching.
- [x] **AC-006:** If the WASM module fails to load, samples play at native rate
  and a warning is logged — no crash.
- [x] **AC-007:** While cold stretch preparation is pending, the transport shows
  `preparing`, the elapsed timer does not advance, and repeated Play requests do
  not start duplicate schedulers. Stop or Space cancels the pending start.
- [x] **AC-008:** Editing project BPM while playing pauses at
  the current tick, prepares the new ratio, and resumes the scheduler, audible
  state, and elapsed timer together.

- [x] **AC-009:** Sample-browser preview is stretched to match the project
  BPM using the sample's auto-detected native BPM.

- `time-stretch.test.ts` covers ratio math, null/equal passthrough, cache reuse,
  concurrent request deduplication, LRU eviction, and one-warning WASM failure
  fallback across concurrent keys, including invalid-ratio and unavailable
  offline-context failures in the default processor.
- `playback-engine.test.ts` covers BPM-aware sample preview, pre-stretching
  before voice creation, native-rate placements, BPM changes, canceled
  preparation, and reuse when returning to a prior BPM.
- `useTransportEngine.test.ts` covers the atomic `preparing` transition, timer
  gating, cancellation, seek restart, and project-BPM updates.
- `useTransportRuntime.test.ts` verifies that transport controls remain safe
  while the runtime is inactive and no playback engine exists.
- `arrangement.test.ts` covers placement-owned native BPM, including multiple
  native tempos on one lane and the UI-to-engine mapping.
- Production Chromium verification on both localhost and Electron's secure
  `app://bundle` origin rendered a 48,000-frame, 440Hz sine at a 1.2 speed
  ratio into 40,000 frames. The measured output pitch was 440.003Hz; an
  Electron stereo pass also preserved its second 660Hz channel at 660.005Hz.
- Verification commands: `npm run typecheck`, targeted `vitest`, `npm run
  build`, `node tmp/verify-time-stretch.mjs` against the static production
  renderer, and `node tmp/verify-time-stretch-electron.mjs` against the Electron
  production renderer.

## Non-Goals

- No real-time stretching (pre-computed only).
- No manual per-placement BPM editor; ratios derive from captured analysis BPM.
- No formant preservation for vocal samples.
- No time-stretch quality comparison across multiple WASM libraries in this
  spec — use one, swap later if needed.
- Manual listening against the full real sample library remains the subjective
  quality check for melodic artifacts and drum transients; the automated pitch
  and duration checks do not replace that listening pass.
