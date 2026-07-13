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
- The playhead can advance indefinitely — there is no fixed song length.
  Lanes can hold patterns of any number of bars.
- Transport is a standalone module — no DOM, no React, no UI imports.

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
- Provides `triggerVoice(buffer, channel, when, laneIndex)` — creates a new
  `AudioBufferSourceNode`, routes it through the channel's gain/pan chain into
  the master bus, and returns a `Voice` handle.
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

### Lane

- Represents one of the 16 monophonic stereo lanes in the current MixJam
  Player. Lane add/remove is not implemented, and no supported maximum above
  16 is currently defined.
- **Monophonic:** if a new sample bubble overlaps a currently playing one on the
  same lane, the previous voice is cut off immediately (classic eJay/Acid
  behavior).
- Each lane holds a set of clip placements (each with a sample reference,
  start tick, and duration in ticks), mute state, solo state, and
  a channel assignment.
- Lanes have unlimited length — the user can add clip placements at any tick position,
  extending the arrangement as needed.
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

## Non-Goals

- Transport controls and the visual playhead are specified by spec-006.
- Tempo-following resampling is specified by spec-009.
- Per-channel effects are specified by spec-010.
- No offline rendering for export. Export is spec-012.
- No multi-channel audio output (only stereo master).
- No live input monitoring or recording.
- No native audio addon — Web Audio API only for v1.
- No MIDI input or output.
- No pre-roll, count-in, or metronome.

## References

- [Current project audio-engine.md](../audio-engine.md) — Lookahead scheduler pattern, sample loading strategy, native-addon escape hatch.
- [Current project architecture.md](../architecture.md) — Web Audio API for v1, Electron protocol for file access.
