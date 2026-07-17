# Spec 006 — MixJam Player Timeline & Panel Layout

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement the MixJam Player's visual region layout from the approved General
Layout mock-up: an upper row with the MixJam Browser and Tracker, a full-width
Middle Strip containing the Transport Ribbon and global controls, and one
full-width Bottom Workspace with Song, Mixer, FX, and Samples tabs. Within that
shell, define the 16-lane Tracker, sample bubbles, ruler, moving playhead, and
browser adjacencies.

## User Stories

- **US-001:** As a user, I see a dedicated MixJam Browser in the active
  Player that includes both recently opened `.mixjam` files and `.mixjam`
  files discovered from the current User Folder so project-switching
  affordances have a stable home.
- **US-002:** As a user, I see the Tracker occupy the upper-right
  primary work area so arrangement stays visually dominant.
- **US-003:** As a user, I see a full-width Middle Strip between the tracker
  and browser so transport controls and global song state live on a clear seam.
- **US-004:** As a user, I can switch the full-width Bottom Workspace between
  Song, Mixer, FX, and Samples without learning different reveal mechanisms.
- **US-004a:** As a user, I can adjust master volume, monitor overall loudness,
  and change BPM from the Song panel without opening the Mixer.
- **US-004b:** As a keyboard user, I can navigate and activate every Bottom
  Workspace tab using the standard tablist keyboard model.
- **US-005:** As a user, I can place sample bubbles onto lanes and see the same
  project-owned musical-span geometry in the Sample Browser, unaffected by BPM
  changes.
- **US-006:** As a user, I see a moving playhead sweep across the timeline
  during playback, synchronized to the audio.
- **US-007:** As a user, I see a ruler with bar numbers and tick marks so I
  can orient myself in the arrangement.
- **US-007a:** As a user, I can click the ruler to move the playhead to the
  nearest beat so I can start or resume playback from a precise grid position.
- **US-007b:** As a user, I can use an always-visible Song Progress Bar to
  navigate across the full 999-bar capacity without changing playback
  position.
- **US-008:** As a user, I can use the Middle Strip transport buttons (Skip
  Back, Jump to End, Play/Pause, Stop) to control playback and navigate to the
  last content tick.
- **US-009:** As a user, I can drag the browser's internal vertical resize
  handle to adjust the split between the category tree and the sample list.
- **US-010:** As a user, I can resize the upper work area against the Bottom
  Workspace so the tracker or the active lower workflow gets the space I need.

## Scope

### Player Layout

```text
.player (flex-column, full viewport below header/footer from spec-001)
  ├── .upper-work       — flex row, main top work band
  │   ├── .mixjam-browser — independently resizable/collapsible left rail
  │   └── .tracker-region       — upper-right primary arrangement surface
  │       ├── .ruler            — horizontal bar with tick marks + bar numbers
  │       ├── .lane-scroll      — scrollable lane container
  │           ├── .playhead     — absolute, full-height, 2px wide
  │           └── .lane × 16    — 39px height each
  │               ├── .lane-head — 240px: name, M/S buttons, pan knob
  │               └── .lane-canvas — clip placement area
  ├── .middle-strip     — 80px border-box, fixed full-width command band
  │   ├── .song-progress-bar — 28px persistent timeline navigation row
  │   └── .middle-strip-main — 48px project + edit + transport + utility row
  └── .bottom-workspace — full-width tabbed work band
      ├── .bottom-workspace-tabs — Song | Mixer | FX | Samples + song status
      └── .bottom-workspace-panel — active peer panel
          ├── Song      — BPM, combined Master Volume and Output Level, Clip Edge Fades
          ├── Mixer     — full-width channel strips (spec-007)
          ├── FX        — channel selector + effect editor (spec-010)
          └── Samples   — category tree + virtualized sample list (spec-004)
```

### Region Contract

- The active Player uses a two-column layout only in the upper work band. The
  Bottom Workspace spans the full Player width and does not inherit the upper
  MixJam Browser/Tracker split.
- The **MixJam Browser** is visible in the active Player layout. This
  spec only reserves the region; project-switching behavior is defined later.
- The **Bottom Workspace** is the only lower-band container. Song, Mixer, FX,
  and Samples are peer tabs; future peer workflows append tabs to the same
  tablist instead of adding another reveal system.
- The **Middle Strip** is a fixed, full-width band between the upper and lower
  work areas. The Song Progress Bar is its first row and cannot scroll or resize
  with the Tracker. Its main row contains project identity, a separate
  edit-history group, the centered Transport Ribbon, sample search, transient
  library status, and compact menus for infrequent actions. The Transport Ribbon
  contains transport controls only.
- The **Sample Browser** lives in the Samples panel and owns its internal
  category-tree/sample-list split.

### Bottom Workspace

- Tab order is **Song, Mixer, FX, Samples**. Song is active only when no valid
  saved tab exists. Thereafter, the last active tab persists in localStorage as
  `mixjam:bottom-workspace-tab`; missing or unknown values fall back to Song.
