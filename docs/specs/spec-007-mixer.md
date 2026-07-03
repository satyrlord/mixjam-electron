# Spec 007 — Mixer

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline & Panel Layout)

## Objective

Implement the N-channel mixer: per-channel gain, pan, stereo width, mute/solo
controls, and channel routing. Default 16 channels (one per default lane),
extendable to 99. The mixer UI is hidden by default inside the lower-left Song
Controls rail and is revealed by widening that rail.

## User Stories

- **US-001:** As a user, I can adjust each channel's volume with a vertical
  slider (VOL).
- **US-002:** As a user, I can adjust each channel's stereo pan position.
- **US-003:** As a user, I can mute or solo individual channels from the mixer.
- **US-004:** As a user, I see a dB meter per channel showing the current
  output level.
- **US-005:** As a user, I can add new channels (up to 99) and remove unused
  ones.

## Scope

### Mixer Panel Location

The mixer occupies revealable space inside the lower-left Song Controls rail in
the Player layout. It is not a child of the sample browser:

```text
.player
  └── .lower-work
      ├── .song-controls-rail      — visible by default
      │   ├── .song-controls-main  — default song-level controls
      │   └── .mixer-col           — hidden by default, revealed on widen
      └── .browser-region
```

The mixer column is revealed when the Song Controls rail's right-edge reveal
seam is dragged to the right past a threshold (104px of revealed mixer width).
When collapsed below that threshold, the mixer column is hidden and only the
default Song Controls content is visible in the left rail.

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
  Note: the UI currently supports only 16 lanes (spec-006), so channels
  beyond 16 have no lanes to route to until lane add/remove UI is added.
- The user can remove channels. Removing a channel unmaps any lanes routed to
  it (those lanes become silent until re-routed).
- Channel reordering: channels can be dragged to reorder in the mixer.

### dB Meter

- Displays real-time RMS output level per channel.
- Updates at ~30fps — driven by an `AnalyserNode` or equivalent.
- Color zones: green (-60 to -12 dB), yellow (-12 to -3 dB), red (-3 to 0 dB).
- Peak hold: a small line marks the recent peak, decays after ~1 second.

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
- [ ] **AC-007:** User can add a new channel (incrementing the count beyond 16).
- [ ] **AC-008:** User can remove a channel; lanes routed to it become unrouted and silent.
- [ ] **AC-009:** Dragging the Song Controls rail's right-edge reveal seam reveals/hides the mixer column based on the 104px threshold.
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

- mixjam-webjam spec-004 — archived predecessor-project doc, not tracked in this repo — ChannelData shape, N-channel model, default routing.
- mixjam-webjam architectural-suggestion-notes §3, §6 — archived predecessor-project doc, not tracked in this repo — N-channel from day one, pre-built GainNode/PannerNode chains.
- mixjam-sample-daw style-guide §4 — archived predecessor-project doc, not tracked in this repo — Control column layout, mixer zone.
