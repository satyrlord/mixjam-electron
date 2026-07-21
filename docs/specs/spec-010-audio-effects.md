# Spec 010 — Return FX Modules

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** IMPLEMENTED — four send/return buses, Empty and
Echoform Delay modules, modal editing with live draft audition, limiter toggles,
persistence with v5→v6 migration, and unified project undo are implemented.

**Depends on:** spec-005 (Audio Playback Engine), spec-007 (Lane-Bound Mixer)

**Related:** spec-011 (Project Save & Load)

## Objective

Define four independent, global FX modules as black boxes hosted by the four
Mixer return buses. Each fixed slot contains either an Empty module or an
Echoform Delay module. Users edit one slot in a blocking modal with live
audition, while the host owns routing, power, return level, tail lifecycle, and a
per-return safety limiter.

The Echoform Delay is the only effect module. It replaced the earlier native
`delay` module; projects saved with that type are upgraded by the v5→v6
migration (see Persistence). The serialized module type is `echoform-delay`.

## User Stories

- **US-001:** I can configure each of the four return slots independently.
- **US-002:** I can audition Echoform Delay changes live, then commit or discard
  the whole edit.
- **US-003:** I can operate every modal control without a pointer.
- **US-004:** I can power a slot off without cutting its existing tail, or
  clear it when I want the tail and settings removed immediately.
- **US-005:** I can enable or bypass a fixed safety limiter on each return.
- **US-006:** The FX-slot Mix knob and the editor Mix knob are one control, so
  changing either updates the other and the audible wet-return level.

## Module Host Contract

### Fixed independent slots

- The Mixer always contains FX 1, FX 2, FX 3, and FX 4 in one 2x2 section after
  the lane strips. Each container also owns the controls for its matching
  Return. Slots cannot be added, deleted, reordered, chained, or routed into
  one another.
- Return bus N feeds FX slot N. Each slot receives only the sum of lane send N.
- Every slot contains exactly one module record with a stable slot identity.
  The supported module types are `empty` and `echoform-delay`.
- A module is a black box to the host. The host provides stereo input, expects
  stereo wet-only output, supplies current project BPM, and owns power, return
  level, limiter, persistence, and disposal.
- Module parameters never leak into lane state or another slot. Editing or
  clearing one slot cannot mutate another slot.

### Empty module

Empty is an explicit saved module identity, not a missing record. It owns no
editable parameters. At the black-box module boundary it returns its input
unchanged with no latency, like every other input-to-output module. The Return
host gates Empty input to silence, so non-zero sends and return level cannot
duplicate dry audio through an empty slot.

### Container power and Clear

- Every FX container has a saved Power setting, default on.
- Turning Power off stops new input to the module. The already-generated delay
  tail remains connected and rings out through the return level and limiter.
- Turning Power on resumes new input without resetting saved module settings.
- Clear immediately replaces the module with Empty, disposes its owned graph,
  and cuts its tail. Clear does not change container Power, return level,
  limiter setting, or lane send values.
- Clear takes effect without confirmation and is one undoable project edit.
  Undo restores the prior module type and complete settings, but cannot recreate
  audio energy from the tail that Clear already cut.

### Container menu and summary

- Left-clicking a container opens its dropdown. An Empty slot offers
  `Echoform Delay...`. A configured slot offers `Echoform Delay...` and
  `Clear slot`.
- Choosing `Echoform Delay...`, or the Edit button, opens the Echoform Delay
  modal. In a configured slot it edits that slot's independent settings; in
  Empty it begins a new Echoform Delay draft.
- The closed container shows FX 1 through FX 4, Empty or Echoform Delay, Power
  state, the Mix rotary (the shared return level), limiter state, and a compact
  summary of time or division, Feedback, character, and Mix.

## Echoform Delay Module

The Echoform Delay is a stereo tempo-synced delay implemented in an
`AudioWorkletProcessor` (`echoform-delay-processor`) backed by an allocation-free
DSP core (`EchoformDelayCore`). The renderer sends the whole parameter state to
the worklet by `port.postMessage` on every change; the audio thread smooths
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
| Duck amount | 0–100% | 34% |
| Duck release | 50–2500 ms | 620 ms |
| Output level | -24 to +6 dB | -1.5 dB |
| Freeze/Hold | Off, On | Off |
| Bypass | Off, On | Off |
| Mix | 0–100% (shared FX-return level) | container-owned |