- The tablist uses automatic activation. Left/Right Arrow moves focus and
  activates the previous/next tab with wrapping; Home/End activates the
  first/last tab. One tab has `tabIndex=0`; all others have `tabIndex=-1`.
  Tabs and panels are connected with `id`, `aria-controls`, and
  `aria-labelledby`.
- All four panels remain mounted in the same Bottom Workspace grid cell while
  inactive. Inactive panels keep their layout geometry but are visually hidden,
  removed from the accessibility and pointer interaction paths, and excluded
  from sequential focus. Tab changes therefore preserve Sample scroll/filter
  state, Mixer state, FX selection, and stable Radix control geometry. The
  inactive Samples panel mounts no virtual rows and cannot request result pages.
- Mixer meters and FX compressor reduction share visual-only telemetry. Its
  animation-frame loop runs only while Mixer or FX is active; Song and Samples
  pause that loop without changing audio state or unmounting any panel.
- The tab row shows compact read-only BPM and Master Volume status. The status
  is an accessible button that activates Song; it does not create a second
  editable BPM or volume control.
- A fresh layout gives the Bottom Workspace 24% of the Player height. The
  current layout persists under `mixjam:bottom-workspace-layout-v2`. The v2 key
  intentionally ignores the previous unversioned layout once so existing users
  receive the compact default; every later manual resize updates v2 and
  survives remounts.
- An explicit workflow transition may activate a tab. In particular, a mixer
  channel's FX action selects that channel and activates FX.
- Samples exposes an explicit expand/restore action. Expansion grows the Bottom
  Workspace to 60%; restoration returns to the previous user-controlled size.
  Expansion intent and the restore size persist separately from the panel
  layout, so manually resizing the workspace to 60% never turns Restore into a
  hidden 24% jump.
- On narrow windows, the tab row scrolls horizontally or uses a labeled
  overflow control; tab targets do not shrink below 44 by 44 CSS pixels.
- The Bottom Workspace has no Song Controls/Mixer reveal seam. Resizing or
  collapsing the upper MixJam Browser remains independent of its full width.

### Song Panel Controls

- BPM and the combined Master Volume/Output Level control form one leading-edge
  group of vertical modules. Linear controls and meters increase from bottom to
  top. The Output Level meter, readings, and reset action share the Master
  Volume module because they all describe or control the master bus.
- BPM is a vertical slider from 50 to 200 and has an editable numeric value for
  precise entry. Both surfaces reflect one transport BPM value; invalid or
  out-of-range input is not committed.
- The BPM numeric field uses a compact 42-by-28px visible input inside its
  44px-high label target; it must not compete visually with the fader.
- Master Volume uses the same vertical fader grammar as channel gain, including
  value placement and unity indication. Output Level sits beside that fader in
  the same bordered module. It keeps the shared themed meter chrome and color
  tokens, but its live fill is Momentary LUFS rather than channel RMS dBFS.
- The Song panel exposes project-owned automatic clip-edge micro-fade controls:
  one enabled checkbox plus fractional fade-in and fade-out millisecond fields.
  Both fields accept 0 through 20 ms and default to 2 ms and 4 ms. These
  controls change project sound, mark the project dirty, and are not stored as
  app-level UI preferences.
- Output Level shows compact M, S, I, and TP values with explicit LUFS and dBTP
  units. When the standards-based processor is unavailable it identifies the
  fallback value as dBFS. A keyboard-reachable icon button starts a new
  Integrated/LRA session without stopping Momentary or Short-term updates. Its
  visible content is an SVG ear with no text; its accessible name and tooltip
  both read `Reset loudness measurement`.
- Vertical sliders expose `aria-orientation="vertical"`, unit-aware value text,
  Arrow Up/Right to increase, Arrow Down/Left to decrease, and Home/End for
  minimum/maximum. Their pointer target is at least 44 CSS pixels wide and the
  slider thumb is centered on the visible track. Compact inputs may use
  a 44-by-44 label target around a smaller visible field.
- Linear faders use the shared `VerticalFader` wrapper over Radix Slider so
  thumb positioning, pointer capture, and vertical keyboard semantics do not
  depend on browser-specific range-input pseudo-elements.
- The vertical rule applies to linear sliders and meters. Bipolar pan and
  continuous FX parameters remain rotary controls.

### Ruler

- Height: 33px, padded left 240px (lane-head width).
- The lane-head rendered border box must remain exactly 240px wide so ruler
  marks, tracker grid lines, placements, and playhead share the same x-origin.
- Tick marks use the same beat/bar model as the lane canvas: a transparent
  tick every beat and a stronger tick every bar.
- Bar numbers: 1, 5, 9, 13… (every 4 bars), monospace font, muted color.
- The arrangement capacity is 999 bars in 4/4: 31,968 ticks at 8 ticks per beat
  and 32 ticks per bar. The timeline keeps a 32px-per-beat minimum density, so
  the 999-bar lane canvas is 127,872px wide plus the 240px lane head. A wider
  viewport may expand that surface but never compresses the capacity below
  this density.
