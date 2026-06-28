# Spec 006 — MixJam Player Timeline & Panel Layout

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** ⏳ NOT IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement the MixJam Player's visual layout: 16 lanes with clip bubbles, a
moving playhead, ruler with bar numbers, transport strip with play/pause/stop,
and resizable panels (timeline ↔ browser, category tree ↔ sample list).

## User Stories

- **US-001:** As a user, I see 16 lanes in the Player, each with a name, mute
  (M) and solo (S) buttons, and a pan indicator.
- **US-002:** As a user, I can place sample clips (bubbles) onto lanes and see
  them rendered at the correct position and proportional width.
- **US-003:** As a user, I see a moving playhead sweep across the timeline
  during playback, synchronized to the audio.
- **US-004:** As a user, I see a ruler with bar numbers and tick marks so I
  can orient myself in the arrangement.
- **US-005:** As a user, I can use transport buttons (⏮ Skip Back, ▶ Play,
  ⏹ Stop) to control playback.
- **US-006:** As a user, I can drag the horizontal resize handle to adjust the
  split between the timeline and the browser panel.
- **US-007:** As a user, I can drag the vertical resize handle to adjust the
  split between the category tree and the sample list.

## Scope

### Player Layout

```text
.player (flex-column, full viewport)
  ├── header.bar        — 40px (per spec-001)
  ├── .timeline         — flex:3, min-height:80px
  │   ├── .ruler        — horizontal bar with tick marks + bar numbers
  │   └── .lane-scroll  — scrollable lane container
  │       ├── .playhead — absolute, full-height, 2px wide
  │       └── .lane × 16 — 44px height each
  │           ├── .lane-head — 168px: name, M/S buttons, pan knob
  │           └── .lane-canvas — clip placement area
  ├── .transport-strip  — 44px
  ├── .resize-h         — 5px, horizontal drag handle
  └── .browser          — flex:2, min-height:60px (spec-004)
      ├── .category-tree
      ├── .resize-v     — 5px, vertical drag handle
      └── .sample-list
```

### Ruler

- Height: 24px, padded left 168px (lane-head width).
- Tick marks every 96px (one bar at default zoom).
- Bar numbers: 1, 5, 9, 13… (every 4 bars), monospace font, muted color.
- Scrolls horizontally in sync with the lane canvas.

### Lanes (16)

- Height: 44px fixed per lane.
- **Lane head** (168px wide):
  - Lane name (e.g. "Lane 1"), 11px, truncated with ellipsis.
  - Mute button (M) — 18×18px, toggle style. Muted lanes are visually dimmed.
  - Solo button (S) — 18×18px, toggle style. When any lane is soloed,
    non-soloed lanes are dimmed.
  - Pan knob indicator — 16×16px placeholder.
- **Lane canvas:** flex:1, position:relative — hosts clip bubbles.
- **Focused lane:** subtle accent-color left border on the lane head.

### Clip Bubbles

- Rendered as rounded rectangles on the lane canvas.
- Position: `left` computed from the clip's start tick × pixels-per-tick.
  Width: proportional to the clip's duration in ticks.
- Height: 32px, vertically centered in the 44px lane.
- Label: sample filename, truncated.
- Clip color: driven by a per-sample hue derived from category or a hash of
  the filename (consistent across sessions).
- **Monophonic cut-off behavior** (per spec-005): placing a clip that overlaps
  an existing clip on the same lane visually truncates the previous clip at
  the overlap point.
- Clips are rendered on a canvas element for performance — not as individual
  DOM nodes (enables smooth scrolling at high lane/clip counts).

### Playhead

- Vertical line spanning the full height of all lanes.
- Position: computed from `currentTick × pixelsPerTick`, updated on every tick
  event from the engine.
- Width: 2px, color: playhead theme token (`--playhead`), z-index above clips.
- Non-interactive (`pointer-events: none`).
- Visible during both playback and when stopped (rests at position 0).