The 15 divisions are 1/1, 1/1 dotted, 1/1 triplet, 1/2, 1/2 dotted, 1/2 triplet,
1/4, 1/4 dotted, 1/4 triplet, 1/8, 1/8 dotted, 1/8 triplet, 1/16, 1/16 dotted,
1/16 triplet. A straight 1/N lasts 4/N quarter beats; dotted × 1.5; triplet ×
2/3. Left and right divisions and free times are independent. Sync divisions
stay saved while Free is active and vice versa, so switching modes restores each
mode's last values. Power (Space) toggles whether new input reaches the delay
while preserving its tail; it is distinct from the in-module Bypass.

### Signal flow

Conceptual stereo flow, all inside the module black box:

1. Copy the unprocessed input into the ducking detector.
2. Read the left and right fractional delay lines at their modulated times
   (4-point cubic interpolation; dual read-head crossfade in Digital, slewed
   read in Analog/Tape).
3. Two-pole (12 dB/oct) low-cut high-pass and high-cut low-pass **inside** the
   feedback loop, so tone accumulates across repeats.
4. Character coloration inside the loop (Digital clean, Analog mild soft
   saturation, Tape stronger asymmetric saturation with DC removed).
5. Normal-stereo or cross-coupled (ping-pong) feedback matrix, crossfaded on
   change; loop signal × Feedback; a bounded soft limiter inside the loop keeps
   over-unity feedback finite without hard-clipping ordinary repeats.
6. Add the new input unless Freeze/Hold is active.
7. The delayed taps are the wet output; apply post-loop mid/side Stereo width
   (0% mono, 100% unchanged, 200% doubled side).
8. Apply ducking gain to the wet only (soft knee, wet-only attenuation).
9. Apply Output level.

The module renders **100% wet**. The dry path is owned by the lane send/return
model, and Mix is the FX-return level (see Mix contract). Feedback maps 0–110% →
loop gain 0.0–1.10.

### Buffer allocation

Each delay line preallocates for the longest supported synchronized value
(1/1 dotted at the lowest supported BPM) plus modulation depth and interpolation
margin. The core reserves at least 10 s per line (it uses 12 s), so 1/1 dotted at
40 BPM (9 s) is always safe. No allocation happens in the render callback.

### Character

Character changes the real algorithm, not only a label:

- **Digital** — clean feedback path, click-free dual-head time changes, precise
  timing; safety limiting engages only near unsafe loop levels.
- **Analog** — mild soft saturation and gentle progressive high-frequency
  softening in the loop; smoothly slewed time changes.
- **Tape** — stronger soft saturation with mild (DC-removed) asymmetry, more
  progressive high-frequency loss, wow/flutter/drift scaled from Mod depth, and
  a tape-style time glide. Apparent loudness stays roughly matched across modes.

### Modulation

Mod rate is the LFO rate and Mod depth is the peak delay-time deviation in ms.
Left and right modulate 90° apart so the channels move differently. Depth 0
disables audible time modulation in every character (no hidden tape drift).

## Return Graph and Limiter

Each of the four return buses owns this independent graph:

```text
sum of lane sends N
  -> powered FX module N
  -> return level N
  -> safety limiter N
  -> unchanged Master input
```

- The limiter is enabled by default and its enabled/bypassed setting is saved
  per return.
- Enabled behavior is fixed: ceiling -1 dBFS, 5 ms lookahead, 100 ms release,
  and stereo-linked gain reduction. These values are not user-editable.
- Stereo linking applies one gain-reduction envelope to both channels so image
  position does not shift during limiting.
- Limiter bypass is fully off: it removes limiting and lookahead latency from
  that return instead of applying neutral parameters through the limiter.
- Return level precedes the limiter. The limiter output feeds the existing
  Master input; it does not replace or modify Song Master processing.
- Four limited Returns and the dry lanes sum at Master. That sum can exceed
  -1 dBFS, so the Return limiters are not a guarantee of safe Master level or
  hearing protection.
- The limiter owns no visible meter.

## Mix and Bypass Semantics

