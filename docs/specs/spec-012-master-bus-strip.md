# Spec 012 — Master Bus Strip

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** IMPLEMENTED — DSP core, worklet integration,
rack UI, format-6 persistence, and unified undo are in place. Unit evidence:
`src/renderer/src/engine/masterbus/**` (chain, modules, null/THD/limiter,
EBU compliance via the production loudness meter, calibration, allocation
and CPU gates), `MasterBusStrip.test.tsx`, `master-bus-chain.test.ts`,
`master-bus.worklet.test.ts`, `useMasterBusMeters.test.tsx`, project
state/file suites. E2E evidence: `tests/e2e/master-bus-strip.spec.ts`
(rack contract, keyboard reorder, bypass, presets, save/load round trip,
and the shipped worklet's true-peak ceiling rendered offline under
production CSP). Pointer drag-reorder is implemented but has no automated
proof yet (keyboard reorder is the automated path); AC-009 stays open on
that evidence.

**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline
Panels), spec-007 (Lane-Bound Mixer), spec-011 (Project Save & Load)

**Related:** spec-002 (Theming), spec-010 (Return FX Modules), spec-019
(Audio Export)

## Objective

Add a 13-slot mastering strip on the stereo Master bus. Slot 01 is the pinned,
always-on Gain Stage, slot 02 is the pinned input meter, and slot 13 is the
pinned output meter. Slots 03 through 12 are ten DSP processors the user can
reorder freely and bypass individually. The chain is calibrated so that a
nominal mix at -18 dBFS RMS
lands at -14 LUFS integrated with true peak at or below -1 dBTP using the
default preset, matching Spotify's published loudness guidance.

This checked-in spec is the authoritative contract for the layout, module set,
control ranges, defaults, faceplate finishes, and interactions. The optional
machine-local mockup at
`tmp/master bus design ideas/master-bus-strip.html` is non-normative design
provenance. It can help explain the visual direction, but implementation and
review must follow this spec when the two differ or the mockup is unavailable.

DSP algorithms, threading, oversampling, latency, and crossfade design live
in [audio-engine.md](../audio-engine.md#master-bus-strip). Visual rules live
in the [Style Guide](../style-guide.md#master-bus-strip). This spec owns the
functional contract and acceptance criteria.

## User Stories

- **US-001:** I can gain-stage my mix into the chain using a VU meter
  calibrated to 0 VU = -18 dBFS.
- **US-002:** I can reorder the ten downstream processors by dragging a grip or with
  the keyboard, while audio keeps playing without clicks.
- **US-003:** I can bypass any downstream processor with its power LED,
  click-free. The Gain Stage stays active.
- **US-004:** I can recall four factory chain presets.
- **US-005:** I can watch live gain reduction on the Bus Compressor and
  Limiter, and live LUFS and true peak on the output meter.
- **US-006:** I can trust the output: with the Limiter active, true peak
  never exceeds the Ceiling; if I bypass the Limiter, the OVER lamp latches
  when true peak exceeds -1 dBTP.
- **US-007:** My chain order, bypass states, and parameter values save and
  load with the project.

## Placement and Signal Position

- The strip is the content of the **Master tab** of the Bottom Workspace. It
  renders as one horizontal rack inside a horizontal scrollport, following
  the Mixer's scroll conventions (Shift+wheel, trackpad horizontal, Left and
  Right keys, focus reveal, themed always-visible horizontal scrollbar).
- The strip REPLACES the previous Master tab content entirely: the Master
  Volume fader and the Output Level meter block are removed. Gain staging
  into the chain is owned by the strip's Gain Stage; output metering by the
  strip's pinned output meter (Momentary, Short-term, Integrated, and true
  peak). Clip Edge Fades live in the Player Settings modal (spec-001).
- `song.masterGain` remains project state applied before the chain (the
  Bottom Workspace tab row keeps its read-only Master status). With no
  editable control, new projects default it to unity so the chain receives
  nominal program level; loaded projects keep their saved value.
- Audio position: the chain processes the full Master sum after the Master
  Volume gain and before the destination:
  `lanes + returns -> masterGain -> master bus chain -> analyser -> destination`.
  Master Volume therefore acts as the trim into the chain, and the Limiter
  ceiling protects the actual output.
- Inside the chain, the Gain Stage module runs before the Input Meter so the
  VU needle reflects the trimmed signal. The signal path through the strip is:
  `Gain Stage -> Input Meter -> remaining processors -> Output Meter`.
