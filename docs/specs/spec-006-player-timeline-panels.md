# Spec 006 — MixJam Player Timeline & Panel Layout

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement the MixJam Player's visual region layout from the approved General
Layout mock-up: an upper row with the MixJam Browser and Tracker, a full-width
Middle Strip containing the Transport Ribbon and global controls, and a
lower row with a Song Controls rail and the Sample Browser. Within that shell,
define the 16-lane Tracker, sample bubbles, ruler, moving playhead, and browser
adjacencies.

## User Stories

- **US-001:** As a user, I see a dedicated MixJam Browser in the active
  Player that includes both recently opened `.mixjam` files and `.mixjam`
  files discovered from the current User Folder so project-switching
  affordances have a stable home.
- **US-002:** As a user, I see the Tracker occupy the upper-right
  primary work area so arrangement stays visually dominant.
- **US-003:** As a user, I see a full-width Middle Strip between the tracker
  and browser so transport controls and global song state live on a clear seam.
- **US-004:** As a user, I see a dedicated Song Controls rail in the lower-left
  so global song controls are always available without stealing space from the
  browser.
- **US-004a:** As a user, I can adjust master volume, monitor overall loudness,
  and change BPM from the default Song Controls rail without opening the mixer.
- **US-005:** As a user, I can place sample bubbles onto lanes and see the
  same source-duration-derived geometry used in the Sample Browser.
- **US-006:** As a user, I see a moving playhead sweep across the timeline
  during playback, synchronized to the audio.
- **US-007:** As a user, I see a ruler with bar numbers and tick marks so I
  can orient myself in the arrangement.
- **US-007a:** As a user, I can click the ruler to move the playhead to the
  nearest beat so I can start or resume playback from a precise grid position.
- **US-008:** As a user, I can use the Middle Strip transport buttons (Skip
  Back, Play/Pause, Stop) to control playback.
- **US-009:** As a user, I can drag the browser's internal vertical resize
  handle to adjust the split between the category tree and the sample list.

## Scope

### Player Layout

```text
.player (flex-column, full viewport below header/footer from spec-001)
  ├── .upper-work       — flex row, main top work band
  │   ├── .mixjam-browser — left rail, shared width with song-controls
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
      │   └── .mixer-reveal    — mixer column, shown/hidden via the rail's drag seam (spec-007)
      └── .browser-region      — lower-right sample browser (spec-004)
          ├── .category-tree
          ├── .browser-resize-v — 5px, internal vertical drag handle
          └── .sample-list
```

### Region Contract

- The active Player uses a two-column layout in the upper and lower work
  bands, with a shared left rail seam and a wider right-hand primary workspace.
- The **MixJam Browser** is visible in the active Player layout. This
  spec only reserves the region; project-switching behavior is defined later.
- The **Song Controls rail** is visible by default in the lower-left. Its
  right edge is the reveal seam for the implemented mixer panel (spec-007).
- The **Middle Strip** is a fixed, full-width band between the upper and lower
  work areas. Its center Transport Ribbon contains transport controls only;
  project name, BPM, search, Re-scan, and Help remain outside that subregion.
- The **Sample Browser** remains in the lower-right work region and owns its
  own internal category-tree ↔ sample-list split.

### Ruler

- Height: 24px, padded left 168px (lane-head width).
- The lane-head rendered border box must remain exactly 168px wide so ruler
  marks, tracker grid lines, placements, and playhead share the same x-origin.
- Tick marks use the same beat/bar model as the lane canvas: a transparent
  tick every beat and a stronger tick every bar.
- Bar numbers: 1, 5, 9, 13… (every 4 bars), monospace font, muted color.
- Scrolls horizontally in sync with the lane canvas.
- Clicking the timeline portion of the ruler moves the engine and visual
  playhead to the nearest beat boundary (every 8 ticks). The lane-head spacer
  is not a seek target.
- Seeking while playing continues playback from the selected beat. Seeking
  while paused or stopped only repositions the playhead and does not start it.

### Lanes (16)

- Height: 44px fixed per lane.
- **Lane head** (168px wide):
  - Lane name (e.g. "Lane 1"), 11px, truncated with ellipsis.
  - Mute button (M) — 28×28px, toggle style. Muted lanes are visually dimmed.
  - Solo button (S) — 28×28px, toggle style. When any lane is soloed,
    non-soloed lanes are dimmed.
  - Pan knob — 30×30px drag-to-pan dial with a highlight-token pointer.
