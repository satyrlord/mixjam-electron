# Spec 010 — Return FX Modules

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** PARTIAL — the app implements four send/return
buses and the Empty, Echoform Delay, and Aetherform Reverb modules. It also
implements modal editing with live draft audition, limiter toggles, persistence,
and unified project undo. See unchecked acceptance criteria for remaining proof.

**Depends on:** spec-005 (Audio Playback Engine), spec-007 (Lane-Bound Mixer)

**Related:** spec-011 (Project Save & Load)

## Objective

Define four independent, global FX modules as black boxes hosted by the four
Mixer return buses. Each fixed slot contains an Empty module, an Echoform Delay
module, or an Aetherform Reverb module. Users edit one slot in a blocking modal
with live audition. The host owns routing, power, return level, tail lifecycle,
and a per-return safety limiter.

The effect modules are the Echoform Delay and the Aetherform Reverb
(spec-013). The serialized module types are `echoform-delay` and
`aetherform-reverb`.

## User Stories

- **US-001:** I can configure each of the four return slots independently.
- **US-002:** I can audition Echoform Delay changes live, then commit or discard
  the whole edit.
- **US-003:** I can operate every modal control without a pointer.
- **US-004:** I can power a slot off without cutting its existing tail. I can
  clear the slot to remove the tail and settings immediately.
- **US-005:** I can enable or bypass a fixed safety limiter on each return.
- **US-006:** The FX-slot Mix knob and editor Mix knob are one control. A change
  on either knob updates the other knob and audible wet-return level.

## Module Host Contract

### Fixed independent slots

- The Mixer always contains FX 1, FX 2, FX 3, and FX 4. One 2x2 section follows
  the lane strips. Each container also owns the controls for its matching
  Return. Users cannot add, delete, reorder, chain, or route slots into one
  another.
- Return bus N feeds FX slot N. Each slot receives only the sum of lane send N.
- Every slot contains exactly one module record with a stable slot identity.
  The supported module types are `empty`, `echoform-delay`, and
  `aetherform-reverb`.
- A module is a black box to the host. The host provides stereo input and expects
  stereo wet-only output. It supplies current project BPM. It owns power, return
  level, limiter, persistence, and disposal.
- Module parameters never leak into lane state or another slot. Editing or
  clearing one slot cannot mutate another slot.

### Empty module

Empty is an explicit saved module identity, not a missing record. It owns no
editable parameters. At the black-box module boundary, it returns its input
unchanged with no latency. Every other input-to-output module does the same. The
Return host gates Empty input to silence. Thus, non-zero sends and return level
cannot duplicate dry audio through an empty slot.

### Container power and Clear

- Every FX container has a saved Power setting, default on.
- Turning Power off stops new input to the module. The already-generated delay
  tail remains connected and rings out through the return level and limiter.
- Turning Power on resumes new input without resetting saved module settings.
- Clear immediately replaces the module with Empty, disposes its owned graph,
  and cuts its tail. Clear does not change container Power, return level,
  limiter setting, or lane send values.
- Clear takes effect without confirmation and is one undoable project edit.
  Undo restores the previous module type and complete settings. It cannot
  recreate audio energy from the tail that Clear already cut.

### Container menu and summary

- Left-clicking a container opens its dropdown. An Empty slot offers
  `Echoform Delay...` and `Aetherform Reverb...`. A configured slot offers both
  effect entries and `Clear slot`.
- Choosing an effect entry opens that module's modal. In a slot already
  holding the chosen type it edits that slot's independent settings. Otherwise
  it begins a new draft of that module's default state. The Edit button
  reopens the editor matching the module currently in the slot. On an Empty
  slot it opens the effect picker instead of silently assigning a module.
- The closed container shows FX 1 through FX 4 and the module name. The module
  can be Empty, Echoform Delay, or Aetherform Reverb. It shows Power, the shared
  Mix return-level rotary, and limiter state. A compact delay summary shows time
  or division, Feedback, character, and Mix. The reverb summary shows Space
  model, decay, character, enabled shimmer interval, and Mix.

## Echoform Delay Module

