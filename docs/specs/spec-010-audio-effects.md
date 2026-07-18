# Spec 010 — Return FX Modules

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** PARTIAL — four send/return buses, Empty and Delay
modules, modal editing with live draft audition, limiter toggles, and persistence
are implemented. Unified undo integration and rendered hard-ceiling verification
remain.

**Depends on:** spec-005 (Audio Playback Engine), spec-007 (Lane-Bound Mixer)

**Related:** spec-011 (Project Save & Load)

## Objective

Define four independent, global FX modules as black boxes hosted by the four
Mixer return buses. Each fixed slot contains either an Empty module or a Delay
module. Users edit one slot in a blocking modal with live audition, while the
host owns routing, power, return level, tail lifecycle, and a per-return safety
limiter.

## User Stories

- **US-001:** I can configure each of the four return slots independently.
- **US-002:** I can audition Delay changes live, then commit or discard the
  whole edit.
- **US-003:** I can operate every modal control without a pointer.
- **US-004:** I can power a slot off without cutting its existing tail, or
  clear it when I want the tail and settings removed immediately.
- **US-005:** I can enable or bypass a fixed safety limiter on each return.

## Module Host Contract

### Fixed independent slots

- The Mixer always contains FX 1, FX 2, FX 3, and FX 4 after the Return
  section. Slots cannot be added, deleted, reordered, chained, or routed into
  one another.
- Return bus N feeds FX slot N. Each slot receives only the sum of lane send N.
- Every slot contains exactly one module record with a stable slot identity.
  The supported module types are `empty` and `delay`.
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
- Turning Power off stops new input to the module. Already-generated Delay tail
  remains connected and rings out through the return level and limiter.
- Turning Power on resumes new input without resetting saved module settings.
- Clear immediately replaces the module with Empty, disposes its owned graph,
  and cuts its tail. Clear does not change container Power, return level,
  limiter setting, or lane send values.
- Clear takes effect without confirmation and is one undoable project edit.
  Undo restores the prior module type and complete settings, but cannot recreate
  audio energy from the tail that Clear already cut.

### Container menu and summary

- Left-clicking a container opens its dropdown. An Empty slot offers
  `Delay...`. A configured slot offers `Delay...` and `Clear slot`.
- Choosing `Delay...` opens the Delay modal. In a configured slot it edits that
  slot's independent settings; in Empty it begins a new Delay draft.
- The closed container shows FX 1 through FX 4, Empty or Delay, Power state,
  and a compact summary of time or division, Feedback, Tape Distortion, and
  Ping-Pong.

## Delay Module

### Saved settings and defaults

| Setting | Range or values | Default |
| --- | --- | --- |
| Mode | Free, Sync | Free |
| Free time | 0–2000 ms | 375 ms |
| Sync division | 1/4, 1/8, 1/16, 1/8T, 1/16T | 1/8 |
| Feedback | 0–75% | 35% |
| Tape Distortion | 0–100% | 0% |
| Ping-pong | Off, On | Off |
| Power | Off, On | On |

The sync division remains saved while Free mode is active, and Free time
remains saved while Sync mode is active. Changing modes therefore restores the
last value for that mode. Power is the container setting defined above: Space
toggles whether new input reaches the Delay while preserving its tail.

### Delay graph

- Free mode maps time directly to the DelayNode from 0 to 2 seconds.
- Sync mode derives delay time from current project BPM and the saved division.
  BPM changes update the live time without changing the saved division.
- Feedback is clamped to 0–0.75 before it reaches the feedback gain.
- Ping-pong off preserves the incoming stereo field. Ping-pong on alternates
  repeats between left and right while producing a stereo wet output.
- Delay output is wet-only. The return bus provides no parallel dry path.

### Tape Distortion

Tape Distortion applies the same stereo-symmetric waveshaper after the delay tap and before
both the
wet output and feedback recirculation:

```text
delay tap -> tape waveshaper -> wet output
                          +-> feedback gain -> delay input
```

- Tape Distortion 0% is an exact identity path; it must not approximate identity with a
  near-linear curve.
