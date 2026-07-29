# Spec 006 — MixJam Player Timeline & Panel Layout

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** PARTIAL — the app implements the Player baseline
and app-wide UI Size layout. Other unchecked acceptance criteria remain open.
**Depends on:** spec-005 (Audio Playback Engine)

## Objective

Implement the MixJam Player's visual region layout from the approved General
Layout mock-up. Add an upper row with the MixJam Browser and Tracker. Add a
full-width Middle Strip with the Transport Ribbon and global controls. Add one
full-width Bottom Workspace with Master, Mixer, and Samples tabs. Within that
shell, define the dynamic 1-through-64-lane Tracker. Also define sample bubbles,
the ruler, the moving playhead, and browser adjacencies.

## User Stories

- **US-001:** As a user, I see a dedicated MixJam Browser in the active Player.
  It includes recent `.mixjam` files and files from the current User Folder.
  Project-switching controls have a stable location.
- **US-002:** As a user, I see the Tracker occupy the upper-right
  primary work area so arrangement stays visually dominant.
- **US-003:** As a user, I see a full-width Middle Strip between the tracker and
  browser. Transport controls and global song state have a clear boundary.
- **US-004:** As a user, I can switch the full-width Bottom Workspace between
  Master, Mixer, and Samples. Each tab uses the same reveal method.
- **US-004a:** As a user, I can adjust master volume and monitor overall
  loudness. I can also change BPM from the Middle Strip without opening Mixer.
- **US-004b:** As a keyboard user, I can navigate and activate every Bottom
  Workspace tab using the standard tablist keyboard model.
- **US-005:** As a user, I can place sample bubbles onto lanes. The Sample
  Browser shows the same project-owned musical-span geometry. BPM changes do not
  affect this geometry.
- **US-006:** As a user, I see a moving playhead sweep across the timeline
  during playback, synchronized to the audio.
- **US-007:** As a user, I see a ruler with bar numbers and tick marks. These
  marks show my position in the arrangement.
- **US-007a:** As a user, I can click the ruler to move the playhead to the
  nearest beat. I can start or resume playback from a precise grid position.
- **US-007b:** As a user, I can use an always-visible Song Progress Bar. It
  navigates across the full 999-bar capacity without changing playback position.
- **US-008:** As a user, I can use the Middle Strip transport buttons. Skip
  Back, Jump to End, Play/Pause, and Stop control playback. They also navigate
  to the last content tick.
- **US-009:** As a user, I can drag the browser's internal vertical resize
  handle. It adjusts the split between the tag navigator and sample list.
- **US-010:** As a user, I can resize the upper work area against the Bottom
  Workspace. The tracker or active lower workflow gets the space I need.

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
  │           ├── .empty-lane-macro — bulk removal for empty lanes
  │           ├── .lane × 1..64 — height follows UI Size
  │           └── .add-lane-row — persistent append action
  │               ├── .lane-head — 240px: name, M/S buttons, pan knob
  │               └── .lane-canvas — clip placement area
  ├── .middle-strip     — 80px base border-box, full-width command band
  │   ├── .song-progress-bar — 28px persistent timeline navigation row
  │   └── .middle-strip-main — 48px project + edit + transport + utility row
  └── .bottom-workspace — full-width tabbed work band
      ├── .bottom-workspace-tabs — Master | Mixer | Samples + Master status
      └── .bottom-workspace-panel — active peer panel
          ├── Master    — 13-slot Master Bus Strip with pinned
          │               input/output meters (spec-012)
          ├── Mixer     — lane strips + Return + FX1..FX4 (specs 007 and 010)
          └── Samples   — tag navigator + virtualized sample list (spec-004)