- The scrollable capacity is not song length. The exact `songEndTick` comes
  from the latest placement end across all lanes as defined by spec-005. The
  Tracker and Song Progress Bar always expose all 999 bars even when the song
  ends earlier.
- The ruler, playhead, selection overlay, and all lane canvases share one
  horizontal scroll position. Lane heads and the ruler's lane-head spacer stay
  pinned while the rest of the song moves beneath them.
- The **Song Progress Bar** is the only visible horizontal timeline-navigation
  control. It is always rendered as the first row of the Middle Strip, directly
  below the Tracker, uses theme tokens for its track, thumb, hover, focus, and
  disabled states, and remains visible but
  disabled when the song is no wider than the Tracker viewport. Native
  horizontal scrollbar chrome is hidden so operating-system auto-hide behavior
  cannot remove the control.
- The Song Progress Bar thumb size reflects the visible fraction of the full
  arrangement capacity; its position mirrors the shared horizontal scroll
  offset. Pointer dragging, track clicks, Arrow keys, Page Up/Down, Home, and
  End update the visible timeline range without seeking the playhead or
  changing transport state.
- Clicking the timeline portion of the ruler moves the engine and visual
  playhead to the nearest beat boundary (every 8 ticks). The lane-head spacer
  is not a seek target.
- Seeking while playing continues playback from the selected beat. Seeking
  while paused or stopped only repositions the playhead and does not start it.

### Lanes (16)

- Height: 39px fixed per lane.
- **Lane head** (240px wide):
  - Lane name (e.g. "Lane 1"), 11px, truncated with ellipsis.
  - Right-clicking the lane head opens a keyboard-operable context menu with
    Rename lane. Rename replaces the label with a focused, prefilled inline
    field. Enter or blur commits a trimmed, non-empty name; Escape cancels.
  - Mute button (M) — 32×32px, toggle style. Muted lanes are visually dimmed.
  - Solo button (S) — 32×32px, toggle style. When any lane is soloed,
    non-soloed lanes are dimmed.
  - Pan knob — 32×32px drag-to-pan dial with a highlight-token pointer.
- **Lane canvas:** flex:1, position:relative — hosts sample bubbles.
- **Focused lane:** subtle accent-color left border on the lane head.

### Sample Bubbles

- Rendered as rounded rectangles on the lane canvas.
- Position: `left` computed from the clip placement's start tick multiplied by
  pixels-per-tick.
- Width: the placement's project-owned `durationTicks` multiplied by the shared
  pixels-per-tick scale, with a 12px minimum. BPM changes do not resize placed
  sample bubbles; viewport scale changes resize every representation together.
  The Sample Browser reuses an existing placement span for an already-placed
  sample. Before first placement, it estimates the span from source duration
  and detected BPM, or the current project BPM when detection is unavailable,
  so the first drop preserves the same dimensions across views.
- Height: 26px, vertically centered in the 39px lane. Dense Sample Browser and
  category rows wrap the same visual in a separate 30px interaction target.
- Label: sample filename, truncated.
- Bubble color: resolved from the active theme's palette using the placement's
  stable category slot. Known categories have fixed slots; unknown category
  names map to a slot through the shared deterministic hash.
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
- The logical lane spans the full 999-bar surface, but each lane's canvas backing
  store is bounded to the visible Tracker viewport and redraws in full-timeline
  coordinates while scrolling. Scroll events coalesce into at most one redraw
  per animation frame. No canvas bitmap may use the full 127,872px lane width
  because it exceeds Chromium's reliable canvas dimensions.
- Sample drag payload access is defensive: the complete internal sample detail
  is cached synchronously at drag start, before the browser protects payload
  access. Dragover and drop reuse that cache, so an over-capacity sample still
  advertises an unavailable target even when `DataTransfer.getData()` cannot be
  read during dragover. External or malformed drag data is treated as absent.
- A placement drag image may use a larger transparent canvas for shadow padding,
  pointer offset, or a multi-selection badge. The sample bubble drawn inside
  that canvas keeps the canonical musical-span width and 26px height.

### Playhead

- Vertical line spanning the full height of all lanes.
- Position: computed from `currentTick × pixelsPerTick`, updated on every tick
  event from the engine.
- Width: 2px, color: playhead theme token (`--playhead`), z-index above placements.
- Non-interactive (`pointer-events: none`).
- Visible during both playback and when stopped (rests at position 0).

### Middle Strip

#### Context and goals

The Middle Strip is a sleek, low-clutter command surface. It keeps transport
visually stable, makes current project and library state easy to scan, and moves
infrequent commands out of the permanent button row.

- Height: 80px border-box, spanning the full Player width including both left
  rails. The Song Progress Bar uses 28px, the main row uses 48px, and the strip
  owns its borders inside that total. Child padding must not increase either
  row beyond the strip.
- The main row has three semantic zones:
  - **Project zone (left):** one project-identity/menu trigger showing the
    project name and unsaved-state dot. Its menu contains New, Open, Save, and
    Save As with shortcut hints where defined.
  - **Command dock (center):** a separate Undo/Redo group followed by the
    centered Transport Ribbon.
  - **Utility zone (right):** sample search, one transient library-status
    region, and one More menu.
