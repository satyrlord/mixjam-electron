# MixJam Electron — Style Guide

Centralized art direction for the MixJam Electron UI. This document defines
the visual language: layout principles, typography, spacing, color philosophy,
interaction patterns, and surface treatments. Specs reference this guide for
style rules and contain only functional requirements and acceptance criteria.

The theming system (spec-002) implements this style guide through CSS custom
properties and JSON theme files. This document describes the *design intent*;
spec-002 defines the *token mechanics*.

---

## Table of Contents

- [Design Principles](#design-principles)
- [Layout Architecture](#layout-architecture)
- [Typography](#typography)
- [Spacing & Rhythm](#spacing--rhythm)
- [Color Philosophy](#color-philosophy)
- [Surface Treatments](#surface-treatments)
- [Component Patterns](#component-patterns)
- [Interaction Patterns](#interaction-patterns)
- [Accessibility Foundations](#accessibility-foundations)
- [Theme Design Rules](#theme-design-rules)

---

## Design Principles

1. **Sleek and low-clutter.** The UI must feel spacious, with breathing room
   around controls. Infrequent actions live in menus, not permanent chrome.

2. **Continuous surface.** Related controls share subtle rounded group
   backgrounds. Idle buttons do not each render as raised bordered slabs.

3. **One primary action per surface.** Play/Pause is the sole filled accent
   action. Other commands use quiet/ghost styling with accent-tinted surfaces
   on hover, focus-visible, or active.

4. **Sample bubbles are identical everywhere.** Same height, same width, same
   visual treatment in the Tracker canvas, browser grid, drag images, and
   any future bubble surface. The shared `SAMPLE_BUBBLE_HEIGHT_PX` constant
   governs all rendering.

5. **Theme tokens, not hardcoded colors.** Every semantic color comes from
   CSS custom properties. Only invariant neutral overlays, selection ink,
   and canvas safety fallbacks may use local black/white literals.

6. **Dark by default, light supported.** The default Emerald theme is dark.
   Light themes (Vintage, Soft, Riso) work within the same token system.

---

## Layout Architecture

### Shell Structure

The app has two views sharing a common header/footer shell:

```text
App (full viewport, no root overflow scrollbar)
  ├── Header (48px fixed, full width)
  ├── Content (flex-1, scrolls internally as needed)
  └── Footer (48px fixed, full width)
```

### Home Screen Layout

```
Home (1280x720 default, no maximize button)
  ├── Content (centered two-column layout)
  │   ├── Hero column (left): logo, wordmark, tagline, steps, theme grid
  │   ├── Setup column (right): raised panel with folder cards + launch gate
  │   └── Recent Projects rail (full-width, below hero, up to 4 entries)
  └── Footer: "Select User Folder" (left), version (right)
```

- The Home Screen has no timer and no home link.
- At 1280x720, Home has no vertical overflow or scrollbar. At narrow widths,
  internal scrolling is owned by Home, not the root.

### Player Layout

```
Player (1920x1080 default, resizable, maximize enabled)
  ├── Header: home link (left), brand (left-of-center), timer (absolute center),
  │           theme selector (right)
  ├── Upper Work Band (flex row)
  │   ├── MixJam Browser (resizable left rail, default 240px / 18%, collapsible)
  │   └── Tracker Region (flex-1)
  │       ├── Ruler (33px, padded-left 240px lane-head width)
  │       ├── Lane Scroll (scrollable container for 16 lanes)
  │       └── Playhead (2px, absolute, full-height, pointer-events: none)
  ├── Middle Strip (80px border-box, full width, fixed)
  │   ├── Song Progress Bar (28px row)
  │   └── Main Row (48px): project zone | undo/redo | transport | search | menus
  └── Bottom Workspace (full width, tabbed: Song | Mixer | FX | Samples)
      ├── Tab Row (with BPM + Master Volume status)
      └── Panel (one active, all mounted, inactive hidden)
```

### Header Bar (both views)

- Fixed 48px height, full width.
- **Home state:** brand "MixJam Electron" anchored left; theme selector right.
- **Player state:** home link "&lt; Return to Main Menu" (left), brand
  "MixJam Electron" (right of home link), timer (absolute center,
  `position:absolute; left:50%; transform:translateX(-50%)`), theme selector
  (right).
- Home link appears only in Player.

### Footer (both views)

- Fixed 48px height, full width (same as header).
- **Home state:** "Select User Folder" link (left), version string (right).
- **Player state:** "Select User Folder" link (left), version (right), center
  slot may show selected sample details.
- Version string format: `0.<commit-count>`, clickable to the GitHub repo.

### MixJam Browser

- Occupies upper-left region of the active Player.
- Defaults to 18% of upper work band (240px at common desktop size).
- Collapsible via toggle; when collapsed, only the toggle button shows.
- Lists merged recent + discovered `.mixjam` files.

### Middle Strip

- 80px border-box, full width, fixed between upper work and Bottom Workspace.
- **Song Progress Bar:** 28px persistent timeline navigation row.
- **Main Row (48px):** three semantic zones:
  - **Project zone (left):** project name + unsaved dot + menu (New, Open,
    Save, Save As).
  - **Command dock (center):** Undo/Redo group, then centered Transport Ribbon.
  - **Utility zone (right):** sample search, transient library status, More
    menu (Keyboard Shortcuts, Re-scan).

### Bottom Workspace

- Full-width tabbed region below the Middle Strip.
- Tabs: Song, Mixer, FX, Samples (in that order).
- Default height: 24% of Player.
- All four panels remain mounted; inactive panels are visually hidden and
  removed from accessibility/focus paths.
- Tablist uses automatic activation with arrow-key navigation.

### Resize Handles

Three resize handles share a common pattern:
- **MixJam Browser handle:** 5px width, `ew-resize` cursor, on
  browser/tracker seam.
- **Browser internal handle:** 5px width, `ew-resize`, splits category tree
  from sample list.
- **Bottom Workspace handle:** splits upper work from Bottom Workspace
  vertically.

All use the shared resizable-panel primitive (pointer, touch, keyboard).

---

## Typography

### Font Roles

Three typographic roles, each defined per theme via CSS custom properties:

| Role | Token | Purpose | Emerald Default |
|------|-------|---------|-----------------|
| Chrome | `--font-chrome` | Header, chrome UI, brand | Josefin Sans |
| Label | `--font-label` | Body copy, labels, buttons | Ubuntu |
| Mono | `--font-mono` | Ruler, timer, code, bar numbers | JetBrains Mono |

### Type Scale

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Lane name | 11px | normal | Truncated with ellipsis |
| Status/helper text | 12px minimum | normal | |
| Action labels | 13px minimum | normal | |
| Channel label | 13px | normal | Muted text color |
| Bar numbers (ruler) | — | normal | Monospace, muted color |
| Timer | — | normal | Monospace, `00:00.0` format |

### Font Rules

- All fonts are bundled with the app in `src/renderer/public/fonts/`.
- No external CDN or Google Fonts dependencies.
- Typeface-wide metric corrections belong on the theme root and inherit
  through the UI. Do not repeat as component-level font-size overrides.
- A theme's typeface is part of its identity. Each theme may override any
  role with a different bundled font.

### Text Transform Rules

- Uppercase for brand, lane names, and mixer labels is a per-theme choice
  applied via `[data-theme-key]` CSS rules (Beton Brut, Mono, Arcade).
- Sample-bubble label case follows the `--sample-bubble-case` token
  (`uppercase` or `none`).
- Brand uppercase is a typography decision, not a color token.

---

## Spacing & Rhythm

- **Primary rhythm:** 8px spacing grid.
- **Micro-spacing:** 4px allowed only for icon/group internal spacing.
- **Control hit targets:** minimum 44x44 CSS pixels for all interactive
  controls (buttons, toggles, knobs, menu items).
- **Group padding:** must not increase rendered group beyond its container
  height (e.g. 48px Middle Strip main row).

### Key Measurements

| Element | Measurement |
|---------|-------------|
| Header height | 48px fixed |
| Footer height | 48px fixed |
| Middle Strip total | 80px border-box |
| Song Progress Bar row | 28px |
| Middle Strip main row | 48px |
| Lane height | 39px fixed |
| Lane head width | 240px (exact, including rendered border box) |
| Sample bubble height | 26px (`SAMPLE_BUBBLE_HEIGHT_PX`), centered in 39px lane |
| Ruler height | 33px, padded-left 240px |
| Ruler beat/bar model | Beat tick lines at each beat; stronger tick every bar |
| Bar number interval | Every 4 bars: 1, 5, 9, 13... |
| Playhead width | 2px |
| Mixer channel strip | 96-124px responsive width |
| Pan/Mute/Solo controls | 32x32px (lane head), 44x44px minimum (mixer) |
| BPM numeric input | 42x28px visible, inside 44px label target |
| Vertical fader minimum width | 44px |
| Transport buttons | 44px interaction targets inside 48px row |
| Search field | 200-320px flexible width |
| Project name trigger | up to 320px, truncates with ellipsis |
| Theme preview swatches | 44px squares, 8x2 grid |

---

## Color Philosophy

### Token-Driven

Every semantic color comes from theme tokens (CSS custom properties). Tokens
are defined in JSON theme files under `public/themes/` and applied to
`:root`. See spec-002 for the complete token reference and runtime behavior.

### Token Categories

- **Surface tokens:** `--bg-base`, `--bg-panel`, `--bg-lane`, `--bg-grid`,
  `--chrome`
- **Accent tokens:** `--accent`, `--accent-dark`, `--highlight`
- **Text tokens:** `--text`, `--text-muted`
- **Border tokens:** `--border`, `--header-border`
- **Control tokens:** `--pill-bg`, `--pill-border`
- **Signal tokens:** `--playhead`, `--meter-green`, `--meter-yellow`,
  `--meter-red`
- **Transport tokens:** `--transport`, `--transport-active`
- **Sample bubble tokens:** `--sample-bubble-text`, `--sample-bubble-select`,
  `--sample-bubble-missing`, `--shadow-sample-bubble-text`

### Depth Tokens

Depth tokens (gradients and shadows) are theme-dependent value strings:

- `--gradient-header`: header background (gradient or flat color)
- `--gradient-ruler`: ruler shading over `--bg-panel`
- `--gradient-lane`: lane shading over `--bg-lane`
- `--shadow-sample-bubble-text`: text-shadow on bubble labels
- `--gradient-transport`: idle transport button surface
- `--gradient-transport-active`: active transport button surface
- `--shadow-transport`: idle transport button box-shadow
- `--shadow-transport-active`: active transport button box-shadow (glow)
- `--shadow-pill`: box-shadow for pill-family chrome
- `--shadow-lane`: inset well shadow on lane placement area
- `--shadow-playhead`: playhead glow
- `--shadow-sample-bubble`: sample-bubble drop-shadow (canvas-parsed)
- `--border-sample-bubble`: sample-bubble outline (canvas-parsed)
- `--gradient-sample-bubble`: sample-bubble gloss (canvas-parsed)
- `--shadow-meter`: box-shadow on meter fills

### Construction Tokens

- `--radius`: general border radius
- `--radius-transport`: transport button corner shape
- `--radius-sample-bubble`: sample-bubble corner radius
- `--border-width`: structural hairline width
- `--border-width-pill`: control border width
- `--border-width-header`: header bottom-rule width
- `--sample-bubble-font-weight`: bubble label weight
- `--sample-bubble-case`: bubble label case (`uppercase` or `none`)

### Sample Palette

Each theme defines an 8-slot palette plus an unsorted color. Slots map to
acoustic categories deterministically:

| Slot | Category | 
|------|----------|
| 0 | Drums / Percussion |
| 1 | Loop |
| 2 | Bass |
| 3 | Keys / Guitar / Chords / Piano |
| 4 | Synth / Lead |
| 5 | Voice / Vocal / FX / Vox |
| 6 | Arp |
| 7 | Pad / Atmosphere / Xtra / Texture |
| 8 | Unsorted (fallback) |

Placements store the slot number, not the color. The hex resolves at draw
time from the active palette. Switching themes recolors every placed sample
bubble live. Palette entries must be 6-digit hex.

Label contrast is guaranteed per slot by derived ink (white or near-black,
whichever clears the higher WCAG ratio). Slot colors themselves are surfaces,
not signals — the 3:1 signal contrast gate does not apply to them.

### Contrast Policy

- Text contrast: minimum 4.5:1 for all text against its background.
- Non-text contrast (signals): 3:1 minimum for meter colors against
  `--bg-base`, meter-red against `--pill-bg` (mute-active fill), and
  `--sample-bubble-select`/`--sample-bubble-missing` against `--bg-lane`.
- Known waiver: Rust `meter-green` `#4A5A28` trades gate headroom for faceplate
  fidelity.

### Scrollbar Styling

Every scroll surface styles `::-webkit-scrollbar*` from theme tokens (via
`color-mix` over `--text`/`--bg-panel`). The `scrollbar-color` property is not
set because Chromium disables `::-webkit-scrollbar` styling when it is
present. Native light Windows scrollbars never appear on dark themes.

---

## Surface Treatments

### Buttons

- **Primary action (Play/Pause):** filled accent background.
- **Quiet/ghost actions:** transparent background, accent-tinted on hover,
  focus-visible, or active.
- **Transport buttons:** 44px interaction targets, round or rounded-rect
  based on `--radius-transport`. Transport Ribbon contains exactly four:
  Skip Back, Jump to End, Play/Pause, Stop.
- **Mute/Solo:** 32x32px (lane head), 44x44px minimum (mixer), toggle style.
  Active mute fill must meet 3:1 non-text contrast against inactive pill.
- **Disabled state:** visually subdued, non-interactive.

### Pills & Chips

- Pills use `--pill-bg` and `--pill-border`.
- `--shadow-pill` provides theme-dependent bevel/extrusion (neumorphic Soft,
  Win9x bevel Vintage, offset slab Arcade, riso overprint).
- Tag filter chips appear in the browser's subcategory row.

### Cards & Panels

- Raised panels use `--bg-panel`, bordered with `--border`.
- Cards within panels may have subtle rounded backgrounds.
- Home's setup column is a raised panel.

### Menus & Dropdowns

- Native select popups pair `--text` with `--chrome` instead of inheriting
  OS default surface.
- Custom dropdown menus use readable token pairs.
- Destructive items use a colored edge and standard menu accent pair for
  highlighted state.
- Menus use the shared Radix-backed menu primitive and return focus to their
  trigger when closed.

### Scrollbars

- Thin themed scrollbars on all scrollable surfaces.
- Mixer strips use `overflow-x: auto` with thin themed scrollbar.
- Tracker lane scroll hides native horizontal scrollbar chrome (Song Progress
  Bar replaces it).

### Focus Indicators

- Visible focus ring on all interactive elements.
- Focused lane: subtle accent-color left border on the lane head.

### Meter Bars

- **Channel dB meters:** CSS-rendered vertical bars overlaid on VOL slider
  background. Fill height via style prop. Three color zones:
  - Green (`--meter-green`): -60 to -12 dB
  - Yellow (`--meter-yellow`): -12 to -3 dB
  - Red (`--meter-red`): -3 to 0 dB
- **Peak hold:** 2px CSS-positioned line, ~30 dB/s decay.
- **Master Output Level:** Momentary LUFS fill with M/S/I/TP readouts.
  Styled with the same themed meter chrome.
- **Compressor gain reduction:** positive dB value from processor, zero when
  bypassed.

### Progress Indicators

- Sync/scan progress uses native `<progress>` with visible text equivalent
  and accessible label.
- Indeterminate phases omit fabricated numeric values.
- `prefers-reduced-motion: reduce` replaces spinner/flash with static
  indicators and removes transitions.

### Sample Bubbles

- 26px height, centered in 39px lane.
- Rounded rectangles with theme radius (`--radius-sample-bubble`).
- Width: musical span in pixels-per-tick, 12px minimum.
- Label: filename, truncated, font weight and case from theme tokens.
- Color: resolved from active palette by category slot.
- Missing samples render 45-degree hazard stripes in `--sample-bubble-missing`
  over a darkened variant.
- Selection highlight uses `--sample-bubble-select`.
- Canvas-drawn in the Tracker (viewport-bounded backing store, full-timeline
  coordinates). Redraws coalesce to at most one per animation frame.
- DOM bubbles in the browser grid. Identical appearance to canvas bubbles.
- Bubbles may carry shadow (`--shadow-sample-bubble`), border
  (`--border-sample-bubble`), and gloss (`--gradient-sample-bubble`).

---

## Component Patterns

### Vertical Faders

- Shared `VerticalFader` wrapper over Radix Slider.
- Linear controls increase from bottom to top.
- `aria-orientation="vertical"`, unit-aware value text.
- Arrow Up/Right increases, Arrow Down/Left decreases, Home/End for
  min/max.
- Pointer target at least 44px wide, thumb centered on visible track.
- Used for: channel VOL, Master Volume, BPM slider (50-200).
- Unity (100%) marked with a tick.

### Rotary Controls (Pan, FX Parameters)

- Shared project-owned SVG control: 270-degree range track, high-contrast
  value arc, inset cap, short pointer inside cap.
- Interaction: vertical pointer drag, mouse-wheel steps, Shift fine
  adjustment, Arrow keys, Home/End, double-click reset.
- Wheel up increases, wheel down decreases. Handled wheel events do not
  scroll the page.
- Direct numeric entry available.
- `aria-valuetext` with unit-aware position (e.g. "Center", "40% left",
  "100% right").
- Right-click cycle on pan: C to R to L to C.

### Channel Strip (Mixer)

- Responsive 96-124px vertical stack.
- Components: channel label (13px muted, 44px target), remove button (44px),
  VOL fader, dB meter overlay, pan rotary, M button (44px min), S button
  (44px min).
- M and S share full strip width.
- Muted channel strip dims as a whole.
- Remove is always visible. No confirmation dialog.

### Effect Chain (FX Panel)

- Left-to-right chain rail with named cards.
- Cards expose: order position, selection state, bypass toggle, drag handle.
- Visible connectors reinforce signal direction.
- Bypass uses explicit "Enabled"/"Bypassed" text (not ambiguous power icon).
- Add effect tile appends Delay, Reverb, or Compressor.
- Empty chain: centered explanation + Add action.
- No-channel state: "Restore a channel" and "Open Mixer" options.
- Selected effect editor below chain: label-first vertical modules with dial
  or switch, editable value, explanatory copy on separate aligned rows.
- Output metering grouped separately with scale endpoints, enlarged live
  value, 120px meter.

### Tabs (Bottom Workspace)

- Tablist with automatic activation.
- Left/Right Arrow moves focus and activates; Home/End activates first/last.
- One tab has `tabIndex=0`, others `tabIndex=-1`.
- Connected via `id`, `aria-controls`, `aria-labelledby`.
- Tab row shows compact read-only BPM and Master Volume status (accessible
  buttons that activate Song).
- Narrow windows: horizontal scroll or overflow control; tabs never shrink
  below 44x44px.

### Tooltips

- Shared accessible tooltip primitive for transport, BPM, mute/solo, pan.
- Includes shortcut hints where defined.
- Native `title` attributes are not used.

---

## Interaction Patterns

### Transport

- Play/Pause toggles; Play is accent-colored when stopped, Pause when playing.
- Space toggles Play/Pause.
- Stop returns to tick 0.
- Skip Back returns to tick 0 (restarts playback if playing).
- Jump to End moves to `songEndTick` (disabled when no placements).
- Ctrl+Z undoes, Ctrl+Y / Ctrl+Shift+Z redoes (placement edits only).

### Sample Placement

- **Snap-to-beat (default):** dropping or moving snaps to nearest beat (8
  ticks).
- **Alt:** freeform per-tick precision.
- **Shift:** reserved for duplication.
- **Ctrl:** reserved for rectangle-drag multi-select.
- Overlapping placements are monophonic in audio only; both bubbles keep full
  visual size and data.

### Playhead & Ruler

- Playhead: 2px vertical line, `--playhead` color, triangular cap via
  `::before`, `pointer-events: none`.
- Clicking ruler moves playhead to nearest beat.
- Song Progress Bar thumb reflects visible fraction of capacity; dragging
  pans view without seeking.

### Keyboard Shortcuts Overlay

- Opened from Middle Strip More menu or "?".
- Modal dialog semantics: focus trap, Esc/close/backdrop dismiss.
- Lists all keyboard and mouse shortcuts.

### Reduced Motion

- `prefers-reduced-motion: reduce` replaces scan spinner and locate-in-browser
  flash with static indicators and removes transitions.

---

## Accessibility Foundations

- Every icon-only control has an accessible name and visible focus indicator.
- All interactive targets are at least 44x44 CSS pixels.
- No overlapping interactive rectangles; every target's center hit-tests to
  that target or a descendant.
- Menus use the shared Radix-backed primitive and return focus to trigger on
  dismiss.
- Modal dialogs trap focus and restore to opener.
- Vertical sliders expose `aria-orientation="vertical"` and unit-aware values.
- Rotary controls expose `aria-valuetext` with position.
- Resize handles expose separator value/min/max semantics.
- Context menus follow standard keyboard model, remain in viewport, return
  focus on dismiss.
- Global shortcuts are suppressed while text inputs, textareas, selects, or
  contenteditable elements have focus.

---

## Theme Design Rules

When creating or modifying a theme, follow these rules:

1. **Every theme defines all token keys.** No partial themes. Missing keys
   fall back to Emerald via `normalizeThemeKey`.

2. **Palette entries must be 6-digit hex.** The luminance derivation for
   label ink needs a parseable format.

3. **Solid colors only for surface/text/control tokens.** The one sanctioned
   exception is Enterprise's `bg-panel`/`pill-bg` as rgba glass values, since
   neither feeds a luminance derivation.

4. **Each theme authors its palette within its own color family** (Cosmic
   blues/violets, Riso pink/blue inks, Arcade PICO-8, Beton concrete blacks
   with a brick jolt).

5. **Themes with low-contrast slots** (Soft, PA, Beton) must compensate with
   `--shadow-sample-bubble` or `--border-sample-bubble`.

6. **Meter triad and signal colors are tuned per theme**, not shared across
   all themes.

7. **Depth tokens are theme-dependent:** bevels, slabs, and extrusions stay
   in JSON shadow tokens. Vintage's Win9x bevel is a 2px double-inset
   `shadow-pill`.

8. **Treatments a single-value token cannot express** live in
   `[data-theme-key]` blocks in `index.css`. Semantic theme colors still come
   from tokens; only neutral black/white overlays may be fixed. Examples:
   Enterprise's `backdrop-filter: blur(4px)`, Rust noise overlay.

9. **Typeface-wide metric corrections** belong on the theme root and inherit
   through the UI. Arcade uses one inherited `font-size-adjust` rule for its
   small-x-height pixel fonts.

10. **Case transforms are typography, not color.** Uppercase brand/lane/mixer
    labels live in CSS `[data-theme-key]` rules, not theme JSON.

11. **Theme-preview swatches** on Home are 44px squares in an 8x2 grid,
    showing the palette colors with selected-state indicator. The theme name
    appears only in the header selector.

12. **`gradient-header` must be a complete background value** (not layered
    over another color). `gradient-ruler` and `gradient-lane` are layered
    over `--bg-panel`/`--bg-lane`, so `none` yields a flat surface.