- The loudness measurement branch (spec-005 Master loudness metering) taps
  after the chain, so the Middle Strip readouts and the strip's output meter
  report the same delivery-accurate values from one measurement engine.
- The dither/export stage is out of scope; if added later it slots after the
  Limiter and before the output meter (see spec-019).

## Chain Contract

Thirteen slots. Slots 01 (Gain Stage) and 02 (Input Meter) and 13 (Output Meter)
are pinned and cannot move or bypass. Slots 03 through 12 hold the ten remaining
processors below, in this default order. The user may reorder slots 03 through
12 freely; slot ordinals renumber live.

The Input Meter is pinned to slot 02, immediately after the Gain Stage, so the
VU needle always reflects the gain-staged signal regardless of downstream
reordering.

| # | Module | Family | Controls (range, default) |
| --- | --- | --- | --- |
| 01 | Gain Stage | GAIN | Trim -24 to +24 dB, default 0 |
| 02 | Input Meter (pinned) | METER | none |
| 03 | Soft Clip | SAT | Amount 0 to 6 dB, default 1.5; Ceiling -6 to 0 dB, default -0.5 |
| 04 | Tube Saturation | SAT | Drive 0 to 10, default 2.5; Mix 0 to 100 %, default 100 |
| 05 | Trim EQ | EQ | HP 10 to 40 Hz, default 20; Mud @250 Hz 0 to -3 dB, default -1.5; Harsh @3.5 kHz 0 to -3 dB, default -1.0 |
| 06 | Bus Compressor | DYN | Threshold -30 to 0 dB, default -16; Ratio 1.5:1 to 10:1, default 2:1; Attack 0.1 to 30 ms, default 10; Release 50 to 1200 ms, default 300 |
| 07 | Maximizer | DYN | Boost 0 to 25 %, default 10 |
| 08 | Lift EQ | EQ | Low shelf @90 Hz 0 to +2 dB, default +1; Air shelf @12 kHz 0 to +2 dB, default +1 |
| 09 | Tape Saturation | SAT | Drive 0 to 10, default 2; Speed 15/30 IPS, default 30 |
| 10 | Stereo Imaging | IMG | Width 60 to 140 %, default 105; Mono Below 60 to 300 Hz, default 120 |
| 11 | Multiband Comp | DYN | Low/Mid/High amount 0 to 100 %, defaults 20/15/20 |
| 12 | Limiter | DYN | Gain 0 to 12 dB, default 4; Ceiling -3 to 0 dBTP, default -1.0 |
| 13 | Output Meter (pinned) | METER | none |

The EQ faceplates are displayed as **TRIM EQ** and **LIFT EQ**. Their
internal processor IDs remain `subeq` and `addeq` for DSP routing and saved
project state.