- **Lane canvas:** flex:1, position:relative — hosts sample bubbles.
- **Focused lane:** subtle accent-color left border on the lane head.

### Sample Bubbles

- Rendered as rounded rectangles on the lane canvas.
- Position: `left` computed from the clip placement's start tick multiplied by
  pixels-per-tick.
- Width: source audio duration projected through the Tracker's current time
  scale (`pixels-per-tick / seconds-per-tick`), with a 12px minimum and a
  two-second fallback when duration is unknown. The Tracker passes the same
  pixels-per-second value to the Sample Browser, so a sample is identical in
  both views and its right edge aligns with the ruler time at which its source
  audio ends. BPM or viewport changes resize every representation together;
  placement duration and UI context do not create a different width.
- Height: 32px, vertically centered in the 44px lane.
- Label: sample filename, truncated.
- Bubble color: driven by a per-sample hue derived from category or a hash of
  the filename.
- **Snap-to-beat (default):** Dropping a sample from the browser or moving a
  sample bubble within the Tracker snaps the placement's start position to the nearest beat
  boundary (every 8 ticks). Holding **Alt** while dropping/moving places the
  placement at per-tick precision (freeform). **Shift** is reserved for duplicating
  a sample; **Ctrl** is reserved for rectangle-drag multi-select.
- **Monophonic cut-off behavior** (per spec-005): a lane is monophonic in
  *audio* only — a new trigger cuts off the previously sounding voice on that
  lane. Overlapping placements are *not* trimmed visually: both bubbles keep their
  full size and data, so an accidental overlap never destroys the earlier
  sample's information.
- Placements are rendered on a canvas element for performance — not as individual
  DOM nodes (enables smooth scrolling at high placement counts).
- A placement drag image may use a larger transparent canvas for shadow padding,
  pointer offset, or a multi-selection badge. The sample bubble drawn inside
  that canvas keeps the canonical source-duration width and 32px height.

### Playhead

- Vertical line spanning the full height of all lanes.
- Position: computed from `currentTick × pixelsPerTick`, updated on every tick
  event from the engine.
- Width: 2px, color: playhead theme token (`--playhead`), z-index above placements.
- Non-interactive (`pointer-events: none`).
- Visible during both playback and when stopped (rests at position 0).

### Middle Strip

- Height: 44px, spans the full player width including both left rails.
- Owns the global transport and song state seam between the tracker and the
  browser.
- Left segment: project name (the opened project's display name, "Untitled"
  when none) and the BPM display/editor.
- Center **Transport Ribbon**: three transport buttons plus the edit-history pair:
  - Skip Back (returns to tick 0). Resets the engine scheduler's playhead, not
    just the UI mirror; while playing it restarts playback from the top.
  - Play / Pause (toggles; Play is accent-colored when stopped, Pause when
    playing). Space toggles the same action.
  - Stop (returns to tick 0 and stops).
  - Undo / Redo — separated by a seam, disabled when the respective history
    stack is empty (see Undo/Redo below).
- Right segment: search, Re-scan, and a "?" help button that opens the
  keyboard-shortcuts overlay.
- BPM is editable; changing it updates the engine's transport BPM immediately.
- Transport buttons call the engine via the bridge layer (spec-005).
- Transport, BPM, mute/solo, and pan controls carry `title` tooltips including
  their shortcut hints where one exists.

### Undo/Redo

- A command stack in the transport-engine hook covers clip-placement edits:
  place, move, duplicate, group move/duplicate, single delete, and batch
  delete. Mixer state (mute/solo/pan, volume, BPM) is not tracked.
- Each entry is an immutable lanes snapshot (structurally shared), capped at
  100 entries. A new edit clears the redo stack.
- Bindings: Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes; the Middle Strip
  buttons mirror the same actions and disable when their stack is empty.
- A multi-placement Delete is one history entry (batch remove), so one Ctrl+Z
  restores the whole selection.

### Keyboard shortcuts overlay

- The "?" Middle Strip button and the "?" key open a modal overlay listing all
  keyboard and mouse shortcuts (transport, placement editing, browser).
