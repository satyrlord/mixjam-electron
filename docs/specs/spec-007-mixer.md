# Spec 007 — Mixer

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline & Panel Layout)

## Objective

Implement the N-channel mixer: per-channel gain, pan, mute/solo controls, and
hardcoded 1:1 lane-to-channel routing. Default 16 channels, capped at 16 for
this spec. The mixer UI is hidden by default inside the lower-left Song
Controls rail and is revealed by widening the entire left column via a drag
seam.

## User Stories

- **US-001:** As a user, I can adjust each channel's volume with a vertical
  slider (VOL).
- **US-002:** As a user, I can adjust each channel's stereo pan position.
- **US-003:** As a user, I can mute or solo individual channels from the mixer.
- **US-004:** As a user, I see a dB meter per channel showing the current
  output level.
- **US-005:** As a user, I can remove unused channels (down to a minimum of 1).

## Scope

### Mixer Panel Location

The mixer occupies revealable space inside the lower-left Song Controls rail in
the Player layout. The entire left column (shared by RecentProjectsRail and
SongControlsRail) widens via a drag seam on its right edge. The mixer column
appears inside SongControlsRail to the right of SongControlsMain when the left
column exceeds 272px (168px default + 104px threshold):

```text
SongControlsRail (flex row, overflow: hidden)
├── SongControlsMain   — 168px fixed width, master vol + dB meter
└── MixerColumn        — visible when left-col-w > 272px
    └── ChannelStrip × N  — 40px each, no horizontal scroll
```

The resize seam updates a CSS custom property `--left-col-w` on the grid
container during drag (no React re-renders until mouseup). The mixer column is
`overflow: hidden` — users reveal more strips by widening the column, not by
scrolling.

When the upper Recent Projects rail is collapsed, it collapses horizontally to
a narrow tab and the tracker region expands across the full top row. This
preserves full Song Controls + Mixer width in the lower-left rail while
maximizing tracker editing surface above.

### Channel Strip (per channel)

Each channel strip is 40px wide and a vertical stack:

- **Channel label** — channel number, 9px muted text.
- **Remove button (x)** — hover-revealed at top-right of strip. Removes the
  channel immediately (no confirmation). Strips above shift down visually to
  fill the gap (display labels renumber).
- **VOL slider** — vertical range input, 0–100% (maps to 0–1 gain).
- **dB meter** — CSS-rendered vertical bar overlaid on the VOL slider
  background. Fill height set via style prop as a percentage mapped from dB.
  Color zones via CSS custom properties (--meter-green, --meter-yellow,
  --meter-red): green (-60 to -12 dB), yellow (-12 to
  -3 dB), red (-3 to 0 dB). Peak hold line is an absolute-positioned div with
  CSS transition decay.
- **Pan knob** — channel-level horizontal position, -1 (L) to 1 (R).
  Independent from the lane-head pan knob (see Design Decisions).
- **M button** — mute toggle, 16×16px.
- **S button** — solo toggle, 16×16px.
  M and S buttons sit side-by-side (16px each + gap, fits within 40px strip).

No stereo width control — deferred until DSP is implemented (spec-010).

### Channel Management

- Default: 16 channels, hardcoded 1:1 lane-to-channel routing.
- Channel count is **capped at 16** for spec 007. Adding channels beyond 16 is
  deferred to spec-017 (no routing UI exists to assign lanes to new channels).
- The user can remove channels. Removing channel N unmaps lane N. Remaining
  channel strips shift down visually to fill the gap and display labels
  renumber (the strip formerly labeled N+1 becomes N). Internal engine routing
  indices remain stable so the audio graph is not rebuilt on removal.
