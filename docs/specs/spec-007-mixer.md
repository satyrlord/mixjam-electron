# Spec 007 — Mixer

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED (including 2026-07-07 amendments)
**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline & Panel Layout)

## Objective

Implement the N-channel mixer: per-channel gain, pan, mute/solo controls, and
hardcoded 1:1 lane-to-channel routing. Default 16 channels, capped at 16 for
this spec. The mixer UI lives inside the lower-left Song Controls rail, is
visible by default (amended 2026-07-07 — originally hidden behind the drag
seam), and is hidden by dragging the left-column seam (which carries a
visible grip handle) below the reveal threshold; the dragged width persists.

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

The mixer occupies space inside the lower-left Song Controls rail in the
Player layout. The entire left column (shared by RecentProjectsRail and
SongControlsRail) resizes via a drag seam on its right edge and defaults to
420px (amended 2026-07-07 — originally 168px, which kept the mixer entirely
off-screen). The mixer column appears inside SongControlsRail to the right of
SongControlsMain when the left column exceeds 272px (168px master section +
104px threshold); below that width the mixer is hidden (there is no separate
toggle — decision 32 replaced it with the drag seam):

```text
SongControlsRail (flex row, overflow: hidden)
├── SongControlsMain   — 168px fixed width, master vol + dB meter
└── MixerColumn        — visible when left-col-w > 272px
    └── ChannelStrip × N  — 40px each, horizontal scroll when clipped
```

The resize seam updates a CSS custom property `--left-col-w` on the grid
container during drag (no React re-renders until mouseup). The strip row
(`.mixer-strips`) scrolls horizontally (`overflow-x: auto`, thin themed
scrollbar) so every strip stays reachable at any column width (amended
2026-07-07 — originally `overflow: hidden` with no scroll, which made strips
past the fold unreachable and let keyboard focus force-scroll the clipped
container).

**Hiding the mixer (user request, 2026-07-07, revised same day):** the left
column resize seam carries an always-visible grip handle (pill bar with three
dots, centered vertically) so it reads as draggable. Dragging the seam below
the 272px threshold hides the mixer completely; the dragged width persists in
localStorage (`mixjam-left-col-w`) and is re-applied on mount, so a hidden
mixer stays hidden across reloads. An earlier revision used a "Mixer" toggle
button in the SongControlsMain header; the user asked for it to be removed in
favor of the discoverable seam (decision 32 supersedes 23).

When the upper Recent Projects rail is collapsed, it collapses horizontally to
a narrow tab and the tracker region expands across the full top row. This
preserves full Song Controls + Mixer width in the lower-left rail while
maximizing tracker editing surface above.

### Channel Strip (per channel)

Each channel strip is 40px wide and a vertical stack:

- **Channel label** — channel number, 9px muted text. Stable
  `channelIndex + 1`, used for both the visible label and all aria-labels
  (amended 2026-07-07 — originally positional and renumbered on removal, which
  made the visible label disagree with the aria-label and hid the fixed
  lane N → channel N routing).
- **Remove button (x)** — revealed on strip hover and on `:focus-visible`
  (amended 2026-07-07 — originally hover-only, leaving keyboard focus on an
  invisible control). Removes the channel immediately; no confirmation needed
  because removal is reversible via restore (see Channel Management).
  Remaining strips shift to fill the gap and keep their stable labels, so
  numbering gaps mark removed channels.
- **VOL slider** — vertical range input, 0–100% (maps to 0–1 gain). Shows its
  value while dragging and marks unity (100%) with a tick (amended
  2026-07-07 — channels previously had no value feedback while the master
  slider showed one).
- **dB meter** — CSS-rendered vertical bar overlaid on the VOL slider
  background. Fill height set via style prop as a percentage mapped from dB.
  Color zones via CSS custom properties (--meter-green, --meter-yellow,
  --meter-red): green (-60 to -12 dB), yellow (-12 to
  -3 dB), red (-3 to 0 dB). Peak hold line is an absolute-positioned div with
  CSS transition decay.
- **Pan knob** — channel-level horizontal position, -1 (L) to 1 (R).
  Independent from the lane-head pan knob (see Design Decisions).
  - **Right-click cycle (user request, 2026-07-07):** right-click steps a
    three-position cycle and suppresses the context menu. From any
    freely-dragged position the first right-click resets to C (0); from C it
    sets 100% R (+1); from 100% R it sets 100% L (-1); from 100% L it returns
    to C. Repeated right-clicks therefore cycle C → R → L → C.
  - **Keyboard (2026-07-07):** the knob is focusable (`tabIndex 0`);
    ArrowLeft/ArrowRight adjust pan by 0.05 (clamped to [-1, 1]);
    `aria-valuetext` announces the position ("Center", "40% left",
    "100% right"). Previously the knob had `role="slider"` but no tabindex or
    key handling — announced but unusable without a mouse.
