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
- Each voice is a fresh `AudioBufferSourceNode` (they are one-shot) routed through
  its lane path and the shared send/return graph.

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

## Lane, Send, and Return graph

Each lane has one stable input and a project-owned volume and pan stage. The
post-fader, post-pan output splits into the dry Master route and four independent
Send gains. Each Send is linear from 0 through 100 percent and defaults to zero.
One gate controls both the dry route and new Send input:
`anySolo ? lane.solo : !lane.muted`. Solo therefore overrides mute. Audio
already inside an FX processor continues its tail after mute or solo changes.

Each Send feeds its matching global FX bus. The four buses are fixed, parallel,
and cannot feed themselves or one another:

```text
lane voice -> lane volume -> lane pan -> dry ---------------------------> Master
                                      +-> Send 1 -> FX 1 -> Return level
                                                           -> limiter --> Master
                                      +-> Send 2 -> FX 2 -> Return level
                                                           -> limiter --> Master
                                      +-> Send 3 -> FX 3 -> Return level
                                                           -> limiter --> Master
                                      +-> Send 4 -> FX 4 -> Return level
                                                           -> limiter --> Master
```

Return processors are wet-only. Their level is linear from 0 through 100
percent and defaults to 100 percent. Each Return then passes through its own
optional fixed limiter. The limiter defaults on and uses a -1 dBFS ceiling,
5 ms lookahead, 100 ms release, and stereo-linked peak detection. Bypass removes
that limiter from the route. The four limited Returns and all dry lanes sum
before the existing Master gain and meter. This is not a Master limiter: the
sum can still exceed -1 dBFS.

Playback consumes one complete project snapshot and atomically reconciles lane
paths and the four buses. React state updaters never mutate the Web Audio graph
or replay individual fields in order. Removing a lane disconnects every node it
owns. Clearing an FX bus immediately replaces it with Empty and cuts its active
tail. Powering a populated module off blocks new input but lets its existing tail
finish.
The snapshot may arrive before playback creates any lane channels. Playback
therefore retains each lane's four Send values and replays them, including the
Return connections, when the first voice lazily creates that channel.

## Modular FX processors

An FX module is a black box with a stable type, display metadata, defaults,
validation, editor, summary, processor, live-update behavior, tail policy, and
tests. The Return host provides input, output, level, limiter, lifecycle, and
persistence. A module cannot reach another bus or the Master directly.

`Empty` is the identity processor with no latency. The host gates an Empty bus
to silence so a nonzero Send cannot duplicate the dry signal. Delay is the only
other module in this phase. It is wet-only and has no Mix parameter:

- Free time is 0 through 2000 ms. Tempo-sync divisions are `1/4`, `1/8`,
  `1/16`, `1/8T`, and `1/16T`. Switching modes preserves the last value in
  each mode.
- Feedback is 0 through 75 percent and defaults to 35 percent.
- Tape Distortion is 0 through 100 percent and defaults to zero. With
  `a = tapeDistortion / 100` and `d = 1 + 4a`, it uses
  `y = (1 - a)x + a * tanh(d * x) / d`. Zero is exact identity, 100 percent
  reaches drive factor 5, and the loop's small-signal gain does not increase.
  Processing uses 2x oversampling and applies the same curve to both stereo
  channels without changing pan.
- At exactly zero Tape Distortion, the live WaveShaper curve is `null`. This is
  the Web Audio identity path and preserves over-unity Return input instead of
  clamping it to the finite curve domain.
- Tape Distortion follows the delay and precedes wet output and feedback. It
  therefore colors both the first echo and accumulated repeats.
- Ping-Pong defaults off and uses a stereo feedback loop when enabled.
- A new Delay defaults to Free mode at 375 ms, with `1/8` retained as its saved
  sync division, and is powered on.

The Web Audio `WaveShaperNode` contract defines the distortion curve and
oversampling behavior. The `tanh` transfer is the basic saturating nonlinearity
used here; see the [Web Audio specification](https://webaudio.github.io/web-audio-api/#WaveShaperNode)
and the [DAFx soft-clipping reference](https://dafx12.york.ac.uk/papers/dafx12_submission_45.pdf).

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

Lane channel meters remain lightweight post-fader, post-pan RMS dBFS meters
with peak hold. Returns have no meters. Standards-based programme loudness is
measured only on the stereo Master bus.

## OS media actions

The renderer registers Media Session action handlers. `previoustrack` seeks to
tick zero, play and pause toggle transport, and `nexttrack` seeks to song end.
These actions remain available while a blocking modal is open and while MixJam
is in the background when the operating system selects its media session. All
ordinary app and transport shortcuts remain blocked by a modal. The Electron
shell does not use `globalShortcut` for media keys. See the
[Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setActionHandler)
and [Electron globalShortcut documentation](https://www.electronjs.org/docs/latest/api/global-shortcut).

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

An `AudioWorklet` remains the first custom-DSP choice because it keeps DSP in
Chromium's audio rendering model and avoids native ABI, packaging, and signing
work. A native addon is acceptable only after one of the measured triggers
above is reproduced.