- **Orphan lane routing:** When a channel is removed and a lane becomes
  unrouted, that lane's audio is routed to a **master bypass bus** — a direct
  path to the master output that skips the mixer channel strip entirely. The
  lane is audible at unity gain with no channel processing applied. This
  prevents accidental data loss (removing a channel does not silence the
  lane's clips).
- Channel reordering is deferred to spec-017 (confusing without visible routing
  indicators).

### dB Meter

- Displays real-time RMS output level per channel.
- **Audio source:** One `AnalyserNode` per channel, inserted after the channel's
  output `StereoPannerNode` and before the master bus. `fftSize` 256.
- **Update loop:** Single `requestAnimationFrame` loop reads all 16 analysers,
  computes RMS (`20 * log10(rms)`), clamps to [-60, 0] dB, updates peak hold,
  and calls `setState` once per frame with batched values.
- **Peak hold:** Tracks the maximum recent RMS. Decays at ~30 dB/s when no new
  peak exceeds it. Rendered as a 2px CSS-positioned line.
- Color zones: green (-60 to -12 dB), yellow (-12 to -3 dB), red (-3 to 0 dB).

### Routing

- Hardcoded 1:1 for spec 007: lane N → channel N.
- Lane-to-channel reassignment and multi-lane routing are deferred to spec-017.
- AC-010 (multiple lanes sharing one channel) is deferred.

### Lane / Channel Pan Independence

Lane-level pan and channel-level pan are independent values, both applied in
the audio chain. Lane pan uses a **per-lane persistent `StereoPannerNode`**
(one per lane, created lazily like `channelFor`, re-used across voices) so
live knob updates affect already-sounding voices and the pattern mirrors the
existing `channelPans` replay logic.

Normal routing (lane routed to a channel):

```text
Voice → lanePanner (lane pan) → channel.input (GainNode) → channel.output (StereoPannerNode, channel pan) → analyser → master
```

Orphan lane routing (channel removed, lane routed to master bypass):

```text
Voice → lanePanner (lane pan) → masterBypass (GainNode, unity) → master
```

The `masterBypass` node sits outside the channel strip chain — it feeds the
master bus directly, before the master gain. Orphan lanes are audible at unity
gain with lane pan applied but no channel gain/pan/mute/solo processing.

The lane-head pan knob controls `LaneState.pan`. The mixer strip pan knob
controls `ChannelState.pan`. Both are applied when a lane is routed through a
channel. Mute/Solo gates are independent and ANDed: a lane is audible only when
it passes its own lane-level mute/solo AND (if routed to a channel) its
channel's mute/solo.

## Design Decisions (from grilling session 2026-07-03)

| # | Decision | Rationale |
|---|---|---|
| 1 | Channel and lane state coexist | Lane M/S = arrangement tool; Channel M/S/gain/pan = mixing layer |
| 2 | `Map<number, ChannelState>` in `useMixer()` hook | Clean separation from transport engine; dedicated hook |
| 3 | Lane/channel mute-solo are independent ANDed gates | Solo a pattern OR solo an instrument; both filters apply |
| 4 | Per-channel `AnalyserNode` | Accurate, efficient for 16 channels, no switching artifacts |
| 5 | Widen entire left column (Option A) | Simple grid resize; shared column gets wider for both rails |
| 6 | `useMixer(playerRef)` receives player ref as param | Clean DI; Player gets channel state via callback ref |
| 7 | 40px strip width, no horizontal scroll | Fits M/S side-by-side; reveal more by widening column |
| 8 | Hardcoded 1:1 routing, deferred to spec-017 | No routing UI yet; adding channels beyond 16 is useless without it |
| 9 | Cap at 16 channels, include remove, defer add | Remove is useful now; add-channel has no value without routing |
| 10 | Channel reordering deferred to spec-017 | Confusing without visible routing indicators |
| 11 | CSS-rendered dB meters | GPU-composited, simple height-% + solid fill via CSS custom properties, peak hold via CSS transition |
| 12 | Stereo width control skipped | No-op control is misleading; add with DSP in spec-010 |
| 13 | Channel state persisted to localStorage | Survives page refresh; serialized as JSON array on change |
| 14 | Hover-reveal × button for channel removal | Compact, discoverable, no confirmation needed |
| 15 | CSS custom property for resize seam | DOM-only update during drag, no React re-renders until mouseup |
| 16 | Lane pan ≠ channel pan (independent) | Two StereoPannerNodes in audio chain; both values matter |
| 17 | `overflow: hidden` on mixer column | No scrollbar; user widens column to see more strips |
| 18 | Single rAF meter loop, batch `setState` | One React render per frame; peak hold decay ~30 dB/s |
| 19 | Master bypass bus for orphan lanes | Removing a channel routes its lane to a unity-gain bypass; no data loss |
| 20 | Per-lane persistent panner for lane pan | One `StereoPannerNode` per lane, reused across voices; live knob updates work for free |

## Implementation Notes (verified against current codebase)

### Hook composition

`useAppState` calls `useLibraryData` then `useTransportEngine` unconditionally;
adding `useMixer(playerRef)` after them keeps hook order stable. `playerRef`
must be added to `useTransportEngine`'s return value — refs are stable across
renders so this does not break memoization. `useMixer` keys its apply-to-player
effect on `view` (returned by the engine) since `playerRef.current` mutating
does not trigger renders. On teardown, cleanup runs in call order; the mixer
cleanup runs before `player.close()` and must null-check the ref.

### Lane pan plumbing

Currently `handleSetLanePan` writes `LaneState.pan` AND calls
`player.setChannelPan()` — aliasing lane pan onto the channel's panner. Once
the mixer owns channel pan, that second call must be removed. Required
plumbing: add `pan` to `EngineLane` and `LaneTrigger` (currently dropped in
`toEngineLanes`), then insert the per-lane persistent panner before
`channel.input` in `triggerLane` / `triggerVoice`.

### Resize seam

The grid is `.tracker-view` with `grid-template-columns: 168px minmax(0, 1fr)`.
Swapping to `var(--left-col-w, 168px)` is safe — custom properties are valid in
track lists. The `168px` values inside column 2 (`.tracker-ruler-spacer`,
`LANE_HEAD_WIDTH_PX` inline widths) must NOT adopt the variable; they are
ruler-alignment constants per spec-006. Setting `--left-col-w` imperatively via
`element.style.setProperty` during drag survives React re-renders because the
JSX `style` prop does NOT include `--left-col-w`; React's style diffing only
touches keys present in the JSX `style` prop, leaving the imperative value
intact. The CSS fallback (`var(--left-col-w, 168px)`) provides the initial width.

## Acceptance Criteria (testable)

- [x] **AC-001:** 16 channel strips (40px each) are visible in the mixer column, each with VOL slider, dB meter, pan knob, M and S buttons.
- [x] **AC-002:** Dragging a channel's VOL slider changes the audio output level for that channel in real-time.
- [x] **AC-003:** The dB meter updates during playback, showing green/yellow/red zones proportional to output level, with a decaying peak hold line.
- [x] **AC-004:** Clicking a channel's M button mutes that channel — lane N (hardcoded route) goes silent. The button shows active state.
- [x] **AC-005:** Clicking a channel's S button soloes it — all other channels go silent. Clicking another channel's S transfers the solo.
- [x] **AC-006:** Lane-level mute/solo and channel-level mute/solo are independent ANDed gates. A lane is audible only when both its own mute AND its channel's mute are off, and it passes both solo filters.
- [x] **AC-008:** User can remove a channel via hover-revealed x button; the corresponding lane is re-routed to the master bypass bus
  (audible at unity gain with lane pan applied). Remaining strips shift down and display labels renumber.
- [x] **AC-009:** Dragging the left-column right-edge resize seam past 272px (168px + 104px threshold) reveals the mixer column. Dragging below 272px hides it. The column has no horizontal scrollbar.
- [x] **AC-011:** Channel state (gain, pan, mute, solo) persists across page refreshes via localStorage.
- [x] **AC-012:** The lane-head pan knob and mixer-strip pan knob control independent values (lane pan and channel pan respectively); both are applied in the audio chain.
- [x] **AC-013:** Removing all channels leaves all 16 lanes routed to the master bypass bus; all lanes remain audible. The mixer column shows no channel strips.

## Non-Goals (deferred to later specs)

- No per-channel audio effects (delay, reverb, compression) — spec-010.
- No stereo width control or DSP — spec-010.
- No channel EQ or filter controls.
- No channel preset save/load.
- No automation (recording mixer movements over time).
- No channel group/link (moving one fader moves another).
- No send/return or aux buses — only insert routing.
- No lane-to-channel routing UI (assignment, multi-lane routing) — spec-017.
- No add-channel beyond 16 — spec-017.
- No channel drag-to-reorder — spec-017.

## References

- spec-017 — Mixer Channel Routing & Per-Channel FX (deferred routing, add-channel, reordering)
- mixjam-webjam spec-004 — archived predecessor-project doc, not tracked in this repo — ChannelData shape, N-channel model, default routing.
- mixjam-webjam architectural-suggestion-notes §3, §6 — archived predecessor-project doc, not tracked in this repo — N-channel from day one, pre-built GainNode/PannerNode chains.
- mixjam-sample-daw style-guide §4 — archived predecessor-project doc, not tracked in this repo — Control column layout, mixer zone.