- The More menu contains Keyboard Shortcuts and the single manual **Re-scan
  Sample Folder** recovery action. Re-scan helper text states that it is for
  files changed while MixJam is already open. Uniform Folder Calibration is
  not present in the Middle Strip.

#### Design tokens and foundations

- Use only existing semantic theme tokens for surfaces, text, borders, focus,
  accent, success, warning, and danger. The redesign must work across every
  shipped theme without raw color values in feature selectors.
- Use an 8px spacing rhythm with 4px only for icon/group micro-spacing.
- The strip is one continuous surface. Related controls may share one subtle
  rounded group background; individual idle buttons do not each render as
  raised bordered slabs.
- Play/Pause is the sole filled accent action. Other commands use quiet/ghost
  styling and gain an accent-tinted surface on hover, focus-visible, or active.
- Icons use one consistent 16-18px stroke/fill weight. Action labels use at
  least 13px; status/helper text uses at least 12px.

#### Component rules

- The project trigger uses the available left-zone width up to 320px, truncates
  the name with an ellipsis, and keeps the unsaved-state indicator visible.
- Undo and Redo remain visible because they are frequent editing commands, but
  they are outside the Transport Ribbon and separated from it by spacing, not a
  heavy divider.
- The center **Transport Ribbon** contains exactly four transport buttons:
  - Skip Back (returns to tick 0). Resets the engine scheduler's playhead, not
    just the UI mirror; while playing it restarts playback from the top.
  - Jump to End (moves the playhead and Tracker view to the exact
    `songEndTick`). It is disabled when the song has no placements. When used
    during playback, it stops playback but parks the playhead and view at the
    end instead of applying the natural-playback reset-to-zero rule. Pressing
    Play from that parked state restarts preparation and playback at tick 0.
  - Play / Pause (toggles; Play is accent-colored when stopped, Pause when
    playing). Space toggles the same action.
  - Stop (returns to tick 0 and stops).
- Transport and edit commands use 44px interaction targets inside the 48px row.
  Group padding must not increase the rendered group beyond 48px.
- Search uses a leading search icon, a quiet filled surface, and a flexible
  width between 200px and 320px at supported desktop sizes.
- Library status occupies a bounded slot and appears only for syncing,
  analyzing, completion feedback, or error. It may compact long text to phase
  plus percentage, but its accessible name retains full detail. Active status
  provides Cancel without adding another permanent button to the row.
- The command dock remains anchored to the horizontal midpoint. As space
  tightens, the project name truncates, status text compacts, and search changes
  to an icon-triggered expandable field before any command overlaps, clips,
  scrolls horizontally, or displaces transport.
- Required control states are default, hover, focus-visible, active/pressed,
  disabled, and busy where relevant. Dynamic status never changes the geometry
  of the center command dock.
- Transport buttons call the engine via the bridge layer (spec-005).
- Transport, BPM, mute/solo, and pan controls use the shared accessible tooltip
  primitive, including shortcut hints where one exists. Native `title`
  attributes are not used as the tooltip system.

#### Accessibility requirements

- Every icon-only control has an accessible name and a visible focus indicator.
  Menus use the shared Radix-backed menu primitive and return focus to their
  trigger when closed.
- The project and More menus use concise verb labels, logical separators, and
  visible shortcut hints. Disabled commands remain discoverable where the
  standard application-menu model benefits from them.
- The Middle Strip has no overlapping interactive rectangles. At each supported
  Player size, every target's center hit-tests to that target or one of its
  descendants.

#### Content standards and prohibited implementations

- Use "Re-scan Sample Folder", not "Uniform Re-scan", "Refresh everything", or
  another ambiguous scan label.
- Do not render four equal New/Open/Save/Save As buttons.
- Do not render multiple scan buttons or insert unbounded progress/error text
  into the same grid track as search.
- Do not use a fixed three-column layout whose side content can overlap the
  centered command dock while root overflow remains hidden.
- Do not add per-button gradients, strong bevels, or decorative borders that
  compete with the Play action.

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

- The Keyboard Shortcuts item in the Middle Strip More menu and the "?" key
  open a modal overlay listing all keyboard and mouse shortcuts (transport,
  placement editing, browser).
- Esc, the close button, or a backdrop click dismisses it.
- The overlay uses modal dialog semantics, traps focus while open, and restores
  focus to the opener when dismissed.
- The dialog surface paints above its backdrop. The backdrop dims the
  application without `backdrop-filter`; dialog text and controls remain sharp,
  visible, and hit-testable. Any tooltip opened from the trigger closes before
  the dialog appears.
- Global shortcuts (Space, Delete, Ctrl+Z/Y, ?) are suppressed while a text
  input, textarea, select, or contenteditable element has focus.

### Player Subregions

#### MixJam Browser

- Occupies the upper-left region of the active Player layout.
- Defaults to 18% of the upper work band (240px at the common desktop size)
  instead of competing with the Tracker for one third of the viewport.
