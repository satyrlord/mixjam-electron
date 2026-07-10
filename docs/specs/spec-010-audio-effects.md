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

- Each effect slot shows: effect type icon, name, bypass button, remove button.
- Clicking an effect slot opens a parameter panel with knobs/sliders for that
  effect's parameters.
- Adding an effect: dropdown or "+" button to select effect type.
- The effect chain UI lives in the mixer column (spec-007), below the channel
  strips, or in an expandable per-channel panel.
- The fixed 40 px channel-strip width from spec-007 is preserved. Compact slots
  show a type glyph and accessible name; selecting a slot opens its named
  parameter panel with bypass, reorder, and remove actions.

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

## Validation Evidence

- `src/renderer/src/specs/spec-010-audio-effects.test.ts` verifies DSP node
  construction, parameter mapping and bounds, real-time parameter updates,
  tempo sync, ping-pong routing, bypass restoration, ordered graph rebuilds,
  complete node cleanup, and channel isolation.
- `src/renderer/src/components/ChannelEffects.test.tsx` and
  `src/renderer/src/hooks/useMixer.test.ts` verify the editor contract, the
  four-slot cap, state mutation, persistence, pre-effects state migration, and
  rejection of malformed persisted effect slots.
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