- **M button** — mute toggle, 16×16px. The active fill must meet 3:1 non-text
  contrast against the inactive pill, and a muted channel's strip dims as a
  whole (amended 2026-07-07 — accent-on-pill fill measured ~2:1 in the
  Emerald theme and was nearly indistinguishable, while solo-active was
  clearly visible).
- **S button** — solo toggle, 16×16px.
  M and S buttons sit side-by-side (16px each + gap, fits within 40px strip).

No stereo width control — deferred until DSP is implemented (spec-010).

### Channel Management

- Default: 16 channels, hardcoded 1:1 lane-to-channel routing.
- Channel count is **capped at 16** for spec 007. Adding channels beyond 16 is
  deferred to spec-017 (no routing UI exists to assign lanes to new channels).
- The user can remove channels. Removing channel N unmaps lane N. Remaining
  channel strips shift visually to fill the gap and keep their stable labels
  (amended 2026-07-07 — labels no longer renumber; see Channel Strip).
  Internal engine routing indices remain stable so the audio graph is not
  rebuilt on removal.
- **Restore removed channels (2026-07-07):** a restore affordance in the mixer
  column re-adds the lowest removed `channelIndex` with default state
  (gain 0.8 — the createDefaultChannels default, pan 0, unmuted, unsoloed)
  and re-routes lane N from the master bypass back
  to channel N. Restore is add-back of a removed default channel, not
  add-new — the 16-channel cap and the spec-017 deferral of add-channel are
  unchanged. This makes removal reversible; before this, removal was permanent
  across reloads behind a 14px hover-only target.
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
| --- | --- | --- |
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

Decisions 7 (no horizontal scroll), 14 (hover-only remove, no restore), and
17 (`overflow: hidden` on the strip row) are SUPERSEDED by the 2026-07-07
amendments below.

## Amendments (2026-07-07 — design critique session)

Source: live design critique of the running app (screenshots at default and
widened layouts, Emerald theme) accepted by the user, plus two user-requested
behaviors. Status: IMPLEMENTED (verified live against the production bundle
on 2026-07-07; meter-red contrast validated ≥3:1 in all 8 bundled themes).

| # | Decision | Rationale |
| --- | --- | --- |
| 21 | Default `--left-col-w` raised to 420px | At the 168px default the mixer was invisible and undiscoverable — the only reveal was dragging an unmarked 4px seam |
| 22 | `.mixer-strips` scrolls horizontally (`overflow-x: auto`, thin scrollbar) | 16 strips need 640px; hidden strips were unreachable, focus force-scrolled the clipped rail (supersedes 7, 17) |
| 23 | Persisted mixer hide toggle in SongControlsMain | User request: hide the mixer completely on demand, independent of column width |
| 24 | Removed channels restorable (add-back, not add-new) | Removal was permanent across reloads; restore re-adds the lowest removed `channelIndex` at default state; 16 cap intact |
| 25 | Remove button revealed on `:focus-visible` too | Keyboard focus landed on an invisible control (supersedes 14 in part) |
| 26 | Stable channel labels (`channelIndex + 1`), no renumbering | Visible label and aria-label disagreed after a removal; stable numbers match the fixed lane N → channel N routing |
| 27 | Pan knob right-click cycles C → 100% R → 100% L → C | User request; context menu suppressed; replaces the critique's double-click-reset suggestion |
| 28 | Pan knob keyboard-operable (tabIndex, arrow keys, `aria-valuetext`) | `role="slider"` without focus or key handling was announced but unusable |
| 29 | Mute-active fill at ≥3:1 contrast; muted strip dims | Accent-on-pill measured ~2:1 in Emerald — the more common action had the weaker signal |
| 30 | Fader value readout while dragging + unity tick | Channels gave no value feedback; the master slider did |
| 31 | Master meter relabeled "Output Level" | "dB Loudness" read like a slider control name, not a meter |
| 32 | Hide via seam drag with visible grip; persisted width; no toggle button | User request: grip makes drag-to-hide discoverable; persisted width keeps it hidden across reloads (supersedes 23) |

Deliberately NOT adopted from the critique: enlarged M/S touch targets
(deferred — the 40px strip is a load-bearing density decision; revisit if
touch support becomes a goal) and double-click pan reset (superseded by the
right-click cycle).

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

`handleSetLanePan` writes `LaneState.pan` and calls `player.setLanePan()`,
which updates the per-lane persistent panner directly so live knob changes
affect already-sounding voices. `pan` travels through `EngineLane` /
`toEngineLanes`, and the lane panner sits before `channel.input` in the audio
chain (see Lane / Channel Pan Independence).