- Its right edge resizes only the upper MixJam Browser/Tracker split. The
  current split persists in localStorage as `mixjam:upper-work-layout`; the
  older `mixjam-left-col-w` value is read only as a one-time fallback. Neither
  value constrains the Bottom Workspace.
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
  file) is implemented by project save/load (spec-011).

#### Song panel

- Occupies the Song panel in the full-width Bottom Workspace.
- First-launch default; subsequent visits restore the last active tab.
- While the arrangement is empty, a persistent Tracker cue explains the first
  sample action and opens Samples directly. Opening it also grows a compressed
  Bottom Workspace to at least 50%.
- Controls:
  - **BPM slider** — project tempo control, from 50 BPM to 200 BPM.
  - **Master Volume module** — global output level slider plus the related LUFS
    loudness meter, Momentary fill, M/S/I LUFS and true-peak dBTP readouts, and
    an explicitly labeled RMS dBFS fallback.
- Changing the BPM slider updates the engine's transport BPM immediately.
- Owns song-level controls only. Mixer visibility is controlled by the Bottom
  Workspace tabs, not by resizing Song.

### Resize Handles

**MixJam Browser vertical handle** (`.upper-work-resize`):

- 5px width, `ew-resize` cursor, on the upper work band's browser/tracker seam.
- Resizes only the MixJam Browser/Tracker split and persists the expanded width
  as `mixjam:upper-work-layout`; `mixjam-left-col-w` is only a legacy fallback.
  The existing collapse state remains authoritative while collapsed.
- Does not cross the Middle Strip or change the Bottom Workspace width.

**Browser vertical handle** (`.browser-resize-v`):

- 5px width, `ew-resize` cursor.
- Same smooth-drag pattern.
- Splits the category tree from the sample list within the browser region.

**Bottom Workspace horizontal handle** (`.bottom-workspace-resize`):

- Sits below the fixed-height Middle Strip and changes the height allocation
  between the upper work area and the full-width Bottom Workspace.
- Supports pointer, touch, and keyboard resizing, exposes separator value/min/max
  semantics, and persists the resulting layout as
  `mixjam:bottom-workspace-layout-v2`.

All three split handles use the shared resizable-panel primitive rather than
window-level mouse listeners. Their focus indicator and hit target remain
visible across themes and viewport sizes.

## Acceptance Criteria (testable)

- [x] **AC-001:** The active Player renders the MixJam Browser and Tracker in
  the upper work band, a full-width Middle Strip, and one full-width Bottom
  Workspace below it.
- [x] **AC-002:** The MixJam Browser is visible in the upper-left of the active
  Player by default, shows a merged list of recently opened `.mixjam` files
  plus `.mixjam` files discovered from the current User Folder, and can be
  collapsed/expanded via a persisted toggle button.
- [x] **AC-002a:** The User Folder contribution to the MixJam Browser includes `.mixjam` files found in nested subfolders, not only files at the User Folder root.
- [x] **AC-002b:** The MixJam Browser sorts entries with open history by `lastOpened` descending; discovered projects with no open history appear afterward in alphabetical order.
- [x] **AC-002c:** When the MixJam Browser has no recent entries and no discovered `.mixjam` files, it shows an informational empty state instead of a blank region or browser-specific action buttons.
- [x] **AC-002d:** Resizing the MixJam Browser/Tracker seam changes and persists
  only the upper split; it does not resize or divide the Bottom Workspace.
- [x] **AC-003:** The 80px border-box Middle Strip spans the full Player width
  between the upper and lower work bands. Its 28px Song Progress Bar and 48px
  main row remain fully contained, including borders and group padding.
- [x] **AC-004:** The Bottom Workspace presents Song, Mixer, FX, and Samples as
  ordered peer tabs; the lower reveal seam no longer exists.
- [x] **AC-004a:** With no valid persisted selection, Song is active. A valid
  last tab is restored after remount, and each mounted panel preserves its
  internal state while inactive. The hidden Samples panel keeps its virtual DOM
  empty and does not advance windowed paging until it is visible and measured.
- [x] **AC-004b:** The tabs implement automatic activation, wrapping
  Left/Right Arrow navigation, Home/End, roving tabindex, and correctly linked
  tab/tab-panel ARIA attributes.
- [x] **AC-004c:** The tab row exposes read-only BPM/Master status that opens
  Song, and remains usable at narrow widths without targets below 44 by 44 CSS
  pixels.
- [x] **AC-004d:** The Song panel shows a vertical BPM slider beside one Master
  Volume module that contains its vertical slider, the related vertical Output
  Level meter, M/S/I in LUFS, TP in dBTP, and an explicit RMS dBFS fallback.
  The meter's live fill is Momentary LUFS. Its keyboard-reachable reset action
  is an SVG ear icon with the `Reset loudness measurement` accessible name and
  tooltip. BPM accepts 50 to 200, initializes to 120 for a new project, and
  supports precise numeric entry.
- [x] **AC-004e:** Mixer/FX visual telemetry runs only while Mixer or FX is the
  active Bottom Workspace tab. Song, Samples, and leaving Player cancel its
  animation-frame loop without changing audio state.
