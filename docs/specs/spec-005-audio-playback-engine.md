# Spec 005 — Audio Playback Engine

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** ✅ IMPLEMENTED
**Depends on:** spec-003 (Folder & Session Management)

## Objective

Build the pure audio playback core: transport control (BPM, play/pause/stop), a
lookahead scheduler, sample voice triggering, and per-channel gain/pan routing.
At the end of this slice, a test can load a sample, place it on a track, press
play, and hear audio. The engine is fully decoupled from the UI layer.

## User Stories

- **US-001:** As a user, I can press play and hear samples triggered on the beat
  grid at the correct timing.
- **US-002:** As a user, I can pause playback and resume from the same position.
- **US-003:** As a user, I can stop playback, which resets the playhead to the
  beginning.
- **US-004:** As a user, I can change the BPM and hear the playback tempo change
  immediately.
- **US-005:** As a user, each track has its own volume and stereo pan control
  that affects its sound independently.
- **US-006:** As a user, I can change the master output volume without altering
  the relative balance between channels.
- **US-007:** As a user, the UI can display a master loudness meter driven by
  the engine's real output level.

## Scope

### Transport

- Owns BPM (default: 120) and playhead position (current tick).
- States: `stopped`, `playing`, `paused`.
- `play()`: transitions to `playing`, begins advancing the playhead.
- `pause()`: transitions to `paused`, holds current tick position.
- `stop()`: transitions to `stopped`, resets playhead to tick 0.
- `setBpm(bpm)`: changes tempo. Effective immediately during playback.
- Tick-to-time conversion: given a tick number and the current AudioContext
  time, returns the absolute time when that tick should fire.
- Step resolution: 1/32 note (8 ticks per beat at 4/4). Every track shares the
  same global grid.
- The playhead can advance indefinitely — there is no fixed song length.
  Tracks can hold patterns of any number of bars.
- Transport is a standalone module — no DOM, no React, no UI imports.

### Lookahead Scheduler

- Uses a `setInterval`-based tick (~25ms) that looks ahead by ~100ms.
- Each tick: determine which steps fall within the lookahead window, schedule
  them at precise `AudioContext` times via `source.start(when)`.
- Self-corrects from the wall clock on every tick — if the event loop hiccups,
  the playhead catches up rather than drifting.
- The scheduler does not own the transport; it reads from it and calls back
  with `(tick, when)` pairs for steps that need to fire.
- The playhead anchor folds forward to the last whole tick on every timer pass,
  so a mid-playback BPM change reinterprets at most one timer interval of
  elapsed time — the visual playhead stays continuous instead of jumping
  (fixed 2026-07-02).
- The scheduler is a standalone module — testable with a mock clock.

### Audio Engine

- Owns the single `AudioContext` and the master `GainNode`.
- Owns a master metering tap (`AnalyserNode` or equivalent) after the master
  gain stage so UI can render overall loudness.
- Provides a factory for mixer channels (`createChannel(index?)`). The channel
  registry is keyed by the caller's channel index — lane N always resolves to
  channel N even when channels are created lazily out of order — so
  `setChannelPan(index, pan)` targets the right channel. A pan set before a
  lane's first trigger is stored and applied when its channel is created
  (fixed 2026-07-02).
- Provides `triggerVoice(buffer, channel, when, trackIndex)` — creates a new
  `AudioBufferSourceNode`, routes it through the channel's gain/pan chain into
  the master bus, and returns a `Voice` handle.
- Provides `setMasterGain(value)` — 0 to 1 range, applied after all channel
  routing.
- Provides a read-only master meter stream or polling surface that reports
  current output loudness in dB for UI metering.
- Maintains an active voice registry — tracks which voices are currently
  playing.
- `stopAllVoices()` — immediately stops all active voices.
- `resume()` — resumes the AudioContext (required after user gesture for
  autoplay policy).
- AudioContext is created lazily (on first user gesture), not at app startup.

### Sample Loading & Caching

- Samples are decoded once into `AudioBuffer` and cached by sample ID.
- An LRU eviction policy prevents unbounded memory growth — the cache has a
  configurable maximum size.
- File bytes reach the audio engine via a defined IPC path from the main
  process (the engine never accesses the filesystem directly).
- Decoding failures are reported as errors — a corrupt or unreadable sample
  does not crash the engine.

### Channel

