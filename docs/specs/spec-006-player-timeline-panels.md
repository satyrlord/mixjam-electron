# Spec 006 — MixJam Player Timeline & Panel Layout

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** ⏳ NOT IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement the MixJam Player's visual region layout from the approved General
Layout mock-up: an upper row with a Recent Projects rail and the Player /
Tracker, a full-width Middle Strip for transport and global status, and a
lower row with a Song Controls rail and the Sample Browser. Within that shell,
define the 16-lane tracker, clip bubbles, ruler, moving playhead, and browser
adjacencies.

## User Stories

- **US-001:** As a user, I see a dedicated Recent Projects rail in the active
  Player that includes both recently opened `.mixjam` files and `.mixjam`
  files discovered from the current User Folder so project-switching
  affordances have a stable home.
- **US-002:** As a user, I see the Player / Tracker occupy the upper-right
  primary work area so arrangement stays visually dominant.
- **US-003:** As a user, I see a full-width Middle Strip between the tracker
  and browser so transport controls and global song state live on a clear seam.
- **US-004:** As a user, I see a dedicated Song Controls rail in the lower-left
  so global song controls are always available without stealing space from the
  browser.
- **US-004a:** As a user, I can adjust master volume, monitor overall loudness,
  and change BPM from the default Song Controls rail without opening the mixer.
- **US-005:** As a user, I can place sample clips (bubbles) onto lanes and see
  them rendered at the correct position and proportional width.
- **US-006:** As a user, I see a moving playhead sweep across the timeline
  during playback, synchronized to the audio.
- **US-007:** As a user, I see a ruler with bar numbers and tick marks so I
  can orient myself in the arrangement.
- **US-008:** As a user, I can use the Middle Strip transport buttons (Skip
  Back, Play/Pause, Stop) to control playback.
- **US-009:** As a user, I can drag the browser's internal vertical resize
  handle to adjust the split between the category tree and the sample list.

## Scope

### Player Layout

```text
.player (flex-column, full viewport below header/footer from spec-001)
  ├── .upper-work       — flex row, main top work band
  │   ├── .recent-projects-rail — left rail, shared width with song-controls
  │   └── .tracker-region       — upper-right primary arrangement surface
  │       ├── .ruler            — horizontal bar with tick marks + bar numbers
  │       └── .lane-scroll      — scrollable lane container
  │           ├── .playhead     — absolute, full-height, 2px wide
  │           └── .lane × 16    — 44px height each
  │               ├── .lane-head — 168px: name, M/S buttons, pan knob
  │               └── .lane-canvas — clip placement area
  ├── .middle-strip     — 44px, full-width transport + global status band
  └── .lower-work       — flex row, main bottom work band
      ├── .song-controls-rail — left rail, default-visible control region
      │   └── .mixer-reveal    — hidden by default, revealed by widening rail
      └── .browser-region      — lower-right sample browser (spec-004)
          ├── .category-tree
          ├── .browser-resize-v — 5px, internal vertical drag handle
          └── .sample-list
```

### Region Contract

- The active Player uses a two-column layout in the upper and lower work
  bands, with a shared left rail seam and a wider right-hand primary workspace.
- The **Recent Projects rail** is visible in the active Player layout. This
  spec only reserves the region; project-switching behavior is defined later.
- The **Song Controls rail** is visible by default in the lower-left. Its
  right edge is the reveal seam for the future mixer panel (spec-007).
- The **Middle Strip** is a fixed, full-width band between the upper and lower
  work areas. It replaces the earlier idea of a narrow transport strip plus a
  separate horizontal resize handle.
- The **Sample Browser** remains in the lower-right work region and owns its
  own internal category-tree ↔ sample-list split.

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

### Middle Strip

- Height: 44px, spans the full player width including both left rails.
- Owns the global transport and song state seam between the tracker and the
  browser.
- Left segment: project name ("Untitled") and lightweight global status text.
- Center segment: three transport buttons:
  - Skip Back (returns to tick 0).
  - Play / Pause (toggles; Play is accent-colored when stopped, Pause when
    playing).
  - Stop (returns to tick 0 and stops).
- Right segment: BPM display/editor and future global status affordances.
- BPM is editable; changing it updates the engine's transport BPM immediately.
- Transport buttons call the engine via the bridge layer (spec-005).

### Left Rails

**Recent Projects rail**
- Occupies the upper-left region of the active Player layout.
- Uses the same width as the Song Controls rail to keep the left seam aligned.
- Lists two merged sources:
  - recently opened `.mixjam` files from the persisted recent-project registry
  - `.mixjam` files discovered by recursively scanning the current User Folder
    (spec-003)
- If the same project appears in both sources, it is shown once, deduplicated
  by canonical file path.
- Ordering rule:
  - entries with a known `lastOpened` timestamp sort first, newest to oldest
  - discovered `.mixjam` files with no open history sort after those entries,
    alphabetically by display name
