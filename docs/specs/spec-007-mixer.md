# Spec 007 — Mixer

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** ⏳ NOT IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement the N-channel mixer: per-channel gain, pan, stereo width, mute/solo
controls, and channel routing. Default 16 channels (one per default lane),
extendable to 99. The mixer UI lives in the left control column of the Player.

## User Stories

- **US-001:** As a user, I can adjust each channel's volume with a vertical
  slider (VOL).
- **US-002:** As a user, I can adjust each channel's stereo pan position.
- **US-003:** As a user, I can mute or solo individual channels from the mixer.
- **US-004:** As a user, I see a dB meter per channel showing the current
  output level.
- **US-005:** As a user, I can add new channels (up to 99) and remove unused
  ones.
- **US-006:** As a user, I can set a global BPM from the mixer panel.

## Scope

### Mixer Panel Location

The mixer occupies the left control column (96px wide) in the Player layout,
positioned between the lane heads and the category tree:

```text
.player
  └── .browser
      ├── .mixer-col      — 96px, mixer controls
      ├── .resize-v       — vertical split handle
      ├── .category-tree
      └── .sample-list
```

The mixer column is revealed when the vertical resize handle is dragged past a
threshold (104px minimum control column width). When collapsed below the
threshold, the mixer column is hidden and only the category tree + sample list
are visible.

### Channel Strip (per channel)

Each channel strip is a vertical stack:

- **Channel label** — channel number or custom name, 9px muted text.
- **VOL slider** — vertical range input, 0–100% (maps to 0–1 gain).
- **dB meter** — vertical bar showing RMS output level, color-coded (green →
  yellow → red).
- **Pan knob** — horizontal position indicator, -1 (L) to 1 (R).
- **M button** — mute toggle, 18×18px.
- **S button** — solo toggle, 18×18px.
- **Stereo width** — optional control, 0 (mono) to 1 (full stereo), default 1.

### Channel Management

- Default: 16 channels pre-routed to 16 default lanes (1:1 mapping).
- The user can add channels (up to 99 total). New channels are not
  automatically routed to a lane — the user assigns lane routing.
- The user can remove channels. Removing a channel unmaps any lanes routed to
  it (those lanes become silent until re-routed).
- Channel reordering: channels can be dragged to reorder in the mixer.

### dB Meter

- Displays real-time RMS output level per channel.
- Updates at ~30fps — driven by an `AnalyserNode` or equivalent.
- Color zones: green (-60 to -12 dB), yellow (-12 to -3 dB), red (-3 to 0 dB).
- Peak hold: a small line marks the recent peak, decays after ~1 second.

### BPM Control

- A dedicated BPM slider in the mixer column, separate from channel strips.
- Range: 40–300 BPM.
- Current BPM displayed as a numeric label.
- Changing the BPM slider updates the engine's transport BPM immediately.
- The BPM display in the transport strip (spec-006) stays in sync.

### Routing

- Each lane (spec-006) is assigned to one mixer channel.
- Default: lane N → channel N.
- Routing can be changed per lane — multiple lanes can share one channel.
- Changing a channel's gain/pan/mute affects all lanes routed to it.

## Acceptance Criteria (testable)

- [ ] **AC-001:** 16 channel strips are visible in the mixer column, each with VOL slider, dB meter, pan knob, M and S buttons.
- [ ] **AC-002:** Dragging a channel's VOL slider changes the audio output level for that channel in real-time.
- [ ] **AC-003:** The dB meter updates during playback, showing green/yellow/red zones proportional to output level.
- [ ] **AC-004:** Clicking a channel's M button mutes that channel — all lanes routed to it go silent. The button shows active state.
- [ ] **AC-005:** Clicking a channel's S button soloes it — all other channels go silent. Clicking another channel's S transfers the solo.
- [ ] **AC-006:** The BPM slider changes the engine's BPM; the transport strip BPM display updates synchronously.
- [ ] **AC-007:** User can add a new channel (incrementing the count beyond 16).
- [ ] **AC-008:** User can remove a channel; lanes routed to it become unrouted and silent.
- [ ] **AC-009:** Dragging the vertical resize handle reveals/hides the mixer column based on the 104px threshold.
- [ ] **AC-010:** Multiple lanes can be routed to the same channel; muting that channel silences all of them.

## Non-Goals (deferred to later specs)

- No per-channel audio effects (delay, reverb, compression) — that's spec-010.
- No stereo width DSP implementation (control is present but `setWidth()` is
  a no-op until the DSP is built).
- No channel EQ or filter controls.
- No channel preset save/load.
- No automation (recording mixer movements over time).
- No channel group/link (moving one fader moves another).
- No send/return or aux buses — only insert routing.

## References

- [mixjam-webjam spec-004](../_archived/mixjam-webjam/specs/004-state-architecture/spec.md) — ChannelData shape, N-channel model, default routing.
- [mixjam-webjam architectural-suggestion-notes §3, §6](../_archived/mixjam-webjam/docs/architectural-suggestion-notes.md) — N-channel from day one, pre-built GainNode/PannerNode chains.
- [mixjam-sample-daw style-guide §4](../_archived/mixjam-sample-daw/docs/style-guide.md) — Control column layout, mixer zone.
