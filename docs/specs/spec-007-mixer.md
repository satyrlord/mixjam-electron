# Spec 007 — Mixer

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline & Panel Layout)

## Objective

Implement the N-channel mixer: per-channel gain, pan, mute/solo controls, and
hardcoded 1:1 lane-to-channel routing. Default 16 channels, capped at 16 for
this spec. The mixer UI occupies the full-width Mixer panel in the Bottom
Workspace from spec-006 and remains reachable through its peer tab.

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

The mixer occupies the full-width Mixer panel in the Bottom Workspace. It does
not share space with Song and does not depend on the upper work band's column
width:

```text
BottomWorkspacePanel (Mixer active)
└── MixerColumn
    └── ChannelStrip × N — horizontal scroll only when the viewport is narrow
```

The strip row (`.mixer-strips`) uses the available panel width and scrolls
horizontally (`overflow-x: auto`, thin themed scrollbar) only when every strip
cannot fit. Mixer state remains mounted when another Bottom Workspace tab is
active. The upper MixJam Browser's resize/collapse behavior does not change the
Mixer panel width.

### Channel Strip (per channel)

Each channel strip is a responsive 96-124px vertical stack. Strips share the
available width before the row enables horizontal scrolling:

- **Channel label** — channel number, 13px muted text in a 44px target. Its
  selection button takes its accessible name from that visible label; related
  control labels use the same stable `channelIndex + 1` so numbering reflects
  the fixed lane N → channel N routing.
- **Remove button (x)** — always visible as a 44px target and removes the
  channel immediately. No confirmation is needed
  because removal is reversible via restore (see Channel Management).
  Remaining strips shift to fill the gap and keep their stable labels, so
  numbering gaps mark removed channels.
- **VOL slider** — vertical range input, 0–100% (maps to 0–1 gain). Shows its
  value while dragging and marks unity (100%) with a tick.
- **dB meter** — CSS-rendered vertical bar overlaid on the VOL slider
  background. Fill height set via style prop as a percentage mapped from dB.
  Color zones via CSS custom properties (--meter-green, --meter-yellow,
  --meter-red): green (-60 to -12 dB), yellow (-12 to
  -3 dB), red (-3 to 0 dB). Peak hold line is an absolute-positioned div with
  CSS transition decay.
- **Pan knob** — channel-level horizontal position, -1 (L) to 1 (R).
  Independent from the lane-head pan knob (see Design Decisions).
  - **Right-click cycle:** right-click steps a
    three-position cycle and suppresses the context menu. From any
    freely-dragged position the first right-click resets to C (0); from C it
    sets 100% R (+1); from 100% R it sets 100% L (-1); from 100% L it returns
    to C. Repeated right-clicks therefore cycle C → R → L → C.
  - **Keyboard:** the knob is focusable (`tabIndex 0`);
    ArrowLeft/ArrowRight adjust pan by 0.05 (clamped to [-1, 1]);
    `aria-valuetext` announces the position ("Center", "40% left",
    "100% right").
  - **Mouse wheel:** wheel up increases pan and wheel down decreases pan by
    0.05. Hold Shift for fine adjustment. A handled wheel event does not
    scroll the surrounding page.
- **M button** — mute toggle, at least 44×44px. The active fill must meet 3:1 non-text
  contrast against the inactive pill, and a muted channel's strip dims as a
  whole.
- **S button** — solo toggle, at least 44×44px.
  M and S buttons share the full responsive strip width.

Stereo width is out of scope.

### Channel Management

- Default: 16 channels, hardcoded 1:1 lane-to-channel routing.
- Channel count is **capped at 16** for spec 007. Adding channels beyond 16 is
  deferred to spec-017 (no routing UI exists to assign lanes to new channels).
- The user can remove channels. Removing channel N unmaps lane N. Remaining
  channel strips shift visually to fill the gap and keep their stable labels
  (see Channel Strip).
  Internal engine routing indices remain stable so the audio graph is not
  rebuilt on removal.
- **Restore removed channels:** a restore affordance in the mixer
  column re-adds the lowest removed `channelIndex` with default state
  (gain 0.8 — the createDefaultChannels default, pan 0, unmuted, unsoloed)
  and re-routes lane N from the master bypass back
  to channel N. Restore is add-back of a removed default channel, not
  add-new — the 16-channel cap and the spec-017 deferral of add-channel are
  unchanged.