- Let `a = tapeDistortion / 100` and `d = 1 + 4a`. The stereo-symmetric curve
  is `y = (1 - a)x + a * tanh(d * x) / d`. Tape Distortion blends smoothly from
  exact identity at 0% to drive factor 5 at 100%.
- The division by `d` keeps small-signal loop gain at or below unity. Combined
  with Feedback's 0.75 cap, Tape Distortion cannot turn the Delay feedback loop into a
  self-amplifying route.
- The WaveShaperNode uses `2x` oversampling.
- Tape Distortion affects both heard repeats and later feedback repeats. It never affects
  the lane's dry path.

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

## FX Edit Modal

### Transaction and live audition

- Activating an FX container opens a blocking modal for that slot. There is no
  close `X` and no click-outside dismissal.
- Opening snapshots the complete saved slot state. Parameter changes update an
  isolated draft and audition that draft through the live module immediately.
- **OK** or Enter commits the complete draft as one undoable project edit and
  closes the modal.
- **Cancel** or Escape restores the opening snapshot in state and the live
  graph, discards all draft changes, and closes the modal.
- Focus is trapped inside the modal and returns to the FX container that opened
  it after either outcome.
- The modal is portaled outside the Mixer scroll surface and centered in the
  application viewport. Mixer clipping and horizontal scroll position cannot
  move or crop it.
- The modal uses a Free/Sync segment, horizontal sliders with read-only value
  text, a Sync division dropdown, a Ping-Pong Off/On control, and Reset,
  Cancel, and OK actions. It has no typed numeric fields.

### Keyboard contract

- Tab and Shift+Tab move through modal controls without escaping the trap.
- Left/Right and Down/Up change the focused continuous control. Free time uses
  10 ms steps; Feedback and Tape Distortion use 1 percentage-point steps. Values clamp to
  their documented ranges.
- Home and End set the focused continuous control to its minimum and maximum.
- Space always toggles the edited slot's Power state. Arrow keys select
  Free/Sync, Sync division, and Ping-Pong values.
- Backspace restores the focused setting to its documented default.
- Ctrl+Backspace restores every Delay setting in the draft to its documented
  default.
- Enter activates the focused choice or button. Otherwise it commits OK.
- Escape always cancels the entire draft.

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
  voices and new send input but leave existing Delay energy connected to ring
  out.
- Lane mute/solo gating and FX container Power off also stop new input without
  cutting an existing tail.
- Return level changes and limiter bypass changes apply live to existing tails.
- Clear cuts the selected module's tail immediately.
- Project replacement, engine close, or AudioContext close disposes all return
  graphs and cuts all tails.
- Reopening playback reuses each current module graph without duplicate
  connections. It may intentionally overlap a tail that is still audible.

## Persistence and Validation

Spec-011 owns the version-4 wire format. It saves exactly four slot records and
four limiter settings. Each slot saves its stable position, module type,
container Power, and complete Delay settings when the type is Delay. Empty is
saved explicitly. Return levels and lane sends are owned by spec-007.

Parsing rejects:

- any slot count other than four;
- duplicate or out-of-range slot positions;
- unknown module types or unknown sync divisions;
- missing settings, non-finite values, or values outside documented ranges;
- a non-boolean Power or limiter-enabled value; and
- Delay parameter fields attached to Empty.

Project format version 4 is breaking. Version-3 per-channel insert effects are
not migrated, imported, or interpreted.

## Black-Box Verification Contract

Each module implementation must be testable behind the same host boundary:

- construct with stereo input/output and current BPM;
- apply a complete validated settings snapshot;
- update BPM without replacing saved settings;
- accept or gate new input independently of tail output;
- let the Return host enforce wet-only output, including silence for Empty;
- dispose every owned node and connection; and
- render deterministically in `OfflineAudioContext` for audible assertions.

Delay verification uses an impulse fixture and checks repeat timing, feedback
decay, ping-pong alternation, wet-only output, exact Tape Distortion identity at
0%, increasing harmonic content above 0%, and bounded output at Tape Distortion
100%. Limiter
verification uses stereo fixtures to check the -1 dBFS ceiling, lookahead,
release, stereo linking, and zero limiter latency while bypassed.