### Transport Strip

- Height: 44px.
- Left: project name ("Untitled") + BPM display ("120 BPM").
- Center: three transport buttons:
  - ⏮ Skip Back (returns to tick 0).
  - ▶ Play / ⏸ Pause (toggles; Play is accent-colored when stopped, Pause
    when playing).
  - ⏹ Stop (returns to tick 0 and stops).
- Right: search input (placeholder, non-functional until spec-004 browser is
  wired).
- BPM is editable — clicking the BPM display allows direct numeric input.
- Transport buttons call the engine via the bridge layer (spec-005).

### Resize Handles

**Horizontal handle** (`.resize-h`):
- 5px height, `ns-resize` cursor.
- On `mousedown`: timeline and browser get `flex:none` + explicit pixel
  heights. Dragging adjusts the split.
- Minimum heights: timeline 80px, browser 60px.
- Hover/dragging: handle background changes to accent color.

**Vertical handle** (`.resize-v`):
- 5px width, `ew-resize` cursor.
- Same smooth-drag pattern.
- Splits the category tree from the sample list within the browser panel.

## Acceptance Criteria (testable)

- [ ] **AC-001:** 16 lanes render at 44px each with lane heads showing name, M and S buttons, and pan knob placeholder.
- [ ] **AC-002:** Clicking a lane's M (mute) button toggles mute state — the lane dims and no audio plays from it. Clicking again restores.
- [ ] **AC-003:** Clicking a lane's S (solo) button soloes that lane — all other lanes dim. Clicking again un-soloes.
- [ ] **AC-004:** Placing a sample clip on a lane renders it as a rounded rectangle at the correct tick position with proportional width.
- [ ] **AC-005:** Placing a clip that overlaps an existing one on the same lane visually truncates the previous clip.
- [ ] **AC-006:** The playhead moves smoothly from left to right during playback, synchronized to audio.
- [ ] **AC-007:** The ruler displays tick marks every 96px and bar numbers (1, 5, 9, 13…) in monospace font.
- [ ] **AC-008:** Clicking ▶ Play starts playback; the button changes to ⏸ Pause. Clicking ⏸ Pause pauses; the button reverts to ▶ Play.
- [ ] **AC-009:** Clicking ⏹ Stop halts playback and returns the playhead to tick 0.
- [ ] **AC-010:** Clicking ⏮ Skip Back returns the playhead to tick 0 without stopping playback (if playing).
- [ ] **AC-011:** The BPM display shows the current BPM. Clicking it allows editing; changing the value updates the engine's BPM immediately.
- [ ] **AC-012:** Dragging the horizontal resize handle adjusts the timeline/browser split smoothly with minimum constraints (80px/60px).
- [ ] **AC-013:** Dragging the vertical resize handle adjusts the category-tree/sample-list split smoothly.
- [ ] **AC-014:** Clips are rendered on canvas (or equivalent performant surface) — not as individual DOM nodes per clip.

## Non-Goals (deferred to later specs)

- No clip drag-to-reposition or resize — clips are placed programmatically.
  Full clip interaction is a later slice.
- No track reordering (drag lane up/down).
- No lane add/remove UI (fixed 16 lanes).
- No zoom in/out on the timeline.
- No waveform rendering inside clips.
- No clip selection, multi-select, cut/copy/paste.
- No undo/redo for clip placement.
- No BPM automation or tempo changes within a project.

## References

- [mixjam-sample-daw spec-003](../_archived/mixjam-sample-daw/specs/003-tracker-view-shell/spec.md) — Lane layout, ruler, transport strip, resize handles.
- [mixjam-sample-daw style-guide §4–§5](../_archived/mixjam-sample-daw/docs/style-guide.md) — Timeline, lane, clip component rules.
- [Current project architecture.md](../architecture.md) — Virtualization requirement, canvas rendering guidance.
