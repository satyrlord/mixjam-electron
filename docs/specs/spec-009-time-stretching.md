# Spec 009 — Tempo-Following Audio

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline)

## Objective

Make project BPM a musical-time mapping, as in conventional DAWs.
Changing BPM must preserve each placement start tick and musical duration.
Render its source audio faster or slower to fill that unchanged span. Consecutive
sample bubbles remain consecutive visually and audibly at every supported BPM.

The implemented playback mode is real-time re-pitch resampling through Web
Audio. It changes playback speed and pitch together, like a turntable. A future
pitch-preserving algorithm may replace or complement this mode, but it must
obey the same placement timing contract.

## Assumptions and Decision

- The project grid uses eight ticks per beat and the MVP has one global BPM.
- Placed audio follows project tempo by default. MixJam does not currently
  expose a per-placement opt-out equivalent to an unwarped DAW clip.
- Placement start ticks represent a user-created gap or overlap. The
  engine must not infer either one from source-buffer duration.
- **Decision:** musical span is placement-owned, not analysis-owned.
  Native BPM helps estimate a sample's first span and unplaced preview.
  However, it is nullable, late, and editable. Making it the playback authority
  caused the reported arrangement morphing and silence. Persisted
  `durationTicks` is stable, already belongs to the project, and directly
  expresses the musical relationship the user created.

## User Stories

- **US-001:** As a user, my arrangement keeps the same bar and beat relationships after a project BPM change.
  Placed audio follows the new tempo.
- **US-002:** As a user, consecutive sample bubbles remain gapless after a BPM change.
  Native-rate playback does not expose silence between them.
- **US-003:** As a user, a sample without detected BPM still follows the
  project once placed. Missing analysis metadata must not disable resampling.
- **US-004:** As a user, changing project BPM audibly changes placed sample
  speed instead of padding the native-rate audio with silence.

## Timing Model

### Placement-owned musical span

- `startTick` and `durationTicks` are the arrangement authority.
- `durationSeconds` is immutable source-file metadata. It is not a Tracker
  width or scheduled-duration authority after placement.
- On first placement, establish the musical span as follows:
  - If the sample has a positive detected BPM, convert its source duration to
    ticks at that BPM.
  - Otherwise, convert its source duration to ticks at the current project BPM.
    This makes first-drop playback native-rate while still creating a stable
    musical span for future tempo changes.
  - Later placements of the same sample reuse its established project span.
    This rule applies after BPM metadata or project BPM changes.
- Project BPM changes never mutate `startTick`, `durationTicks`, or the order of
  placements. They only change tick-to-seconds conversion and rendered audio.
- A background analysis result can still fill captured `nativeBPM` provenance.
  It must not silently rewrite an existing placement's musical span.

### Playback ratio

For a placement at the current project BPM:

```text
targetDurationSeconds = durationTicks * 60 / (projectBPM * 8)
playbackRate = sourceDurationSeconds / targetDurationSeconds
```

- A rate greater than 1 shortens and pitches up the source. A rate less than 1
  lengthens and pitches it down.
- Rate 1 plays the decoded source unchanged.
- The scheduler triggers the source at `startTick`. The next
  consecutive placement may trigger at `startTick + durationTicks` without an
  intentional gap or overlap.
- Spec-005 automatic micro-fades use output-time milliseconds after the
  playback-rate ratio is applied. Exact same-lane adjacency does not fade to silence on both sides.
  Thus, tempo changes preserve gapless boundaries without an automatic level dip.
- Example: a 140 BPM four-bar loop stored as 128 ticks targets 8.648649 seconds
  at 111 BPM. Its speed ratio is `111 / 140`, independent of whether analysis
  metadata is present.

## Resampling Engine

- Each Tracker voice uses the decoded source `AudioBuffer` directly.
  It sets `AudioBufferSourceNode.playbackRate` from source duration, placement `durationTicks`, and current project BPM.
- Nullable native-BPM metadata never decides whether a placed sample follows
  project tempo. It is only an input when first establishing a placement span
  and when previewing an unplaced sample.
- The engine decodes a cache-sized window of the nearest upcoming unique samples before the scheduler starts.
  Scheduled placements consume this window, and the engine refills it.
  Decode work runs with bounded concurrency. There is no offline render,
  generated tempo buffer, WASM processor, or ratio-dependent audio cache.
- Sample Browser preview has no placement span. It derives playback rate from
  detected sample BPM when available and otherwise previews at native rate.

## Resampling Quality

- Speed and pitch change together. This is intentional for the implemented
  re-pitch mode and must be visible in product documentation.
- Web Audio performs interpolation during rate conversion. MixJam does not
  currently promise transient, formant, or pitch preservation.

## Caching and Failure

- Every playback rate shares the existing decoded-source LRU cache. A BPM
  edit does not allocate another audio buffer.
- Preparation never requests more unique samples than the LRU can retain.
  Editing BPM while stopped performs no file read or decode. Editing while
  playing prepares the upcoming window before scheduling resumes.