```

### Region Contract

- Player layout, sizing, and region relationships follow the
  [Style Guide](../style-guide.md#layout-architecture).
- The supported Player minimum is 1920x1080 CSS pixels. At that size, set UI
  Size 50 and open Mixer. The Tracker still shows the ruler and at least one
  complete lane. The root Player does not gain a vertical scrollbar.
- UI Size is an app preference with values 30, 40, and 50 and a default of 40.
  Sample-bubble/lane heights are 24/37px, 33/49px, and 41/61px respectively.
  UI Size changes presentation only. It never changes project data.
- The active Player uses a two-column layout only in the upper work band. The
  Bottom Workspace spans the full Player width and does not inherit the upper
  MixJam Browser/Tracker split.
- The **MixJam Browser** is visible in the active Player layout. This
  spec only reserves the region. A later section defines project-switching
  behavior.
- The **Bottom Workspace** is the only lower-band container. Master, Mixer, and
  Samples are peer tabs. Future peer workflows append tabs to the same
  tablist instead of adding another reveal system.
- The **Middle Strip** is a fixed, full-width band between the upper and lower
  work areas. The Song Progress Bar is its first row. It cannot scroll or resize
  with the Tracker. Its main row contains project identity and a separate
  edit-history group. It also contains the centered Transport Ribbon and sample
  search.

  Transient library status and compact menus support infrequent actions.
  The Transport Ribbon contains transport controls only.
- The **Sample Browser** lives in the Samples panel and owns its internal
  tag-navigator/sample-list split.
- Visual treatment of all controls, surfaces, buttons, and indicators follows
  the [Style Guide](../style-guide.md#surface-treatments).

### Bottom Workspace

- Tab order is **Master, Mixer, Samples**. Master is active only when no valid
  saved tab exists. Thereafter, the last active tab persists in localStorage as
  `mixjam:bottom-workspace-tab`. Missing or unknown values fall back to Master.
- Tab behavior (activation, keyboard navigation, ARIA, panel lifecycle) follows
  the [Style Guide](../style-guide.md#tabs-bottom-workspace).
- All three panels remain mounted in the same Bottom Workspace grid cell while
  inactive. Inactive panels keep their layout geometry. The interface hides
  them visually and removes them from accessibility and pointer interaction
  paths. It also excludes them from sequential focus. Tab changes preserve
  Sample scroll/filter
  state, Mixer state, and stable control geometry. The
  inactive Samples panel mounts no virtual rows and cannot request result pages.
- Mixer meters and return-module telemetry share one visual-only loop. Its
  animation-frame loop runs only while Mixer is active. Master and Samples
  pause that loop without changing audio state or unmounting any panel.
- Mixer uses one horizontal scrollport with the lane strips in visible order.
  A 2x2 grid of combined FX and Return containers follows. The containers are
  `FX1` through `FX4`. At base UI Size 30, lane strips are 76px wide. Each combined
  container is 160px wide.

  All lane strips and all four combined containers
  remain reachable by horizontal scrolling. The layout pins none outside that
  scrollport.
- The tab row shows compact read-only BPM and Master status. The status
  is an accessible button that activates Master. It does not create a second
  editable BPM or gain control.
- Default layout proportion and sizing follow the
  [Style Guide](../style-guide.md#layout-architecture). The current layout
  persists under `mixjam:bottom-workspace-layout-v2`. Other layout keys are
  ignored. Every manual resize updates the current key and survives remounts.
- One Player workspace-preference module owns validation, defaults, and storage
  for both panel layouts and the active tab. It also owns Samples
  expansion/restore state and MixJam Browser collapse. Rendering code
  coordinates live panel refs but does not parse or write storage formats.
- The Bottom Workspace module owns that live coordination. It owns panel refs,
  tab-size capture and restore, expand/restore actions, and browser-collapse
  effects. It also owns the UI-Size-derived minimum for each tab. Manual sizes, stored sizes, tab
  changes, expansion restores, and UI Size changes all clamp through the same
  content-safe minimum. The root Player supplies content and layout regions but
  does not duplicate this state machine.
- The resizable Panel's drag floor uses the smallest tab's content-safe minimum.
  It does not use the active tab's minimum. A per-tab floor changed the Panel's
  `minSize` on every tab switch. This change re-registered the panel group's size
  constraint during the switch commit. It forced a synchronous layout and
  clamp. The size restoration used a second, rAF-deferred frame.

  This two-frame
  delay exceeded the audio scheduler's lookahead margin and caused a playback
  glitch. A constant drag floor prevents a new clamp after a tab change. The
  size restoration now runs in the same commit as the tab change. Thus, a switch
  uses one frame, not two.
- A CSS `min-height` on the active panel content sets the per-tab content floor.
  The property is `--bottom-workspace-content-min-height`. It remains effective
  when a panel root sets `min-height: 0`. The content keeps the active tab's full
  layout budget.

  The panel is a vertical scrollport. Thus, a tab below its budget
  scrolls, and every control remains reachable. The interface does not clip or
  stop the controls. Tab restoration still
  lifts each tab to its own remembered budget through the imperative resize.
- At supported 1920x1080 geometry, every Master, Mixer, and Samples control stays
  within its card. Every control remains reachable. Controls are visible when
  the panel meets or exceeds the tab budget. Below the budget, panel scrolling
  keeps them reachable.

  The three panel subtrees stay memoized. A switch renders
  the tab chrome and panel group again. It does not render the Mixer strips,
  Master rack, Sample Browser, or Tracker again.
- Mixer effect selection and editing remain inside Mixer. There is no FX tab or
  cross-tab FX transition.
- Samples exposes an explicit expand/restore action. Expansion grows the Bottom
  Workspace to 60%. Restoration returns to the previous user-controlled size.
  Expansion intent and the restore size persist separately from the panel
  layout. Thus, a manual 60% workspace size never makes Restore cause an unseen
  24% jump.
- The Bottom Workspace has no Master Controls/Mixer reveal seam. Resizing or
  collapsing the upper MixJam Browser remains independent of its full width.

### Middle Strip Controls

- The Middle Strip carries the project BPM control as a horizontal slider. An
  editable numeric value stays at the slider's left margin. Both surfaces
  reflect one transport BPM value (50 to 200). Invalid or out-of-range input is
  not committed. The slider uses the app-wide Mixer-derived linear rail and
  compact rectangular handle.

### Master Panel Controls

- The Master panel contains only the 13-slot Master Bus Strip (spec-012).
  Master Volume is no longer a Master-tab control. The tab row keeps its
  read-only Master status. The strip's Gain Stage module owns gain staging.
- Master output metering lives in the strip's pinned output meter, which
  supersedes the previous standalone Output Level block. The strip's style
  rules live in the [Style Guide](../style-guide.md#master-bus-strip).
- The Player Settings modal contains the project-owned automatic clip-edge
  micro-fade controls. These controls include one enabled checkbox and
  fractional fade-in and fade-out millisecond fields. Both fields accept 0 through 20 ms and default to 2 ms and
  4 ms. The move out of Master does not change sound, dirty-state, or project
  persistence behavior.
- The Master Bus Strip's pinned output meter shows Momentary, Short-term, and
  Integrated LUFS plus true peak in dBTP. Spec-012 owns its behavior and layout.
- Level faders and meters increase vertically from bottom to top. The shared
  linear-slider visual is orientation-independent: BPM and Delay parameters use
  its horizontal form. Bipolar pan and continuous Mixer controls remain rotary.

### Ruler

- Sizing, spacing, tick-mark styling, and bar-number formatting follow the
  [Style Guide](../style-guide.md#layout-architecture). Visual treatment follows
  the [Style Guide](../style-guide.md#typography).
- The lane-head rendered border box must remain exactly 240px wide. Ruler marks,
  tracker grid lines, placements, and playhead share the same x-origin.
- The arrangement capacity is 999 bars in 4/4. It has 31,968 ticks at 8 ticks
  per beat and 32 ticks per bar. Minimum timeline density follows the
  [Style Guide](../style-guide.md#spacing--rhythm).
- The scrollable capacity is not song length. The exact `songEndTick` comes
  from the latest placement end across all lanes as defined by spec-005. The
  Tracker and Song Progress Bar always expose all 999 bars even when the song
  ends earlier.
- The ruler, playhead, selection overlay, and all lane canvases share one
  horizontal scroll position. Lane heads and the ruler's lane-head spacer stay
  pinned while the rest of the song moves beneath them.
- The **Song Progress Bar** is the only visible horizontal timeline-navigation
  control. The Middle Strip always renders it as the first row below the
  Tracker. It remains visible but disabled when the song is no wider than the
  Tracker viewport. The interface hides native horizontal scrollbar chrome.
  Thus, operating-system auto-hide behavior cannot remove the control.
- The Song Progress Bar thumb size reflects the visible fraction of the full
  arrangement capacity. Its position mirrors the shared horizontal scroll
  offset. Pointer dragging and track clicks update the visible timeline range.
  Arrow keys, Page Up/Down, Home, and End do the same. These actions do not seek
  the playhead or change transport state.
- Clicking the timeline portion of the ruler moves the engine playhead to the
  nearest beat boundary. It moves the visual playhead to the same 8-tick
  boundary. The lane-head spacer
  is not a seek target.
- Seeking while playing continues playback from the selected beat. Seeking
  while paused or stopped only repositions the playhead and does not start it.

### Lanes (1 through 64)

- `hooks/useTrackerInteraction.ts` owns Tracker selection and drag coordination.
  It owns scroll and transport-location policy, lane context menus, and
  sample-location feedback. `PlayerView` composes the Tracker region. It renders
  the returned state. It does not own a parallel interaction state machine.
- Lane sizing, head width, and control dimensions follow the
  [Style Guide](../style-guide.md#layout-architecture). Visual treatment follows
  the [Style Guide](../style-guide.md#spacing--rhythm).
- A blank project contains exactly eight lanes. Each lane has a stable project
  ID. Visible lane numbers and default names follow current array order.
- The persistent **Add Lane** row follows the last lane. It appends one lane,
  stops playback first, and creates the lane's complete default mixer state.
  At 64 lanes it remains visible but disabled, with a tooltip explaining the
  64-lane limit.
- **Lane head:**
  - Lane name (e.g. "Lane 1"), truncated with ellipsis.
  - Right-clicking the lane head opens a keyboard-operable context menu with
    Rename lane. Rename replaces the label with a focused, prefilled inline
    field. Enter or blur commits a trimmed, non-empty name. Escape cancels.
  - The same menu contains Delete lane. The interface disables it at one lane. Deleting an
    empty lane is immediate. Deleting a non-empty lane opens a blocking
    confirmation that names the lane and states its placement count.
  - Mute button (M) — toggle style. Muted lanes are visually dimmed.
  - Solo button (S) — toggle style. When a user solos any lane, the interface
    dims non-soloed lanes.
  - Pan knob — drag-to-pan dial. Interaction follows the
    [Style Guide](../style-guide.md#rotary-controls-sends-return-mix-lane-header-pan-fx-parameters).
- **Lane canvas:** hosts sample bubbles.
- **Focused lane:** subtle accent-color left border on the lane head.
- Add and delete stop playback before changing project state. Deletion removes
  the lane and its lane-owned mixer state. It keeps every surviving stable ID.
  It shifts and renumbers later lanes in visible order. Add and delete participate
  in the same undo history as placement edits.
- An eye-icon **Follow playhead** toggle sits above the lane headers immediately
  before the empty-lane macro. It is off whenever the Player mounts and is
  transient UI state, not project or app state. While enabled and playing, the
  Tracker centers the current playhead in the visible timeline area, clamped at
  the arrangement boundaries. Enabling it during playback centers the current
  playhead immediately.

  Later playhead ticks do not scroll while the playhead
  remains inside the central 60% of the visible timeline. Crossing either 20%
  guard band recenters it. This avoids continuous canvas redraws while keeping
  the playhead in view. Paused, stopped, and preparing transport do not trigger
  follow scrolling.
- An unlabeled trash-icon macro sits above the lane headers. Its accessible name
  describes removing empty lanes, and its adjacent value is the number of
  removable empty lanes. Its tooltip explains the operation. Activation removes
  all empty lanes without confirmation as one undoable command. It preserves the
  first lane in visible order when every lane is empty. The interface disables
  it when the removable count is zero.

### Sample Bubbles

- Bubble appearance, geometry, color, label treatment, and rendering follow the
  [Style Guide](../style-guide.md#sample-bubbles).
- Position: `left` computed from the clip placement's start tick multiplied by
  pixels-per-tick.
- Width: the placement's project-owned `durationTicks` multiplied by the shared
  pixels-per-tick scale. BPM changes do not resize placed sample bubbles.
  Viewport scale changes resize every representation together.

  The Sample Browser reuses an existing placement span for an already-placed
  sample. Before first placement, it estimates the span from source duration and
  detected BPM. It uses the current project BPM when detection is unavailable.
  Thus, the first drop preserves the same dimensions across views.
- Bubble color: resolved from the active theme's palette using the placement's
  stable source-group slot. Known top-level source-folder names have fixed
  slots. Unknown names map to a slot through the shared deterministic hash.
- **Snap-to-beat (default):** Dropping a browser sample snaps its start to the
  nearest beat boundary. Moving a Tracker sample bubble applies the same 8-tick
  snap. Holding **Alt** while dropping or moving
  places the placement at per-tick precision (freeform). The contract reserves
  **Shift** for sample duplication. It reserves **Ctrl** for rectangle-drag
  multi-select.
- **Monophonic cut-off behavior** (per spec-005): a lane is monophonic only in
  *audio*. A new trigger cuts off the previous voice on that lane. The interface
  does *not* trim overlapping placements visually. Both bubbles keep their full
  size and data. Thus, an accidental overlap never destroys the previous
  sample's information.
- A canvas element renders placements for performance. Individual DOM nodes do
  not render them. This supports smooth scrolling at high placement counts.
- The logical lane spans the full 999-bar surface. Each lane's canvas backing
  store has a maximum of two visible Tracker viewports. The extra
  horizontal viewport is split around the visible range as overscan. Scrolls
  inside that covered range reuse the bitmap. Crossing its inner 10% guard
  schedules one frame-coalesced redraw in full-timeline coordinates. This keeps
  Follow playhead recentering covered without allocating the full 127,872px
  lane width, which exceeds Chromium's reliable canvas dimensions.
- Sample drag payload access is defensive. The browser caches the complete
  internal sample detail synchronously at drag start. It does this before it
  protects payload access. Dragover and drop reuse that cache. Thus, an
  over-capacity sample still shows an unavailable target when dragover cannot
  read `DataTransfer.getData()`. The interface treats external or malformed drag
  data as absent.
- Drag image sizing follows the [Style Guide](../style-guide.md#sample-bubbles).

### Playhead

- Vertical line spanning the full height of all lanes.
- Position: computed from `currentTick × pixelsPerTick`, updated on every tick
  event from the engine.
- Visual treatment follows the [Style Guide](../style-guide.md#interaction-patterns).
- Non-interactive (`pointer-events: none`).
- Visible during both playback and when stopped (rests at position 0).

### Middle Strip

#### Context and goals

The Middle Strip is a low-clutter command surface. It keeps transport visually
stable and makes the current project and library state easy to scan. It moves
infrequent commands out of the permanent button row.

- Sizing, zone layout, spacing, and visual treatment follow the
  [Style Guide](../style-guide.md#layout-architecture) and
  [Style Guide](../style-guide.md#surface-treatments).
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
  files changed while MixJam is already open. Contextual analysis runs as part
  of the normal analyzer and adds no second Middle Strip command.

#### Design tokens and foundations

- Use only existing semantic theme tokens for surfaces, text, borders, focus,
  accent, success, warning, and danger. The redesign must work across every
  shipped theme without raw color values in feature selectors.
- Visual treatment of buttons, icons, and labels follows the
  [Style Guide](../style-guide.md#surface-treatments) and
  [Style Guide](../style-guide.md#typography).

#### Component rules

- The project trigger truncates the name with an ellipsis and keeps the
  unsaved-state indicator visible.
- Undo and Redo remain visible because they are frequent edit commands. They are
  outside the Transport Ribbon. Spacing, not a heavy divider, separates them
  from the ribbon.
- The center **Transport Ribbon** contains exactly four transport buttons:
  - Skip Back (returns to tick 0). Resets the engine scheduler's playhead, not
    just the UI mirror. While playing it restarts playback from the top.
  - Jump to End (moves the playhead and Tracker view to the exact
    `songEndTick`). The interface disables it when the song has no placements. During
    playback, it stops playback. It parks the playhead and view at the end. It
    does not apply the natural-playback reset-to-zero rule. Pressing
    Play from that parked state restarts preparation and playback at tick 0.
  - Play / Pause (toggles). Space toggles the same action.
  - Stop (returns to tick 0 and stops).
- Search uses a leading search icon and a quiet filled surface.
- Library status occupies a bounded slot and appears only for syncing,
  analyzing, completion feedback, or error. It may compact long text to phase
  plus percentage, but its accessible name retains full detail. Active status
  provides Cancel without adding another permanent button to the row.
- The command dock remains anchored to the horizontal midpoint. As space
  decreases, the project name truncates and status text compacts. Search changes
  to an icon-triggered expandable field. This happens before a command overlaps,
  clips, scrolls horizontally, or displaces transport.
- Required control states are default, hover, focus-visible, active/pressed,
  disabled, and busy where relevant. Dynamic status never changes the geometry
  of the center command dock.
- Transport buttons call the engine via the bridge layer (spec-005).
- Tooltips follow the [Style Guide](../style-guide.md#tooltips).

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
- Do not use a fixed three-column layout if side content can overlap the
  centered command dock. The root overflow must remain hidden.
- Do not add per-button gradients, strong bevels, or decorative borders that
  compete with the Play action.

### Undo/Redo

- One project command stack covers clip-placement edits, lane addition, lane
  deletion, and bulk empty-lane removal. It covers lane name, mute, solo, pan,
  volume, Sends, Return levels, and limiter toggles. It also covers FX selection,
  parameters, Power, and Clear. A structural lane command stores the complete
  affected lane and Mixer state. Thus, undo restores the same stable IDs,
  placements, order, and Send values. BPM remains
  outside this history.
- Each entry is an immutable project edit snapshot or delta with structural
  sharing, capped at 100 entries. A new edit clears the redo stack.
- One continuous pointer, wheel, or repeated-key adjustment gesture collapses
  into one history entry. The project-history hook owns the gesture baseline,
  live updates, commit, cancel, and synchronization behavior. Feature hooks do
  not keep a second gesture snapshot.
- Bindings: Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes. The platform primary
  modifier works for these commands. The Middle Strip
  buttons mirror the same actions and disable when their stack is empty.
- A multi-placement Delete is one history entry (batch remove), so one Ctrl+Z
  restores the whole selection.

### Blocking modal command policy

- A blocking lane-delete or Mixer FX editor modal traps focus and blocks
  background pointer and keyboard interaction.
- Enter activates Save or the modal's affirmative action. Escape cancels.
  Arrow keys navigate modal controls. In an FX editor, Space toggles bypass,
  Backspace resets the focused parameter, and Ctrl+Backspace resets all module
  parameters. Editable text fields retain their normal editing behavior.
- While a blocking modal is open, transport and application hotkeys do not run.
  OS Media Session actions remain available. Previous seeks to tick 0.
  Play/Pause toggles transport. Next seeks to exact song end.

### Keyboard shortcuts overlay

- The Keyboard Shortcuts item in the Middle Strip More menu opens a modal
  overlay. The "?" key opens the same overlay. It lists project, transport,
  placement edit, and browser shortcuts.
- Esc, the close button, or a backdrop click dismisses it.
- The overlay uses modal dialog semantics, traps focus while open, and restores
  focus to the opener when dismissed.
- Visual treatment follows the [Style Guide](../style-guide.md#interaction-patterns).
- One global Player shortcut policy owns matching, editable-target guards,
  dispatch, and the descriptions used by menus, tooltips, and this overlay.
  It includes Save, Save As, Space, Delete, Undo, Redo, and Help. Global
  The policy suppresses shortcuts while a text input, textarea, select, or
  contenteditable element has focus.

### Player Subregions

#### MixJam Browser

- Occupies the upper-left region of the active Player layout.
- Default sizing, collapse behavior, and visual treatment follow the
  [Style Guide](../style-guide.md#layout-architecture).
- Its right edge resizes only the upper MixJam Browser/Tracker split. The
  current split persists in localStorage as `mixjam:upper-work-layout` and does
  not constrain the Bottom Workspace. The module rejects a stored value with
  incorrect panel names or number types. It uses the default instead.
- Includes a collapse/expand toggle. Its state persists in localStorage as
  `mixjam:recents-rail-collapsed`. When collapsed, the interface shows only the
  toggle button. The browser stays visually flush and leaves no stray divider
  in the tracker lane header.
- Lists two merged sources:
  - recently opened `.mixjam` files from the persisted recent-project registry
  - `.mixjam` files discovered by recursively scanning the current User Folder
    (spec-003)
- If the same project appears in both sources, the browser shows it once. The
  browser deduplicates it by canonical file path.
- Ordering rule:
  - entries with a known `lastOpened` timestamp sort first, newest to oldest
  - discovered `.mixjam` files with no open history sort after those entries,
    alphabetically by display name
- Empty state:
  - The rail shows an informational empty state when no recent or discovered
    `.mixjam` files exist.
  - The copy explains that no MixJam projects exist yet. It states that saving
    or opening a `.mixjam` file will populate the rail.
  - The empty state does not add browser-specific action buttons.
- Entries are interactive:
  - Each entry is a full-width click target with a hover state.
  - Clicking an entry opens it and records it as most-recently opened. The
    browser sorts again. The project name appears in the Middle Strip.
  - Right-clicking an entry shows a context menu with **Open** and
    **Copy Path**.
- Project save/load (spec-011) implements full project deserialization. This
  restores lanes and placements from the `.mixjam` file.

#### Master panel

- Occupies the Master panel in the full-width Bottom Workspace.
- First-launch default. Later visits restore the last active tab.
- While the arrangement is empty, a persistent Tracker cue explains the first
  sample action and opens Samples directly. Opening it also grows a compressed
  Bottom Workspace to at least 50%.
- Controls:
  - **Master Bus Strip (spec-012)** — the 13-slot mastering rack with pinned
    input and output meters. The output meter shows Momentary, Short-term, and
    Integrated LUFS plus true peak in dBTP. The strip's Gain Stage module owns
    gain staging. A separate Master Volume module no longer exists.
- Master does not render Clip Edge Fades. Their project-owned editor is in the
  Player Settings modal.
- Changing the BPM slider updates the engine's transport BPM immediately.
- Owns project-wide sound controls only. The Bottom Workspace tabs control Mixer
  visibility. Resizing the Master panel does not control it.

### Resize Handles

Sizing and visual treatment follow the [Style Guide](../style-guide.md#resize-handles).

**MixJam Browser vertical handle** (`.upper-work-resize`):

- Resizes only the MixJam Browser/Tracker split and persists the expanded width
  as `mixjam:upper-work-layout`. The existing collapse state remains
  authoritative while collapsed. The module reads no previous width key.
- Does not cross the Middle Strip or change the Bottom Workspace width.

**Browser vertical handle** (`.browser-resize-v`):

- Splits the tag navigator from the sample list within the browser region.

**Bottom Workspace horizontal handle** (`.bottom-workspace-resize`):

- Sits below the fixed-height Middle Strip. It changes the height allocation
  between the upper work area and the full-width Bottom Workspace.
- Supports pointer, touch, and keyboard resizing, exposes separator value/min/max
  semantics, and persists the resulting layout as
  `mixjam:bottom-workspace-layout-v2`. Its drag floor is the smallest tab's
  UI-Size-derived content minimum (constant across tab switches). The active
  tab's own minimum is a CSS content floor. Dragging a taller tab below its
  budget scrolls the panel. Every control remains reachable.

All three split handles use the shared resizable-panel primitive rather than
window-level mouse listeners.

## Acceptance Criteria (testable)

- [x] **AC-001:** The active Player renders the MixJam Browser and Tracker in
  the upper work band. It renders a full-width Middle Strip and one full-width
  Bottom Workspace below it.
- [x] **AC-002:** The MixJam Browser appears in the active Player's upper-left by
  default. It shows a merged list of recent `.mixjam` files. The list also
  contains `.mixjam` files from the current User Folder. A persisted toggle
  button collapses or expands it.
- [x] **AC-002a:** The MixJam Browser includes `.mixjam` files from nested User
  Folder subfolders. It does not include only the User Folder root.
- [x] **AC-002b:** The MixJam Browser sorts entries with open history by `lastOpened` descending. Discovered projects with no open history appear afterward in alphabetical order.
- [x] **AC-002c:** When the MixJam Browser has no recent or discovered `.mixjam`
  files, it shows an informational empty state. It does not show a blank region
  or browser-specific action buttons.
- [x] **AC-002d:** Resizing the MixJam Browser/Tracker seam changes and persists
  only the upper split. It does not resize or divide the Bottom Workspace.
- [x] **AC-003:** At UI Size 30, the 80px border-box Middle Strip spans the full
  Player width. It stays between the upper and lower work bands. Its 28px Song Progress
  Bar and 48px main row remain fully contained, including borders and group
  padding. Higher UI Sizes use the coherent scaling contract in spec-002.
- [x] **AC-004:** The Bottom Workspace presents Master, Mixer, and Samples as
  ordered peer tabs. The lower reveal seam no longer exists.
- [x] **AC-004a:** With no valid persisted selection, Master is active. A valid
  last tab returns after remount, and each mounted panel preserves its
  internal state while inactive. The hidden Samples panel keeps its virtual DOM
  empty. It does not advance windowed paging until it is visible and measured.
- [x] **AC-004b:** The tabs implement automatic activation and wrapping
  Left/Right Arrow navigation. They implement Home/End, roving tabindex, and
  correctly linked tab/tab-panel ARIA attributes.
- [x] **AC-004c:** The tab row shows read-only BPM/Master status that opens
  Master. It remains usable throughout the supported viewport range. No target
  is smaller than the selected UI Size.
- [x] **AC-004d:** The Master panel content is the spec-012 Master Bus Strip.
  Master output metering lives in the strip's pinned output meter, which shows
  Momentary, Short-term, and Integrated LUFS plus true peak. The app no longer
  includes the previous standalone Master Volume module or Output Level block.
  The Middle Strip shows a horizontal BPM slider with an editable numeric
  value. BPM accepts 50 to 200, initializes to 120 for a new project, and
  supports precise numeric entry. BPM uses the Mixer-derived linear rail and
  compact rectangular handle in its horizontal orientation.
- [x] **AC-004e:** Mixer and return-module visual telemetry runs only while Mixer
  is the active Bottom Workspace tab. Master, Samples, and leaving Player cancel its
  animation-frame loop without changing audio state.
- [x] **AC-004f:** Inactive Bottom Workspace panels retain their layout geometry.
  The interface hides them visually and removes them from the accessibility
  tree. It excludes them from pointer and sequential-focus paths. A lane fader thumb keeps its
  position and value through Mixer activation and later animation frames.
- [ ] **AC-005:** A blank project renders eight stable-ID lanes. Projects accept
  1 through 64 lanes. UI Size 30/40/50 produces bubble/lane heights of 24/37px,
  33/49px, and 41/61px. All sizes preserve the 240px lane-head x-origin.
- [x] **AC-005a:** Right-clicking a lane head exposes Rename lane. The inline
  rename field contains the current name and receives focus. Enter or blur commits a trimmed,
  non-empty name, while Escape cancels. A committed name updates the lane label
  and the accessible names of its controls.
- [ ] **AC-005b:** Add Lane appends one lane. The interface disables it at 64
  and shows a limit tooltip. It disables Delete lane at one. Empty deletion is immediate. Non-empty
  deletion uses a blocking confirmation that shows the placement count.
- [ ] **AC-005c:** Add and delete stop playback and preserve surviving stable
  IDs. They shift and renumber visible order. They roundtrip through the unified
  undo stack.
- [ ] **AC-005d:** The empty-lane macro reports the removable-empty count. It
  removes those lanes without confirmation as one undo step. It preserves the
  first lane when all are empty. At zero removable lanes, the interface disables
  it.
- [x] **AC-005e:** At the supported 1920x1080 CSS minimum, set UI Size 50 and
  open Mixer. The ruler and one complete lane remain visible. The root has no
  vertical scrollbar.
- [x] **AC-006:** Clicking a lane's M (mute) button toggles mute state. The lane dims and no audio plays from it. Clicking again restores.
- [x] **AC-007:** Clicking a lane's S (solo) button soloes that lane. All other lanes dim. Clicking again un-soloes.
- [x] **AC-008:** Drag a sample bubble from the Sample Browser and drop it onto
  a lane. This creates a clip placement at the nearest beat boundary.
  Its bubble uses the selected UI Size height and the placement's project-owned
  musical span.
  Changing BPM never changes its position or width, and the corresponding
  Sample Browser bubble has the identical pixel width.
- [x] **AC-008a:** Hold Alt while dropping a sample or moving a placement. This
  bypasses beat-snap and places it at per-tick precision (freeform).
- [x] **AC-008b:** A drop or move near the arrangement boundary preserves the
  placement's complete duration. It clamps the start so the end does not exceed
  tick 31,968. The interface rejects a placement longer than the whole capacity
  without a dialog. Illegal targets show an unavailable cursor or equivalent
  inline pointer feedback. This feedback remains when the browser protects drag
  payload access.
- [x] **AC-009:** Placing a sample that overlaps an existing placement on the same lane keeps both sample bubbles visually intact. Only the audio
  is monophonic. Overlap never deletes or trims the earlier placement's data.
- [x] **AC-010:** The playhead moves smoothly from left to right during playback, synchronized to audio.
- [x] **AC-011:** The ruler and lane canvas use the same beat/bar grid. The ruler
  shows beat ticks and stronger bar ticks. It shows bar numbers 1, 5, 9, 13… in
  monospace font.
  The ruler x-origin aligns with the tracker grid, placements, and playhead.
- [x] **AC-011a:** Clicking the ruler timeline moves the playhead to the nearest
  8-tick beat boundary. The clicked beat and rendered playhead share the same
  pixel position at every horizontal scroll offset. Arrow Left and Arrow
  Right move by one beat,
  while Home and End move to the timeline boundaries. The engine seeks to the same tick. Playback continues from that tick when already playing,
  while paused or stopped transport remains paused or stopped.
- [x] **AC-011b:** The always-rendered, skinnable Song Progress Bar controls the
  shared horizontal position. This position applies to the ruler, playhead,
  selections, and every lane canvas. Lane heads remain pinned. Keyboard and
  pointer input operate the bar. It exposes its current and maximum positions
  accessibly.

  It stays visible but disabled when the full arrangement capacity
  fits the viewport. Its
  `aria-controls` target is the actual Tracker scrollport ID supplied by the
  parent. Native horizontal scrollbar chrome is not the visible navigation
  control. The progress control is a DOM child of the fixed Middle Strip. That
  strip fully contains it at supported Player sizes.
- [x] **AC-011c:** The Tracker and Song Progress Bar expose all 999 bars in 4/4.
  They expose 31,968 ticks at a minimum density of 32px per beat. Ruler ticks, placement
  bounds, seeking, and playhead limits use that capacity, independently of the
  content-derived `songEndTick`.
- [x] **AC-011d:** The upper-panel height constrains the Tracker region. The
  Middle Strip always renders the visible, pointer-operable Song Progress Bar as
  its first row at 1920x1080.
- [x] **AC-011e:** Follow playhead is an accessible, default-off eye-icon toggle
  immediately before Delete empty lanes. The control exposes its pressed state
  through `aria-pressed`. When enabled during playback, it immediately scrolls to the
  current playhead. It centers the playhead in the unobscured timeline area. It
  recenters only after the playhead crosses the visible timeline's 20% guard
  bands. It does not
  auto-scroll while playback is inactive.
- [x] **AC-012:** Clicking Play starts playback. The button changes to Pause. Clicking Pause pauses. The button reverts to Play.
- [x] **AC-013:** Clicking Stop halts playback and returns the playhead to tick 0.
- [x] **AC-014:** Clicking Skip Back returns the playhead to tick 0 without stopping playback (if playing).
- [x] **AC-014a:** Jump to End moves the playhead and Tracker viewport to the
  exact `songEndTick`. The interface disables it for an empty song. If the user activates it while
  playing, it stops playback and parks at the end. Natural playback reaching
  the same tick still stops and resets to tick 0 per spec-005. Play from the
  parked end synchronizes both engine and visual playheads to tick 0 before
  asynchronous preparation begins.
- [x] **AC-015:** The BPM slider shows the current BPM and changing it updates the engine's BPM immediately.
- [x] **AC-015a:** The Middle Strip's slider and numeric field edit one BPM
  value. They always reflect the transport's current BPM.
- [ ] **AC-016:** Dragging the browser's internal vertical resize handle adjusts the tag-navigator/sample-list split smoothly.
- [x] **AC-016a:** Dragging the Bottom Workspace separator changes its rendered
  height at supported resolutions. Pointer, touch, and keyboard input all work.
  Separator ARIA reports the current value and active-tab minimum. The clamped
  layout persists.
- [x] **AC-016d:** At UI Sizes 30, 40, and 50, each tab clamps its sizes. This
  applies to manual, stored, restored, and tab-switched sizes. Each size uses the
  content-safe minimum.

  Visible controls remain inside their card and workspace. Changing UI
  Size grows the active panel when required. The active panel retains a
  defensive vertical scrollport for later content growth. The interface clips
  no interactive content.
- [x] **AC-016c:** A missing or malformed stored layout falls back to a fresh
  24% Bottom Workspace preference. The rendered height clamps to the active tab
  minimum. The module stores the current layout. Later manual resizing persists
  across reloads.
- [ ] **AC-016b:** The flat tag navigator remains searchable and independently
  scrollable for the real `tmp/test-samples` catalog. This applies at UI Sizes
  30, 40, and 50.
  Identically named subfolders appear once and active filters stay visible.
- [x] **AC-017:** A canvas or equivalent surface renders placements. Individual
  DOM nodes do not render each placement.
- [x] **AC-018:** Shift-dragging a placed sample bubble duplicates its placement at the drop position. The original remains unchanged.
- [x] **AC-019:** Ctrl+drag on the lane canvas draws a selection rectangle. It
  selects placements whose bounds intersect the rectangle. A white border
  highlights them.
- [x] **AC-020:** Pressing Delete removes all selected placements. Clicking empty space without Ctrl deselects all.
- [x] **AC-021:** Dragging a selected sample bubble moves the complete placement
  group. The group maintains relative offsets. Shift-dragging the group
  duplicates all members.
- [x] **AC-022:** Ctrl+Z undoes the last placement, lane-structure, Mixer,
  Return, limiter, or FX edit. Ctrl+Y or Ctrl+Shift+Z redoes it. A continuous
  adjustment is one history entry.
  The Middle Strip Undo/Redo buttons mirror the shortcuts. They become disabled
  when their history stack is empty. A multi-placement delete undoes as one step.
- [x] **AC-023:** The More-menu Keyboard Shortcuts item and the "?" key open a
  modal dialog. Esc, the close button, or a backdrop click dismisses it. The
  dialog blocks background interaction and returns focus to the opener. It
  paints above its non-blurring backdrop. Its center hit-tests to dialog content.
  The interface closes a trigger tooltip before the dialog appears.

  Transport, BPM, mute/solo, and pan controls retain accessible tooltip hints
  without native `title` attributes.
- [x] **AC-024:** Clicking a MixJam Browser entry records it as most-recently
  opened. It sorts the browser again and shows its name in the Middle Strip.
  Right-clicking shows an Open / Copy Path context menu. Entries show a hover
  state.
  Full project deserialization restores lanes and placements from the `.mixjam`
  file through spec-011.
- [ ] **AC-025:** A sample bubble keeps its canonical width and selected UI Size
  height in the drag image. Any minimum drag surface, theme-shadow clearance,
  or group badge uses transparent space outside that rectangle.
- [x] **AC-026:** Space toggles Play/Pause when focus is not in a text control.
- [ ] **AC-026a:** Blocking modals implement Enter, Escape, Arrow, FX Space,
  Backspace, and Ctrl+Backspace as specified. They suppress app and transport
  hotkeys. OS Previous, Play/Pause, and Next retain their defined transport
  actions.
- [x] **AC-027:** An arrangement with no placements keeps a visible first-sample
  cue in the Tracker. Its Open Samples action activates Samples and grows the
  Bottom Workspace to at least 50% when needed. The cue disappears after the
  first placement.
- [x] **AC-028:** Transport, Mixer, theme, header, footer, management, browser,
  and Tracker controls use one selected target set. The set is 30px, 40px, or
  50px.
  Sample bubbles and lanes use the matching geometry from spec-002. Every size
  remains keyboard-operable with visible focus and readable labels.
- [x] **AC-029:** One project identity/menu trigger shows New, Open, Save, and
  Save As. It does not render four equal Middle Strip buttons. New uses the Home
  Screen reset path, and project names can use up to 320px before truncation.
- [x] **AC-030:** At 1920x1080, the test covers every shipped theme. It covers
  idle, syncing, analyzing, and error states. Middle Strip controls remain inside
  the strip. Actionable rectangles do not intersect. Target centers hit-test
  correctly. The command dock stays visually centered.
- [x] **AC-031:** The Middle Strip exposes no more than one manual Re-scan
  action and no Uniform Re-scan action. Sync and analysis progress share one
  bounded library-status region that cannot push into search or transport.
- [x] **AC-032:** Play/Pause is the only filled accent command. Related quiet
  controls share restrained group surfaces, and the strip uses semantic theme
  tokens consistently across all shipped themes.
- [x] **AC-033:** Built Chromium verification exercises 1, 8, and 64 lanes at
  every UI Size. This includes 1920x1080 with Mixer open. It proves the full
  ruler and one complete lane remain visible. It proves the root and Mixer have
  no vertical scrollbar. Every lane and fixed Mixer section remains reachable.
  Visual telemetry stays viewport-bounded.

## Bottom Workspace Validation Evidence

The evidence below proves the implemented baseline and app-wide UI Size
contract.

- `src/renderer/src/components/PlayerView.test.tsx` verifies ordered peer tabs,
  first-launch selection, and persisted selection. It verifies mounted panels,
  automatic keyboard activation, Master status, and telemetry activation. It
  also verifies the upper-only resize seam. It verifies cached oversized-sample
  rejection while dragover payload access has protection.
- `src/renderer/src/components/LaneRow.test.tsx` and
  `src/renderer/src/components/PlayerView.test.tsx` verify lane-head context
  actions, inline rename commit/cancel behavior, and the rename callback.
- `src/renderer/src/components/MixJamBrowser.test.tsx` verifies the Open and
  Copy Path context-menu actions for discovered and recent project entries.
- `tests/e2e/lane-head-overlap.spec.ts` verifies MixJam Browser collapse and
  expansion. The same interaction updates the parent grid. It keeps the Tracker
  ruler, lane names, and lane heads clear of the browser rail.
- `src/renderer/src/components/PlayerView.test.tsx` verifies BPM value and
  callback wiring at the Player composition boundary.
- `src/renderer/src/components/MiddleStrip.test.tsx` verifies that the BPM
  control renders in the Middle Strip as a horizontal slider with an editable
  numeric value.
- `src/renderer/src/components/BpmControl.test.tsx` verifies precise BPM entry,
  invalid-entry rejection, external value sync, and orientation-aware keyboard
  commands.
- `src/renderer/src/components/MasterBusStrip.test.tsx` verifies the Master
  panel rack, including its pinned output meter (spec-012).
- `tests/e2e/library.spec.ts` verifies that tag filtering, sort, and management
  actions render with at least 44-by-44px interaction boxes in production
  Chromium. Dense Sample Browser tiles and tag-navigator rows use the separate
  30px contract above.
- In production Chromium, `tests/e2e/timeline-seek.spec.ts` verifies exact beat
  clicks and playhead geometry. It verifies that Skip Back resets the playhead
  and Tracker viewport. It verifies that Jump to End parks at the exact
  content-derived end and shows it. It delays sample preparation. This proves
  that Play restarts from the parked end at tick 0. End detection does not cancel
  it.
- `tests/e2e/compact-layout.spec.ts` verifies the 75% shared Tracker geometry,
  all-lane visibility, and the 80px Middle Strip. It verifies that a new 24%
  Bottom Workspace clamps to the active tab minimum. It also verifies later
  manual persistence and root overflow across every UI Size. Its lane-count matrix verifies Tracker and
  Mixer fit plus horizontal reachability with 1, 8, and 64 lanes. Its Middle
  Strip matrix covers all 16 shipped themes at 1920×1080 in idle, syncing,
  analyzing, and error states.
- `src/renderer/src/hooks/useTransportEngine.test.ts` verifies continuous lane
  gain, Send, and Return adjustments. They commit as one project-history entry.
  `src/renderer/src/components/PlayerView.test.tsx` verifies stable-ID Mixer
  selection after lane deletion and compaction.
- In built Electron, `tests/e2e/timeline-seek.spec.ts` verifies Follow playhead.
  Enabling it during playback centers the current position immediately. It keeps
  the position within the guard bands. It stops following when disabled.
- `npm run measure:song-progress-performance` reproduces the full-capacity
  built-Chromium characterization under
  `tmp/verify-song-progress-performance/`. Six raw CDP traces cover a real
  pointer drag from start to end and back. They cover 999 bars, 16 lanes, and
  15,984 placements. Native-speed p95 frame intervals were 16.7-16.8ms and p95
  input-to-scroll latency was 0.5ms. At 4x CPU slowdown those ranges were
  50.1ms and 2.4-2.9ms.

  Every run reached capacity and kept canvas backing stores
  viewport-bounded. Each run combined lane redraws into one per animation frame. The
  later Follow playhead repair permits at most two viewport widths of bounded
  horizontal overscan. Those earlier figures have not been re-characterized.
  These values are characterization only because no authority has approved a
  numeric performance budget.

## Non-Goals (deferred to later specs)

- No bulk project management actions exist inside the MixJam Browser. These
  actions include pinning, removing entries, or custom grouping.
- At a selected UI Size the Middle Strip uses its fixed height token. User
  resizing uses the dedicated separator below it. Dragging the strip does not
  resize it.
- No placement-duration resize after placement.
- No lane reordering (drag lane up/down).
- No zoom in/out on the timeline.
- No waveform rendering inside placements.
- No cut/copy/paste for placements.
- No BPM automation or tempo changes within a project.
- BPM and transport-position changes are not undoable.

## References

- [Current project architecture.md](../architecture.md) — Virtualization requirement, canvas rendering guidance.
- [WAI-ARIA Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) — tab roles, relationships, and keyboard behavior.
- [Microsoft touch interactions](https://learn.microsoft.com/windows/apps/develop/input/touch-interactions#hit-targets) — 44-by-44 touch-optimized targets.