The Echoform Delay is a stereo tempo-synced delay implemented in an
`AudioWorkletProcessor` (`echoform-delay-processor`) backed by an allocation-free
DSP core (`EchoformDelayCore`). The renderer sends the whole parameter state to
the worklet by `port.postMessage` on every change. The audio thread smooths
toward those targets. Where a worklet cannot register, the host substitutes an
identity passthrough so the graph never breaks.

### Saved settings and defaults

Defaults are the **Wide Tape Echo** preset. At 120 BPM the default sync readouts
are L 500 ms (1/4) and R 375 ms (1/8 dotted).

| Setting | Range or values | Default |
| --- | --- | --- |
| Time mode | Sync, Free | Sync |
| Left division | 15 divisions (1/1..1/16, straight/dotted/triplet) | 1/4 |
| Right division | same 15 divisions | 1/8 dotted |
| Left free time | 1–2000 ms | 420 ms |
| Right free time | 1–2000 ms | 610 ms |
| Feedback | 0–110% | 68% |
| Ping-pong | Off, On | On |
| Stereo width | 0–200% | 142% |
| Low-cut | 20–2000 Hz | 160 Hz |
| High-cut | 1000–20000 Hz | 7800 Hz |
| Mod rate | 0.05–8 Hz | 0.38 Hz |
| Mod depth | 0–20 ms | 5.4 ms |
| Character | Digital, Analog, Tape | Tape |
| Drive | 0–100% | 0% |
| Duck amount | 0–100% | 34% |
| Duck release | 50–2500 ms | 620 ms |
| Output level | -24 to +12 dB | -1.5 dB |
| Bypass | Off, On | Off |
| Mix | 0–100% (shared FX-return level) | container-owned |

The 15 divisions start with 1/1, 1/1 dotted, and 1/1 triplet. They continue with
1/2, 1/2 dotted, and 1/2 triplet. They also include 1/4, 1/4 dotted, 1/4 triplet,
1/8, 1/8 dotted, and
1/8 triplet. The final divisions are 1/16, 1/16 dotted, and 1/16 triplet. A
straight 1/N lasts 4/N quarter beats. Dotted uses × 1.5, and Triplet uses ×
2/3.

Left and right divisions and free times are independent. Sync divisions
stay saved while Free is active and vice versa, so switching modes restores each
mode's last values. Power (Space) toggles whether new input reaches the delay
while preserving its tail. It is distinct from the in-module Bypass.

### Signal flow

Conceptual stereo flow, all inside the module black box:

1. Copy the unprocessed input into the ducking detector.
2. Read the left and right fractional delay lines at their modulated times.
   Use 4-point cubic interpolation. Use a dual read-head crossfade in Digital.
   Use a slewed read in Analog and Tape.
3. Two-pole (12 dB/oct) low-cut high-pass and high-cut low-pass **inside** the
   feedback loop, so tone accumulates across repeats.
4. Character coloration inside the loop (Digital clean, Analog mild soft
   saturation, Tape stronger asymmetric saturation with DC removed).
5. Normal-stereo or cross-coupled (ping-pong) feedback matrix, crossfaded on
   change. Loop signal × Feedback. A bounded soft limiter inside the loop keeps
   over-unity feedback finite without hard-clipping ordinary repeats.
6. Add the new input.
7. The delayed taps are the wet output. Apply post-loop mid/side Stereo width
   (0% mono, 100% unchanged, 200% doubled side).
8. Apply ducking gain to the wet only (soft knee, wet-only attenuation).
9. Apply Output level.

The module renders **100% wet**. The lane send/return model owns the dry path,
and Mix is the FX-return level (see Mix contract). Feedback maps 0–110% →
loop gain 0.0–1.10.

### Buffer allocation

Each delay line preallocates for the longest supported synchronized value. This
value is 1/1 dotted at the lowest supported BPM. The allocation also includes
modulation depth and interpolation margin. The core reserves at least 10 s per
line and uses 12 s. Thus, 1/1 dotted at 40 BPM (9 s) is always safe. The render
callback makes no allocation.

### Character

Character changes the real algorithm, not only a label:

- **Digital** — clean feedback path, click-free dual-head time changes, precise
  timing. Safety limiting engages only near unsafe loop levels.