- Empty state:
  - when there are no recent entries and the recursive User Folder scan finds
    no `.mixjam` files, the rail shows an informational empty state
  - empty-state copy explains that no MixJam projects exist yet and that
    saving the current project or opening an existing `.mixjam` file will
    populate the rail
  - the empty state does not add rail-specific action buttons
- This spec defines the rail content and persistence in the layout; load/open
  behavior for an entry is defined by project save/load work.

**Song Controls rail**
- Occupies the lower-left region of the active Player layout.
- Visible by default.
- Default-visible controls:
  - **Master Volume slider** — global output level control for the full mix.
  - **dB loudness meter** — master-output loudness display for the current mix.
  - **BPM slider** — transport tempo control, 50–200 BPM, default 120 BPM.
- Owns song-level controls and the right-edge reveal affordance for the future
  mixer panel (spec-007).
- The BPM slider stays synchronized with the Middle Strip BPM display/editor;
  changing either control updates the same transport BPM.
- Dragging the right-edge reveal seam to the right widens the rail; once the
  reveal threshold is crossed, mixer content may appear inside the expanded
  rail without moving into the sample-browser region.

### Resize Handles

**Browser vertical handle** (`.browser-resize-v`):
- 5px width, `ew-resize` cursor.
- Same smooth-drag pattern.
- Splits the category tree from the sample list within the browser region.

## Acceptance Criteria (testable)

- [ ] **AC-001:** The active Player layout renders five primary regions matching the mock-up: Recent Projects rail, Tracker region, full-width Middle Strip, Song Controls rail, and Sample Browser region.
- [ ] **AC-002:** The Recent Projects rail remains visible in the upper-left of the active Player, shares the same width as the Song Controls rail below it, and shows a merged list of recently opened `.mixjam` files plus `.mixjam` files discovered from the current User Folder.
- [ ] **AC-002a:** The User Folder contribution to the Recent Projects rail includes `.mixjam` files found in nested subfolders, not only files at the User Folder root.
- [ ] **AC-002b:** The Recent Projects rail sorts entries with open history by `lastOpened` descending; discovered projects with no open history appear afterward in alphabetical order.
- [ ] **AC-002c:** When the Recent Projects rail has no recent entries and no discovered `.mixjam` files, it shows an informational empty state instead of a blank rail or rail-specific action buttons.
- [ ] **AC-003:** The Middle Strip spans the full player width between the upper and lower work bands.
- [ ] **AC-004:** The Song Controls rail is visible by default in the lower-left; widening its right-edge reveal seam may expose mixer content without relocating the sample browser into the left rail.
- [ ] **AC-004a:** The default Song Controls rail shows a Master Volume slider, a master dB loudness meter, and a BPM slider.
- [ ] **AC-004b:** The Song Controls BPM slider ranges from 50 BPM to 200 BPM and initializes to 120 BPM for a new project.
- [ ] **AC-005:** 16 lanes render at 44px each in the Tracker region with lane heads showing name, M and S buttons, and pan knob placeholder.
- [ ] **AC-006:** Clicking a lane's M (mute) button toggles mute state; the lane dims and no audio plays from it. Clicking again restores.
- [ ] **AC-007:** Clicking a lane's S (solo) button soloes that lane; all other lanes dim. Clicking again un-soloes.
- [ ] **AC-008:** Placing a sample clip on a lane renders it as a rounded rectangle at the correct tick position with proportional width.
- [ ] **AC-009:** Placing a clip that overlaps an existing one on the same lane visually truncates the previous clip.
- [ ] **AC-010:** The playhead moves smoothly from left to right during playback, synchronized to audio.
- [ ] **AC-011:** The ruler displays tick marks every 96px and bar numbers (1, 5, 9, 13…) in monospace font.
- [ ] **AC-012:** Clicking Play starts playback; the button changes to Pause. Clicking Pause pauses; the button reverts to Play.
- [ ] **AC-013:** Clicking Stop halts playback and returns the playhead to tick 0.
- [ ] **AC-014:** Clicking Skip Back returns the playhead to tick 0 without stopping playback (if playing).
- [ ] **AC-015:** The BPM display shows the current BPM. Clicking it allows editing; changing the value updates the engine's BPM immediately.
- [ ] **AC-015a:** Changing BPM from either the Middle Strip editor or the Song Controls slider updates the same transport state and keeps both controls synchronized.
- [ ] **AC-016:** Dragging the browser's internal vertical resize handle adjusts the category-tree/sample-list split smoothly.
- [ ] **AC-017:** Clips are rendered on canvas (or equivalent performant surface), not as individual DOM nodes per clip.

## Non-Goals (deferred to later specs)

- No bulk recent-project management actions (pinning, removing entries, or custom grouping) inside the Recent Projects rail.
- No user-resizable split between the upper and lower work bands; the full-width
  Middle Strip is a fixed seam, not a drag handle.
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