- **Mix is one parameter.** The FX-slot circular Mix knob and the editor Mix
  knob are the same value: the bus return level (0..1 linear → the return-gain
  node). The module always renders 100% wet, so there is no second in-DSP dry/wet
  crossfade. Updating either surface immediately updates the other, and
  automation from either surface targets the same return level. This preserves
  the established "wet-return amount" meaning of Mix for old projects.
- **Bypass** follows the FX-return contract. The in-module Bypass crossfades the
  audible return to silence while the delay loop keeps running internally
  (tail-preserving); un-bypassing reveals the still-ringing tail. It never clears
  frozen or normal delay buffers. Container Power gates input the same
  tail-preserving way.

## FX Edit Modal

### Form and layout

- The Echoform Delay editor is a centered blocking modal with a target desktop
  size of exactly 760 × 680 CSS px (width `min(760px, 100vw − 28px)`, height
  `min(680px, 100vh − 28px)`; internal scroll when smaller). The control grid
  collapses to two columns below ~720px and one column below ~500px. It is
  portaled outside the Mixer scroll surface and centered in the viewport.
- A 68 px header stays visible while the body scrolls. Left: a square "D8"
  module mark, a dynamic "FX Return NN" kicker with the real slot number, and the
  "Echoform Delay" title. Right: a Bypass toggle, a Preset selector, and a Close
  button with an accessible name.
- Below the header: a ~120 px echo-tap visualizer, a four-column control grid
  (Time spanning two columns, then Space, Feedback Tone, Modulation, Character,
  Ducking, Output), and a footer with knob help and a live module-state string
  such as `Active / Tape / Sync`.
- The editor inherits the active DAW theme through semantic tokens; the fallback
  palette (dark charcoal, warm amber accent, muted teal secondary) is complete
  when no theme override is present.

### Transaction and live audition

- Opening snapshots the complete saved slot state. Parameter changes update an
  isolated draft and audition it through the live module immediately.
- The **Close** button (and clicking Edit again does not open a duplicate)
  commits the complete draft as one undoable project edit and closes the modal.
- **Escape** cancels: it restores the opening snapshot in state and the live
  graph, discards all draft changes, and closes.
- Focus is trapped inside the modal, opens on the Bypass toggle, and returns to
  the FX container's Edit trigger after either outcome. There is no click-outside
  dismissal.
- Applying a preset updates all parameters atomically, clears Bypass, updates the
  shared Mix, and is one undoable edit. Any manual parameter change switches the
  preset selector to Custom.

### Echo-tap visualizer

- A compact tempo-grid visualizer, not a waveform, oscilloscope, or spectrum.
  Left area: tempo and mode chip. Center: a two-lane echo grid (L amber, R teal)
  with mock tap markers placed from the current delay times and feedback —
  alternating lanes in ping-pong, independent taps in normal stereo, more taps
  with more feedback, a sustained pattern under Freeze. Right: L/R time readouts
  and stereo state. Marker shape follows character (Digital squared, Analog
  round, Tape irregular). A restrained playhead scans unless bypassed or
  reduced-motion is set. It is derived entirely from parameter state (no audio
  telemetry) and has an accessible description with L/R times, feedback, and
  ping-pong state.

### Controls and keyboard contract

- Continuous controls are circular hardware-style knobs with a 270° arc and a
  value readout, plus a horizontal range for Stereo width. Knobs turn while
  dragging (pointer/touch, vertical primary with a small horizontal component),
  use Shift for fine adjustment, reset to default on double-click, and expose
  `role="slider"` with continuously updated `aria-valuemin/max/now/valuetext`
  and `aria-orientation`. Frequency and time knobs use a perceptual log skew.
- Knob keyboard: Arrow Up/Right increases one step, Arrow Down/Left decreases,
  Shift + arrow is fine, Page Up/Down move ten steps, Home/End set
  minimum/maximum. Values clamp to their documented ranges.
- Bypass, Ping-pong, Freeze/Hold, Sync/Free, and Character are real buttons with
  `aria-pressed`; Character is a single-selection group. Hidden Sync or Free
  controls are removed from the tab order.
- Tap Tempo records tap timestamps, resets after a >2000 ms gap, keeps the six
  most recent, averages ≥2 intervals to BPM clamped 40–240, flashes ~150 ms, and
  drives real delay timing through the delay's tempo ownership.
- Escape cancels the entire draft.

