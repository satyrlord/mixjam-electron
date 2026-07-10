# Audio engine

The tracker/player uses the **Web Audio API** in the renderer with a
lookahead-scheduler pattern.

## Lookahead scheduler

`AudioContext` time is sample-accurate, but JS timers are not. Bridge them with the
standard pattern (Chris Wilson, "A Tale of Two Clocks"):

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
  per-track gain/pan node into the master bus.

### Offline time-stretching

- A lane's optional native BPM selects pitch-preserving time-stretching before
  voice creation. The speed ratio is `projectBPM / nativeBPM`; a null native BPM
  and a ratio of 1 are zero-work passthroughs.
- `bungee-pitch-shift` supplies an MIT-licensed Bungee phase vocoder compiled to
  embedded WASM. Vite emits its self-contained AudioWorklet processor as a static
  asset that works in both the browser build and Electron shell.
- Stretching renders through an `OfflineAudioContext`, producing a reusable
  `AudioBuffer`. Playback never runs stretch DSP on each voice trigger.
- Completed stretched buffers use a separate `(sampleId, ratio)` LRU cache, and
  concurrent requests for the same key share one promise. Old ratios remain in
  the cache until eviction so a BPM change can be reversed without recomputing.
- WASM or AudioWorklet failure logs one warning, disables stretching for that
  player session, and returns the decoded native-rate buffer. Playback does not
  crash or repeatedly retry a broken module.

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
