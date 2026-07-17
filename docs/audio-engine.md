# Audio engine

The tracker/player uses the **Web Audio API** in the renderer with a
lookahead-scheduler pattern.

## Lookahead scheduler

`AudioContext` time is sample-accurate, but JS timers are not. Bridge them with the
standard lookahead-scheduler pattern:

- A coarse `setInterval` "ticks" every ~25 ms.
- Each tick, schedule every step whose time falls within a lookahead window
  (~100 ms ahead) by calling `source.start(when)` with an absolute `AudioContext`
  time — never `start(0)` / "now".
- Keep a `nextStepTime` cursor advanced by the step duration derived from BPM.

This gives sample-accurate playback timing regardless of timer jitter, which is more
than enough for an eJay/Acid-style tracker.

### Sample loading

- Decode each sample once into an `AudioBuffer` and cache it (keyed by sample id),
  with an LRU cap so a 35GB library never tries to live in memory.
- Before playback, decode only the nearest cache-sized window of upcoming unique
  samples with bounded concurrency. Refill that window as scheduled placements
  consume it; never read an entire large arrangement into a smaller cache.
- Working-set replacement invalidates decoded and pending non-member entries;
  late decode completion cannot restore an entry that was discarded. A failed
  serialized preload does not prevent later playback sessions from preparing.