- Esc, the close button, or a backdrop click dismisses it.
- Global shortcuts (Space, Delete, Ctrl+Z/Y, ?) are suppressed while a text
  input, textarea, select, or contenteditable element has focus.

### Left Rails

#### MixJam Browser

- Occupies the upper-left region of the active Player layout.
- Uses the same width as the Song Controls rail to keep the left seam aligned.
- Includes a collapse/expand toggle (state persisted to localStorage as
  `mixjam:recents-rail-collapsed`). When collapsed, only the toggle button is
  visible, and the browser stays visually flush so it does not leave a stray
  divider in the tracker lane header.
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
  - the empty state does not add browser-specific action buttons
- Entries are interactive:
  - each entry is a full-width click target with a hover state
  - clicking an entry opens it: the project is recorded as most-recently
    opened, the browser re-sorts, and the project name appears in the Middle
    Strip
  - right-clicking an entry shows a context menu with **Open** and
    **Copy Path**
- Full project deserialization (restoring lanes/placements from the `.mixjam`
  file) remains deferred to project save/load work (spec-011).

#### Song Controls rail

- Occupies the lower-left region of the active Player layout.
- Visible by default.
- Default-visible controls:
  - **Master Volume slider** — global output level control for the full mix.
  - **dB loudness meter** — master-output loudness display for the current mix.
- Owns song-level controls and the right-edge reveal affordance for the
  implemented mixer panel (spec-007).
- Dragging the right-edge reveal seam to the right widens the rail; once the
  reveal threshold is crossed, mixer content may appear inside the expanded
  rail without moving into the sample-browser region.

### Resize Handles

**Browser vertical handle** (`.browser-resize-v`):

- 5px width, `ew-resize` cursor.
- Same smooth-drag pattern.
- Splits the category tree from the sample list within the browser region.

## Acceptance Criteria (testable)

- [x] **AC-001:** The active Player layout renders five primary regions matching the mock-up: MixJam Browser,
  Tracker region, full-width Middle Strip, Song Controls rail, and Sample Browser region.
- [x] **AC-002:** The MixJam Browser is visible in the upper-left of the active Player by default, shares the same width as the Song
  Controls rail below it, shows a merged list of recently opened `.mixjam` files plus `.mixjam` files discovered from the current
  User Folder, and can be collapsed/expanded via a toggle button (state persisted to localStorage).
- [x] **AC-002a:** The User Folder contribution to the MixJam Browser includes `.mixjam` files found in nested subfolders, not only files at the User Folder root.
- [x] **AC-002b:** The MixJam Browser sorts entries with open history by `lastOpened` descending; discovered projects with no open history appear afterward in alphabetical order.
- [x] **AC-002c:** When the MixJam Browser has no recent entries and no discovered `.mixjam` files, it shows an informational empty state instead of a blank region or browser-specific action buttons.
- [x] **AC-003:** The Middle Strip spans the full player width between the upper and lower work bands.
- [x] **AC-004:** The Song Controls rail is visible by default in the lower-left; widening its right-edge reveal seam may expose mixer content without relocating the sample browser into the left rail.
- [x] **AC-004a:** The default Song Controls rail shows a Master Volume slider and a master dB loudness meter. BPM is edited only via the Middle Strip click-to-edit control
  so the app has one BPM editor.
- [x] **AC-004b:** The BPM editor accepts 50 BPM to 200 BPM and initializes to 120 BPM for a new project.
- [x] **AC-005:** 16 lanes render at 44px each in the Tracker region with lane heads showing name, functional M and S buttons, and a functional pan knob.
- [x] **AC-006:** Clicking a lane's M (mute) button toggles mute state; the lane dims and no audio plays from it. Clicking again restores.
- [x] **AC-007:** Clicking a lane's S (solo) button soloes that lane; all other lanes dim. Clicking again un-soloes.
- [x] **AC-008:** Dragging a sample bubble from the Sample Browser and dropping it onto a lane creates a clip placement snapped to the nearest beat boundary.
  Its bubble is 32px high and uses the shared source-duration width. The width
  spans the same amount of Tracker time as the source audio at the current BPM,
  and the corresponding Sample Browser bubble has the identical pixel width.
