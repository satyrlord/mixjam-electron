# Spec 005 — Audio Playback Engine

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-003 (Folder & App State Management)

## Objective

Build the pure audio playback core: transport control (BPM, play/pause/stop), a
lookahead scheduler, sample voice triggering, and per-channel gain/pan routing.
At the end of this slice, a test can load a sample, place it on a lane, press
play, and hear audio. The engine is fully decoupled from the UI layer.

## User Stories

- **US-001:** As a user, I can press play and hear samples triggered on the beat
  grid at the correct timing.
- **US-002:** As a user, I can pause playback and resume from the same position.
- **US-003:** As a user, I can stop playback, which resets the playhead to the
  beginning.
- **US-004:** As a user, I can change the BPM and hear the playback tempo change
  immediately.
- **US-005:** As a user, each lane has its own volume and stereo pan control
  that affects its sound independently.
- **US-006:** As a user, I can change the master output volume without altering
  the relative balance between channels.
- **US-007:** As a user, the UI can display a master loudness meter driven by
  the engine's real output level.
- **US-008:** As a user, playback suppresses clicks at placement edges next to
  silence without changing my source files or creating a noticeable attack or
  release.

## Scope

### Transport

- Owns BPM (default: 120) and playhead position (current tick).
- States: `stopped`, `playing`, `paused`.
- `play()`: transitions to `playing`, begins advancing the playhead.
- `pause()`: transitions to `paused`, holds current tick position.
- `stop()`: transitions to `stopped`, resets playhead to tick 0.
- `setBpm(bpm)`: changes tempo. Effective immediately during playback.
- The renderer transport runtime is the single owner of BPM, master gain,
  transport state, and elapsed display time. Pausing commits the active elapsed
  segment before stopping its timer, so resume excludes time spent paused.
- Tick-to-time conversion: given a tick number and the current AudioContext
  time, returns the absolute time when that tick should fire.
- Step resolution: 1/32 note (8 ticks per beat at 4/4). Every lane shares the
  same global grid.
- The transport distinguishes the arrangement's fixed capacity from the
  content-derived song end defined below.
- Transport is a standalone module — no DOM, no React, no UI imports.

### Song Boundary and Arrangement Capacity

- The arrangement has a theoretical capacity of 999 bars, matching the legacy
  eJay products. In 4/4 at 8 ticks per beat, this is 32 ticks per bar and an
  exclusive capacity boundary of 31,968 ticks.
- Capacity is not song length. `songEndTick` is derived as the maximum
  `startTick + durationTicks` across every placement on every lane. A song with
  content in bars 1-10, silence in bar 10-11, and later content through bar 30
  ends at the exact placement boundary at bar 31; the internal silence does not
  truncate it.
- A final placement that ends partway through a bar makes that exact tick the
  song end. The value is not rounded to the next beat or bar.
- Every placement record contributes to `songEndTick`, including placements on
  muted or currently unsoloed lanes and placements whose sample file is
  missing. Mixer state and temporary file availability never change song
  length. A project with no placements has `songEndTick = 0`.
- Natural playback reaching `songEndTick` automatically stops playback and
  resets the playhead to tick 0. Play on an empty project remains stopped at
  tick 0. Explicit navigation to the end may park the stopped playhead at
  `songEndTick`; it is not treated as natural playback reaching the boundary.
  Pressing Play from that parked end synchronizes the engine and visual
  playhead to tick 0 before preparation, then starts from the beginning.
- Transport completion uses the **Ring Out** contract. Natural song end,
  explicit Stop, and Jump to End stop all source voices and prevent new
  scheduling, but do not reset or rebuild channel effect processors. Delay and
  reverb energy already inside those processors may therefore remain audible
  while transport state is `stopped`. Pause and discontinuous seek use the
  same source-stop behavior. Project replacement and engine close terminate
  the AudioContext and cut any remaining tail.
- If an edit shortens the song below the current playhead, a stopped or paused
  playhead and its view clamp to the new `songEndTick`. During playback, the
  same edit applies the natural-end rule and resets to tick 0.