### Shortcut isolation and Media Session exceptions

While the modal is open, ordinary application and project hotkeys are blocked,
including transport keyboard shortcuts, save/open/new, undo/redo, deletion,
and Tracker editing commands. Operating-system Media Session actions are the
only transport exceptions:

- Previous seeks to tick 0.
- Play/Pause toggles the current transport state.
- Next seeks to song end.

These actions do not commit, cancel, reset, or change focus in the modal. Live
audition continues against the resulting transport position.

## Tail and Lifecycle Rules

- Natural song end, Stop, Pause, Jump to End, and discontinuous seek stop source
  voices and new send input but leave existing delay energy connected to ring
  out.
- Lane mute/solo gating and FX container Power off also stop new input without
  cutting an existing tail.
- Return level changes and limiter bypass changes apply live to existing tails.
- Clear cuts the selected module's tail immediately.
- Project replacement, engine close, or AudioContext close disposes all return
  graphs and cuts all tails.
- Project replacement rebuilds a Return processor even when the incoming slot
  uses the same module type; parameter updates inside one project keep the
  existing processor.
- Reopening playback reuses each current module graph without duplicate
  connections. It may intentionally overlap a tail that is still audible.

## Persistence and Validation

Spec-011 owns the wire format, now **version 6**. It saves exactly four slot
records and four limiter settings. Each slot saves its stable position, module
type, container Power, return level, and complete Echoform Delay settings when
the type is `echoform-delay`. Empty is saved explicitly. Return levels and lane
sends are owned by spec-007.

Parsing rejects:

- any slot count other than four;
- duplicate or out-of-range slot positions;
- unknown module types or unknown note divisions;
- missing settings, non-finite values, or values outside documented ranges;
- a non-boolean Power, Ping-pong, Freeze, Bypass, or limiter-enabled value; and
- delay parameter fields attached to Empty.

**Migration.** Loading a version-5 project transforms each FX module in place:

- A legacy native `delay` module upgrades to `echoform-delay`. Mode, feedback,
  ping-pong, and time carry over (a single old time seeds both L and R; the old
  note division maps onto the Echoform set or falls back to 1/4). Fields the old
  module lacked take Echoform defaults; the removed Tape Distortion field is
  dropped.
- A pre-release `opus-delay` sketch normalizes to `echoform-delay`: the dropped
  `link` and `mix` fields are removed and widened ranges are re-clamped.

Versions below 5 remain breaking and are not migrated. Version 6 is the current
format.

Return modules, Power, Return level, and limiter state live in the same project
command history as lanes. Saving a modal draft, clearing a slot, toggling Power,
changing Return level, or toggling the limiter creates one complete project edit.
Undo and Redo restore the whole bus record without a second FX state owner.
Project command-history tests cover complete Return-bus Undo and Redo, while
persistence tests cover complete bus replacement on load and New.

## Black-Box Verification Contract

Each module implementation must be testable behind the same host boundary:

- construct with stereo input/output and current BPM;
- apply a complete validated settings snapshot;
- update BPM without replacing saved settings;
- accept or gate new input independently of tail output;
- let the Return host enforce wet-only output, including silence for Empty;
- dispose every owned node and connection; and
- render deterministically in `OfflineAudioContext` for audible assertions.

Echoform Delay DSP verification runs headless against `EchoformDelayCore`:
division math (straight/dotted/triplet at several BPM), independent L/R impulse
timing, free min/max, ping-pong cross-channel routing vs normal-stereo routing,
feedback decay below 100% and bounded behavior at 100–110%, no NaN/Inf under
extreme settings, low/high-cut accumulation across repeats, width at 0/100/200%,
modulation staying in bounds and disabled at depth 0, character differences,
wet-only ducking, Freeze holding the loop while blocking input, tail-preserving
bypass, output-gain conversion, and sample-rate reinitialization. Limiter
verification uses stereo fixtures to check the -1 dBFS ceiling, lookahead,
release, stereo linking, and zero limiter latency while bypassed.

## Design Decisions

