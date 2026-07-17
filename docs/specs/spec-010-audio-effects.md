# Spec 010 — Per-Channel Audio Effects

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement per-channel insert effects: delay, reverb, and compression. Users
can chain effects in order and adjust parameters per channel.

## User Stories

- **US-001:** As a user, I can add a delay effect to a channel and adjust
  time, feedback, and wet/dry mix.
- **US-002:** As a user, I can add a reverb effect to a channel and adjust
  room size, decay, and wet/dry mix.
- **US-003:** As a user, I can add a compressor to a channel and adjust
  threshold, ratio, attack, and release.
- **US-004:** As a user, I can order effects in a chain (e.g. delay → reverb
  vs. reverb → delay).
- **US-005:** As a user, I can bypass individual effects without removing them.

## Scope

### Effect Types

**Delay:**

- Parameters: time (ms, 0–2000), feedback (0–1), wet/dry mix (0–1).
- Stereo ping-pong option (alternates L/R).
- Tempo-synced mode (time in note divisions: 1/4, 1/8, 1/16, etc.).

**Reverb:**

- Parameters: room size (0–1), decay (0–1), wet/dry mix (0–1).
- Freeverb-style algorithm (or equivalent).
- Mono input, stereo output.

**Compressor:**

- Parameters: threshold (dB, -60–0), ratio (1:1–20:1), attack (ms, 0–200),
  release (ms, 5–3000), makeup gain (dB, 0–24).
- May wrap the native `DynamicsCompressorNode` for efficiency, with custom
  parameter mapping.

### Effect Chain

- Each channel has an ordered list of effect slots (initially empty, up to 4).
- The audio signal flows: `channel input → FX1 → FX2 → FX3 → FX4 → channel output`.
- Effects can be reordered by dragging.
- Each effect has a bypass toggle.

### Effect UI

- FX is a peer in the full-width `Song | Mixer | FX | Samples` Bottom
  Workspace from spec-006. The editor is non-modal and keeps the tracker
  available while parameters change in real time.
- FX contains its own channel selector and does not depend on Mixer remaining
  visible. The selector retains the current channel across tab changes. If the
  selected channel is removed, it selects the next channel, then the previous
  channel, then shows the existing empty-mixer state.
- Each responsive mixer strip has one full-width, at-least-44px FX entry button with a
  zero-to-four count and an all-bypassed state. Channel labels select a channel
  without changing tabs; the FX button selects its channel and opens the FX tab.
- The selected channel displays an explicit left-to-right chain rail. Named
  cards expose order, selection, bypass, a drag handle, pointer drop targets,
  `Alt+ArrowLeft/Right`, and named Move left/right menu actions. Visible
  connectors reinforce the signal direction, and bypass uses explicit
  `Enabled` and `Bypassed` state text rather than an ambiguous power label.
- A described Add effect tile appends Delay, Reverb, or Compressor and becomes
  a `4 of 4 effects used` status at the slot cap.
- An empty chain combines its explanation and Add action into one centered
  surface. A no-channel state offers both Restore a channel and Open Mixer.
- Chain cards compact responsively before overflow, the selected card scrolls
  within the chain without shifting the surrounding workspace, and a themed
  edge fade plus visible scrollbar signals clipped content. Visibility and
  scroll correction run after selection and ordered-chain changes and use the
  live chain/card viewport rectangles, so reordering, padding, or nested
  offset-parent changes do not break selection tracking. Enabled uses a
  restrained outline; Bypassed remains explicit.
- The selected effect opens a spacious editor below the chain. Rotary controls
  support vertical pointer drag, mouse-wheel steps, Shift fine adjustment,
  Arrow keys, Home/End, direct numeric entry, unit-aware accessible values,
  and double-click reset. Wheel up increases and wheel down decreases by one
  configured step; a handled wheel event does not scroll the surrounding page.
  Discrete delay timing uses its existing note-division selector when tempo
  sync is enabled.
- Rotary faces are project-owned inline SVG, not an external component. Each
  face uses a fixed 270-degree range track, a high-contrast value arc, an inset
  cap, and a short pointer anchored inside that cap. The rendering is shared
  without changing the established pointer, keyboard, reset, or direct-entry
  contract.
- Every parameter carries a plain-language explanation of its audible result.
  Bypassed effects remain editable; text stays fully opaque while decorative
  card graphics and surfaces carry the subdued state. Explanatory copy
  is at least 12 px, and the interaction hint is available on hover, focus, and
  through an accessible description.