- **Analog** — mild soft saturation and gentle progressive high-frequency
  softening in the loop. Smoothly slewed time changes.
- **Tape** — stronger soft saturation with mild, DC-removed asymmetry. It adds
  progressive high-frequency loss and wow, flutter, and drift scaled from Mod
  depth. It also adds a tape-style time glide. Apparent loudness stays roughly
  matched across modes.

### Modulation

Mod rate is the LFO rate and Mod depth is the peak delay-time deviation in ms.
Left and right modulate 90° apart so the channels move differently. Depth 0
disables audible time modulation in every character (no hidden tape drift).

### Drive

Drive ("Smash") applies gain-compensated soft saturation to the signal
**entering** the delay. It acts before the feedback network. This input
distortion differs from the in-loop Character coloration. The ducking detector
reads the input before Drive. Thus, ducking follows the natural transient, not
the smashed level.

Drive acts before the network write. Driven material then
recirculates, and the grit develops across repeats. The curve is `tanh(x·g)/g`
with `g = 1 + drive·8` and mild makeup. The Drive amount blends this result with
the clean input. Thus, 0% is an exact bypass. Per-sample smoothing prevents
clicks.

## Return Graph and Limiter

Each of the four return buses owns this independent graph:

```text
sum of lane sends N
  -> powered FX module N
  -> return level N
  -> safety limiter N
  -> unchanged Master input
```

- The app enables the limiter by default. It saves the enabled or bypassed
  setting for each return.
- The contract fixes enabled behavior: ceiling -1 dBFS, 5 ms lookahead, 100 ms release,
  and stereo-linked gain reduction. These values are not user-editable.
- Stereo linking applies one gain-reduction envelope to both channels so image
  position does not shift during limiting.
- Limiter bypass is fully off. It removes limiting and lookahead latency from
  that return. It does not apply neutral parameters through the limiter.
- Return level precedes the limiter. The limiter output feeds the existing
  Master input. It does not replace or modify Song Master processing.
- Four limited Returns and the dry lanes sum at Master. That sum can exceed
  -1 dBFS. Thus, the Return limiters do not guarantee a safe Master level or
  hearing protection.
- The limiter owns no visible meter.

## Mix and Bypass Semantics

- **Mix is one parameter.** The FX-slot circular Mix knob and editor Mix knob
  have the same value. This value is the bus return level from 0..1 linear to
  the return-gain node. The module always renders 100% wet. There is no second in-DSP dry/wet
  crossfade.

  Updating either surface immediately updates the other, and
  automation from either surface targets the same return level. This preserves
  the established "wet-return amount" meaning of Mix for old projects.
- **Bypass** follows the FX-return contract. The in-module Bypass crossfades the
  audible return to silence while the delay loop keeps running internally
  (tail-preserving). Un-bypassing reveals the still-ringing tail. It never clears
  delay buffers. Container Power gates input the same
  tail-preserving way.

## FX Edit Modal

### Form and layout

- The centered blocking Echoform Delay editor targets exactly 760 × 680 CSS px.
  Its width is
  `min(760px, 100vw − 28px)`. Its height is
  `min(680px, 100vh − 28px)`. It scrolls internally when smaller. The control grid
  collapses to two columns below ~720px and one column below ~500px. It is
  portaled outside the Mixer scroll surface and centered in the viewport.
- A 68 px header stays visible while the body scrolls. The left side contains a
  square "D8" module mark. It also contains a dynamic "FX Return NN" kicker with
  the real slot number and the "Echoform Delay" title. The right side contains
  a Bypass toggle, a Preset selector, and a Close
  button with an accessible name.
- Below the header, a ~120 px echo-tap visualizer precedes a four-column control
  grid. Time spans two columns. Space, Feedback Tone, Modulation, Character,
  Ducking, and Output follow. A footer contains knob help and a live module-state
  string, such as `Active / Tape / Sync`.
- The editor inherits the active DAW theme through semantic tokens. The fallback
  palette (dark charcoal, warm amber accent, muted teal secondary) is complete
  when no theme override is present.

### Transaction and live audition

- Opening snapshots the complete saved slot state. Parameter changes update an
  isolated draft and audition it through the live module immediately.