- Placements retain their complete duration. Drops and moves clamp their start
  tick so `startTick + durationTicks` does not exceed 31,968. A placement whose
  duration alone exceeds the entire capacity is rejected without a dialog;
  the interaction surface provides unavailable-cursor or equivalent inline
  feedback instead of interrupting the user.

### Lookahead Scheduler

- Uses a `setInterval`-based tick (~25ms) that looks ahead by ~100ms.
- Each tick: determine which steps fall within the lookahead window, schedule
  them at precise `AudioContext` times via `source.start(when)`.
- Self-corrects from the audio clock on every tick — if the event loop hiccups,
  the playhead catches up rather than drifting.
- The scheduler does not own the transport; it reads from it and calls back
  with `(tick, when)` pairs for steps that need to fire.
- The playhead anchor folds forward to the last whole tick on every timer pass,
  so a mid-playback BPM change reinterprets at most one timer interval of
  elapsed time and the visual playhead stays continuous instead of jumping.
- The scheduler is a standalone module — testable with a mock clock.

### Audio Engine

- Owns the single `AudioContext` and the master `GainNode`.
- Keeps the audible `masterGain -> analyser -> destination` route and adds an
  optional post-master-gain `AudioWorkletNode` branch for standards-based
  programme loudness. Optional metering never sits in the audible route.
- Provides a factory for mixer channels (`createChannel(index?)`). The channel
  registry is keyed by the caller's channel index — lane N always resolves to
  channel N even when channels are created lazily out of order — so
  `setChannelPan(index, pan)` targets the right channel. A pan set before a
  lane's first trigger is stored and applied when its channel is created.
- Provides `triggerVoice({ buffer, channel, when, laneIndex, playbackRate? })`
  — creates a new `AudioBufferSourceNode`, routes it through the channel's
  gain/pan chain into the master bus, and returns a `Voice` handle.
- Provides `setMasterGain(value)` — 0 to 1 range, applied after all channel
  routing.
- Provides a project-owned read-only master snapshot with RMS dBFS fallback,
  Momentary/Short-term/Integrated LUFS, maximum true peak in dBTP, and
  Loudness Range in LU. Package-specific message types do not cross the engine
  boundary.
- Initializes the self-hosted `loudness-worklet` 1.6.9 asset from `resume()` at
  most once. Registration failure warns once, does not block playback, and
  keeps the analyser fallback active.
- Preserves Integrated/LRA history across pause/resume and freezes it on Stop.
  Starting at tick zero after Stop, loading another project, explicit Reset,
  or discontinuous seek/skip begins a new integration session.
- Maintains an active voice registry — tracks which voices are currently
  playing.
- `stopAllVoices()` — immediately stops all active voices.
- `resume()` — resumes the AudioContext (required after user gesture for
  autoplay policy).
- AudioContext is created lazily (on first user gesture), not at app startup.

### Sample Loading & Caching

- Samples are decoded once into `AudioBuffer` and cached by their sample relpath
  within the active Sample Folder.
- An LRU eviction policy prevents unbounded memory growth — the cache has a
  configurable maximum size.
- File bytes reach the audio engine via the injected `loadSampleBytes`
  callback, backed by `BackendAPI.readSampleBytes(rootId, relpath)` through the
  Sample Folder's directory handle (the engine never accesses the filesystem
  directly).
- Decoding failures are reported as errors — a corrupt or unreadable sample
  does not crash the engine.

### Channel

- Each channel owns a pre-built `GainNode` → `StereoPannerNode` chain.
- `setGain(value)` — 0 to 1 range.
- `setPan(value)` — -1 (full left) to 1 (full right).
- Channels are reusable — the same node chain serves all voices routed through
  that channel.
- The current product surface manages 16 stable channel indices (spec-007).
  The engine can lazily create a channel for a numeric index, but no supported
  product limit above 16 is defined or enforced. Spec-017 must validate a limit
  before exposing add-channel behavior.

### Voice

- Represents a single triggered sample playback instance.
- Created by `triggerVoice()`, wraps an `AudioBufferSourceNode`.
- Lifecycle: `playing` → `ended` (auto-disposed when the buffer finishes).
- Provides `stop()` for early termination.
- Reports lifecycle events: `voiceStarted`, `voiceEnded`.