| Decision | Reason |
| --- | --- |
| Four fixed independent slots | The send/return model stays understandable and has no routing editor. |
| Modules are black boxes | New module types can share one host lifecycle without exposing internal graphs. |
| Empty is explicit and silent | Saved slot identity is deterministic and cannot leak dry send audio. |
| Echoform Delay renders 100% wet | Mix is the FX-return level, so there is no double dry/wet stage. |
| Mix is the shared return level | One source of truth for the slot knob and editor Mix; automation targets one parameter. |
| Filters and character live inside the feedback loop | Tone and saturation evolve across repeats instead of colouring only the final output. |
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
  and Return containers after the lane strips, each containing explicit Empty
  or Echoform Delay state plus its matching Mix (return level) and limiter
  controls.
- [ ] **AC-002:** Empty produces silence for non-zero sends and creates no
  audible dry path.
- [ ] **AC-003:** Echoform Delay defaults (Wide Tape Echo), ranges, the 15
  divisions, independent L/R Sync and Free retained values, feedback to 110%,
  character, ducking, freeze, and bypass roundtrip exactly as specified.
- [ ] **AC-004:** Free and sync timing respond live and independently per side,
  sync follows project BPM, and the module produces stereo 100%-wet output.
- [ ] **AC-005:** Feedback maps 0–110% → loop gain 0.0–1.10; over-unity feedback
  stays finite through the in-loop soft limiter without hard-clipping ordinary
  repeats; low/high-cut filters and character colour the loop across repeats.
- [ ] **AC-006:** Container Power off stops new input while an existing tail
  rings; Power on resumes input without resetting settings.
- [ ] **AC-007:** Clear immediately replaces the module with Empty, cuts its
  tail, and is one undoable data edit that does not change sends, return level,
  Power, or limiter setting.
- [ ] **AC-008:** Each return graph follows module -> return level (Mix) ->
  limiter -> unchanged Master, with no crossfeed or dry leakage.
- [ ] **AC-009:** Enabled limiters enforce a stereo-linked -1 dBFS ceiling with
  5 ms lookahead and 100 ms release; bypass removes limiting and its latency;
  enabled state saves independently for all four returns.
- [ ] **AC-010:** The modal renders at 760 × 680 with responsive breakpoints,
  cannot dismiss outside, traps and restores focus to the Edit trigger, commits
  on Close, and cancels on Escape; re-opening does not duplicate the modal.
- [ ] **AC-011:** Draft changes audition live; Escape restores the complete
  opening snapshot in state and audio; Close commits all draft changes as one
  undoable edit; a manual change switches the preset selector to Custom and a
  preset load is one atomic undoable edit that clears Bypass.
- [ ] **AC-012:** Every documented knob keyboard step (arrows, Shift-fine,
  Page Up/Down, Home/End), double-click reset, toggle, character selection, and
  tap-tempo works; controls expose correct `role="slider"`/`aria-pressed` and
  values to assistive technology; hidden controls leave the tab order.
- [ ] **AC-013:** The FX-slot Mix knob and editor Mix are one parameter — either
  surface updates the other and the audible wet-return level, with no second
  in-DSP crossfade.
- [ ] **AC-014:** Stop, Pause, natural end, Jump to End, seek, lane gating,
  Power, and in-module Bypass preserve tails; Clear, project replacement, and
  engine close cut them; Freeze holds the loop and blocks new input.
- [ ] **AC-015:** Version-6 parsing and roundtrip enforce exactly four complete
  valid slots and limiter records; version-5 native `delay` and sketch
  `opus-delay` modules migrate to `echoform-delay`; versions below 5 reject.
- [ ] **AC-016:** Headless DSP and Chromium offline-render tests prove division
  timing, independent L/R routing, ping-pong vs stereo feedback, in-loop
  filtering, width, modulation bounds, ducking, freeze, tail-preserving bypass,
  sample-rate reinitialization, limiter ceiling/linking/latency, slot isolation,
  and complete node cleanup.

## Non-Goals

- No per-lane insert effects or ordered effect chains.
- No Reverb, Compressor, third-party plugin, or spectrum analyzer as a module.
  (The Echoform Delay ships built-in presets and a Custom entry; it must remain
  recognizably a delay and adds no reverb or diffusion network.)
- No user-created FX slots, slot reordering, return crossfeed, or external
  routing beyond the delay's own internal feedback.
- No editable limiter ceiling, lookahead, release, linking, or metering.
- No project-format-version-4-or-earlier compatibility or insert-effect
  migration; only version 5 upgrades to version 6.