- The **Close** button commits the complete draft as one undoable project edit.
  It then closes the modal. Clicking Edit again does not open a duplicate.
- **Escape** cancels: it restores the opening snapshot in state and the live
  graph, discards all draft changes, and closes.
- The modal traps focus and initially focuses the Bypass toggle. It returns focus
  to the FX container's Edit trigger after either outcome. Outside clicks do not
  dismiss the modal.
- Applying a preset updates all parameters atomically, clears Bypass, updates the
  shared Mix, and is one undoable edit. Any manual parameter change switches the
  preset selector to Custom.

### Echo-tap visualizer

- A compact tempo-grid visualizer, not a waveform, oscilloscope, or spectrum.
  The left area contains a tempo and mode chip. The center contains a two-lane
  echo grid with an amber L lane and teal R lane. Current delay times and
  feedback place mock tap markers. Ping-pong alternates lanes. Normal stereo
  uses independent taps.

  More feedback adds more taps and a longer sustained
  pattern. The right area contains L/R time readouts
  and stereo state. Marker shape follows character (Digital squared, Analog
  round, Tape irregular). A restrained playhead scans unless bypassed or the
  user enables reduced motion. Parameter state supplies all visualizer data, and
  audio telemetry supplies none. An accessible description gives L/R times, feedback,
  and ping-pong state.

### Controls and keyboard contract

- Continuous controls use circular hardware-style knobs with a 270° arc and a
  value readout. Stereo width uses a horizontal range. Pointer or touch dragging
  turns knobs. Vertical movement is primary, with a small horizontal component.

  Shift gives fine adjustment. A double-click resets the default. Knobs expose
  `role="slider"` with continuously updated `aria-valuemin/max/now/valuetext`
  and `aria-orientation`. Frequency and time knobs use a perceptual log skew.
- Knob keyboard: Arrow Up/Right increases one step. Arrow Down/Left decreases one
  step. Shift + arrow gives fine control. Page Up/Down moves ten steps. Home/End
  sets the minimum or maximum. Values clamp to their documented ranges.
- Bypass, Ping-pong, Sync/Free, and Character are real buttons with
  `aria-pressed`. Character is a single-selection group. The interface removes
  hidden Sync or Free controls from the tab order.
- Tap Tempo records tap timestamps. It resets after a >2000 ms gap and keeps the
  six most recent taps. It averages at least two intervals and clamps BPM to
  40–240. It flashes for ~150 ms. The delay's tempo ownership drives real delay
  timing.
- Escape cancels the entire draft.

### Shortcut isolation and Media Session exceptions

While the modal is open, it blocks ordinary application and project hotkeys.
These include transport shortcuts, save/open/new, undo/redo, deletion, and
Tracker edit commands. Operating-system Media Session actions are the
only transport exceptions:

- Previous seeks to tick 0.
- Play/Pause toggles the current transport state.
- Next seeks to song end.

These actions do not commit, cancel, reset, or change focus in the modal. Live
audition continues against the resulting transport position.

## Tail and Lifecycle Rules

- Natural song end, Stop, Pause, Jump to End, and discontinuous seek stop source
  voices and new send input. They leave existing delay energy connected to ring
  out.
- Lane mute/solo gating and FX container Power off also stop new input without
  cutting an existing tail.
- Return level changes and limiter bypass changes apply live to existing tails.
- Clear cuts the selected module's tail immediately.
- Project replacement, engine close, or AudioContext close disposes all return
  graphs and cuts all tails.
- Project replacement rebuilds a Return processor even when the incoming slot
  uses the same module type. Parameter updates inside one project keep the
  existing processor.
- Reopening playback reuses each current module graph without duplicate
  connections. It may intentionally overlap a tail that is still audible.

## Persistence and Validation

Spec-011 owns the wire format, now **version 7**. It saves exactly four slot
records and four limiter settings. Each slot saves its stable position, module
type, container Power, and return level. For `echoform-delay`, it also saves
complete Echoform Delay settings. Spec-011 saves Empty explicitly. Spec-007 owns
return levels and lane sends.

Parsing rejects:

- any slot count other than four,
- duplicate or out-of-range slot positions,
- unknown module types or unknown note divisions,
- missing settings, non-finite values, or values outside documented ranges,
- a non-boolean Power, Ping-pong, Bypass, or limiter-enabled value, and
- delay parameter fields attached to Empty.

Version 7 is the current format. Spec-011 owns strict version validation. The
parser rejects older project formats and does not migrate them.

Return modules, Power, Return level, and limiter state share the project command
history with lanes. One complete project edit saves a modal draft or clears a
slot. Toggling Power, changing Return level, or toggling the limiter also creates
one complete project edit.
Undo and Redo restore the whole bus record without a second FX state owner.
Project command-history tests cover complete Return-bus Undo and Redo, while
persistence tests cover complete bus replacement on load and New.

## Module Registration Contract

New module types connect to the runtime host through one descriptor. They do not
use per-type branches across the engine and project loader. Each effect
owns a folder containing its state, defaults, presets, validator, descriptor,
processor adapter, and worklet protocol. The runtime host holds a registry keyed
by module type and never implements an individual effect.

A module descriptor declares:

- `type` — the serialized module-type string (for example `echoform-delay`).
- `label` — the human name shown in the container menu and closed slot.
- `tempoAware` — whether the effect reads project tempo, so the editor surfaces
  tempo / Tap-Tempo controls (delay `true`, reverb `false`).
- `supportsClearTail` — specifies whether the effect exposes the Clear Tail
  momentary command. The editor then shows the Clear Tail control. Reverb uses
  `true`, and delay uses `false`.
- `createProcessor(context, module, bpm)` — builds the black-box
  `ReturnModuleProcessor` for the live graph.
- `prepareWorklet(context)` — registers the effect's AudioWorklet before the
  host materializes a populated snapshot. Resolves `false` where worklets are
  unavailable so the identity fallback applies.
- `createDefault(id)` — the default module record (its default preset).
- `validate(module)` — the load-time guard proving every field is present,
  correctly typed, and in range for that type.
- `moduleKeys` — the exact serialized field allow-list for that type. The project
  parser uses it to reject foreign or missing keys without a per-type branch.

The descriptor does **not** contain the built-in preset set or its atomic
`applyPreset(module, name)`. They belong to the effect's modal and remain
internal to the effect. Thus, only that editor names its presets. The host never
applies a preset.

### Parameter ranges have one owner

Every continuous numeric parameter declares its `{ min, max }` exactly once, in
`src/renderer/src/engine/return-param-ranges.ts`. Both consumers derive from
that table:

- `validate` builds its numeric bounds with `numericFieldsWithinRanges`, so a
  load-time guard cannot disagree with the declared range.
- The editor's knob specification spreads the same entry for its `min` and
  `max`. It keeps `step`, `curve`, `defaultValue`, and `format` local to the
  editor. These fields define presentation, not the contract.

A range stated in two places can become inconsistent. This failure is silent in
the worst direction. A knob widened past the validator lets the user build a
project that saves but will not load. Enumerated numeric fields (for example
`shimmerIntervalSemitones`) are not ranges and keep their own predicate.

Add one range entry for each new numeric parameter. Do not restate bounds in
each layer. `return-param-ranges.test.ts` verifies that each table covers the
effect's continuous numeric fields. Thus, a parameter without a range causes a
failure instead of losing its bound.

### The editor knob is shared

Both editors render `FxKnob` (`src/renderer/src/components/FxKnob.tsx`). It
owns the complete interaction contract. This includes log/linear mapping, drag
weighting, wheel control, Shift fine steps, keyboard bindings, and double-click
reset. Thus, identical gestures behave identically across FX. Each editor
passes its own `classPrefix` (`ef`, `af`), so the two skins stay independent
while the behavior does not. Copying the control per effect is what allowed
them to drift previously.

The host derives every effect-agnostic operation from the registry:

- The processor factory looks up `createProcessor` by `module.type`. An
  unknown type falls back to the Empty identity processor.
- Load validation dispatches to the descriptor's `validate` and `moduleKeys`.
  `empty` remains the built-in two-key record.
- The container menu lists one entry per registered descriptor in registration
  order. Thus, an added effect adds a menu item without a host edit.