- [x] **AC-008a:** Holding Alt while dropping a sample or moving a placement bypasses beat-snap and places it at per-tick precision (freeform).
- [x] **AC-009:** Placing a sample that overlaps an existing placement on the same lane keeps both sample bubbles visually intact; only the audio
  is monophonic. Overlap never deletes or trims the earlier placement's data.
- [x] **AC-010:** The playhead moves smoothly from left to right during playback, synchronized to audio.
- [x] **AC-011:** The ruler displays beat ticks and stronger bar ticks using the same beat/bar grid as the lane canvas, with bar numbers (1, 5, 9, 13…) in monospace font;
  the ruler x-origin aligns with the tracker grid, placements, and playhead.
- [x] **AC-011a:** Clicking the ruler timeline moves the playhead to the nearest 8-tick beat boundary. Arrow Left and Arrow Right move by one beat,
  while Home and End move to the timeline boundaries. The engine seeks to the same tick; playback continues from that tick when already playing,
  while paused or stopped transport remains paused or stopped.
- [x] **AC-012:** Clicking Play starts playback; the button changes to Pause. Clicking Pause pauses; the button reverts to Play.
- [x] **AC-013:** Clicking Stop halts playback and returns the playhead to tick 0.
- [x] **AC-014:** Clicking Skip Back returns the playhead to tick 0 without stopping playback (if playing).
- [x] **AC-015:** The BPM display shows the current BPM. Clicking it allows editing; changing the value updates the engine's BPM immediately.
- [x] **AC-015a:** The Middle Strip BPM editor is the single BPM control and always reflects the transport's current BPM
  without a second control to synchronize.
- [x] **AC-016:** Dragging the browser's internal vertical resize handle adjusts the category-tree/sample-list split smoothly.
- [x] **AC-017:** Placements are rendered on canvas (or equivalent performant surface), not as individual DOM nodes per placement.
- [x] **AC-018:** Shift-dragging a placed sample bubble duplicates its placement at the drop position; the original remains unchanged.
- [x] **AC-019:** Ctrl+drag on the lane canvas area draws a selection rectangle; placements whose bounds intersect the rectangle are selected (highlighted with a white border).
- [x] **AC-020:** Pressing Delete removes all selected placements. Clicking empty space without Ctrl deselects all.
- [x] **AC-021:** Dragging a sample bubble that is part of a multi-selection moves the entire placement group, maintaining relative offsets. Shift-dragging the group duplicates all members.
- [x] **AC-022:** Ctrl+Z undoes the last placement edit (place, move, duplicate, delete, group operations); Ctrl+Y or Ctrl+Shift+Z redoes it.
  The Middle Strip Undo/Redo buttons mirror the shortcuts and disable when their history stack is empty. A multi-placement delete undoes as a single step.
- [x] **AC-023:** The "?" Middle Strip button and the "?" key open a keyboard-shortcuts overlay; Esc, the close button, or a backdrop click dismisses it.
  Transport, BPM, mute/solo, and pan controls have tooltip hints.
- [x] **AC-024:** Clicking a MixJam Browser entry records it as most-recently opened, re-sorts the browser, and shows its name in the
  Middle Strip. Right-clicking shows an Open / Copy Path context menu. Entries show a hover state.
  Full project deserialization (restoring lanes/placements from the `.mixjam` file) remains deferred to spec-011.
- [x] **AC-025:** A sample bubble keeps its canonical width and 32px height in
  the drag image; any minimum drag surface, theme-shadow clearance, or group
  badge uses transparent space outside that rectangle.
- [x] **AC-025:** Space toggles Play/Pause when focus is not in a text control.

## Non-Goals (deferred to later specs)

- No bulk project management actions (pinning, removing entries, or custom grouping) inside the MixJam Browser.
- No user-resizable split between the upper and lower work bands; the full-width
  Middle Strip is a fixed seam, not a drag handle.
- No placement-duration resize after placement.
- No lane reordering (drag lane up/down).
- No lane add/remove UI; the current arrangement and supported engine surface
  are fixed at 16 lanes.
- No zoom in/out on the timeline.
- No waveform rendering inside placements.
- No cut/copy/paste for placements.
- No BPM automation or tempo changes within a project.
- Undo/redo covers placement edits only (see Undo/Redo); mixer and
  tempo changes are not undoable.

## References

- [Current project architecture.md](../architecture.md) — Virtualization requirement, canvas rendering guidance.
