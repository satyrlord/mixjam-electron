# Audio engine

The tracker/player uses the **Web Audio API** in the renderer with a
lookahead-scheduler pattern.

The `AudioContext` is created with an explicit `latencyHint` of 0.2 seconds.
The note scheduler runs on the renderer main thread, so the audio thread's only
protection from a UI stall is how much rendered audio is already buffered ahead
of it; a large buffer converts a main-thread hitch into no audible event at all.
MixJam is arrangement playback with no live input monitoring (a spec-005
non-goal) and nothing in the app reacts to output latency, so this is free
resilience rather than a trade-off. Measured result: `baseLatency` 0.17 s and
`outputLatency` 0.21 s at 48 kHz, comfortably beyond the worst main-thread
stalls observed while switching Bottom Workspace tabs.

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

The timer runs on the renderer main thread, so its budget is finite: the
lookahead minus one interval, about 75 ms of main-thread stall before a step
would be scheduled late. Two rules protect that budget.

- **Steps whose time already passed are dropped, not fired late.** Handing Web
  Audio a start time in the past makes it play immediately, so a stalled event
  loop would otherwise dump its whole backlog at once as an audible burst. The
  scheduler skips forward to the present instead: a stall costs the steps it
  covered and nothing more. The playhead is derived from the audio clock, so it
  stays correct either way.
- **Per-tick work stays flat.** Whatever the scheduler consults every tick must
  not scale with arrangement size. Lane evaluation and the UI-to-engine lane
  mapping are both cached on array identity (lane state is immutable by
  convention, so an edit is always a cache miss and a stale hit is impossible),
  and each lane keeps a start-tick index so a tick lookup is a map read rather
  than a re-sort of every placement.

The renderer also disables Chromium's background timer throttling
(`backgroundThrottling: false`), which would otherwise clamp the interval to
one second — ten times past the lookahead — when the window is hidden.

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

Each lane has one stable input and a project-owned volume and pan stage. Every
continuous parameter on this path — lane volume, pan, the four Sends, Return
level and power, and Master volume — is written as a 20 ms linear ramp rather
than a direct `.value` assignment. A raw write is a step discontinuity that
clicks, and a fader drag emits one per pointer move; the ramp length matches the
smoothing the Master Bus worklet applies to its own parameters. Project
replacement is the deliberate exception: it snaps, because that boundary is
meant to cut tails.
When a new edit arrives during an active ramp, the engine calls
`cancelAndHoldAtTime(now)` before scheduling the replacement ramp. This holds
the value already reached by automation; cancelling scheduled values and then
reading `.value` can restore an earlier value and create the very step the ramp
is meant to prevent.

The post-fader, post-pan output splits into the dry Master route and four independent
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
Creating or replacing a playback engine applies the complete snapshot before
the engine is exposed for use. A Sample Folder change therefore preserves
unchanged gain, pan, mute/solo, Sends, and Returns. Lane pan is applied once in
the reusable channel path; a voice connects directly to that path and never
creates a second lane panner.
The snapshot may arrive before playback creates any lane channels. Playback
therefore retains each lane's four Send values and replays them, including the
Return connections, when the first voice lazily creates that channel.

## Modular FX processors

An FX module is a black box with a stable type, display metadata, defaults,
validation, editor, summary, processor, live-update behavior, tail policy, and
tests. The Return host provides input, output, level, limiter, lifecycle, and
persistence. A module cannot reach another bus or the Master directly.

`Empty` is the identity processor with no latency. The host gates an Empty bus
to silence so a nonzero Send cannot duplicate the dry signal. The effect
modules are the Echoform Delay (`echoform-delay`) and the Aetherform Reverb
(`aetherform-reverb`). Both render 100% wet; Mix is the FX-return level, not an
in-module parameter. See spec-010 for the host contract and spec-013 for the
reverb.

The Echoform Delay runs in an `AudioWorkletProcessor` (`echoform-delay-processor`)
backed by an allocation-free DSP core (`EchoformDelayCore`). The renderer sends
the full parameter state via `port.postMessage`; the audio thread smooths toward
those targets. Contexts without worklet support fall back to identity passthrough.