### Automatic Clip-Edge Micro-Fades

- Automatic clip-edge micro-fades are project-owned Song settings:
  `enabled`, `fadeInMs`, and `fadeOutMs`.
- Defaults are enabled, 2 ms fade-in, and 4 ms fade-out. Both values accept
  fractional milliseconds from 0 through 20.
- Each Tracker voice uses one linear-amplitude per-voice gain envelope. The
  envelope applies equally to all decoded source channels before lane pan,
  channel processing, and the master bus.
- Fade sample counts use
  `round(audioContext.sampleRate * durationMs / 1000)`. Tempo-following
  playback changes source rate but not the requested output-time duration.
- An enabled fade-in begins at gain 0 and reaches gain 1 at its final sample.
  An enabled fade-out begins at gain 1 and reaches gain 0 at the placement end.
- If the audible placement is shorter than the combined requested fades, both
  sample counts shrink proportionally so their sum does not exceed the audible
  placement sample count. Zero-length and invalid durations do not schedule
  ramps or produce non-finite gain values. A one-render-frame placement is
  silent when either edge fade applies because one frame cannot represent both
  endpoints.
- A placement edge is automatically faded only when that edge touches silence
  on the same lane. Touching or overlapping effective audible segments do not
  both fade to zero. Effective segments use the monophonic trigger precedence
  below, rather than the placements' nominal visual spans. MixJam has no
  edit-boundary crossfade in this slice.
- Fade suppression also requires the touching sample to be decoded and ready.
  A missing, unreadable, corrupt, or not-yet-prepared neighbor is treated as a
  possible silence edge, so the playable placement keeps its protective fade.
  Silence classification propagates across consecutive failed placements until
  the next playable placement.
- Starting playback inside a placement starts its source at the corresponding
  source offset and schedules the gain from the corresponding point in the
  envelope.
- The decoded `AudioBuffer` and source file remain unchanged.
- Explicit placement fades, loop crossfades, reverse playback, and offline
  export are not implemented. Future explicit fades must replace, not stack
  with, the automatic envelope on the same edge. Spec-012 export must reuse
  the same sample-count and boundary rules.

### Lane

- Represents one of the 16 monophonic stereo lanes in the current MixJam
  Player. Lane add/remove is not implemented, and no supported maximum above
  16 is currently defined.
- **Monophonic:** if a new sample bubble overlaps a currently playing one on the
  same lane, the previous voice is cut off at the new placement's exact
  scheduled start time (classic eJay/Acid behavior). Lookahead scheduling must
  not cut it off early. The cutoff still applies if the later sample cannot be
  prepared because placement precedence is independent of sample readiness.
- A later placement start permanently ends the earlier placement's effective
  audible segment. Seeking past that cut does not resume the earlier placement.
  If several placements share one start tick, the last placement in stored
  lane order wins. Automatic fade planning uses this effective audible segment,
  not the earlier placement's nominal duration.
- Each lane holds a set of clip placements (each with a sample reference,
  start tick, and duration in ticks), mute state, solo state, and
  a channel assignment.
- Lanes share the 999-bar arrangement capacity. Placement duration is never
  trimmed at the boundary; placement operations follow the clamping and silent
  rejection contract above.
- **Default routing:** each lane is pre-routed to its own mixer channel (lane 1
  → channel 1, lane 2 → channel 2, etc.). This is why the default channel count
  equals the default lane count (16).
- During playback, the scheduler evaluates each lane's placements: when the
  playhead reaches an audible placement's start position, a voice is triggered.
- Solo overrides mute: if any lane is soloed, only soloed lanes play.

### Engine Boundary

The audio engine layer must have **zero imports from UI, state management, or
DOM APIs**. It is pure TypeScript, unit-testable with a mocked `AudioContext`.
Communication with the rest of the app happens through typed events/callbacks —
the engine never knows who is listening.

## Acceptance Criteria (testable)