Behavioral requirements per module (algorithms and their justification in
[audio-engine.md](../audio-engine.md#master-bus-strip)):

- **Input Meter:** VU ballistics with about 300 ms integration, 0 VU
  calibrated to -18 dBFS. Taps after the Gain Stage so the needle shows the
  trimmed signal before dynamics and EQ. L and R sample-peak lamps.
- **Gain Stage:** clean smoothed gain.
- **Soft Clip:** continuous waveshaper, at least 4x oversampled. Amount maps
  to how many dB of peak reduction occur on nominal program. DC-safe.
- **Tube Saturation:** asymmetric waveshaper with predominantly even
  harmonics, DC blocker after the nonlinearity, oversampled, dry/wet mix,
  approximately unity loudness across Drive (automatic gain compensation).
- **Trim EQ:** 12 dB/oct Butterworth high-pass; Mud and Harsh are RBJ
  peaking cuts with narrow Q (2.5 to 4). The name signals focused cleanup,
  not a sub-bass processor.
- **Bus Compressor:** feed-forward, stereo-linked, RMS-style detector with a
  soft knee. No auto-makeup. Design intent: 1 to 2 dB gain reduction on loud
  passages at defaults with nominal program. GR value exposed to the UI.
- **Maximizer:** Boost drives an internal 4x oversampled soft clipper with a
  fixed matched output ceiling, so Boost raises perceived loudness without
  raising peaks. Mapping: drive dB = 0.25 x Boost % (the slope is the
  constant that calibrates the Cheat Sheet defaults to -14 LUFS-I).
- **Lift EQ:** wide musical shelves (shelf S about 0.6) for low-end weight
  and high-frequency air.
- **Tape Saturation:** odd-harmonic-leaning saturation with pre- and
  de-emphasis. Speed switch moves the head-bump center (about 55 Hz at
  15 IPS, about 35 Hz at 30 IPS) and the HF roll-off corner.
- **Stereo Imaging:** mid/side processing where the mid signal passes
  through untouched. An LR4 high-pass at Mono Below on the side signal
  discards the low side band (mono below the crossover); Width scales the
  remaining high side band. Mono compatibility is exact by construction
  (L + R = 2M at every sample).
- **Multiband Comp:** LR4 crossovers at 120 Hz and 2 kHz. Each amount macro
  maps to a coupled threshold/ratio pair (mapping documented in
  audio-engine.md). Flat magnitude response when all amounts are 0.
- **Limiter:** lookahead brickwall limiter (2.5 ms) with true-peak detection
  on a 4x oversampled sidechain. Output never exceeds Ceiling in true peak.
  GR value exposed to the UI. Reports its latency.
- **Output Meter:** ITU-R BS.1770-4 / EBU R128 loudness: K-weighting,
  Momentary (400 ms), Short-term (3 s), gated Integrated LUFS, and 4x
  oversampled true peak. Green target band at -14 LUFS-I, red line at
  -1 dBTP, latching OVER lamp.

## Calibration (non-negotiable)

- Input reference: 0 VU = -18 dBFS. Default parameters assume nominal
  program near -18 dBFS RMS; every nonlinear stage's sweet spot is tuned to
  that level.
- Delivery target: -14 LUFS integrated, true peak at or below -1 dBTP. With
  the Cheat Sheet preset and a -18 dBFS RMS pop/electronic reference
  program, the chain lands within plus or minus 1 LU of -14 LUFS-I without
  user intervention. Verified by an automated test against the repository's
  deterministic reference program (see Testing).

## Interaction Contract

- **Reorder:** drag a module by its grip, or focus the grip and press Left
  or Right to swap with the neighbor. The Gain Stage and pinned meters never
  move and reject drops. A drop indicator marks the insertion point while dragging. Ordinals
  renumber immediately. Reordering while audio runs is a first-class case
  and must be click-free.
- **Bypass:** each of the ten downstream processors has a power LED toggle
  (`aria-pressed`). Off
  dims and desaturates the module body and disables its controls. Bypass and
  re-enable are click-free. The Gain Stage and pinned meters have no power
  control; Gain Trim remains editable in every preset.
- **Knobs:** shared rotary behavior per the Style Guide: vertical drag,
  wheel steps, Shift for fine, double-click and Home reset to default, Arrow
  keys step, read-only value text, `aria-valuetext` with unit. Bipolar knobs
  (Trim) fill from center; unipolar knobs fill from minimum.
- **Speed switch (Tape):** a two-state switch showing `15 IPS` or `30 IPS`
  with `role="switch"` semantics.
- **Presets:** four chips in the strip header: Cheat Sheet, Gentle, Loud,
  Bypass All. Activating a chip applies the preset and marks the chip
  active. Applying a preset is one undoable project edit.
- **OVER lamp:** latches when output true peak exceeds -1 dBTP; click
  resets it. The lamp is UI state, not saved state.
- Focus-visible outlines and `prefers-reduced-motion` are respected
  throughout.

## Factory Presets

Every preset first resets all parameters to their defaults, then applies its
overrides and power map. Only Cheat Sheet restores the default slot order;
the other presets keep the current order.

| Preset | Power | Overrides |
| --- | --- | --- |
| Cheat Sheet | all on | none (defaults, default order restored) |
| Gentle | all on except Maximizer and Multiband Comp off | Soft Clip Amount 0.8; Tube Drive 1.5; Comp Threshold -12; Limiter Gain 2.5; Width 100 |
| Loud | all on | Soft Clip Amount 2.5; Boost 16; Comp Threshold -20; Comp Ratio 3; MB 35/25/35; Air +1.6; Limiter Gain 7 |
| Bypass All | all ten downstream processors off; Gain Stage stays on | none |

## Metering and UI Data

- The engine publishes a meter snapshot at least 30 times per second while
  the Master tab is active: input VU level and L/R peak flags, Bus
  Compressor GR dB, Limiter GR dB, output Momentary/Short-term/Integrated
  LUFS, and output true peak dBTP.
- While the Master tab is hidden, the UI disables the snapshot stream (a
  `meters` enable message to the worklet), so the audio thread posts
  nothing for meters nobody can see. The loudness measurement itself is
  never paused; Integrated LUFS keeps accumulating in its own worklet.
- The UI renders meters from the latest snapshot on an animation-frame loop
  that runs only while the Master tab is active (same policy as the Mixer
  meter loop, spec-006). Snapshot values reach the strip through a
  subscription store; they never pass through App-level React state.
- If the snapshot stream stalls, meters freeze at their last values. They
  never show fabricated or garbage data.
- GR LED rows: Bus Compressor thresholds 0.5/1/1.5/2/3/4 dB; Limiter
  thresholds 0.5/1/2/3/4.5/6 dB. A LED lights when GR meets its threshold.

## Real-Time Constraints (summary)

Owned in detail by [audio-engine.md](../audio-engine.md#master-bus-strip):

- All DSP runs in one AudioWorkletProcessor. The per-block processing path
  performs no allocation, no locks, and no I/O.
- All continuous parameters are smoothed (20 ms); no zipper noise.
- Bypass, reorder, and preset recall crossfade old and new downstream-chain
  outputs with a 30 ms equal-power crossfade; no clicks. The Gain Stage runs
  exactly once before the Input Meter and before the signal is copied to both
  crossfade branches.
- Shared 4x oversampling infrastructure for nonlinear stages; each stage
  reports latency; the total chain latency is reported in the meter
  snapshot.
- Denormals are flushed; NaN/Inf guards at module boundaries; a misbehaving
  module can never take down the Master bus.

## Persistence

- The complete strip state serializes into the project file as one
  `masterBus` JSON object: slot order (array of the ten downstream processor
  ids), one power flag for each downstream processor, every parameter value
  including `gain.trim`, and the selected preset name (or none after manual
  edits). Gain has no persisted order entry or power flag.
- This record is required by project **format version 6** (spec-011 owns the
  wire format).
- Parsing rejects: a slot order that is not a permutation of the ten
  downstream processor ids; `gain` in the order or power map; unknown module
  or parameter ids; missing parameters;
  non-finite values; values outside documented ranges; non-boolean power
  flags; and an unknown preset name.
- Strip edits (parameter change, bypass, reorder, preset recall) join the
  unified project command history. One continuous knob gesture is one
  history entry. Undo and Redo restore the complete strip record.
- New projects start with the Cheat Sheet preset.

## Testing

These suites gate the DSP phase and the integration phase:

- **Per-module unit tests** (headless, pure TypeScript DSP core, node
  vitest project): impulse and frequency response against spec within
  0.5 dB where linear; THD sweeps proving even-dominant harmonics for Tube
  and odd-leaning for Tape; compressor static curve and attack/release
  timing; limiter true peak never above Ceiling across an inter-sample-peak
  torture set.
- **Null tests:** every module at neutral settings nulls against a
  latency-compensated bypass below -100 dBFS. The Trim EQ's
  always-active high-pass nulls against its documented high-pass reference
  at zero cuts. Stereo Imaging passes mono material bit-exactly at any
  setting and keeps the mono sum identical to the input sum. Multiband at
  all-zero amounts nulls against its crossover allpass reference.
- **Loudness compliance:** Momentary, Short-term, Integrated, and true peak
  validated against the EBU Tech 3341 and 3342 test vectors within the
  tolerances those documents specify.
- **Calibration test:** the deterministic seeded reference program
  (pseudo-music: kick-like impulses, bass tone, and shaped noise bursts,
  normalized to -18 dBFS RMS) through the Cheat Sheet preset lands at
  -14 plus or minus 1 LUFS-I with true peak at or below -1 dBTP. A licensed
  commercial mix cannot be committed, so the seeded generator is the
  repository verification asset.
- **Reorder glitch test:** render while programmatically reordering and
  bypassing mid-signal; assert no sample-to-sample discontinuity above the
  documented threshold (see audio-engine.md).
- **Smoothing test:** a full-range parameter jump produces no step larger
  than the smoothing slope allows.
- **Allocation test:** the per-block processing path performs no allocation
  (verified by allocation tracking around a long render).
- **Performance budget:** processing 1 s of 48 kHz stereo through the full
  default chain in 512-sample blocks must take at most 20 % of real time on
  the CI reference runner; each module at most 4 %. The benchmark fails on
  regression.
- **E2E (Electron Playwright):** drag-reorder, keyboard reorder, bypass,
  preset recall, OVER lamp latch with Limiter bypassed, and save/load
  persistence, asserting persisted state fields rather than trusting single
  click events, per the repo's E2E conventions.

## Design Decisions

| Decision | Reason |
| --- | --- |
| Architecture lives in audio-engine.md | The doc map has no native-architecture.md; audio-engine.md owns audio engine decisions. |
| One AudioWorkletProcessor hosts the whole chain | AudioWorklet is the repo's first custom-DSP choice. One processor gives exact ordering, one crossfade engine, one latency total. |
| Chain sits after masterGain | Master Volume becomes the trim into the chain, and the Limiter ceiling protects the real output. |
| Output meter reuses the loudness measurement engine | One BS.1770 implementation serves the Middle Strip readouts and the strip meter; no duplicate gated-LUFS DSP. |
| No auto-makeup on the Bus Compressor | Makeup would silently shift the calibrated loudness budget; the Maximizer and Limiter Gain own loudness recovery. |
| Format version 6 strict Master Bus record | Spec-011 owns the current wire format; Gain persists only through `gain.trim`, never topology state. |
| Fixed hardware finishes, not theme tokens | The rack reads as physical gear; finishes are module identity, like the sample palette's fixed slots. Sanctioned in the Style Guide. |
| Rack hit targets are UI Size boxes around compact painted controls | Mockup control sizes are below the repo minimum; the Mixer FX LED precedent applies. |
| Latency is reported, not compensated in the playhead | Total chain latency is a few milliseconds at 48 kHz, below the 10 ms threshold the project already accepts for timing. |

## Acceptance Criteria

- [x] **AC-001:** The Master tab renders the 13-slot rack: pinned Gain Stage,
  pinned input meter, ten processors in persisted order, and pinned output
  meter, with live ordinal renumbering and the Mixer's horizontal-scroll
  conventions.
- [x] **AC-002:** Every control matches the ranges, defaults, units, and
  step behavior in the Chain Contract table, with the documented knob,
  switch, and keyboard interactions.
- [x] **AC-003:** The always-on Gain Stage and all ten downstream processors
  audibly process audio per their
  behavioral requirements; the per-module unit and THD tests pass.
- [x] **AC-004:** Every module at neutral settings nulls against bypass
  below -100 dBFS; imaging and multiband null against their allpass
  references.
- [x] **AC-005:** The input meter shows VU ballistics with 0 VU = -18 dBFS,
  L/R sample-peak lamps, and a numeric dBFS readout.
- [x] **AC-006:** The output meter shows Momentary, Short-term, and gated
  Integrated LUFS plus 4x true peak, validated against EBU Tech 3341/3342
  vectors; the green band marks -14 LUFS-I and the red line -1 dBTP.
- [x] **AC-007:** With the Limiter active, output true peak never exceeds
  Ceiling across the torture set. With the Limiter bypassed and a hot
  chain, the OVER lamp latches and click resets it.
- [x] **AC-008:** The Cheat Sheet preset on the -18 dBFS RMS reference
  program lands at -14 plus or minus 1 LUFS-I with true peak at or below
  -1 dBTP.
- [ ] **AC-009:** Reordering and bypassing while audio runs produce no
  click above the documented glitch threshold (automated render test), and
  both work by pointer and keyboard.
- [x] **AC-010:** All continuous parameters are smoothed; the zipper test
  passes.
- [x] **AC-011:** The four factory presets apply their documented power
  maps and overrides; only Cheat Sheet restores default order; each recall
  is one undoable edit.
- [x] **AC-012:** Strip state round-trips through the version-6 project
  format; invalid records are rejected per the Persistence rules; Undo and
  Redo restore the complete strip record.
- [x] **AC-013:** Meters refresh at 30 Hz or better from real engine data
  while the Master tab is active, and freeze without garbage if the stream
  stalls. Bus Compressor and Limiter GR LED rows show live gain reduction.
- [x] **AC-014:** The allocation test proves no per-block allocation; NaN
  injection into any single module leaves the bus output finite.
- [x] **AC-015:** The performance benchmark meets the documented budget and
  fails on regression.

## Non-Goals

- No sidechain inputs, external hardware I/O, or video sync.
- No A/B snapshot morphing.
- No dithering or export pipeline (spec-019 owns export; the dither stage
  would slot after the Limiter).
- No user-defined presets in this phase.
- No per-module UI beyond the rack faceplates (no expanded editor modals).