- A failed preload rejects only its requesting operation. The serialized queue
  recovers so later playback sessions can prepare normally.
- Working-set replacement invalidates both decoded and in-flight non-member
  samples, so a late decode cannot repopulate a discarded cache entry.
- Invalid persisted placement timing falls back to native-rate playback for
  that voice rather than preventing the remaining arrangement from playing.
- Stop, pause, close, and transport-generation guards cover asynchronous
  sample decoding so a late result cannot create a stray voice.

## Visual Contract

- Only these values determine a placed sample bubble's x position and width:
  `startTick`, `durationTicks`, and the shared pixels-per-tick scale.
- Changing BPM must not move or resize placed bubbles.
- The Sample Browser uses the project-owned duration tick count for an already placed sample.
  Thus, the same sample remains pixel-identical across views.
- Before first placement, the Sample Browser estimates a musical span using
  detected sample BPM or, when unknown, current project BPM. The first drop
  freezes that span for the project.

## Acceptance Criteria (testable)

- [x] **AC-001:** Changing project BPM preserves every placement's `startTick`
  and `durationTicks`. Tracker bubbles do not move, resize, or create visual
  gaps.
- [x] **AC-002:** A source whose placement spans 128 ticks targets 128 ticks at
  every BPM. At 111 BPM its audible duration is approximately 8.648649 seconds.
- [x] **AC-003:** The engine resamples a placement with `nativeBPM: null` from its
  source duration to its stored musical span. Null BPM does not bypass Tracker
  tempo following.
- [x] **AC-004:** Place three consecutive copies at ticks 0, 128, and 256.
  Change the project BPM from 140 to 111. No audible boundary gap occurs.
  Scheduling or render rounding stays within one output sample frame.
- [x] **AC-005:** An existing sample has the same pixel width in the Tracker and
  Sample Browser. A BPM edit does not change that width.
- [x] **AC-006:** Two placements of the same unanalyzed sample reuse its first project-owned musical span.
  This rule applies when the user adds the second placement at another BPM.
- [x] **AC-007:** At 111 BPM, a 140 BPM loop voice has
  `AudioBufferSourceNode.playbackRate` approximately `111 / 140`. Its source
  buffer remains at native duration while its audible duration fills 128 ticks.
- [x] **AC-008:** Tempo following does not create an offline buffer whose
  nominal duration is longer than its audible content.
- [x] **AC-009:** During cold decoding, transport shows `preparing`, and elapsed time does not advance.
  Duplicate Play requests do not start duplicate schedulers. Stop or Space cancels preparation.
- [x] **AC-010:** Editing BPM while playing restarts scheduling from the current
  tick with voices using the new playback rate.
- [x] **AC-011:** Invalid placement timing falls back to native-rate playback
  without crashing or blocking other lanes.
- [x] **AC-012:** Sample Browser preview follows detected sample BPM when
  present and remains native-rate when no preview timing reference exists.
- [x] **AC-013:** Playback preparation stays within the decoded-source cache
  capacity. It limits concurrent reads and refills during playback.
  A stopped BPM edit performs no arrangement reads.
  One failed preparation does not
  poison later sessions, and late invalidated decodes do not re-enter the cache.

## Verification Evidence

- `time-stretch.test.ts` covers preview and placement-duration playback-rate
  math plus invalid source and placement durations.
- `audio-engine.test.ts` proves Tracker and preview rates reach the actual
  `AudioBufferSourceNode`.
- `playback-engine.test.ts` proves decoding and triggering use
  `durationTicks` for both positive and null native-BPM placements.
- `arrangement.test.ts`, `useTransportEngine.test.ts`, and
  `SampleTileGrid.test.tsx` cover BPM-invariant geometry, first-drop span
  capture, same-sample span reuse, and cross-view width.
- `tests/e2e/time-stretch-content.spec.ts` uses a deterministic generated PCM
  WAV in the Electron renderer. It uses a `111 / 140` playback rate and fills
  the expected 8.648649-second span. The test does not use a local fixture
  corpus.
- Verification commands:
  - `npm run typecheck`
  - targeted `vitest` suites for stretching, playback, arrangement, transport,
    Sample Browser, and Player
  - `npm run lint -- --quiet`
  - `npm run build`

## Non-Goals

- Continuous tempo automation and sample-accurate live ratio modulation are not
  implemented. BPM edits use an atomic prepare-and-resume transition.
- No manual warp markers or per-placement BPM editor.
- No pitch-preserving phase-vocoder or Elastique-style mode.
- No formant-preservation mode for vocals.
- No user-selectable playback algorithm in this spec.
- Automated pitch and duration checks do not replace subjective listening on a
  broader library.

## DAW Behavior References

- [Ableton Live: Audio Clips, Tempo, and Warping](https://www.ableton.com/en/live-manual/11/audio-clips-tempo-and-warping/)
- [Apple Logic Pro: Choose the Flex & Follow setting](https://support.apple.com/en-ie/guide/logicpro/lgcpb7abb9cc/10.7/mac/11.0)