- [x] **AC-004f:** Inactive Bottom Workspace panels retain their layout geometry
  while remaining visually hidden, absent from the accessibility tree, and
  outside pointer and sequential-focus paths. A channel fader thumb keeps its
  position and value through Mixer activation and subsequent animation frames.
- [x] **AC-005:** 16 lanes render at 39px each in the Tracker region with 240px
  lane heads showing a name plus keyboard-operable 32px M, S, and pan targets.
- [x] **AC-005a:** Right-clicking a lane head exposes Rename lane. The inline
  rename field is prefilled and focused; Enter or blur commits a trimmed,
  non-empty name, while Escape cancels. A committed name updates the lane label
  and the accessible names of its controls.
- [x] **AC-006:** Clicking a lane's M (mute) button toggles mute state; the lane dims and no audio plays from it. Clicking again restores.
- [x] **AC-007:** Clicking a lane's S (solo) button soloes that lane; all other lanes dim. Clicking again un-soloes.
- [x] **AC-008:** Dragging a sample bubble from the Sample Browser and dropping it onto a lane creates a clip placement snapped to the nearest beat boundary.
  Its bubble is 26px high and uses the placement's project-owned musical span.
  Changing BPM never changes its position or width, and the corresponding
  Sample Browser bubble has the identical pixel width.
- [x] **AC-008a:** Holding Alt while dropping a sample or moving a placement bypasses beat-snap and places it at per-tick precision (freeform).
- [x] **AC-008b:** A drop or move near the arrangement boundary preserves the
  placement's complete duration and clamps its start so its end does not exceed
  tick 31,968. A placement longer than the whole capacity is rejected without
  a dialog, and illegal targets show an unavailable cursor or equivalent
  inline pointer feedback even while the browser protects drag payload access.
- [x] **AC-009:** Placing a sample that overlaps an existing placement on the same lane keeps both sample bubbles visually intact; only the audio
  is monophonic. Overlap never deletes or trims the earlier placement's data.
- [x] **AC-010:** The playhead moves smoothly from left to right during playback, synchronized to audio.
- [x] **AC-011:** The ruler displays beat ticks and stronger bar ticks using the same beat/bar grid as the lane canvas, with bar numbers (1, 5, 9, 13…) in monospace font;
  the ruler x-origin aligns with the tracker grid, placements, and playhead.
- [x] **AC-011a:** Clicking the ruler timeline moves the playhead to the nearest
  8-tick beat boundary, with the clicked beat and rendered playhead sharing the
  same pixel position at every horizontal scroll offset. Arrow Left and Arrow
  Right move by one beat,
  while Home and End move to the timeline boundaries. The engine seeks to the same tick; playback continues from that tick when already playing,
  while paused or stopped transport remains paused or stopped.
- [x] **AC-011b:** The always-rendered, skinnable Song Progress Bar controls the
  shared horizontal position of the ruler, playhead, selections, and every lane
  canvas while lane heads remain pinned. It is keyboard- and pointer-operable,
  exposes its current and maximum positions accessibly, and stays visible but
  disabled when the full arrangement capacity fits the viewport. Its
  `aria-controls` target is the actual Tracker scrollport ID supplied by the
  parent. Native horizontal scrollbar chrome is not the visible navigation
  control. The progress control is a DOM child of the fixed Middle Strip and is
  fully bounded by that strip at supported Player sizes.
- [x] **AC-011c:** The Tracker and Song Progress Bar expose all 999 bars in 4/4
  (31,968 ticks) at a minimum density of 32px per beat. Ruler ticks, placement
  bounds, seeking, and playhead limits use that capacity, independently of the
  content-derived `songEndTick`.
- [x] **AC-011d:** The Tracker region is constrained to its upper-panel height,
  while the always-rendered Song Progress Bar remains visible and
  pointer-operable as the first row of the Middle Strip at the 1280x720 and
  1920x1080 Player sizes.
- [x] **AC-012:** Clicking Play starts playback; the button changes to Pause. Clicking Pause pauses; the button reverts to Play.
- [x] **AC-013:** Clicking Stop halts playback and returns the playhead to tick 0.
- [x] **AC-014:** Clicking Skip Back returns the playhead to tick 0 without stopping playback (if playing).
- [x] **AC-014a:** Jump to End moves both the playhead and Tracker viewport to
  the exact `songEndTick` and is disabled for an empty song. If activated while
  playing, it stops playback and parks at the end; natural playback reaching
  the same tick still stops and resets to tick 0 per spec-005. Play from the
  parked end synchronizes both engine and visual playheads to tick 0 before
  asynchronous preparation begins.
- [x] **AC-015:** The BPM slider shows the current BPM and changing it updates the engine's BPM immediately.
- [x] **AC-015a:** The Song panel's slider and numeric field are two editing
  surfaces for one BPM value and always reflect the transport's current BPM.