- File bytes reach the engine through the injected `loadSampleBytes` callback,
  backed by `BackendAPI.readSampleBytes(rootId, relpath)` — a read through the
  Sample Folder's File System Access handle, so reads cannot escape the granted
  folder (see [architecture.md](architecture.md#process-model)).
- Each voice is a fresh `AudioBufferSourceNode` (they are one-shot) routed through a
  per-lane gain/pan node into the master bus.

### Automatic clip-edge micro-fades

- Tracker voices use a reversible per-voice gain envelope at boundaries that
  touch silence. The project defaults are enabled, 2 ms fade-in, and 4 ms
  fade-out. Both durations are configurable from 0 through 20 ms.
- Fade lengths are converted with
  `round(audioContext.sampleRate * durationMs / 1000)`. The output-context
  sample rate is the timing authority because tempo-following playback must
  keep the fade duration constant in rendered milliseconds.
- The gain is linear in amplitude. It is exactly 0 at an enabled fade-in start,
  reaches 1 at the fade-in end, remains at 1 between edges, and reaches exactly
  0 at an enabled fade-out end.
- If the audible placement is shorter than both requested fades, their sample
  counts shrink proportionally and never overlap. Zero-length and invalid
  durations produce no scheduled envelope and no non-finite values.
- One gain node applies the same envelope to every source channel. This keeps
  channel alignment and the source's existing stereo or multichannel
  relationship before MixJam's normal lane pan and stereo output routing.
- A touching or overlapping placement on the same monophonic lane means that
  boundary is not adjacent to silence. MixJam does not fade both sides of that
  boundary to zero. A later edit-boundary crossfade feature may replace this
  rule without changing the stored automatic-fade settings.
- A later placement cuts the prior voice at its exact scheduled start time,
  including when lookahead prepares the later placement early or its sample is
  unavailable. Fade planning uses the same overlap-truncated audible span.
- Seeking into a sounding placement starts the source at the matching offset
  and enters the envelope at the matching gain. The envelope is therefore
  consistent whether playback starts before or inside a fade region.
- Source audio and decoded cache entries are never changed. Envelope nodes and
  automation are created when the voice is scheduled; the audio rendering
  thread performs no file I/O, blocking work, or per-sample allocation.
- Loop-boundary crossfades and explicit placement fades are separate features.
  When explicit placement fades are added, they must replace the automatic
  envelope on the same edge rather than stack with it.

### Real-time tempo resampling

- Tracker audio is resampled to each placement's stored musical span. The
  target duration is `durationTicks * 60 / (projectBPM * 8)`, and the speed
  ratio is `sourceDurationSeconds / targetDurationSeconds`. Nullable BPM
  analysis metadata never bypasses placement tempo following.
- A positive detected sample BPM establishes the musical span on first drop.
  When BPM is unknown, the current project BPM establishes it, so first-drop
  playback is native-rate and later project BPM changes still resample it.
  Subsequent placements of the same sample reuse that project-owned span.
- `startTick` and `durationTicks` remain unchanged across BPM edits. Only the
  tick-to-seconds mapping and source playback rate change, preserving visual
  and audible boundaries between consecutive placements.
- Each voice uses its decoded source buffer and sets
  `AudioBufferSourceNode.playbackRate` to the speed ratio. Rates above 1 shorten
  and pitch up the source; rates below 1 lengthen and pitch it down. This is a
  re-pitch mode, not a pitch-preserving phase vocoder.
- The runtime exposes a `preparing` transport state while the upcoming buffer
  window is decoded. The scheduler, audible playback state, and elapsed timer
  start together only after preparation succeeds; Stop cancels an in-flight
  start. Project-BPM edits restart scheduling with the new rate while playing,
  but do no file or decode work while stopped.
- Decoded buffers use the existing sample LRU cache. Changing BPM allocates no
  offline rendered buffer and needs no ratio-dependent cache.
- Invalid persisted placement timing falls back to native rate for that voice
  without stopping other lanes.
- Sample-browser preview uses detected sample BPM when available. A sample with
  no preview timing reference plays at native rate; once placed, Tracker
  playback is governed by the placement span instead.

## Per-channel insert effects

Each mixer channel has a stable input and output around an ordered chain of up
to four Web Audio processors. The signal route is channel gain and pan, then
the ordered effects, then the channel analyser and master bus. Rebuilding a
chain does not reconnect active voices because they target the stable channel
input. Replaced and removed processors disconnect every node they own.

- Delay uses dry/wet gain paths, `DelayNode` feedback whose 1.0 control value
  maps to stable near-unity feedback, optional
  quarter/eighth/sixteenth-note tempo sync, and a dual-delay stereo feedback
  loop for ping-pong mode.
- Reverb uses a generated two-channel impulse in a `ConvolverNode`; room size
  changes impulse energy and decay changes its duration and envelope.
- Compression maps the documented controls onto `DynamicsCompressorNode` and
  follows it with a linear makeup-gain stage. Its processor exposes the native
  node's negative `reduction` reading as a positive dB value through the
  channel, audio-engine, and playback-engine facades. The mixer's existing
  animation-frame meter loop reads that property for compressor effect ids;
  bypass and missing processors return zero and no additional analyser is
  inserted into the signal graph.
- Bypass constructs a direct input-to-output route for that slot, so disabling
  DSP also removes its feedback or convolution nodes from the live graph.

Effect definitions live in project-owned mixer state and persist with gain,
pan, mute, and solo in the active `.mixjam` file.

## Master loudness metering

The master bus keeps its audible route unchanged:
`masterGain -> analyser -> destination`. The analyser remains the RMS dBFS
fallback and an A/B reference. A measurement-only branch after `masterGain`
feeds a self-hosted `loudness-worklet` 1.6.9 processor. The optional worklet is
never placed in series with the audible route; when Chromium needs its output
to be pulled, it connects through a zero-gain sink to the destination.

The processor implements ITU-R BS.1770-5 / EBU Mode measurement. MixJam owns a
stable snapshot contract containing RMS dBFS fallback plus Momentary,
Short-term, and Integrated LUFS, maximum true peak in dBTP, and Loudness Range
in LU. The worklet publishes at 100 ms intervals, matching the renderer's
existing meter poll cadence. Its generated release asset is emitted by Vite
from `src/renderer/src/engine/worklets/`; the production loader does not create
a `blob:` URL, so the packaged `worker-src 'self'` policy remains strict.

Registration starts from the existing asynchronous `AudioEngine.resume()`
gesture path and is memoized. Failure logs once, never blocks playback, and
leaves the RMS fallback available. Pause/resume preserves an integration
session. Stop freezes the final values. A new start from tick zero, project
replacement, explicit reset, or discontinuous seek/skip resets Integrated LUFS
and Loudness Range; Momentary and Short-term readings continue after reset.

The 16 channel meters remain lightweight post-channel RMS dBFS meters with
peak hold. Standards-based programme loudness is measured only on the stereo
master bus.

## Native-addon escape hatch — when to leave Web Audio

**Stay on Web Audio for v1.** v1 is playback/arrangement only — no live input
monitoring — and the lookahead scheduler covers that with margin.

Reach for a native addon (`node-addon-api`, Rust/C++) **only** when a concrete,
*measured* condition is hit, not preemptively:

- **Step-timing jitter** measured at the output exceeds ~10 ms at the project's
  finest step resolution, *and* tightening the scheduler window doesn't fix it; or
- a new feature needs **live input monitoring / recording** with round-trip latency
  under ~20 ms (Web Audio + WASAPI shared-mode can't reliably hit this on Windows);
  or
- a feature needs sample-accurate **audio-thread DSP** that can't be expressed as an
  `AudioWorklet`.

Until one of those is true and reproduced, Web Audio stays. The UI is unaffected by
the swap: the scheduler/transport sit behind an interface, and only its
implementation changes. Try an **`AudioWorklet`** before a native addon — it covers
most custom-DSP needs while staying in the web stack.

A native addon can serve only the Electron host; the browser build cannot load
it. `AudioWorklet` works in both hosts and therefore comes first. A native addon
would make the affected feature desktop-only.