Real-time-safety and DSP notes worth recording at the point of confusion:

- Two independently timed delay lines. Fractional reads use 4-point cubic
  (Lagrange) interpolation and are always wrapped in bounds. Digital time changes
  use a dual read-head crossfade (no pitch glide); Analog/Tape slew the read time
  for a controlled glide.
- Buffers preallocate for the longest synchronized value (1/1 dotted at the
  lowest BPM) plus modulation depth and interpolation margin — at least 10 s per
  line (the core uses 12 s). Nothing allocates in the render callback.
- Feedback maps 0–110% → loop gain 0.0–1.10. A bounded soft limiter inside the
  loop keeps over-unity feedback finite without hard-clipping ordinary repeats.
- Low-cut (high-pass) and high-cut (low-pass) are two cascaded TPT one-pole
  filters (≈12 dB/oct) **inside** the feedback loop, so tone accumulates across
  repeats. TPT is chosen over a Chamberlin SVF because it is unconditionally
  stable at any cutoff and under fast automation (a Chamberlin SVF blows up near
  Nyquist — this was a real bug caught by the DSP tests).
- Character changes the algorithm: Digital is clean; Analog adds mild soft
  saturation and gentle HF softening; Tape adds stronger asymmetric saturation
  (DC-blocked) plus wow/flutter/drift scaled from Mod depth. Mod depth 0 disables
  all time modulation, including any tape drift.
- Ducking keys from the unprocessed input (stereo-linked, ~7 ms attack,
  50–2500 ms release) and attenuates the wet output only, with a soft knee.
- Freeze/Hold ramps input injection to zero and loop gain toward unity while
  preserving the buffer; Bypass crossfades the audible return to silence while the
  loop keeps running (tail-preserving). Neither clears the buffers.
- Stereo width is applied post-loop via mid/side (0% mono, 100% unchanged,
  200% doubled side), then Output level.

