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
- File bytes reach the engine through the injected `loadSampleBytes` callback,
  backed by `BackendAPI.readSampleBytes(rootId, relpath)` — a read through the
  Sample Folder's File System Access handle, so reads cannot escape the granted
  folder (see [architecture.md](architecture.md#process-model)).
- Each voice is a fresh `AudioBufferSourceNode` (they are one-shot) routed through a
  per-lane gain/pan node into the master bus.

### Offline time-stretching

- Tracker audio is time-stretched to each placement's stored musical span. The
  target duration is `durationTicks * 60 / (projectBPM * 8)`, and the speed
  ratio is `sourceDurationSeconds / targetDurationSeconds`. Nullable BPM
  analysis metadata never bypasses placement stretching.
- A positive detected sample BPM establishes the musical span on first drop.
  When BPM is unknown, the current project BPM establishes it, so first-drop
  playback is native-rate and later project BPM changes still stretch it.
  Subsequent placements of the same sample reuse that project-owned span.
- `startTick` and `durationTicks` remain unchanged across BPM edits. Only the
  tick-to-seconds mapping and rendered buffer change, preserving visual and
  audible boundaries between consecutive placements.
- The stretch algorithm is a phase vocoder (Bungee, equivalent in approach to
  Elastique) compiled to embedded WASM. Vite emits its self-contained
  AudioWorklet processor as a static asset that works in both the browser
  build and Electron shell.
- Stretching renders through an `OfflineAudioContext`, producing a reusable
  `AudioBuffer`. Playback never runs stretch DSP on each voice trigger.
- The runtime exposes a `preparing` transport state while required buffers are
  decoded or stretched. The scheduler, audible playback state, and elapsed timer
  start together only after preparation succeeds; Stop cancels an in-flight
  preparation. Project-BPM edits use the same transition before playback
  resumes.
- Completed stretched buffers use a separate `(sampleId, ratio)` LRU cache, and
  concurrent requests for the same key share one promise. Old ratios remain in
  the cache until eviction so a BPM change can be reversed without recomputing.
- WASM or AudioWorklet failure logs one warning, disables stretching for that
  playback runtime, and returns the decoded native-rate buffer. Playback does not
  crash or repeatedly retry a broken module. Concurrent failures share that one
  disable transition and therefore still emit only one warning.
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

Effect definitions live in the renderer mixer state and persist in the same
`mixjam-mixer-channels` local-storage entry as gain, pan, mute, and solo.
Older entries without an effects field load with an empty chain.

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
