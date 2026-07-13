# Spec 009 — Tempo-Following Audio

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline)

## Objective

Make project BPM a musical-time mapping, as in conventional DAWs. Changing BPM
must preserve every placement's start tick and musical duration while rendering
its source audio faster or slower to fill that unchanged span. Consecutive
sample bubbles remain consecutive visually and audibly at every supported BPM.

The implementation uses pitch-preserving time stretching. Re-pitch-style
resampling may be added later as a user-selectable mode, but it must obey the
same placement timing contract.

## Assumptions and Decision

- The project grid uses eight ticks per beat and the MVP has one global BPM.
- Placed audio follows project tempo by default; MixJam does not currently
  expose a per-placement opt-out equivalent to an unwarped DAW clip.
- A user-created gap or overlap is represented by placement start ticks. The
  engine must not infer either one from source-buffer duration.
- **Decision:** musical span is placement-owned, not analysis-owned. Native BPM
  is valuable for estimating a sample's first span and for unplaced preview,
  but it is nullable, late, and editable. Making it the playback authority
  caused the reported arrangement morphing and silence. Persisted
  `durationTicks` is stable, already belongs to the project, and directly
  expresses the musical relationship the user created.

## User Stories

- **US-001:** As a user, when I change project BPM, my arrangement keeps the
  same bar/beat relationships and placed audio follows the new tempo.
- **US-002:** As a user, consecutive sample bubbles remain gapless after a BPM
  change instead of exposing silence caused by native-rate playback.
- **US-003:** As a user, a sample without detected BPM still follows the
  project once placed; missing analysis metadata must not disable stretching.
- **US-004:** As a user, stretching preserves pitch well enough that drums stay
  punchy and melodic loops stay in tune.

## Timing Model

### Placement-owned musical span

- `startTick` and `durationTicks` are the arrangement authority.
- `durationSeconds` is immutable source-file metadata. It is not a Tracker
  width or scheduled-duration authority after placement.
- On first placement, the musical span is established as follows:
  - If the sample has a positive detected BPM, convert its source duration to
    ticks at that BPM.
  - Otherwise, convert its source duration to ticks at the current project BPM.
    This makes first-drop playback native-rate while still creating a stable
    musical span for future tempo changes.
  - Later placements of the same sample in the project reuse its established
    span, even if BPM metadata or project BPM has changed.
- Project BPM changes never mutate `startTick`, `durationTicks`, or the order of
  placements. They only change tick-to-seconds conversion and rendered audio.
- A background analysis result may still fill captured `nativeBPM` provenance,
  but it must not silently rewrite an existing placement's musical span.

### Stretch ratio

For a placement at the current project BPM:

```text
targetDurationSeconds = durationTicks * 60 / (projectBPM * 8)
speedRatio = sourceDurationSeconds / targetDurationSeconds
```

- Ratio greater than 1 shortens the source; ratio less than 1 lengthens it.
- Ratio 1 is a zero-work passthrough.
- The scheduler triggers the rendered buffer at `startTick`. The next
  consecutive placement may trigger at `startTick + durationTicks` without an
  intentional gap or overlap.
- Example: a 140 BPM four-bar loop stored as 128 ticks targets 8.648649 seconds
  at 111 BPM. Its speed ratio is `111 / 140`, independent of whether analysis
  metadata is present.

## Stretch Engine

- Uses Bungee, a phase-vocoder time-stretching algorithm compiled to WASM and
  embedded in an AudioWorklet.
- `stretch(buffer: AudioBuffer, ratio: number): Promise<AudioBuffer>`.
- Tracker playback requests output by source duration, placement
  `durationTicks`, and current project BPM. It does not decide whether to
  stretch from nullable native-BPM metadata.
- Stretching is prepared when playback starts or project BPM changes, not on
  every voice trigger. The transport exposes a non-reentrant `preparing` state
  until all required buffers are ready.
- Sample Browser preview has no placement span. It continues to use detected
  sample BPM when available and otherwise previews at native rate.

## Stretch Quality

- The default mode preserves pitch.
- Transient preservation is required for drums.
- Noticeable artifacts on representative melodic material are a failure of the
  subjective listening check even if duration tests pass.

## Caching and Failure

- Rendered buffers are cached by `(sampleId, ratio)` with LRU eviction.
- Concurrent requests for one key share a promise. Returning to a previous BPM
  reuses its cached buffer until eviction.
- The AudioWorklet/WASM asset is emitted by Vite for browser and Electron
  production builds.