- **Orphan lane routing:** When a channel is removed and a lane becomes
  unrouted, that lane's audio is routed to a **master bypass bus** — a direct
  path to the master output that skips the mixer channel strip entirely. The
  lane is audible at unity gain with no channel processing applied. This
  prevents accidental data loss (removing a channel does not silence the
  lane's placements).
- Channel reordering is deferred to spec-017 (confusing without visible routing
  indicators).

### dB Meter

- Displays real-time RMS output level per channel.
- Channel values and peak hold remain RMS dBFS. Standards-based LUFS and true
  peak processing belongs only to the post-master Output Level meter in the
  Song panel; no per-channel loudness worklets are created.
- **Audio source:** One `AnalyserNode` per channel, inserted after the channel's
  output `StereoPannerNode` and before the master bus. `fftSize` 256.
- **Update loop:** Single `requestAnimationFrame` loop reads all 16 analysers,
  computes RMS (`20 * log10(rms)`), clamps to [-60, 0] dB, updates peak hold,
  and calls `setState` once per frame with batched values. The loop is active
  only while Mixer or FX is visible because its channel levels and compressor
  reduction values are visual telemetry; hiding both panels cancels it without
  changing the audio graph or mixer state.
- **Peak hold:** Tracks the maximum recent RMS. Decays at ~30 dB/s when no new
  peak exceeds it. Rendered as a 2px CSS-positioned line.
- Color zones: green (-60 to -12 dB), yellow (-12 to -3 dB), red (-3 to 0 dB).

### Routing

- Hardcoded 1:1 for spec 007: lane N → channel N.
- Lane-to-channel reassignment and multi-lane routing are deferred to spec-017.
- AC-010 (multiple lanes sharing one channel) is deferred.

### Lane / Channel Pan Independence

Lane and channel pan use the shared project-owned rotary control. It captures
pointer input (including touch), supports Shift fine adjustment and keyboard
steps, and preserves pan's center reset and right-click cycle behavior.

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

## Design Decisions

| Decision | Rationale |
| --- | --- |
| Channel and lane state coexist | Lane M/S controls arrangement; channel M/S/gain/pan controls the mix |
| `useMixer(playbackEngineRef)` owns channel state | Mixer state stays separate from the transport engine |
| Lane and channel mute/solo gates are ANDed | Both arrangement and mix filters apply |
| One `AnalyserNode` per channel | All 16 meters update without graph switching |
| Mixer uses a full-width peer tab | All strips receive the lower workspace without competing with Song or Samples |
| Routing is 1:1 and channel count is capped at 16 | Add/reorder needs the routing UI in spec-017 |
| dB meters render in CSS | Fill height and peak hold do not need a canvas |
| Stereo width waits for spec-010 | The control needs DSP before it has a product effect |
| Channel state is project-owned | Project save/load restores the mix without leaking it into other sessions |
| Lane and channel pan are independent | Two panners keep arrangement and mix controls distinct |
| One rAF loop reads all meters | React receives one batched state update per frame |
| Removed channels route their lanes through a master bypass | Removing a strip does not silence its lane |
| A restore action re-adds the lowest removed channel | Removal is reversible without exceeding the 16-channel cap |
| Remove controls remain visible in a 44px target | Removal stays discoverable for mouse, keyboard, and touch users |
| Channel labels use `channelIndex + 1` | Visible and accessible names match fixed routing |
| Both pan knobs support drag, keyboard, and the same right-click cycle | Lane and channel controls share an interaction contract |
| Mute-active fill meets 3:1 contrast | The state remains visible across all themes |
| Faders show a drag value and unity tick | Gain changes have numeric feedback |
| The Bottom Workspace tab controls Mixer visibility | Peer workflows share one predictable navigation model |

## Implementation Notes

### Hook composition

`useAppState` calls `useLibraryData` then `useTransportEngine` unconditionally;
adding `useMixer(playbackEngineRef)` after them keeps hook order stable. `playbackEngineRef`
must be added to `useTransportEngine`'s return value — refs are stable across
renders so this does not break memoization. `useMixer` keys its apply-to-player
effect on `view` (returned by the engine) since `playbackEngineRef.current` mutating
does not trigger renders. On teardown, cleanup runs in call order; the mixer
cleanup runs before `playbackEngine.close()` and must null-check the ref.

### Lane pan plumbing

`handleSetLanePan` writes `LaneState.pan` and calls `playbackEngine.setLanePan()`,
which updates the per-lane persistent panner directly so live knob changes
affect already-sounding voices. `pan` travels through `EngineLane` /
`toEngineLanes`, and the lane panner sits before `channel.input` in the audio
chain (see Lane / Channel Pan Independence).

The lane-head pan knob (`LaneRow.tsx`) and the mixer-strip pan knob
(`ChannelStrip.tsx`) share the same interaction contract (decision 27-28):

- **Left-click drag** horizontally scrubs pan in [-1, 1] (sensitivity
  differs: lane 0.01/px, mixer 0.008/px). Right/middle press is ignored.
- **Right-click** (onContextMenu) suppresses the browser menu and steps a
  three-position cycle: any position → C (0) → 100% R (1) → 100% L (−1) → C.
  Uses a PAN_EPSILON tolerance (1e-6) so key-step residue near 0/±1 still
  cycles correctly.
- **Double-click** resets to center (0). Present on the lane-head knob only;
  the mixer strip relies on the right-click cycle for reset.
- **Keyboard:** ArrowLeft/ArrowDown and ArrowRight/ArrowUp adjust by 0.05
  clamped; Home centers; End goes hard right (mixer only). Both knobs are
  focusable (`tabIndex={0}`, `role="slider"`).
- **Mouse wheel:** wheel up increases and wheel down decreases by 0.05;
  Shift uses the shared fine-adjustment step. Handled wheel events suppress
  surrounding page scroll.

When adding or modifying pan knob behavior, ensure both `LaneRow.tsx` and
`ChannelStrip.tsx` stay in sync for the right-click cycle and keyboard
interaction. Do NOT implement one without the other.

## Acceptance Criteria (testable)

- [x] **AC-001:** Up to 16 responsive 96-124px channel strips share the Mixer width before horizontal overflow, each with VOL slider, dB meter, 44px pan knob, M and S buttons.
- [x] **AC-002:** Dragging a channel's VOL slider changes the audio output level for that channel in real-time.
- [x] **AC-003:** The dB meter updates during playback, showing green/yellow/red zones proportional to output level, with a decaying peak hold line.
- [x] **AC-004:** Clicking a channel's M button mutes that channel — lane N (hardcoded route) goes silent. The button shows active state.
- [x] **AC-005:** Clicking a channel's S button soloes it — all other channels go silent. Clicking another channel's S transfers the solo.
- [x] **AC-006:** Lane-level mute/solo and channel-level mute/solo are independent ANDed gates. A lane is audible when its own mute AND its channel's mute are off, and it passes both solo filters.
- [x] **AC-008:** User can remove a channel via an always-visible 44px x button; the corresponding lane is re-routed to the master bypass bus
  (audible at unity gain with lane pan applied). Remaining strips shift down and keep their stable channel labels.
- [x] **AC-009:** Activating Mixer shows its full-width panel; activating a
  peer tab hides it without unmounting Mixer state. No lower reveal seam is
  present.
- [x] **AC-011:** Channel state (presence, gain, pan, mute, and solo) is saved
  in the active `.mixjam` project by spec-011 and is not persisted as
  app-level state.
- [x] **AC-012:** The lane-head pan knob and mixer-strip pan knob control independent values (lane pan and channel pan respectively); both are applied in the audio chain.
- [x] **AC-013:** Removing all channels leaves all 16 lanes routed to the master bypass bus; all lanes remain audible. The mixer column shows no channel strips.

- [x] **AC-014:** The Mixer panel receives the full Bottom Workspace width and
  is independent of the upper MixJam Browser/Tracker column width.
- [x] **AC-015:** All 16 channel strips are visible when space permits and are
  reachable by horizontal scroll when the viewport is too narrow;
  keyboard-tabbing scrolls a clipped strip into view.
- [x] **AC-016:** Mixer panel state survives tab changes, and the selected
  Bottom Workspace tab survives remount according to spec-006.
- [x] **AC-017:** A restore affordance re-adds the lowest removed channel at default state (gain 0.8, pan 0, unmuted, unsoloed) and re-routes its lane from the master bypass
  back to the channel. It is disabled/absent when no channel is removed.
- [x] **AC-018:** Right-clicking ANY pan knob (lane-head or mixer-strip) never shows a context menu and steps the cycle: any position → C; C → 100% R; 100% R → 100% L; 100% L → C.
- [x] **AC-019:** The remove button remains visible as a 44px target without requiring hover or keyboard focus.
- [x] **AC-020:** Channel labels are stable `channelIndex + 1`; the selection
  button's accessible name matches its visible label, related control labels use
  the same channel number, and removing a middle channel leaves a numbering gap.
- [x] **AC-021:** Both pan knobs are reachable with Tab; ArrowLeft/ArrowRight
  and mouse-wheel movement change pan by 0.05 clamped to [-1, 1], Shift-wheel
  provides fine adjustment, and `aria-valuetext` reflects the position.
- [x] **AC-022:** The mute-active button fill measures at least 3:1 contrast against the inactive button in every bundled theme, and a muted channel's strip is visibly dimmed.
- [x] **AC-023:** A channel fader shows its percentage value while dragging and renders a unity (100%) tick mark.
- [x] **AC-024:** The master meter label reads "Output Level" and uses
  standards-based master LUFS/dBTP values when available, while all 16 channel
  meters remain RMS dBFS with their existing peak-hold behavior.
- [x] **AC-025:** The shared Mixer/FX visual-telemetry frame loop is cancelled
  while Song or Samples is active and restarts when Mixer or FX becomes active.

## Control-System Validation Evidence

- `src/renderer/src/components/ChannelStrip.test.tsx` verifies that channel
  gain uses the shared Radix-backed vertical fader and meter, preserves its
  value and unity affordances, and handles Arrow, Home, and End keys in visual
  orientation.
- `src/renderer/src/hooks/useMixer.test.ts` verifies that inactive workspaces
  schedule no visual-telemetry frame and that deactivation cancels a live loop.
- `tmp/verify-vertical-controls/evidence.md` records production Chromium
  geometry for all 16 fixed-width strips and the shared fader/meter grammar.
- `tmp/verify-complete-system/evidence.md` records the earlier fixed-width
  baseline across every bundled theme at both wide and narrow viewport sizes, including
  keyboard focus scrolling to the final channel.

## Non-Goals

- No stereo width control.
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