- Editable parameters share one visual surface instead of separate nested
  cards. A centered responsive grid keeps short rows balanced. Output-only
  metering is grouped separately, includes scale endpoints, uses an enlarged
  live value and 120px meter, and remains visually distinct from inputs. Every FX button, selector,
  editable value, and menu trigger has a hit target of at least 44 by 44 CSS
  pixels.
- Factory starting points are Classic Echo, Slapback, and Ping-Pong Eighths;
  Studio Room, Tight Room, and Long Hall; and Classic Control, Gentle Glue, and
  Leveler. Choosing one writes ordinary effect parameter fields. Further edits
  display `Custom`; preset identity is never stored.
- Compressor editing includes a live positive-dB gain-reduction meter read
  from its `DynamicsCompressorNode`. Bypass, silence, and missing processors
  report zero reduction; no analyser node is added.
- Reset and Remove live in a labeled actions menu. Removing an effect shows a
  six-second Undo action that restores the same id, values, and bounded chain
  position when the channel still exists and has capacity.
- Add, order, and actions menus use the shared accessible dropdown primitive.
  Rotary parameters use the same project-owned pointer-capture control as pan,
  including touch input, Shift fine adjustment, keyboard steps, and reset.
- Delay booleans retain native checkbox semantics through visually hidden
  inputs while using the project-owned switch visual and the full label target.
- Empty chains explain signal order and focus adding; an empty mixer explains
  that a channel must be restored. Removing the selected effect selects the
  next card, then the previous card, then the empty state.

### DSP Implementation

- Effects are implemented as Web Audio API node chains, not external WASM
  modules for v1.
- Delay uses `DelayNode` + feedback `GainNode`.
- Reverb uses a convolutional or Freeverb-style node graph.
- Compressor wraps `DynamicsCompressorNode` with parameter scaling.
- All effect DSP is in the engine layer — no DOM/UI imports.
- A channel keeps stable input and output nodes while its internal ordered
  effect route is rebuilt. Existing voices therefore remain connected when a
  slot changes, and every replaced processor disconnects all nodes it owns.
- Effect tails follow the **Ring Out** lifecycle. Natural song end, explicit
  Stop, Jump to End, Pause, and discontinuous seek stop source voices without
  resetting or rebuilding the current processors, so delay and reverb energy
  already in the graph decays naturally. Starting again before that decay
  completes may intentionally overlap the remaining tail; starting after
  decay reuses the same graph without replaying stale energy or adding graph
  connections. Channel removal or effect-chain replacement disposes the owned
  processors, while project replacement and engine close terminate the
  AudioContext; those graph-owning operations cut remaining tails.
- Effect chains are project-owned. Spec-011 writes each channel's complete
  ordered FX chain into the active `.mixjam` file and restores it only when
  that project is loaded. FX values are not persisted as app-level state.

## Acceptance Criteria (testable)

- [x] **AC-001:** Adding a delay effect to a channel produces audible echo. Changing time/feedback/mix changes the sound in real-time.
- [x] **AC-002:** Adding a reverb effect to a channel produces audible ambience. Changing room size/decay/mix changes the sound.
- [x] **AC-003:** Adding a compressor to a channel reduces dynamic range. Changing threshold/ratio affects the amount of compression.
- [x] **AC-004:** Bypassing an effect removes its influence on the signal; un-bypassing restores it.
- [x] **AC-005:** Reordering effects changes the sound (for example, compression before delay differs from compression after delay).
- [x] **AC-006:** Removing an effect from the chain cleans up its audio nodes — no memory leak.
- [x] **AC-007:** Effects on channel A do not affect channel B.
- [x] **AC-008:** FX occupies a non-modal, full-width peer tab in the Bottom
  Workspace. Opening FX from a mixer strip selects that channel and activates
  FX without hiding the tracker.
- [x] **AC-008a:** FX provides a labeled internal channel selector, retains its
  selection across tab changes, and handles selected-channel removal without
  requiring Mixer to remain visible.
- [x] **AC-009:** The selected channel shows the complete ordered chain with
  pointer and keyboard reordering, immediate bypass, an explained add flow,
  and an explicit four-slot status.
- [x] **AC-010:** Every continuous parameter is editable with an accessible
  rotary control, mouse-wheel steps, direct numeric input, keyboard steps,
  fine adjustment, unit-aware output, and factory reset.
- [x] **AC-011:** Built-in starting points apply existing effect fields,
  preserve effect identity and bypass, and become Custom after an edit without
  changing the persisted mixer wire format.
- [x] **AC-012:** The compressor editor reports positive gain reduction from
  the live compressor node and zero while bypassed, without analyser nodes.