- Worklet preparation awaits every registered `prepareWorklet` at resume.
- Capability flags control editor commands. The slot connects Clear Tail only
  where `supportsClearTail`. It connects tempo controls only where `tempoAware`.
  It does not infer them from optional property presence.

The runtime registry is the only engine/project place that enumerates concrete
effect types. The UI has one parallel editor-adapter registry for summaries and
modal rendering, avoiding React dependencies in engine and worklet bundles.
Adding a type means adding its effect folder and registering its runtime and UI
adapters. No Mixer slot or project-parser branch changes.

Both editors use one `useReturnEffectEditorSession` hook for draft, preview,
Mix, preset, and Power policy. The effect modal owns only its controls,
visualizer, preset presentation, and effect-specific commands.

Each effect owns its separate internals. These internals include the DSP core,
modal editor, visualizer, knob controls, state interface, and preset table. The
effects share only host-side plumbing. One `createReturnWorkletProcessor`
factory supplies the worklet-processor scaffolding. This scaffolding includes
context registration records, node creation, identity fallback, connections,
and disposal. One worklet-class helper supplies input/output channel extraction.

It also supplies message dispatch. Effects differ in their core and `toState` projection.
They also differ in extra commands, such as the reverb's Clear Tail.

## Black-Box Verification Contract

Each module implementation must be testable behind the same host boundary:

- construct with stereo input/output and current BPM,
- apply a complete validated settings snapshot,
- update BPM without replacing saved settings,
- accept or gate new input independently of tail output,
- let the Return host enforce wet-only output, including silence for Empty,
- dispose every owned node and connection, and
- render deterministically in `OfflineAudioContext` for audible assertions.

Echoform Delay DSP verification runs headless against `EchoformDelayCore`. It
checks straight, dotted, and triplet division math at several BPM values. It
checks independent L/R impulse timing and free minimums and maximums. It compares
ping-pong cross-channel routing with normal-stereo routing. It checks feedback
decay below 100% and bounded behavior at 100–110%. Extreme settings must produce
no NaN or Inf values.

It checks low/high-cut accumulation across repeats and
width at 0/100/200%. It checks modulation bounds and disables modulation at depth
0. It checks character differences, wet-only ducking, and tail-preserving bypass.
It checks output-gain conversion and sample-rate reinitialization. Limiter
verification uses stereo fixtures. It checks the -1 dBFS ceiling, lookahead,
release, stereo linking, and zero limiter latency while bypassed.

## Design Decisions

| Decision | Reason |
| --- | --- |
| Four fixed independent slots | The send/return model stays understandable and has no routing editor. |
| Modules are black boxes | New module types can share one host lifecycle without exposing internal graphs. |
| One descriptor registry, no per-type host branches | Adding an effect needs one new folder and one registry entry. The host components never list concrete effect types. |
| Share plumbing, not effect internals | The effects share identical worklet scaffolding. Each effect keeps an independent core, modal, state, and presets. |
| Empty is explicit and silent | Saved slot identity is deterministic and cannot leak dry send audio. |
| Echoform Delay renders 100% wet | Mix is the FX-return level, so there is no double dry/wet stage. |
| Mix is the shared return level | One source of truth controls the slot knob and editor Mix. Automation targets one parameter. |
| Filters and character live inside the feedback loop | Tone and saturation develop across repeats instead of changing only the final output. |
| In-loop soft limiter, not hard clip | Over-unity feedback (up to 110%) stays finite and musical. |
| TPT two-pole filters | Unconditionally stable at any cutoff and under fast automation, unlike a Chamberlin SVF near Nyquist. |
| Worklet DSP off the UI thread | Real-time-safe processing with an identity fallback where worklets are unavailable. |
| Power gates input but preserves tails | Bypass is musical and does not truncate ambience. |
| Clear disposes immediately | Clear has an unambiguous destructive audio result and remains undoable as data. |
| Modal edits are transactional with live audition | Users hear changes without committing partial state. |
| Fixed per-return limiter | Every return has independent protection before it reaches Master. |
| Return controls share the FX container | The fixed one-to-one bus relationship is visible without a separate Return column. |
| Media Session actions remain active | Hardware and operating-system transport controls keep their expected role. |