- Each channel owns a pre-built `GainNode` → `StereoPannerNode` chain.
- `setGain(value)` — 0 to 1 range.
- `setPan(value)` — -1 (full left) to 1 (full right).
- Channels are reusable — the same node chain serves all voices routed through
  that channel.
- Up to 99 channels supported in the data model (UI gates at 16, per spec-007).

### Voice

- Represents a single triggered sample playback instance.
- Created by `triggerVoice()`, wraps an `AudioBufferSourceNode`.
- Lifecycle: `playing` → `ended` (auto-disposed when the buffer finishes).
- Provides `stop()` for early termination.
- Reports lifecycle events: `voiceStarted`, `voiceEnded`.

### Lane

- Represents one of up to 64 monophonic stereo lanes in the MixJam Player.
  Default: 16 lanes active; users can add more up to the 64-lane limit.
- **Monophonic:** if a new sample bubble overlaps a currently playing one on the
  same lane, the previous voice is cut off immediately (classic eJay/Acid
  behavior).
- Each lane holds: a sample reference (ID), a set of clip placements (each
  clip has a start tick and a duration in ticks), mute state, solo state, and
  a channel assignment.
- Lanes have unlimited length — the user can place clips at any tick position,
  extending the arrangement as needed.
- **Default routing:** each lane is pre-routed to its own mixer channel (lane 1
  → channel 1, lane 2 → channel 2, etc.). This is why the default channel count
  equals the default lane count (16).
- During playback, the scheduler evaluates each lane's clips: if the playhead
  is within a clip's range and the lane is not muted, a voice is triggered at
  the clip's start position.
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
- [x] **AC-004:** Changing BPM from 120 to 140 changes the step duration from 62.5ms to ~53.6ms. Subsequent ticks fire at the new tempo.
- [x] **AC-005:** The scheduler fires `onSchedule(tick, when)` callbacks for ticks within the lookahead window. A unit test with a mock clock verifies this.
- [x] **AC-006:** `triggerVoice()` creates an `AudioBufferSourceNode` connected to the channel's gain/pan chain → master gain → destination.
- [x] **AC-007:** Calling `voice.stop()` before the buffer ends terminates the voice; a `voiceEnded` event fires.
- [x] **AC-008:** `stopAllVoices()` immediately stops all active voices. Active voice count drops to 0.
- [x] **AC-009:** `createChannel()` returns a channel with independent gain and pan. Setting gain on channel A does not affect channel B.
- [x] **AC-009a:** Calling `setMasterGain()` changes the master output level without muting or altering individual channel settings.
- [x] **AC-009b:** The engine exposes a master loudness value in dB that can drive the Song Controls meter during playback.
- [x] **AC-010:** Decoding the same sample twice returns the cached `AudioBuffer` — no duplicate decode.
- [x] **AC-011:** A corrupt audio file triggers a decode error that is reported (does not crash the engine).
- [x] **AC-012:** The engine module has zero imports from React, DOM, or any UI code. A static analysis check confirms this.
- [x] **AC-013:** A soloed track plays; all non-soloed tracks are silent. Un-soloing restores normal playback.

## Non-Goals (deferred to later specs)

- No UI for transport controls — play/pause/stop buttons. The tracker timeline
  UI is spec-006. (Transport buttons and playhead were pulled forward into
  TrackerView during spec-005 implementation; spec-006 formalizes the full layout.)
- Visual playhead pulled forward: the playhead tick is derived from the
  audio-clock Scheduler (`Player.currentTick`), polled into React state and
  rendered as a positioned bar in TrackerView. The transport is a pure state
  machine and owns no timer, so the playhead never drifts from the audible
  output. The spec-006 playhead AC is therefore already satisfied.
- No time-stretching — samples play at native rate regardless of BPM.
  Time-stretch is spec-009.
- No per-channel audio effects (delay, reverb, compression). FX is spec-010.
- No offline rendering for export. Export is spec-012.
- No multi-channel audio output (only stereo master).
- No live input monitoring or recording.
- No native audio addon — Web Audio API only for v1.
- No MIDI input or output.
- No pre-roll, count-in, or metronome.

## References

- [mixjam-webjam spec-002](../_archived/mixjam-webjam/specs/002-engine-layer/spec.md) — Transport, Scheduler, AudioEngine, Channel, Voice, Track definitions.
- [Current project audio-engine.md](../audio-engine.md) — Lookahead scheduler pattern, sample loading strategy, native-addon escape hatch.
- [Current project architecture.md](../architecture.md) — Web Audio API for v1, Electron protocol for file access.