- [x] **AC-013:** Removing an effect offers one six-second Undo that restores
  its snapshot and original bounded position when restoration remains valid.
- [x] **AC-014:** Effect menus implement standard dropdown focus/keyboard
  behavior, and rotary controls support pointer capture, touch, fine adjustment,
  keyboard operation, and reset through the shared control.
- [x] **AC-015:** Rotary controls use the project-owned SVG range track, value
  arc, inset cap, and anchored pointer while preserving direct entry and the
  complete interaction contract without an external rotary-control dependency.
- [x] **AC-016:** The FX chain exposes visible signal-direction connectors and
  explicit enabled/bypassed text; editable controls use one grouped surface,
  output metering is separate and scaled, explanatory copy is at least 12 px,
  and all FX interaction targets are at least 44 by 44 CSS pixels.
- [x] **AC-017:** Reordering the selected effect keeps its card visible inside
  the horizontal chain, and the compressor output meter spans two control-grid
  tracks without overflowing its editor at narrow supported widths.
- [x] **AC-018:** Every FX parameter is a label-first vertical module with its
  dial or switch, editable value, and explanatory copy on separate aligned
  rows; help text never continues inline from a value or adjacent control.
- [x] **AC-019:** Natural end, explicit Stop, and Jump to End leave the active
  effect graph connected after all source voices stop, producing measurable
  post-boundary output. Replay after decay reuses that graph without duplicate
  connections; project replacement and engine close cut remaining tails.

## Validation Evidence

- `tmp/verify-samples-fx-layout/evidence.md` records production Chromium
  geometry and screenshots for the label-first FX modules at wide and narrow
  widths in Emerald, Rack, and Soft.
- `src/renderer/src/specs/spec-010-audio-effects.test.ts` verifies DSP node
  construction, parameter mapping and bounds, real-time parameter updates,
  tempo sync, ping-pong routing, bypass restoration, ordered graph rebuilds,
  complete node cleanup, and channel isolation.
- `src/renderer/src/components/ChannelEffects.test.tsx` and
  `src/renderer/src/components/EffectsWorkspace.test.tsx`, and
  `src/renderer/src/hooks/useMixer.test.ts` verify the strip entry point,
  non-modal editor contract, presets, accessible parameter edits, removal
  recovery, four-slot cap, reduction state, project-state replacement, and
  rejection of malformed project slots.
- `tests/e2e/audio-effects.spec.ts` verifies add, edit, bypass, reorder, selected
  card visibility, narrow compressor-meter containment, and remove behavior
  against the production browser bundle.
- `tests/e2e/project-save-load.spec.ts` verifies that ordered FX chains restore
  from their project and reset for a new project.
- `tests/e2e/audio-effects-rendering.spec.ts` bundles the real DSP module into
  Chromium and uses `OfflineAudioContext` to verify a rendered delay echo,
  reverb tail, compressor gain reduction and bypass, and order-dependent output.
  It also mounts the real transport runtime and engine stack to prove Ring Out
  after natural end, explicit Stop, and Jump to End, plus clean replay through
  the existing graph. The raw 10ms post-boundary measurements are under
  `tmp/verify-fx-song-end/`.
- `tmp/verify-audio-effects/evidence.md` records the built Chromium layout
  assertions and screenshot.
- `tmp/verify-fx-workspace-redesign/evidence.md` verifies the project-owned SVG
  dial geometry, tooltip and edit interactions, 44 px hit targets, grouped
  editor hierarchy, scaled meter, signal connector, explicit bypass states,
  all-theme highlight tokens, and the 900 px layout in built Chromium.
- `tmp/verify-complete-system/evidence.md` verifies Mixer-to-FX channel
  selection, FX selector state, upper-work visibility, and FX panel geometry
  across every theme at wide and narrow viewport sizes.
- `src/renderer/src/components/PlayerView.test.tsx` and
  `tmp/verify-bottom-workspace/evidence.md` verify the full-width FX tab,
  persisted workspace selection, internal channel selection, selected-channel
  removal fallback, and the Mixer-to-FX transition.
- `src/renderer/src/hooks/useMixer.test.ts` verifies that the live compressor
  reduction reader is polled through `PlaybackEngine` and that bypassed or
  removed compressors report no stale reduction. The method is listed in
  Fallow's `usedClassMembers` because the analyzer does not trace that live
  call through the React engine ref.

## Non-Goals

- No per-lane effects (only per-channel).
- No send/return or aux bus effects — insert only.
- No effect presets save/load.
- No effect automation over time.
- No external effect plugin support (VST, JSFX, etc.).
- No spectrum analyzer or EQ visualizer.
- No side-chain compression.