The `tanh` transfer is the saturating nonlinearity used for character; see the
[DAFx soft-clipping reference](https://dafx12.york.ac.uk/papers/dafx12_submission_45.pdf).

The Aetherform Reverb runs in its own `AudioWorkletProcessor`
(`aetherform-reverb-processor`) backed by the allocation-free
`AetherformReverbCore`: stereo pre-delay, model-specific multi-tap early
reflections, input diffusion, an eight-line Householder feedback delay network
with in-loop TPT tone damping and per-line RT60 gains
(`10^(-3 * lineSeconds / decay)`), character processing, a granular
pitch-shifted shimmer feedback branch (band-limited before shifting, bounded by
the in-loop soft limiter), equal-power early/late blend, mid/side width,
wet-only ducking, and output trim. Retimes use dual read-head crossfades;
modulation is deterministic (seeded, no RNG). Clear Tail is a momentary
`clear-tail` port command exposed through `ReturnModuleProcessor.clearTail()`
and `AudioEngine.clearReturnTail(index)`. The reverb worklet processes silence
when its upstream input is inactive so tails ring out and Freeze sustains. Full
DSP contract in spec-013.

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

## Master Bus Strip

The 13-slot mastering strip (functional contract in
[spec-012](specs/spec-012-master-bus-strip.md)) runs as one custom DSP block
on the stereo Master path:

```text
lanes + returns -> masterGain -> [master-bus worklet] -> analyser -> destination
                                        |
                                        +-> loudness measurement branch (post-chain)
```

Inside the worklet the signal flows: `Gain Stage -> Input VU meter -> remaining
processors -> Output`. The Input VU meter taps after the Gain Stage so the
needle reflects the trimmed signal — the user can gain-stage the mix with the
Trim control and see the result on the VU before it hits dynamics and EQ.

Master Volume is therefore the trim into the chain, and the Limiter ceiling
protects the real output. The BS.1770 measurement branch taps the chain
output, so the Middle Strip readouts and the strip's output meter share one
measurement engine.

### Threading model

- The pinned Gain Stage, all ten downstream processors, the input VU meter
  (tapped after the Gain Stage),
  and the limiter's true-peak sidechain run inside a single `AudioWorkletProcessor`
  (`master-bus-processor`), following the repository rule that an
  AudioWorklet is the first custom-DSP choice. The worklet module is emitted
  by Vite from `src/renderer/src/engine/worklets/` like the loudness
  worklet; no `blob:` URL.
- The DSP core is pure TypeScript operating on `Float32Array` blocks with no
  Web Audio types. The worklet is a thin adapter. This is what makes the
  unit suite headless: the same core runs under the node vitest project.
- The per-block processing path allocates nothing, takes no locks, and does
  no I/O. All buffers, module states, both chain instances, and oversampler
  workspaces are allocated at construction.
- The platform adaptation of the "lock-free queue" requirement: parameters
  arrive through the worklet `MessagePort` and are drained into
  preallocated slots at block start; meter data leaves through
  `port.postMessage` of a small snapshot at a 33 ms cadence (about 200
  bytes, the same accepted practice as the loudness worklet's 100 ms
  cadence). SharedArrayBuffer is not available because the app runs without
  COOP/COEP.
- Snapshot posting is gated by a `meters` enable message. It is off by
  default and enabled only while the Master tab shows the strip, so the
  audio thread pays no postMessage or allocation cost for hidden meters.

### UI telemetry routing

High-frequency read-only values never enter React state above the component
that displays them. The playhead tick and master meter snapshot (100 ms
poll), the elapsed-time readout, the strip meter feed, and the per-channel
Mixer meters (animation-frame cadence) all flow through small subscription
stores (`src/renderer/src/lib/value-store.ts`). Writers set the store; only
the leaf components that subscribe re-render. This keeps a playing song from
re-rendering the App tree ten or more times per second — the cause of a
severe UI-latency regression in development builds, where each App render
costs about ten times more than in production.

### Parameter and message flow

```text
UI knob -> React state -> project history edit
        -> port.postMessage {paramId, value}
worklet: drain queue at block start -> per-parameter smoother (20 ms one-pole)
        -> module reads smoothed value per sample or per block
worklet -> port.postMessage snapshot at 33 ms:
        {vuDb, peakL, peakR, compGrDb, limGrDb, latencySamples, stalled?}
UI: latest-snapshot store -> animation-frame paint while Master tab active
```

- Every continuous parameter has a 20 ms one-pole smoother; gains smooth in
  the linear domain, frequencies in log domain. A smoothing test asserts the
  maximum per-sample step.
- Topology messages (reorder, bypass, preset) are atomic: one message
  carries the complete ten-processor order and power map. Gain has no
  topology state and cannot be bypassed or reordered.

### Crossfade mechanism (click-free bypass and reorder)

The worklet owns one always-on Gain Stage followed by two downstream chain
instances, A and B, with independent module states. Gain runs exactly once,
then the Input VU meter taps the result, and only then is that same gain-staged
signal copied to both branches. Exactly one downstream chain is active. On any
topology change (reorder, bypass toggle, preset recall):

1. The inactive instance adopts the new topology and starts processing the
   same input from cleared filter states.
2. Both instances run for the 30 ms crossfade window, mixed with an
   equal-power curve from old to new.
3. The old instance stops; the new one becomes active. Changes arriving
   mid-fade are queued and coalesce to the newest topology, which fades in
   as soon as the running fade completes.

Running both instances doubles CPU only during the 30 ms window. Warm-up
transients from cleared states are inaudible because the new chain fades in
from zero power; the automated glitch test renders program material through
scripted reorder/bypass storms and asserts no discontinuity above
-60 dBFS sample-to-sample step beyond what the program itself contains.

Parameter-only changes never crossfade; they ride the smoothers inside the
active instance.

### Oversampling and latency

- One shared oversampler implementation: 4x via two cascaded 2x half-band
  linear-phase FIR polyphase stages (up and down). Soft Clip, Tube, and
  Maximizer use 4x; Tape uses one 2x stage (its nonlinearity is gentler and
  pre-emphasis already tilts the spectrum). The Limiter's true-peak
  sidechain uses a 4x up-only path per signed channel.
- Tap counts: 63 (outer stage, Kaiser beta 9) and 45 (inner stage, running
  at the doubled rate). They are chosen so every round trip is an INTEGER
  base-rate delay: 2x = 31 samples, 4x = 31 + 11 = 42 samples. A half-band
  kernel's trivial polyphase half (the single ~0.5 center tap) is exploited
  as a pure delay, halving the FIR work.
- Exact-identity neutral path: a nonlinear stage whose drive is zero
  bypasses the oversampler through a plain integer delay of the same
  length, so the -100 dBFS null tests pass bit-exactly. On a
  neutral-to-engaged switch the stage primes the engaged path by replaying
  256 samples of recent raw input, keeping the switch error at the FIR
  reconstruction floor (about -85 dB, under the glitch gate).
- Each stage exposes `latencySamples`. The chain total is the sum over the
  active order plus the Limiter lookahead (2.5 ms). The total is reported in
  every meter snapshot; the default chain is 277 samples (~5.8 ms) at
  48 kHz. The playhead is not compensated (below the project's 10 ms timing
  threshold), but the reported value keeps a later compensation or export
  alignment (spec-019) honest.
- Numerical hygiene: module outputs pass a guard that flushes denormals
  (add/subtract a tiny DC dither constant in feedback states) and replaces
  NaN/Inf with 0 while latching a per-module fault flag into the snapshot.
  A faulty module can never take down the bus.

### Per-module algorithms

Each module is a stereo in, stereo out block with a `process(l, r, n)` hot
path, a parameter struct, and a reported latency. Neutral settings must null
against bypass below -100 dBFS.

**Gain Stage** — one smoothed linear gain. Latency 0.

**Soft Clip** — 4x oversampled quadratic soft-knee clipper: exact identity
below Ceiling/2, a C1-continuous knee from Ceiling/2 to 1.5x Ceiling,
saturation at Ceiling. Amount drives the signal `Amount` dB into the
clipper and attenuates by the same amount after it, so small signals pass
exactly unchanged while peaks land about `Amount` dB lower. The curve is
odd, so it generates no DC by construction.

```text
in -> up 4x -> gain(+Amount dB) -> knee clip at Ceiling -> gain(-Amount dB) -> down 4x -> out
```

**Tube Saturation** — asymmetric shaper `y = tanh(u) - 0.5 * tanh(u)^2`
with `u = x * (1 + 0.4 * Drive)`, normalized to unity small-signal gain.
The even-order `tanh^2` term produces the predominantly even harmonic
profile; a one-pole DC blocker (5 Hz) follows because that term rectifies.
4x oversampled. Loudness compensation is fitted analytically whenever
Drive changes: the module measures the shaper's RMS gain over one cycle of
a -18 dBFS RMS reference sine (the chain's nominal level) and inverts it,
so loudness stays approximately constant across Drive; then dry/wet Mix
against a latency-aligned dry path.

**Trim EQ** — 2nd-order Butterworth high-pass (12 dB/oct). Chosen
over 24 dB/oct: half the low-frequency group delay and phase rotation on a
full mix, and 12 dB/oct at 20 Hz already removes subsonic energy that
matters here. Mud (250 Hz) and Harsh (3.5 kHz) are RBJ peaking biquads with
Q 3.0 (inside the required 2.5 to 4 window).

**Bus Compressor** — feed-forward, stereo-linked. Detector: max of L/R fed
to a 5 ms RMS window (RMS-style "glue" response), log domain, 6 dB soft
knee. Gain computer applies Ratio above Threshold; attack/release are
one-pole smoothers on the gain-reduction envelope. No auto-makeup
(spec-012 decision). GR dB is written to the snapshot.

```text
L,R -> max -> RMS(5 ms) -> dB -> knee/ratio -> attack/release -> gain -> L,R
```

**Maximizer** — input drive `driveDb = 0.25 * Boost%` (25 % = 6.25 dB)
into the shared 4x oversampled soft-knee clipper with a fixed -1.0 dBFS
ceiling. The ceiling never moves, so Boost adds density, not peak level.
The linear mapping keeps the knob musically even (each 4 % is 1 dB more
drive); its slope is the constant that calibrates the Cheat Sheet defaults
to -14 LUFS-I from a -18 dBFS RMS reference program.

**Lift EQ** — RBJ low shelf at 90 Hz and high shelf at 12 kHz, shelf
slope S = 0.6 (wide and musical, inside the 0.5 to 0.7 window). Latency 0.

**Tape Saturation** — pre-emphasis high shelf (+4 dB above 4.5 kHz),
symmetric tanh stage (odd harmonics, drive `1 + 0.45 * Drive`) at 2x
oversampling, matching de-emphasis, then
the speed-dependent head model: a low peaking "head bump" (55 Hz at
15 IPS, 35 Hz at 30 IPS, up to +1.5 dB scaled by Drive) and a first-order
HF roll-off (corner 11 kHz at 15 IPS, 16 kHz at 30 IPS). Pre/de-emphasis
around the shaper is the standard simplified tape model; the lookup-table
hysteresis model remains a stretch goal and is not required.

**Stereo Imaging** — mid/side where the mid signal passes through
UNTOUCHED and only the side signal is filtered: a Linkwitz-Riley
4th-order high-pass at Mono Below on S discards the low side band (mono
below the crossover), and Width scales the remaining high side band.
Because L + R = 2M at every sample, mono compatibility is exact by
construction — the mono-sum null test is bit-identical — and mono input
nulls bit-exactly at any setting. This is stronger than the
allpass-recombination proof originally sketched, so that design was
dropped.

```text
in -> M ------------------------> M   +-> L = M + S', R = M - S'
   -> S -> LR4 highpass -> * width -> S'
```

**Multiband Comp** — LR4 crossovers at 120 Hz and 2 kHz (three bands, sum
is allpass-flat when all bands are unity). Per band, the amount macro maps
to a coupled pair: `ratio = 1 + amount/50` (0 % = 1:1, transparent;
100 % = 3:1) and `thresholdDb = -22 - 0.14 * amount` relative to full
scale (the -22 base sits under the per-band RMS of nominal -18 dBFS
program so the default amounts apply gentle leveling). Fixed per-band time
constants: low 30/200 ms, mid 15/150 ms, high 5/80 ms. The low band passes
through the 2 kHz crossover's allpass so the three bands sum
allpass-flat. At amount 0 the ratio is exactly 1:1, so the band applies
unity gain and the module nulls against its crossover allpass reference.

**Limiter** — 2.5 ms lookahead delay on the audio path. The sidechain
upsamples each SIGNED channel 4x (rectifying before upsampling would
flatten inter-sample peaks) and rectifies at the high rate; its 23-sample
lag leaves a 97-sample lead inside the lookahead. The gain computer takes
the sliding minimum of the required gain over a 98-sample window
(monotonic deque, preallocated), descends with a slope limit of 1/64 per
sample (guaranteed to reach the required gain before the peak plays, and
C0-continuous so the attack itself cannot click), and releases through a
100 ms one-pole; stereo-linked. The enforced ceiling sits 0.1 dB under the
knob value so the 4x estimate's residual error cannot poke above the
documented ceiling. Latency = the lookahead (the sidechain adds none to
the audio path), reported. GR dB is written to the snapshot.

**Input VU** — 300 ms integration one-pole on the mono sum RMS, displayed
against 0 VU = -18 dBFS; per-channel sample-peak flags with 1.5 s hold. Taps
after the Gain Stage so the VU needle shows the trimmed signal before dynamics
and EQ.

**Output meter** — served by the existing self-hosted loudness worklet
(BS.1770 K-weighting, Momentary 400 ms, Short-term 3 s, gated Integrated,
4x true peak) re-tapped after the chain. The strip adds no second LUFS
implementation. The OVER lamp latches in the UI when true peak exceeds
-1 dBTP.

### Serialization

The strip state is one `masterBus` JSON object inside the version-6
project format: the ten downstream processor IDs in slot order, their ten
power flags, all parameter values including Gain Trim, and the selected preset
name. Gain has no order entry or power flag. Spec-011 owns the wire format and validation;
spec-012 lists the rejection rules. The worklet never parses JSON; the
renderer validates and sends typed messages.

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
