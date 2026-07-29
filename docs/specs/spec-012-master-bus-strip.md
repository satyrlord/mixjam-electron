# Spec 012 — Master Bus Strip

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** IMPLEMENTED — DSP core, worklet integration,
rack UI, format-7 persistence, and unified undo are in place.
Unit evidence includes `src/renderer/src/engine/masterbus/**` and the project
state and file suites. It covers the chain, modules, EBU compliance,
calibration, allocation, and CPU gates. Other tests include
`MasterBusStrip.test.tsx`, `master-bus-chain.test.ts`,
`master-bus.worklet.test.ts`, and `useMasterBusMeters.test.tsx`.

E2E evidence comes from `tests/e2e/master-bus-strip.spec.ts`. It covers the rack
contract, keyboard reorder, bypass, presets, and the save/load roundtrip. It also
covers the shipped worklet's true-peak ceiling under production CSP. The test
renders this ceiling offline.

The app implements pointer drag-reorder, but no
automated test proves it yet. Keyboard reorder is the automated path. AC-009
stays open on that evidence.

**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline
Panels), spec-007 (Lane-Bound Mixer), spec-011 (Project Save & Load)

**Related:** spec-002 (Theming), spec-010 (Return FX Modules), spec-019
(Audio Export)

## Objective

Add a 13-slot mastering strip on the stereo Master bus. Slot 01 is the pinned,
always-on Gain Stage. Slot 02 is the pinned input meter. Slot 13 is the pinned
output meter. Slots 03 through 12 are ten DSP processors the user can
reorder freely and bypass individually.

The default preset calibrates a nominal mix at -18 dBFS RMS.
It targets -14 LUFS integrated and a true peak at or below -1 dBTP.
This target matches Spotify published loudness guidance.

This checked-in spec is the authoritative contract for the layout, module set,
control ranges, defaults, faceplate finishes, and interactions. The optional
machine-local mockup at
`tmp/master bus design ideas/master-bus-strip.html` is non-normative design
provenance. It can help explain the visual direction. Implementation and review
must follow this spec if the sources differ or the mockup is unavailable.

