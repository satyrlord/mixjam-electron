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

- The lower-right workspace has `Samples` and `FX` tabs. `Samples` is the
  default on mount. The FX tab is non-modal and keeps the tracker and mixer
  available while parameters change in real time.
- Each fixed 40 px mixer strip has one 40-by-44 px FX entry button with a
  zero-to-four count and an all-bypassed state. Channel labels select a channel
  without changing tabs; the FX button selects its channel and opens the FX tab.
- The selected channel displays an explicit left-to-right chain rail. Named
  cards expose order, selection, bypass, a drag handle, pointer drop targets,
  `Alt+ArrowLeft/Right`, and named Move left/right menu actions.
- A described Add effect tile appends Delay, Reverb, or Compressor and becomes
  a `4 of 4 effects used` status at the slot cap.
- The selected effect opens a spacious editor below the chain. Rotary controls
  support vertical pointer drag, Shift fine adjustment, Arrow keys, Home/End,
  direct numeric entry, unit-aware accessible values, and double-click reset.
  Discrete delay timing uses its existing note-division selector when tempo
  sync is enabled.
- Every parameter carries a plain-language explanation of its audible result.
  Bypassed effects remain editable but are visually subdued.
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
- Effect chains are persisted with the existing mixer channel state in
  `localStorage`. Mixer state written before spec-010 migrates to an empty
  chain.

## Acceptance Criteria (testable)

- [x] **AC-001:** Adding a delay effect to a channel produces audible echo. Changing time/feedback/mix changes the sound in real-time.
- [x] **AC-002:** Adding a reverb effect to a channel produces audible ambience. Changing room size/decay/mix changes the sound.
- [x] **AC-003:** Adding a compressor to a channel reduces dynamic range. Changing threshold/ratio affects the amount of compression.
- [x] **AC-004:** Bypassing an effect removes its influence on the signal; un-bypassing restores it.
- [x] **AC-005:** Reordering effects changes the sound (for example, compression before delay differs from compression after delay).
- [x] **AC-006:** Removing an effect from the chain cleans up its audio nodes — no memory leak.
- [x] **AC-007:** Effects on channel A do not affect channel B.
- [x] **AC-008:** Samples and FX occupy non-modal tabs in the existing lower
  workspace; opening FX from a strip selects that channel without hiding the
  tracker or mixer.
- [x] **AC-009:** The selected channel shows the complete ordered chain with
  pointer and keyboard reordering, immediate bypass, an explained add flow,
  and an explicit four-slot status.
- [x] **AC-010:** Every continuous parameter is editable with an accessible
  rotary control, direct numeric input, keyboard steps, fine adjustment,
  unit-aware output, and factory reset.
- [x] **AC-011:** Built-in starting points apply existing effect fields,
  preserve effect identity and bypass, and become Custom after an edit without
  changing the persisted mixer wire format.
- [x] **AC-012:** The compressor editor reports positive gain reduction from
  the live compressor node and zero while bypassed, without analyser nodes.
- [x] **AC-013:** Removing an effect offers one six-second Undo that restores
  its snapshot and original bounded position when restoration remains valid.

## Validation Evidence

- `src/renderer/src/specs/spec-010-audio-effects.test.ts` verifies DSP node
  construction, parameter mapping and bounds, real-time parameter updates,
  tempo sync, ping-pong routing, bypass restoration, ordered graph rebuilds,
  complete node cleanup, and channel isolation.
- `src/renderer/src/components/ChannelEffects.test.tsx` and
  `src/renderer/src/components/EffectsWorkspace.test.tsx`, and
  `src/renderer/src/hooks/useMixer.test.ts` verify the strip entry point,
  non-modal editor contract, presets, accessible parameter edits, removal
  recovery, four-slot cap, reduction state, persistence, pre-effects migration,
  and rejection of malformed persisted slots.
- `tests/e2e/audio-effects.spec.ts` verifies add, edit, bypass, reorder, remove,
  and reload behavior against the production browser bundle.
- `tests/e2e/audio-effects-rendering.spec.ts` bundles the real DSP module into
  Chromium and uses `OfflineAudioContext` to verify a rendered delay echo,
  reverb tail, compressor gain reduction and bypass, and order-dependent output.
- `tmp/verify-audio-effects/evidence.md` records the built Chromium layout
  assertions and screenshot.

## Non-Goals

- No per-lane effects (only per-channel).
- No send/return or aux bus effects — insert only.
- No effect presets save/load.
- No effect automation over time.
- No external effect plugin support (VST, JSFX, etc.).
- No spectrum analyzer or EQ visualizer.
- No side-chain compression.