- [x] **AC-016:** Dragging the browser's internal vertical resize handle adjusts the category-tree/sample-list split smoothly.
- [x] **AC-016a:** Dragging the Bottom Workspace separator changes its rendered
  height at wide and narrow resolutions. Pointer, touch, and keyboard input all
  work, separator ARIA reports the current value, and the layout persists.
- [x] **AC-016c:** A legacy unversioned vertical layout is ignored once in
  favor of the fresh 24% Bottom Workspace default. The resulting v2 layout is
  stored, and later manual resizing persists across reloads.
- [x] **AC-016b:** Root sample categories use a two-column grid. Expandable
  hierarchy branches may span the grid so their nested children remain
  readable, while leaf categories do not reserve an empty toggle gutter.
- [x] **AC-017:** Placements are rendered on canvas (or equivalent performant surface), not as individual DOM nodes per placement.
- [x] **AC-018:** Shift-dragging a placed sample bubble duplicates its placement at the drop position; the original remains unchanged.
- [x] **AC-019:** Ctrl+drag on the lane canvas area draws a selection rectangle; placements whose bounds intersect the rectangle are selected (highlighted with a white border).
- [x] **AC-020:** Pressing Delete removes all selected placements. Clicking empty space without Ctrl deselects all.
- [x] **AC-021:** Dragging a sample bubble that is part of a multi-selection moves the entire placement group, maintaining relative offsets. Shift-dragging the group duplicates all members.
- [x] **AC-022:** Ctrl+Z undoes the last placement edit (place, move, duplicate, delete, group operations); Ctrl+Y or Ctrl+Shift+Z redoes it.
  The Middle Strip Undo/Redo buttons mirror the shortcuts and disable when their history stack is empty. A multi-placement delete undoes as a single step.
- [x] **AC-023:** The More-menu Keyboard Shortcuts item and the "?" key open a
  modal dialog; Esc, the close button, or a backdrop click dismisses it,
  background interaction is blocked, and focus returns to the opener. The
  dialog paints above its non-blurring backdrop, its center hit-tests to dialog
  content, and a trigger tooltip is closed before the dialog appears.
  Transport, BPM, mute/solo, and pan controls retain accessible tooltip hints
  without native `title` attributes.
- [x] **AC-024:** Clicking a MixJam Browser entry records it as most-recently opened, re-sorts the browser, and shows its name in the
  Middle Strip. Right-clicking shows an Open / Copy Path context menu. Entries show a hover state.
  Full project deserialization restores lanes and placements from the `.mixjam`
  file through spec-011.
- [x] **AC-025:** A sample bubble keeps its canonical width and 26px height in
  the drag image; any minimum drag surface, theme-shadow clearance, or group
  badge uses transparent space outside that rectangle.
- [x] **AC-026:** Space toggles Play/Pause when focus is not in a text control.
- [x] **AC-027:** An arrangement with no placements keeps a visible first-sample
  cue in the Tracker; its Open Samples action activates Samples and grows the
  Bottom Workspace to at least 50% when needed. The cue disappears after the
  first placement.
- [x] **AC-028:** Transport, Mixer, theme, header, footer, and management actions
  expose 44px interaction targets. Dense Sample Browser and category rows use
  30px targets around the unchanged 26px sample-bubble visual. Dense Tracker
  lane controls use 32px targets. All exceptions remain keyboard-operable with
  visible focus. Actionable labels are at least 13px outside the dense Tracker;
  Tracker secondary labels remain readable at 11px on the captured desktop
  surfaces.
- [x] **AC-029:** One project identity/menu trigger exposes New, Open, Save, and
  Save As without rendering four equal Middle Strip buttons. New uses the Home
  Screen reset path, and project names can use up to 320px before truncation.
- [x] **AC-030:** At 1280×720 and 1920×1080 across every shipped theme and
  idle, syncing, analyzing, and error states, Middle Strip controls remain
  inside the strip, actionable rectangles do not intersect, target centers
  hit-test correctly, and the command dock stays visually centered.
- [x] **AC-031:** The Middle Strip exposes no more than one manual Re-scan
  action and no Uniform Re-scan action. Sync and analysis progress share one
  bounded library-status region that cannot push into search or transport.
- [x] **AC-032:** Play/Pause is the only filled accent command. Related quiet
  controls share restrained group surfaces, and the strip uses semantic theme
  tokens consistently across all shipped themes.

## Bottom Workspace Validation Evidence

- `src/renderer/src/components/PlayerView.test.tsx` verifies ordered peer tabs,
  first-launch and persisted selection, mounted panels, automatic keyboard
  activation, song status, telemetry activation, the upper-only resize seam,
  and cached oversized-sample rejection while dragover payload access is
  protected.
- `src/renderer/src/components/LaneRow.test.tsx` and
  `src/renderer/src/components/PlayerView.test.tsx` verify lane-head context
  actions, inline rename commit/cancel behavior, and the rename callback.
- `src/renderer/src/components/MixJamBrowser.test.tsx` verifies the Open and
  Copy Path context-menu actions for discovered and recent project entries.
- `tmp/verify-bottom-workspace/evidence.md` records production Chromium
  geometry, narrow-window targets, tab-state retention, Sample Browser
  remeasurement, and cross-tab Mixer-to-FX behavior.