- [x] **AC-001:** Calling `play()` on the transport transitions state to `playing` and advances the playhead each tick.
- [x] **AC-002:** Calling `pause()` holds the current tick; calling `play()` again resumes from that tick.
- [x] **AC-003:** Calling `stop()` resets the playhead to tick 0 and sets state to `stopped`.
- [x] **AC-004:** Changing BPM from 120 to 140 changes the step duration from
  62.5ms to ~53.6ms. Subsequent ticks fire at the new tempo without mutating
  placement start ticks or musical durations; placement audio rendering follows
  spec-009.
- [x] **AC-005:** The scheduler fires `onSchedule(tick, when)` callbacks for ticks within the lookahead window. A unit test with a mock clock verifies this.
- [x] **AC-006:** `triggerVoice()` creates an `AudioBufferSourceNode` connected to the channel's gain/pan chain → master gain → destination.
- [x] **AC-007:** Calling `voice.stop()` before the buffer ends terminates the voice; a `voiceEnded` event fires.
- [x] **AC-008:** `stopAllVoices()` immediately stops all active voices. Active voice count drops to 0.
- [x] **AC-009:** `createChannel()` returns a channel with independent gain and pan. Setting gain on channel A does not affect channel B.
- [x] **AC-009a:** Calling `setMasterGain()` changes the master output level without muting or altering individual channel settings.
- [x] **AC-009b:** The engine exposes one normalized master snapshot containing
  RMS dBFS fallback and nullable Momentary, Short-term, Integrated LUFS,
  maximum true peak dBTP, and Loudness Range LU values.
- [x] **AC-009c:** The audible master route remains
  `masterGain -> analyser -> destination`; the loudness worklet is a parallel,
  measurement-only branch whose failure cannot mute or alter output.
- [x] **AC-009d:** Worklet initialization is memoized, uses the self-hosted
  checksummed 1.6.9 asset under the production CSP, reports every 100 ms, and
  logs at most one warning before retaining RMS fallback.
- [x] **AC-009e:** Pause/resume preserves integration; Stop freezes it; start
  from tick zero after Stop, project replacement, Reset, and discontinuous
  seek/skip reset Integrated LUFS and LRA history.
- [x] **AC-009f:** The 100 ms UI meter poll commits state only when at least one
  normalized snapshot field changes; unchanged stopped-state snapshots do not
  rerender the Player.
- [x] **AC-010:** Decoding the same sample twice returns the cached `AudioBuffer` — no duplicate decode.
- [x] **AC-011:** A corrupt audio file triggers a decode error that is reported (does not crash the engine).
- [x] **AC-012:** The engine module has zero imports from React, DOM, or any UI code. A static analysis check confirms this.
- [x] **AC-013:** A soloed lane plays; all non-soloed lanes are silent. Un-soloing restores normal playback.
- [x] **AC-014:** The engine exposes the 999-bar capacity boundary of 31,968
  ticks separately from `songEndTick`, which equals the exact maximum
  `startTick + durationTicks` across all placements and is 0 for an empty song.
- [x] **AC-015:** Playback continues across internal silent gaps before
  `songEndTick`; naturally reaching the end stops playback and resets the
  playhead to tick 0, Play from an explicitly parked end restarts at tick 0,
  and Play on an empty song remains stopped at tick 0.
- [x] **AC-016:** Muting, soloing, or losing a referenced sample file does not
  change `songEndTick`. If an edit shortens the song behind the playhead,
  stopped or paused navigation clamps to the new end, while active playback
  stops and resets to tick 0.
- [x] **AC-017:** Natural song end, explicit Stop, and Jump to End reduce active
  source voices to zero without resetting channel processors, so existing FX
  energy rings out after transport stops. Natural end and Stop reset to tick 0;
  Jump to End parks at `songEndTick`. Replaying after the tail decays uses the
  existing graph without duplicate connections.
- [x] **AC-018:** A Tracker voice next to silence schedules a linear 2 ms
  fade-in and 4 ms fade-out by default, with exact 0 and 1 endpoints and one
  shared envelope across every source channel.