## Acceptance Criteria

- [ ] **AC-001:** The Mixer always renders exactly four independent combined FX
  and Return containers after the lane strips. Each contains explicit Empty,
  Echoform Delay, or Aetherform Reverb state. Each also contains its matching Mix
  return level and limiter controls.
- [ ] **AC-002:** Empty produces silence for non-zero sends and creates no
  audible dry path.
- [ ] **AC-003:** Echoform Delay roundtrips the Wide Tape Echo defaults and
  ranges exactly as specified. It also roundtrips all 15 divisions and
  independent L/R Sync and Free retained values. It roundtrips feedback to 110%,
  character, ducking, and bypass.
- [ ] **AC-004:** Free and sync timing respond live and independently on each
  side. Sync follows project BPM. The module produces stereo 100%-wet output.
- [ ] **AC-005:** Feedback maps 0–110% → loop gain 0.0–1.10. Over-unity feedback
  stays finite through the in-loop soft limiter without hard-clipping ordinary
  repeats. Low/high-cut filters and character color the loop across repeats.
- [ ] **AC-006:** Container Power off stops new input while an existing tail
  rings. Power on resumes input without resetting settings.
- [ ] **AC-007:** Clear immediately replaces the module with Empty and cuts its
  tail. One undoable data edit applies the change. It does not change sends,
  return level, Power, or limiter setting.
- [ ] **AC-008:** Each return graph follows module -> return level (Mix) ->
  limiter -> unchanged Master, with no crossfeed or dry leakage.
- [ ] **AC-009:** Enabled limiters enforce a stereo-linked -1 dBFS ceiling with
  5 ms lookahead and 100 ms release. Bypass removes limiting and its latency.
  Enabled state saves independently for all four returns.
- [ ] **AC-010:** The modal renders at 760 × 680 with responsive breakpoints.
  Outside clicks cannot dismiss it. The modal traps focus and restores focus to
  the Edit trigger. Close commits, and Escape cancels. Reopening does not
  duplicate the modal.
- [ ] **AC-011:** Draft changes audition live. Escape restores the complete
  opening snapshot in state and audio. Close commits all draft changes as one
  undoable edit. A manual change switches the preset selector to Custom. One
  atomic undoable edit loads a preset and clears Bypass.
- [ ] **AC-012:** Every documented knob keyboard step works. These steps include
  arrows, Shift-fine, Page Up/Down, and Home/End. Double-click reset, toggle,
  character selection, and tap-tempo also work. Controls expose correct
  `role="slider"`/`aria-pressed` and
  values to assistive technology. Hidden controls leave the tab order.
- [ ] **AC-013:** The FX-slot Mix knob and editor Mix are one parameter. Either
  surface updates the other and the audible wet-return level. No second in-DSP
  crossfade exists.
- [ ] **AC-014:** Stop, Pause, natural end, Jump to End, seek, lane gating,
  Power, and in-module Bypass preserve tails. Clear, project replacement, and
  engine close cut them.
- [ ] **AC-015:** Version-7 parsing and roundtrip enforce exactly four complete
  valid slots and limiter records. Version 6 and all other older formats reject
  without migration.
- [ ] **AC-016:** Headless DSP and Chromium offline-render tests prove division
  timing and independent L/R routing. They prove ping-pong versus stereo
  feedback, in-loop filtering, width, modulation bounds, ducking, and
  tail-preserving bypass. They also prove sample-rate reinitialization, limiter
  ceiling/linking/latency, slot isolation, and complete node cleanup.

## Non-Goals

- No per-lane insert effects or ordered effect chains.
- No Compressor, third-party plugin, or spectrum analyzer as a module.
  Reverb ships only as the Aetherform Reverb module (spec-013). (The Echoform
  Delay ships built-in presets and a Custom entry. It must remain recognizably
  a delay and adds no reverb or diffusion network.)
- No user-created FX slots, slot reordering, return crossfeed, or external
  routing beyond a module's own internal feedback.
- No editable limiter ceiling, lookahead, release, linking, or metering.
- No compatibility or migration for older project formats or insert effects.