- `tmp/verify-samples-fx-layout/evidence.md` records the historical
  pre-compact two-column root category grid, 44px targets, and 32px category
  bubbles in production Chromium.
- `tests/e2e/lane-head-overlap.spec.ts` verifies that collapsing or expanding
  the MixJam Browser updates the parent grid in the same interaction and keeps
  the Tracker ruler, lane names, and lane heads clear of the browser rail.
- `src/renderer/src/components/PlayerView.test.tsx` verifies the shared vertical
  Song controls, precise BPM entry and rejection, and orientation-aware BPM
  keyboard commands.
- `src/renderer/src/components/SongControlsMain.test.tsx` verifies that Output
  Level and its icon-only reset action are contained by the Master Volume
  module, keep their accessible names, and preserve reset behavior.
- `tmp/verify-master-output-group/evidence.md` records production Chromium
  containment, geometry, hit testing, keyboard focus, horizontal fit, and the
  shared reset tooltip at 1280x720 and 1920x1080.
- `tests/e2e/library.spec.ts` verifies that subcategory, sort, and management
  actions render with at least 44-by-44px interaction boxes in production
  Chromium. Dense Sample Browser tiles and category-tree rows use the separate
  30px contract above.
- `tmp/verify-vertical-controls/evidence.md` records production Chromium
  geometry at desktop and narrow widths, vertical direction, 44px targets,
  keyboard behavior, and focus indicators across every bundled theme.
- `tmp/verify-complete-system/evidence.md` records the complete production
  Chromium matrix across all 16 themes, 1280px and 480px viewports, and all
  four tabs, plus tab persistence, roving keyboard navigation, FX channel
  selection, Sample Browser state retention, and rendered geometry.
- `tmp/verify-ui-primitives/evidence.md` records production Chromium checks for
  pointer and keyboard resizing, menus, popovers, tabs, tooltips, dialog focus,
  touch rotary input, and timeline keyboard stepping.
- `tmp/verify-tracker-horizontal-scroll/` records the historical 128-bar
  production Chromium baseline
  for the Song Progress Bar at 1280x800, a 5120x1440 ultrawide viewport, and
  DPR 2. The checks cover all 128 bars, shared ruler/lane scrolling, pinned lane
  heads, keyboard and pointer navigation, theme changes, the visible disabled
  state, unchanged transport position, and canonical sample-bubble geometry.
- `tests/e2e/timeline-seek.spec.ts` verifies in production Chromium that exact
  beat clicks share playhead geometry, Skip Back resets the playhead and
  Tracker viewport, and Jump to End parks at the exact content-derived end and
  brings it into view. It also delays sample preparation to prove that Play
  from the parked end restarts at tick 0 without being cancelled by end
  detection.
- `tmp/verify-song-capacity/evidence.json` and its screenshots record the
  historical pre-compact 168,052px timeline, grid maximum tick 31,960, exact Jump to End tick
  5,032 with scroll position 25,556, and Skip Back restoring both values to 0.
- `tmp/verify-middle-strip-progress/` records the historical pre-compact built-Chromium geometry,
  center-point hit testing, and screenshots at 1280x720 and 1920x1080. At both
  sizes the Song Progress Bar is a visible DOM child fully bounded by the
  100px Middle Strip.
- `tests/e2e/compact-layout.spec.ts` verifies the 75% shared Tracker geometry,
  all-lane visibility, the 80px Middle Strip, fresh 24% Bottom Workspace,
  v1-to-v2 one-time reset, later manual persistence, and root overflow across
  representative stress themes. Its Middle Strip matrix covers all 16 shipped
  themes at 1280×720 and 1920×1080 in idle, syncing, analyzing, and error
  states.
- `tmp/verify-compact-layout/evidence.md` records the matching computed
  geometry and screenshots.
- `npm run measure:song-progress-performance` reproduces the full-capacity
  built-Chromium characterization under
  `tmp/verify-song-progress-performance/`. Six raw CDP traces cover a real
  pointer drag from start to end and back across 999 bars, 16 lanes, and 15,984
  placements. Native-speed p95 frame intervals were 16.7-16.8ms and p95
  input-to-scroll latency was 0.5ms; at 4x CPU slowdown those ranges were
  50.1ms and 2.4-2.9ms. Every run reached capacity, kept canvas backing stores
  viewport-bounded, and coalesced lane redraws to one per animation frame.
  These values are characterization only because no numeric performance budget
  has been approved.

## Non-Goals (deferred to later specs)

- No bulk project management actions (pinning, removing entries, or custom grouping) inside the MixJam Browser.
- The Middle Strip itself remains fixed-height; resizing is owned by the
  dedicated separator immediately below it, not by dragging the strip.
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
- [WAI-ARIA Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) — tab roles, relationships, and keyboard behavior.
- [Microsoft touch interactions](https://learn.microsoft.com/windows/apps/develop/input/touch-interactions#hit-targets) — 44-by-44 touch-optimized targets.