DSP algorithms, threading, oversampling, latency, and crossfade design live
in [audio-engine.md](../audio-engine.md#master-bus-strip). Visual rules live
in the [Style Guide](../style-guide.md#master-bus-strip). This spec owns the
functional contract and acceptance criteria.

## User Stories

- **US-001:** I can gain-stage my mix into the chain using a VU meter
  calibrated to 0 VU = -18 dBFS.
- **US-002:** I can reorder the ten downstream processors by dragging a grip or
  using the keyboard. Audio continues without clicks.
- **US-003:** I can bypass any downstream processor with its power LED,
  click-free. The Gain Stage stays active.
- **US-004:** I can recall four factory chain presets.
- **US-005:** I can watch live gain reduction on the Bus Compressor and Limiter.
  I can watch live LUFS and true peak on the output meter.
- **US-006:** I can trust the output: with the Limiter active, true peak
  never exceeds the Ceiling. If I bypass the Limiter, the OVER lamp latches
  when true peak exceeds -1 dBTP.
- **US-007:** My chain order, bypass states, and parameter values save and
  load with the project.

## Placement and Signal Position

- The strip is the content of the **Master tab** of the Bottom Workspace.
  One horizontal scrollport contains the horizontal rack.
  It follows Mixer scroll conventions for wheel, trackpad, keyboard, focus,
  and the themed scrollbar.
- The strip REPLACES the previous Master tab content entirely. It removes the
  Master Volume fader and Output Level meter block. The strip's Gain Stage owns
  gain staging into the chain. The strip's pinned output meter reports
  Momentary, Short-term, Integrated, and true peak values. Clip Edge Fades live
  in the Player Settings modal (spec-001).
- `song.masterGain` remains project state applied before the chain (the
  Bottom Workspace tab row keeps its read-only Master status). With no
  editable control, new projects default it to unity so the chain receives
  nominal program level. Loaded projects keep their saved value.
- Audio position: the chain processes the full Master sum after the Master
  Volume gain and before the destination:
  `lanes + returns -> masterGain -> master bus chain -> analyser -> destination`.
  Master Volume therefore acts as the trim into the chain, and the Limiter
  ceiling protects the actual output.
- Inside the chain, the Gain Stage module runs before the Input Meter so the
  VU needle reflects the trimmed signal. The signal path through the strip is:
  `Gain Stage -> Input Meter -> remaining processors -> Output Meter`.
- The spec-005 loudness branch taps after the chain.
  Thus, the Middle Strip and output meter report the same delivery values.
  One measurement engine produces these values.
- The dither/export stage is out of scope. If added later it slots after the
  Limiter and before the output meter (see spec-019).

## Chain Contract

Thirteen slots. Slots 01 (Gain Stage), 02 (Input Meter), and 13 (Output Meter)
stay pinned. They cannot move or bypass. Slots 03 through 12 hold the ten remaining
processors below, in this default order. The user may reorder slots 03 through
12 freely. Slot ordinals renumber live.

The chain pins the Input Meter to slot 02 after the Gain Stage.
Thus, the VU needle always shows the gain-staged signal after downstream
reordering.

| # | Module | Family | Controls (range, default) |
| --- | --- | --- | --- |
| 01 | Gain Stage | GAIN | Trim -24 to +24 dB, default 0 |
| 02 | Input Meter (pinned) | METER | none |
| 03 | Soft Clip | SAT | Amount 0 to 6 dB, default 1.5. Ceiling -6 to 0 dB, default -0.5 |
| 04 | Tube Saturation | SAT | Drive 0 to 10, default 2.5. Mix 0 to 100 %, default 100 |
| 05 | Trim EQ | EQ | HP 10 to 40 Hz, default 20. Mud @250 Hz 0 to -3 dB, default -1.5. Harsh @3.5 kHz 0 to -3 dB, default -1.0 |
| 06 | Bus Compressor | DYN | Threshold -30 to 0 dB, default -16. Ratio 1.5:1 to 10:1, default 2:1. Attack 0.1 to 30 ms, default 10. Release 50 to 1200 ms, default 300 |
| 07 | Maximizer | DYN | Boost 0 to 25 %, default 10 |
| 08 | Lift EQ | EQ | Low shelf @90 Hz 0 to +2 dB, default +1. Air shelf @12 kHz 0 to +2 dB, default +1 |
| 09 | Tape Saturation | SAT | Drive 0 to 10, default 2. Speed 15/30 IPS, default 30 |
| 10 | Stereo Imaging | IMG | Width 60 to 140 %, default 105. Mono Below 60 to 300 Hz, default 120 |
| 11 | Multiband Comp | DYN | Low/Mid/High amount 0 to 100 %, defaults 20/15/20 |
| 12 | Limiter | DYN | Gain 0 to 12 dB, default 4. Ceiling -3 to 0 dBTP, default -1.0 |
| 13 | Output Meter (pinned) | METER | none |

The interface displays the EQ faceplates as **TRIM EQ** and **LIFT EQ**. Their
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
- **Tube Saturation:** an asymmetric waveshaper produces predominantly even
  harmonics. A DC blocker follows the nonlinearity. The module uses oversampling,
  dry/wet mix, and automatic gain compensation. Drive keeps approximately unity
  loudness.
- **Trim EQ:** 12 dB/oct Butterworth high-pass. Mud and Harsh are RBJ
  peaking cuts with narrow Q (2.5 to 4). The name signals focused cleanup,
  not a sub-bass processor.
- **Bus Compressor:** feed-forward, stereo-linked, RMS-style detector with a
  soft knee. No auto-makeup. Design intent: 1 to 2 dB gain reduction on loud
  passages at defaults with nominal program. GR value exposed to the UI.
- **Maximizer:** Boost drives an internal 4x oversampled soft clipper. A fixed,
  matched output ceiling lets Boost raise perceived loudness without raising
  peaks. Mapping: drive dB = 0.25 x Boost %. This slope calibrates the Cheat Sheet
  defaults to -14 LUFS-I.
- **Lift EQ:** wide musical shelves (shelf S about 0.6) for low-end weight
  and high-frequency air.
- **Tape Saturation:** odd-harmonic-leaning saturation with pre- and
  de-emphasis. The Speed switch moves the head-bump center and HF roll-off
  corner. The center is about 55 Hz at 15 IPS and 35 Hz at 30 IPS.
- **Stereo Imaging:** mid/side processing where the mid signal passes
  through untouched. An LR4 high-pass at Mono Below on the side signal
  discards the low side band (mono below the crossover). Width scales the
  remaining high side band. Mono compatibility is exact by construction
  (L + R = 2M at every sample).
- **Multiband Comp:** LR4 crossovers at 120 Hz and 2 kHz. Each amount macro
  maps to a coupled threshold/ratio pair (mapping documented in
  audio-engine.md). Flat magnitude response when all amounts are 0.
- **Limiter:** lookahead brickwall limiter (2.5 ms) with true-peak detection
  on a 4x oversampled sidechain. Output never exceeds Ceiling in true peak.
  GR value exposed to the UI. Reports its latency.
- **Output Meter:** ITU-R BS.1770-4 / EBU R128 loudness uses K-weighting. It
  shows Momentary (400 ms), Short-term (3 s), and gated Integrated LUFS. It also
  shows 4x oversampled true peak. A green target band marks -14 LUFS-I. A red line marks
  -1 dBTP, latching OVER lamp.

## Calibration (non-negotiable)

- Input reference: 0 VU = -18 dBFS. Default parameters assume nominal
  program near -18 dBFS RMS. The defaults tune every nonlinear stage's sweet
  spot to that level.
- Delivery target: -14 LUFS integrated, true peak at or below -1 dBTP.
  Use the Cheat Sheet preset with a -18 dBFS RMS reference program.
  The chain then lands within 1 LU of -14 LUFS-I without user action.
  An automated test verifies this result against the repository's
  deterministic reference program (see Testing).

## Interaction Contract

- **Reorder:** drag a module by its grip. Alternatively, focus the grip and press
  Left or Right to swap with the neighbor. The Gain Stage and pinned meters never
  move and reject drops. A drop indicator marks the insertion point while dragging. Ordinals
  renumber immediately. Reordering while audio runs is a first-class case
  and must be click-free.
- **Bypass:** each of the ten downstream processors has a power LED toggle
  (`aria-pressed`). Off
  dims and desaturates the module body and disables its controls. Bypass and
  re-enable are click-free. The Gain Stage and pinned meters have no power
  control. Gain Trim remains editable in every preset.
- **Knobs:** use shared rotary behavior from the Style Guide.
  It includes vertical drag, wheel steps, Shift fine control, and Arrow keys.
  Double-click and Home reset the value.
  The UI makes values read-only, and `aria-valuetext` includes the unit. Bipolar knobs
  (Trim) fill from center. Unipolar knobs fill from minimum.
- **Speed switch (Tape):** a two-state switch showing `15 IPS` or `30 IPS`
  with `role="switch"` semantics.
- **Presets:** four chips in the strip header: Cheat Sheet, Gentle, Loud,
  Bypass All. Activating a chip applies the preset and marks the chip
  active. Applying a preset is one undoable project edit.
- **OVER lamp:** latches when output true peak exceeds -1 dBTP. Click
  resets it. The lamp is UI state, not saved state.
- The interface respects focus-visible outlines and `prefers-reduced-motion`
  throughout.

## Factory Presets

Every preset first resets all parameters to their defaults. It then applies its
overrides and power map. Only Cheat Sheet restores the default slot order. The
other presets keep the current order.

| Preset | Power | Overrides |
| --- | --- | --- |
| Cheat Sheet | all on | none (defaults, default order restored) |
| Gentle | all on except Maximizer and Multiband Comp off | Soft Clip Amount 0.8. Tube Drive 1.5. Comp Threshold -12. Limiter Gain 2.5. Width 100 |
| Loud | all on | Soft Clip Amount 2.5. Boost 16. Comp Threshold -20. Comp Ratio 3. MB 35/25/35. Air +1.6. Limiter Gain 7 |
| Bypass All | all ten downstream processors off. Gain Stage stays on | none |

## Metering and UI Data

- The engine publishes at least 30 meter snapshots each second.
  It publishes only while the Master tab is active.
  A snapshot contains input VU, peak flags, compressor GR, and limiter GR.
  It also contains output loudness and true peak dBTP.
- While the Master tab is hidden, the UI disables the snapshot stream.
  It sends a `meters` enable message to the worklet.
  Thus, the audio thread does not post hidden meter data.
  The loudness measurement itself is
  never paused. Integrated LUFS keeps accumulating in its own worklet.
- The UI renders the latest snapshot on an animation-frame loop.
  This loop runs only while the Master tab is active.
  This policy matches the spec-006 Mixer meter loop.
  Snapshot values reach the strip through a
  subscription store. They never pass through App-level React state.
- If the snapshot stream stalls, meters freeze at their last values. They
  never show fabricated or garbage data.
- GR LED rows: Bus Compressor thresholds 0.5/1/1.5/2/3/4 dB. Limiter
  thresholds 0.5/1/2/3/4.5/6 dB. A LED lights when GR meets its threshold.

## Real-Time Constraints (summary)

Owned in detail by [audio-engine.md](../audio-engine.md#master-bus-strip):

- All DSP runs in one AudioWorkletProcessor. The per-block processing path
  performs no allocation, no locks, and no I/O.
- The processor smooths all continuous parameters over 20 ms. It produces no
  zipper noise.
- Bypass, reorder, and preset recall crossfade old and new downstream-chain
  outputs with a 30 ms equal-power crossfade. No clicks. The Gain Stage runs
  exactly once before the Input Meter. The chain then copies the signal to both
  crossfade branches.
- Shared 4x oversampling infrastructure for nonlinear stages. Each stage
  reports latency. The meter snapshot reports the total chain latency.
- The processor flushes denormals. NaN/Inf guards operate at module boundaries. A misbehaving
  module can never take down the Master bus.

## Persistence

- One `masterBus` JSON object stores the complete strip state.
  It stores the ten downstream processor IDs in slot order.
  It stores one power flag for each downstream processor.
  It stores all parameters, including `gain.trim`, and the selected preset.
  Manual edits can make the preset null.
  Gain has no persisted order entry or power flag.
- Project **format version 7** requires this record. Spec-011 owns the wire
  format.
- Parsing rejects a slot order that is not a permutation of the ten downstream
  processor IDs. It rejects `gain` in the order or power map. It rejects unknown
  module or parameter IDs and missing parameters. It rejects non-finite or
  out-of-range values, non-boolean power flags, and an unknown preset name.
- Strip edits (parameter change, bypass, reorder, preset recall) join the
  unified project command history. One continuous knob gesture is one
  history entry. Undo and Redo restore the complete strip record.
- New projects start with the Cheat Sheet preset.

## Testing

These suites gate the DSP phase and the integration phase:

- **Per-module unit tests:** the node Vitest project tests the headless, pure
  TypeScript DSP core. It checks impulse and frequency response against the spec
  within 0.5 dB where linear. THD sweeps prove even-dominant harmonics for Tube
  and odd-leaning for Tape. Compressor static curve and attack/release
  timing. Limiter true peak never above Ceiling across an inter-sample-peak
  torture set.
- **Null tests:** every module at neutral settings nulls against a
  latency-compensated bypass below -100 dBFS. The Trim EQ's
  always-active high-pass nulls against its documented high-pass reference
  at zero cuts. Stereo Imaging passes mono material bit-exactly at any
  setting and keeps the mono sum identical to the input sum. Multiband at
  all-zero amounts nulls against its crossover allpass reference.
- **Loudness compliance:** tests validate Momentary, Short-term, Integrated, and
  true peak against EBU Tech 3341 and 3342 test vectors. They use the tolerances
  that those documents specify.
- **Calibration test:** use the deterministic seeded reference program.
  It contains kick-like impulses, bass tone, and shaped noise bursts.
  The generator normalizes it to -18 dBFS RMS.

  With Cheat Sheet, it reaches -14 plus or minus 1 LUFS-I.
  Its true peak stays at or below -1 dBTP. The repository cannot contain a
  licensed commercial mix. Thus, the seeded generator is the
  repository verification asset.
- **Reorder glitch test:** render while programmatically reordering and
  bypassing mid-signal. Assert no sample-to-sample discontinuity above the
  documented threshold (see audio-engine.md).
- **Smoothing test:** a full-range parameter jump produces no step larger
  than the smoothing slope allows.
- **Allocation test:** the per-block processing path performs no allocation
  (verified by allocation tracking around a long render).
- **Performance budget:** process one second of 48 kHz stereo.
  Use the full default chain with 512-sample blocks.
  The CI reference runner must use at most 20% of real time.
  Each module can use at most 4%. The benchmark fails on
  regression.
- **E2E (Electron Playwright):** test drag and keyboard reorder, bypass, and
  preset recall. Test the OVER lamp with the Limiter bypassed.
  Test save/load persistence through persisted fields.
  Do not rely on single click events.

## Design Decisions

| Decision | Reason |
| --- | --- |
| Architecture lives in audio-engine.md | The doc map has no native-architecture.md. audio-engine.md owns audio engine decisions. |
| One AudioWorkletProcessor hosts the whole chain | AudioWorklet is the repo's first custom-DSP choice. One processor gives exact ordering, one crossfade engine, one latency total. |
| Chain sits after masterGain | Master Volume becomes the trim into the chain, and the Limiter ceiling protects the real output. |
| Output meter reuses the loudness measurement engine | One BS.1770 implementation serves the Middle Strip readouts and strip meter. There is no duplicate gated-LUFS DSP. |
| No auto-makeup on the Bus Compressor | Makeup would silently shift the calibrated loudness budget. Maximizer and Limiter Gain own loudness recovery. |
| Format version 7 strict Master Bus record | Spec-011 owns the current wire format. Gain persists only through `gain.trim`, never topology state. |
| Fixed hardware finishes, not theme tokens | The rack reads as physical gear. Finishes are module identity, like the sample palette's fixed slots. The Style Guide sanctions this. |
| Rack hit targets are UI Size boxes around compact painted controls | Mockup control sizes are below the repository minimum. The Mixer FX LED precedent applies. |
| Report latency without playhead compensation | Total chain latency is a few milliseconds at 48 kHz, below the accepted 10 ms timing threshold. |

## Acceptance Criteria

- [x] **AC-001:** The Master tab renders the 13-slot rack.
  It contains a pinned Gain Stage, input meter, and output meter.
  Ten processors appear in persisted order with live ordinal changes.
  The rack uses Mixer horizontal-scroll conventions.
- [x] **AC-002:** Every control matches the Chain Contract ranges, defaults,
  units, and step behavior. It also matches the documented knob, switch, and
  keyboard interactions.
- [x] **AC-003:** The always-on Gain Stage and all ten downstream processors
  audibly process audio per their
  behavioral requirements. The per-module unit and THD tests pass.
- [x] **AC-004:** Every module at neutral settings nulls against bypass
  below -100 dBFS. Imaging and multiband null against their allpass
  references.
- [x] **AC-005:** The input meter shows VU ballistics with 0 VU = -18 dBFS. It
  shows L/R sample-peak lamps and a numeric dBFS readout.
- [x] **AC-006:** The output meter shows Momentary, Short-term, and gated
  Integrated LUFS. It also shows 4x true peak. Tests validate these values against
  EBU Tech 3341/3342 vectors. The green band marks -14 LUFS-I. The red line marks
  -1 dBTP.
- [x] **AC-007:** With the Limiter active, output true peak never exceeds
  Ceiling across the torture set. With the Limiter bypassed and a hot
  chain, the OVER lamp latches and click resets it.
- [x] **AC-008:** Apply Cheat Sheet to the -18 dBFS RMS reference program.
  It reaches -14 plus or minus 1 LUFS-I.
  True peak stays at or below -1 dBTP.
- [ ] **AC-009:** Reordering and bypassing while audio runs produce no click
  above the documented glitch threshold. An automated render test verifies this.
  Pointer and keyboard input support both actions.
- [x] **AC-010:** The processor smooths all continuous parameters. The zipper test
  passes.
- [x] **AC-011:** The four factory presets apply their documented power
  maps and overrides. Only Cheat Sheet restores default order. Each recall
  is one undoable edit.
- [x] **AC-012:** Strip state round-trips through the version-7 project
  format. The parser rejects invalid records per the Persistence rules. Undo and
  Redo restore the complete strip record.
- [x] **AC-013:** Active-tab meters refresh at 30 Hz or better from engine data.
  They freeze at valid values if the stream stalls.
  Bus Compressor and Limiter GR LEDs show live gain reduction.
- [x] **AC-014:** The allocation test proves no per-block allocation. NaN
  injection into any single module leaves the bus output finite.
- [x] **AC-015:** The performance benchmark meets the documented budget and
  fails on regression.

## Non-Goals

- No sidechain inputs, external hardware I/O, or video sync.
- No A/B snapshot morphing.
- No dithering or export pipeline (spec-019 owns export, the dither stage
  would slot after the Limiter).
- No user-defined presets in this phase.
- No per-module UI beyond the rack faceplates (no expanded editor modals).