### Resize seam

The grid is `.tracker-view` with `grid-template-columns: 168px minmax(0, 1fr)`.
Swapping to `var(--left-col-w, 168px)` is safe — custom properties are valid in
track lists. The `168px` values inside column 2 (`.tracker-ruler-spacer`,
`LANE_HEAD_WIDTH_PX` inline widths) must NOT adopt the variable; they are
ruler-alignment constants per spec-006. Setting `--left-col-w` imperatively via
`element.style.setProperty` during drag survives React re-renders because the
JSX `style` prop does NOT include `--left-col-w`; React's style diffing only
touches keys present in the JSX `style` prop, leaving the imperative value
intact. The CSS fallback (`var(--left-col-w, 168px)`) provides the initial
width; the 2026-07-07 amendment raises this fallback to 420px (the drag
handler's 168px minimum clamp is unchanged — users may still narrow the
column below the mixer threshold).

## Acceptance Criteria (testable)

- [x] **AC-001:** 16 channel strips (40px each) are visible in the mixer column, each with VOL slider, dB meter, pan knob, M and S buttons.
- [x] **AC-002:** Dragging a channel's VOL slider changes the audio output level for that channel in real-time.
- [x] **AC-003:** The dB meter updates during playback, showing green/yellow/red zones proportional to output level, with a decaying peak hold line.
- [x] **AC-004:** Clicking a channel's M button mutes that channel — lane N (hardcoded route) goes silent. The button shows active state.
- [x] **AC-005:** Clicking a channel's S button soloes it — all other channels go silent. Clicking another channel's S transfers the solo.
- [x] **AC-006:** Lane-level mute/solo and channel-level mute/solo are independent ANDed gates. A lane is audible only when both its own mute AND its channel's mute are off, and it passes both solo filters.
- [x] **AC-008:** User can remove a channel via hover-revealed x button; the corresponding lane is re-routed to the master bypass bus
  (audible at unity gain with lane pan applied). Remaining strips shift down and display labels renumber. *(Label renumbering superseded by AC-020; hover-only reveal superseded by AC-019.)*
- [x] **AC-009:** Dragging the left-column right-edge resize seam past 272px (168px + 104px threshold) reveals the mixer column. Dragging below 272px hides it.
  *("No horizontal scrollbar" superseded by AC-015.)*
- [x] **AC-011:** Channel state (gain, pan, mute, solo) persists across page refreshes via localStorage.
- [x] **AC-012:** The lane-head pan knob and mixer-strip pan knob control independent values (lane pan and channel pan respectively); both are applied in the audio chain.
- [x] **AC-013:** Removing all channels leaves all 16 lanes routed to the master bypass bus; all lanes remain audible. The mixer column shows no channel strips.

### 2026-07-07 amendments

- [x] **AC-014:** On first entry to the Player, the left column is 420px wide and the mixer column is visible without any seam drag.
- [x] **AC-015:** All 16 channel strips are reachable by horizontal scroll at any column width above the 272px threshold; keyboard-tabbing through strips scrolls them into view
  without clipping the master section.
- [x] **AC-016:** The left-column resize seam shows an always-visible grip handle; dragging it below 272px hides the mixer completely; the dragged width persists across
  page refresh so a hidden mixer stays hidden. *(Revised 2026-07-07: originally a "Mixer" toggle button, removed at user request — decision 32.)*
- [x] **AC-017:** A restore affordance re-adds the lowest removed channel at default state (gain 0.8, pan 0, unmuted, unsoloed) and re-routes its lane from the master bypass
  back to the channel. It is disabled/absent when no channel is removed.
- [x] **AC-018:** Right-clicking a pan knob never shows a context menu and steps the cycle: any freely-dragged position → C; C → 100% R; 100% R → 100% L; 100% L → C.
- [x] **AC-019:** The remove button is visible when its strip is hovered AND when the button has keyboard focus (`:focus-visible`).
- [x] **AC-020:** Channel labels are stable `channelIndex + 1` for both the visible label and every aria-label; after removing a middle channel the numbering shows a gap instead of renumbering.
- [x] **AC-021:** The pan knob is reachable with Tab; ArrowLeft/ArrowRight change pan by 0.05 clamped to [-1, 1]; `aria-valuetext` reflects the position.
- [x] **AC-022:** The mute-active button fill measures at least 3:1 contrast against the inactive button in every bundled theme, and a muted channel's strip is visibly dimmed.
- [x] **AC-023:** A channel fader shows its percentage value while dragging and renders a unity (100%) tick mark.
- [x] **AC-024:** The master meter label reads "Output Level".

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