- [x] **AC-019:** Fade sample counts use the active AudioContext sample rate,
  remain constant in milliseconds across supported sample rates and
  tempo-following playback rates, and shrink proportionally without overlap for
  very short placements.
- [x] **AC-020:** Zero-length, one-sample, and invalid envelope inputs never
  crash and never schedule a non-finite gain value.
- [x] **AC-021:** Touching or overlapping placements on one lane do not both
  fade to silence at their shared boundary. Placements separated by a gap keep
  the automatic fade-out and fade-in. If either neighbor cannot be prepared,
  the playable placement keeps the fade at the boundary that is actually
  silent.
- [x] **AC-022:** Starting playback inside a sounding placement uses the
  matching source offset and envelope gain. Disabling the project setting
  restores direct source-to-lane playback without an automatic envelope.
- [x] **AC-023:** An overlapping placement cuts the prior voice at the later
  placement's exact audio-clock start, not when the lookahead schedules it.
  The cutoff remains scheduled when the later sample is unavailable, and fade
  planning uses the same overlap-truncated audible duration.

## Song-Boundary Implementation Evidence

- `src/renderer/src/lib/arrangement.test.ts` verifies the 31,968-tick capacity,
  exact latest-placement end across silent gaps and muted lanes, empty-song
  zero, complete-placement clamping, oversized-sample rejection, and
  offset-preserving group clamping.
- `src/renderer/src/hooks/useTransportEngine.test.ts` verifies empty-song Play,
  exact Jump to End parking, delayed replay from the parked end, natural-end
  stop/reset, and edit-time playhead clamping.
- `src/renderer/src/project/project-file.test.ts` rejects persisted placements
  beyond capacity and proves sparse project serialization.
- `tests/e2e/audio-effects-rendering.spec.ts` exercises the real transport
  runtime and audio engine in Chromium for natural end, replay, explicit Stop,
  and Jump to End. Raw post-boundary output samples are under
  `tmp/verify-fx-song-end/`.
- `src/renderer/src/engine/clip-edge-fades.test.ts`,
  `clip-edge-boundary-policy.test.ts`, `lane-evaluation.test.ts`,
  `audio-engine.test.ts`, and `playback-engine.test.ts` cover sample conversion,
  proportional short-clip handling, exact linear endpoints, same-lane boundary
  classification, decoded readiness, consecutive unavailable placements,
  playback-restart cleanup, multichannel-source graph ownership, disable
  behavior, tempo-following timing, playback starting inside a placement,
  ready and failed overlap cutoffs, and overlap-truncated envelope timing.
- `tmp/verify-micro-fades/` records the production Chromium UI and native
  `AudioParam` automation proof for fractional 0.5 ms/3.5 ms settings.
- `tests/e2e/clip-edge-micro-fades.spec.ts` keeps that production Chromium
  control-to-engine automation check in the durable browser suite. It also
  renders the real voice envelope through `OfflineAudioContext` and verifies
  zero endpoints, bounded sample steps, negative samples, tempo-rate playback,
  short clips, and preserved mono, stereo, and four-channel ratios. Its
  `PlaybackEngine` overlap scenarios prove that a ready successor begins at the
  exact scheduled cutoff without a silent gap, while an unavailable successor
  still ends the prior voice with the overlap-truncated protective fade.

## Non-Goals

- Transport controls and the visual playhead are specified by spec-006.
- Tempo-following resampling is specified by spec-009.
- Per-channel effects are specified by spec-010.
- No offline rendering for export. Export is spec-012.
- No loop-boundary crossfade or edit-boundary crossfade.
- No explicit user-authored placement fade editor. A future explicit fade
  takes precedence over the automatic fade on the same edge.
- No multi-channel audio output (only stereo master).
- No live input monitoring or recording.
- No native audio addon — Web Audio API only for v1.
- No MIDI input or output.
- No pre-roll, count-in, or metronome.

## References

- [Current project audio-engine.md](../audio-engine.md) — Lookahead scheduler pattern, sample loading strategy, native-addon escape hatch.
- [Current project architecture.md](../architecture.md) — Web Audio API for v1, Electron protocol for file access.