## Design Decisions

| Decision | Reason |
| --- | --- |
| Four fixed independent slots | The send/return model stays understandable and has no routing editor. |
| Modules are black boxes | New module types can share one host lifecycle without exposing internal graphs. |
| Empty is explicit and silent | Saved slot identity is deterministic and cannot leak dry send audio. |
| Delay output is wet-only | Dry level remains owned by the lane path. |
| Tape Distortion is inside wet and feedback paths | Saturation evolves across repeats instead of affecting only final output. |
| Power gates input but preserves tails | Bypass is musical and does not truncate ambience. |
| Clear disposes immediately | Clear has an unambiguous destructive audio result and remains undoable as data. |
| Modal edits are transactional with live audition | Users hear changes without committing partial state. |
| Fixed per-return limiter | Every return has independent protection before it reaches Master. |
| Media Session actions remain active | Hardware and operating-system transport controls keep their expected role. |

## Acceptance Criteria

- [ ] **AC-001:** The Mixer always renders exactly four independent FX
  containers after Return, each containing explicit Empty or Delay state.
- [ ] **AC-002:** Empty produces silence for non-zero sends and creates no
  audible dry path.
- [ ] **AC-003:** Delay defaults, ranges, mode-specific retained values,
  divisions, feedback cap, Tape Distortion, ping-pong, and bypass roundtrip exactly as
  specified.
- [ ] **AC-004:** Free and sync timing respond live, sync follows project BPM,
  and Delay produces stereo wet-only output.
- [ ] **AC-005:** Tape Distortion 0% is exact identity; positive Tape Distortion increases normalized
  `tanh` saturation up to drive factor 5 with `2x` oversampling in both wet and
  feedback paths, and the curve keeps the feedback loop contractive.
- [ ] **AC-006:** Container Power off stops new input while an existing tail
  rings; Power on resumes input without resetting settings.
- [ ] **AC-007:** Clear immediately replaces the module with Empty, cuts its
  tail, and is one undoable data edit that does not change sends, return level,
  Power, or limiter setting.
- [ ] **AC-008:** Each return graph follows module -> return level -> limiter ->
  unchanged Master, with no crossfeed or dry leakage.
- [ ] **AC-009:** Enabled limiters enforce a stereo-linked -1 dBFS ceiling with
  5 ms lookahead and 100 ms release; bypass removes limiting and its latency;
  enabled state saves independently for all four returns.
- [ ] **AC-010:** The modal has no close `X`, cannot dismiss outside, traps and
  restores focus, commits with OK/Enter, and cancels with Cancel/Escape.
- [ ] **AC-011:** Draft changes audition live; Cancel restores the complete
  opening snapshot in state and audio; OK commits all draft changes as one
  undoable edit.
- [ ] **AC-012:** Every documented keyboard step, toggle, default reset, global
  reset, minimum, maximum, focus, and shortcut-blocking behavior works without
  typed numeric input.
- [ ] **AC-013:** While the modal is open, ordinary application hotkeys are
  blocked but Media Session Previous, Play/Pause, and Next seek or toggle as
  specified without changing modal state.
- [ ] **AC-014:** Stop, Pause, natural end, Jump to End, seek, lane gating, and
  Power preserve tails; Clear, project replacement, and engine close cut them.
- [ ] **AC-015:** Format-version-4 parsing and roundtrip enforce exactly four
  complete valid slots and limiter records and reject version 3 without
  migration.
- [ ] **AC-016:** Offline rendered-audio tests prove Delay timing, feedback,
  ping-pong, wet-only routing, Tape Distortion behavior, limiter ceiling/linking/latency,
  tail lifecycle, slot isolation, and complete node cleanup.

## Non-Goals

- No per-lane insert effects or ordered effect chains.
- No Reverb, Compressor, third-party plugin, side-chain, automation, preset
  library, spectrum analyzer, or functional EQ.
- No user-created FX slots, slot reordering, return crossfeed, or feedback
  routing.
- No editable limiter ceiling, lookahead, release, linking, or metering.
- No project-format-version-3 compatibility or insert-effect migration.