- If the processor fails, the runtime logs one warning and falls back to the
  decoded source buffer. Playback remains usable, but tempo-following accuracy
  is degraded and the failure must not retry on every trigger.
- Stop, pause, close, and transport-generation guards cover asynchronous
  preparation so a late result cannot create a stray voice.

## Visual Contract

- A placed sample bubble's x position and width are derived only from
  `startTick`, `durationTicks`, and the shared pixels-per-tick scale.
- Changing BPM must not move or resize placed bubbles.
- The Sample Browser uses the same project-owned duration tick count for a
  sample that is already placed, so the same sample remains pixel-identical
  across views.
- Before first placement, the Sample Browser estimates a musical span using
  detected sample BPM or, when unknown, current project BPM. The first drop
  freezes that span for the project.

## Acceptance Criteria (testable)

- [x] **AC-001:** Changing project BPM preserves every placement's `startTick`
  and `durationTicks`; Tracker bubbles do not move, resize, or create visual
  gaps.
- [x] **AC-002:** A source whose placement spans 128 ticks targets 128 ticks at
  every BPM. At 111 BPM its rendered duration is approximately 8.648649 seconds.
- [x] **AC-003:** A placement with `nativeBPM: null` is stretched from its
  source duration to its stored musical span. Null BPM does not bypass Tracker
  time stretching.
- [x] **AC-004:** Three consecutive copies placed at ticks 0, 128, and 256 have
  no audible boundary gap after changing project BPM from 140 to 111, within
  one output sample frame of scheduling/render rounding.
- [x] **AC-005:** The same already-placed sample has the same pixel width in the
  Tracker and Sample Browser, and that width is unchanged by a BPM edit.
- [x] **AC-006:** Two placements of the same unanalysed sample reuse its first
  project-owned musical span even when the second is added at another BPM.
- [x] **AC-007:** Pitch-preserving output keeps a 440Hz sine at 440Hz within the
  verification tolerance after stretching.
- [x] **AC-008:** Cached output is reused when returning to a previous ratio.
- [x] **AC-009:** While cold preparation is pending, transport shows
  `preparing`, elapsed time does not advance, and duplicate Play requests do not
  start duplicate schedulers. Stop or Space cancels preparation.
- [x] **AC-010:** Editing BPM while playing pauses at the current tick, prepares
  placement-duration output, and resumes the scheduler, audible state, and
  elapsed timer together.
- [x] **AC-011:** Processor failure logs one warning and falls back without a
  crash or repeated retries.
- [x] **AC-012:** Sample Browser preview follows detected sample BPM when
  present and remains native-rate when no preview timing reference exists.

## Verification Evidence

- `time-stretch.test.ts` covers placement-duration ratio math, source-buffer
  validation, passthrough, cache reuse, concurrent deduplication, LRU eviction,
  and processor failure.
- `playback-engine.test.ts` proves preparation and triggering use
  `durationTicks` for both positive and null native-BPM placements.
- `arrangement.test.ts`, `useTransportEngine.test.ts`, and
  `SampleTileGrid.test.tsx` cover BPM-invariant geometry, first-drop span
  capture, same-sample span reuse, and cross-view width.
- `tmp/repro-bpm-boundary-gap/` records the pre-fix production Chromium
  reproduction with the real `SPHERE001_TRNCE_140_A_SC4(R).wav` fixture: null
  BPM caused 1.791524 seconds of silence at each 111 BPM boundary, while the
  140 BPM control was continuous within one frame.
- `tmp/verify-bpm-boundary-fix/` records the post-fix production Chromium
  rendered-audio and canvas invariance checks.
- Verification commands:
  - `npm run typecheck`
  - targeted `vitest` suites for stretching, playback, arrangement, transport,
    Sample Browser, and Player
  - `npm run lint -- --quiet`
  - `npm run build`
  - `node tmp/repro-bpm-boundary-gap.mjs --expect-fixed`

## Non-Goals

- Continuous tempo automation and sample-accurate live ratio modulation are not
  implemented. BPM edits use an atomic prepare-and-resume transition.
- No manual warp markers or per-placement BPM editor.
- No formant-preservation mode for vocals.
- No user-selectable re-pitch mode in this spec.
- Automated pitch and duration checks do not replace subjective listening on a
  broader library.

## DAW Behavior References

- [Ableton Live: Audio Clips, Tempo, and Warping](https://www.ableton.com/en/live-manual/11/audio-clips-tempo-and-warping/)
- [Apple Logic Pro: Choose the Flex & Follow setting](https://support.apple.com/en-ie/guide/logicpro/lgcpb7abb9cc/10.7/mac/11.0)
