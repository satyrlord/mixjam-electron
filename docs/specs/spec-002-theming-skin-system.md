# Spec 002 — Theming & Skin System

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** PARTIAL — theme system implemented; global UI
Size overhaul not implemented
**Depends on:** spec-001 (App Shell & Navigation)

## Objective

Establish the theme system: named themes defined as design tokens and a
runtime theme switching mechanism. All 16 themes (Emerald, Enterprise, Neon
Rave, Warm Analog, IDE, Rust Industrial, Club PA, Beton Brut, Mono, Cosmic,
Neon, Vintage, Rack, Soft, Riso, Arcade) are fully implemented with distinct
visual appearances; Emerald is the default.

## User Stories

- **US-001:** As a user, I see the app in the Emerald theme by default so the
  UI has a consistent, polished look on first launch.
- **US-002:** As a user, I can see all 16 available theme names listed in the
  theme selector dropdown so I know what options exist.
- **US-003:** As a user, selecting the Emerald theme applies it immediately
  across the entire app (header, content, footer, all views).
- **US-004:** As a user, selecting any theme applies it immediately across
  the entire app so I can use all 16 themes.

## Scope

Visual design intent (layout, spacing, typography, color philosophy, surface
treatments, interaction patterns, and theme design rules) is centralized in
the [Style Guide](../style-guide.md). This spec defines the token mechanics
and runtime behavior that implement the style guide.

### Theme Token System

A theme is a set of named design tokens. Every theme defines the same token
keys; only the values differ. Tokens are consumed by the UI layer to style all
elements consistently.

| Token | Role | Applies to |
| --- | --- | --- |
| `--accent` | Primary action color | Buttons, active states, playhead, highlights |
| `--accent-dark` | Darker accent variant | Borders, active button states |
| `--highlight` | Highlight / secondary accent | Timer, links, hover indicator |
| `--bg-base` | App background | Root app surface |
| `--bg-panel` | Panel background | Cards, dropdowns, overlays |
| `--bg-lane` | Lane background | Tracker lane rows |
| `--bg-grid` | Grid / deep background | Tracker grid, category grid |
| `--chrome` | Chrome background | Header bar, Transport Ribbon, lane heads |
| `--border` | Default border | Panel borders, separators |
| `--header-border` | Header border | Header bottom edge |
| `--text` | Primary text | Body copy, labels |
| `--text-muted` | Muted / secondary text | Captions, placeholders, metadata |
| `--pill-bg` | Pill/control background | Buttons, chips, dropdowns |
| `--pill-border` | Pill/control border | Button borders, chip borders |
| `--playhead` | Playhead line color | Playhead vertical bar |
| `--sample-bubble-text` | Sample-bubble label text color | Sample-bubble text |
| `--sample-bubble-select` | Selection highlight color | Selected sample-bubble border |
| `--sample-bubble-missing` | Missing-sample indicator | Placements referencing absent files |
| `--meter-green` | Meter safe zone | Channel dB meter (-60 to -12 dB) |
| `--meter-yellow` | Meter caution zone | Channel dB meter (-12 to -3 dB) |
| `--meter-red` | Meter danger zone | Channel dB meter (-3 to 0 dB) |
| `--transport` | Idle transport button base color; drives the derived `--on-transport` glyph ink | Transport Ribbon buttons |
| `--transport-active` | Active transport button base color; drives `--on-transport-active` | Playing transport button |
| `--radius` | Border radius | Placements, buttons, panels |
| `--radius-transport` | Transport button corner shape | Transport Ribbon buttons; `50%` = round hardware (Analog, Rust), rounded-rect for modern themes |
| `--radius-sample-bubble` | Sample-bubble corner radius, px | Lane placements (canvas-drawn) and DOM sample bubbles; `0px` for hard-edged themes |
| `--border-width` | Structural hairline width | Lane separators, panel borders, ruler edge — everything drawn with `--border`; `2px` gives Beton Brut its black rules |
| `--border-width-pill` | Control border width | Pill-family borders (`--pill-border`): theme selector, mute/solo, M/S, transport, chips |
| `--border-width-header` | Header bottom-rule width | Header bottom edge; `3px` on Beton Brut, `2px` on Vintage/Riso |
| `--sample-bubble-font-weight` | Sample-bubble label weight | Canvas and DOM sample bubbles; `700` for statement themes (Beton, Mono, Neon), `600` Riso, `400` otherwise |
| `--sample-bubble-case` | Sample-bubble label case | `uppercase` or `none`; canvas uppercases the drawn string, DOM uses `text-transform` |

`--bg-grid` is the lane
canvas beat-line color (bar lines stay `--border` for structural hierarchy);
`--sample-bubble-missing` fills the 45-degree hazard stripes on placements whose sample row
is missing (`scan_state = 2`); `--shadow-sample-bubble-text` applies to canvas bubble
labels and DOM bubbles (both drop the shadow when the
per-slot ink resolves dark, matching `sampleBubbleDomStyle`).

Sample bubbles use one shared UI Size geometry source for tracker canvas
drawing, browser virtualization, drag images, and DOM height tokens.
Canvas rounded rectangles clamp the theme radius to the actual bubble width and
height, including the minimum-width 12px browser bubble.

### Global UI Size

UI Size is an app-wide presentation preference with three discrete values: 32,
44, and 56. The footer shows the segmented `[32][44][56]` control on Home and
Player, immediately before the version. New app state defaults to 32.

The value selects one coherent token set for controls, interaction targets,
Mixer components, lane heads, tabs, menus, toolbars, footer and header chrome,
spacing, supporting type, lanes, and sample bubbles. Components must not mix
magic dimensions from different size sets.

UI Size does not alter musical time, pixels per tick, project data, audio, clip
placement, or sample-bubble width. It is app state and is not written to a
`.mixjam` file. Bubble and lane heights are:

| UI Size | Sample bubble | Lane |
| --- | --- | --- |
| 32 | 26px | 39px |
| 44 | 36px | 54px |
| 56 | 46px | 68px |

The bubble rectangle keeps the same height in the Tracker, Sample Browser, and
drag image. At 1920x1080 with UI Size 56 and Mixer open, the full ruler and one
complete lane remain visible without a vertical scrollbar.

Depth tokens (`depth.*` in the JSON, applied as the same-named CSS custom
properties) carry theme-dependent gradient/shadow value strings so the same
semantic treatment can change with the active theme (AC-008):

| Depth token | Role |
| --- | --- |
| `--gradient-header` | Header background (gradient or flat color) |
| `--gradient-ruler` | Ruler shading layer over `--bg-panel` (`none` = flat) |
| `--gradient-lane` | Lane shading layer over `--bg-lane` (`none` = flat) |
| `--shadow-sample-bubble-text` | text-shadow on sample-bubble labels |
| `--gradient-transport` | Idle transport button surface |
| `--gradient-transport-active` | Active transport button surface (lamp/LED) |
| `--shadow-transport` | Idle transport button box-shadow |
| `--shadow-transport-active` | Active transport button box-shadow (glow) |
| `--shadow-pill` | box-shadow for pill-family chrome — theme selector, mute/solo, mixer M/S. Neumorphic (Soft), Win9x bevel (Vintage), offset slab (Arcade), riso overprint |
| `--shadow-lane` | Inset well shadow on the lane placement area (Rack, Soft) |
| `--shadow-playhead` | Playhead glow (Cosmic, Neon) |
| `--shadow-sample-bubble` | Sample-bubble drop-shadow, parsed by the lane canvas — strict format `<x>px <y>px <blur>px <color>` or `none` |
| `--border-sample-bubble` | Sample-bubble outline, parsed by the lane canvas — strict format `<width>px <color>` or `none`; gives Beton Brut/Arcade their hard ink borders |
| `--gradient-sample-bubble` | Sample-bubble gloss, canvas-parsed — `linear-gradient(180deg, <top>, <bottom>)` or `none`; stops use hex (`#RRGGBBAA`, never rgba()); Rack's pressed metal |
| `--shadow-meter` | box-shadow on meter fills (channel dB meter, loudness bar) — LED glow on Rack, `none` elsewhere |

### Sample Palette

Every sample bubble is painted from the active theme's `palette`:
eight slot colors plus `palette-unsorted`. Slots keep the fixed semantic
mapping (0 Drums/Percussion, 1 Loop, 2 Bass, 3 Keys/Guitar/Chords/Piano,
4 Synth/Lead, 5 Voice/Vocal/FX/Vox, 6 Arp, 7 Pad/Atmosphere/Xtra/Texture;
unknown names hash to a slot deterministically). Each theme authors its slots
inside its own color family (Cosmic blues/violets, Riso pink/blue inks, Arcade
PICO-8, Beton concrete blacks with a brick jolt).

Placements store the slot, not the color: `ClipPlacement` and drag payloads carry `slot?: number`
(0-7, 8 = Unsorted). The hex resolves at draw time from the active palette,
so switching themes recolors every placed sample bubble live. Slot storage keeps the
original stability goal — renaming a category never recolors existing placements —
while making color a theme concern. No persisted migration was needed:
project save/load (spec-011) persists placements in `.mixjam` files.

`applyTheme` derives per-slot custom properties so DOM bubbles restyle
without a React re-render: `--palette-0..8` (8 = unsorted), `--palette-ink-N`
(WCAG ink via the shared `bubbleTextColor` luminance picker), and
`--palette-shadow-N` (`var(--shadow-sample-bubble-text)` for light ink, `none` for
dark ink — dark ink under a dark text-shadow smears). The lane canvas reads
the same custom properties into its token cache, so canvas placements and DOM
bubbles can never disagree (AGENTS.md hard rule: a sample bubble renders
identically everywhere). Palette entries MUST be 6-digit hex — the ink
derivation needs a parseable luminance.

The sample-bubble visual module owns DOM palette styles and one resolved canvas
visual model covering color, ink, label case, radius, shadow, border, gloss,
missing state, and paint geometry. The Tracker canvas and drag image are two
adapters over the same painter; browser bubbles consume the DOM adapter. Theme
or geometry rules do not live independently in those rendering modules.

Contrast policy: slot colors are surfaces, not signals — the 3:1 signal gate
does not apply to them. Label contrast is guaranteed per slot by the derived
ink (white or near-black, whichever clears the higher ratio). Themes whose
slots sit close to `--bg-lane` (Soft, PA, Beton) compensate with
`--shadow-sample-bubble` or `--border-sample-bubble`, same as the mockups.

### Typography Tokens

Each theme defines font families for three typographic roles. The families listed
below are the **Emerald defaults**; individual themes may override any role with
a different bundled font (e.g. the Rust theme sets both chrome and label to
Special Elite). Every font listed in the table is bundled with the app.

| Token | Role | Emerald Default | Also Used By |
| --- | --- | --- | --- |
| `--font-chrome` | Header, chrome UI | Josefin Sans | Special Elite (Rust), IBM Plex Sans (Enterprise), Space Grotesk (Beton Brut), Space Mono (Mono). See [fonts](#typography-tokens) for full listing. |
| `--font-label` | Body, labels, buttons | Ubuntu | Special Elite (Rust), JetBrains Mono (IDE, Rave, PA), IBM Plex Sans (Enterprise). See [fonts](#typography-tokens) for full listing. |
| `--font-mono` | Monospace (ruler, timer, code) | JetBrains Mono | Space Mono (Mono, Riso), Cousine (Vintage), VT323 (Arcade) |

A theme's typeface is part of its identity, so each theme's font files live in
`src/renderer/public/fonts/`.

Typeface-wide metric corrections belong on the theme root and inherit through
the UI. They must not be repeated as component-by-component font-size overrides;
Arcade uses one inherited `font-size-adjust` rule for its small-x-height pixel
fonts.

All fonts must be bundled with the app and loaded from local files (no
external CDN or Google Fonts dependency). Font files live in `src/renderer/public/fonts/`.

### Sixteen Themes

| # | Theme Name | Token File Key | Character | Status |
| --- | --- | --- | --- | --- |
| 1 | Emerald | `emerald` | Dark green baseline | Fully implemented |
| 2 | Enterprise | `enterprise` | Dark cloud-platform blue | Fully implemented |
| 3 | Neon Rave | `rave` | Cyan/pink club glow | Fully implemented |
| 4 | Warm Analog | `analog` | Warm hardware, round cream transport | Fully implemented |
| 5 | IDE | `ide` | Neutral dark editor | Fully implemented |
| 6 | Rust Industrial | `rust` | Dark olive faceplate, bakelite knobs, red LED | Fully implemented |
| 7 | Club PA | `pa` | Black stage rig | Fully implemented |
| 8 | Beton Brut | `beton` | Dark raw concrete, black rules, brick-red jolt | Fully implemented |
| 9 | Mono | `mono` | Acid-green terminal, all-monospace | Fully implemented |
| 10 | Cosmic | `cosmic` | Blue-violet spatial depth, sample-bubble glow | Fully implemented |
| 11 | Neon | `neon` | Lime + cyan voltage, round glow buttons | Fully implemented |
| 12 | Vintage | `vintage` | Win9x silver bevels, teal placements (light) | Fully implemented |
| 13 | Rack | `rack` | Skeuomorphic rack-gear metal, inset lane wells | Fully implemented |
| 14 | Soft | `soft` | Neumorphic extrusion, teal on warm gray (light) | Fully implemented |
| 15 | Riso | `riso` | Two-ink risograph print, overprint shadows (light) | Fully implemented |
| 16 | Arcade | `arcade` | Cabinet purple, hard outlines, pixel type | Fully implemented |

`normalizeThemeKey` resolves any unsupported theme key through the generic
Emerald fallback.

### Emerald Theme — Full Token Values

| Token | Emerald Value |
| --- | --- |
| `--accent` | `#00674F` |
| `--accent-dark` | `#004434` |
| `--highlight` | `#8FBCB2` |
| `--bg-base` | `#081715` |
| `--bg-panel` | `#051411` |
| `--bg-lane` | `#091613` |
| `--bg-grid` | `#020C0A` |
| `--chrome` | `#0F2722` |
| `--border` | `#1A4D3E` |
| `--header-border` | `#1D5C4A` |
| `--text` | `#E8F0EC` |
| `--text-muted` | `#B8D0C8` |
| `--pill-bg` | `#0C2D32` |
| `--pill-border` | `#2D6B5E` |
| `--playhead` | `#E74C3C` |
| `--radius` | `0.22rem` |

Emerald uses a warm 8-slot palette (`#982A00`, `#830000`,
`#AB4700`, `#BF6601`, `#D48915`, `#E6AD33`, `#BFAD00`, `#7DA500`; unsorted
`#555E6A`). Emerald's construction tokens are the neutral defaults:
`border-width` triple `1px`,
`sample-bubble-font-weight` `400`, `sample-bubble-case` `none`, `gradient-sample-bubble` `none`,
`shadow-meter` `none`.

### Theme Selector

- Present in both Home Screen and Player headers (right side).
- Spec-001 owns the selector's shell placement; this spec owns its runtime
  behavior.
- Dropdown lists all 16 theme names.
- Default selection: **Emerald**.
- Changing the selection to any theme applies it immediately.
- The dropdown is fully functional (opens, items selectable, keyboard
  navigable) in both views.

### Runtime Behavior

- Emerald is applied on app startup before the first frame paints (no flash of
  unstyled content).
- Theme tokens are applied to the root element (e.g. `:root` or equivalent).
- Theme-dependent semantic colors come from tokens. Fixed neutral overlays,
  canvas safety fallbacks, and invariant selection ink may use local black/white
  literals when they do not encode theme identity.
- Switching between Home Screen and Player does not reset or re-apply the
  theme.
- Native select popups explicitly pair `--text` with `--chrome` instead of
  inheriting the operating system's default popup surface. The selected row
  uses the system `HighlightText` and `Highlight` colors. Custom dropdown menus
  use the same readable token pairs; destructive items use a colored edge and
  the standard menu accent pair for their highlighted state.
- Every scroll surface styles `::-webkit-scrollbar*` from theme tokens
  (via `color-mix` over `--text`/`--bg-panel`) so the native light Windows
  scrollbar never appears on dark themes. The standard `scrollbar-color`
  property is deliberately not set — Chromium disables `::-webkit-scrollbar`
  styling when it is present, and Electron only renders through Chromium.
- A `prefers-reduced-motion: reduce` media block replaces the scan spinner and
  locate-in-browser flash with static indicators and removes transitions.
- The playhead line carries a small
  downward triangle at its top (`::before`, colored from `--playhead`),
  matching the mockup marker.
- Switching themes notifies every mounted lane canvas to redraw after the
  token cache refreshes.

### Theme File Format

Each theme is defined as a standalone JSON file in `public/themes/`:

```json
{
  "name": "Emerald",
  "key": "emerald",
  "colors": {
    "accent": "#00674F",
    "accent-dark": "#004434",
    "highlight": "#8FBCB2",
    "bg-base": "#081715",
    "bg-panel": "#051411",
    "bg-lane": "#091613",
    "bg-grid": "#020C0A",
    "chrome": "#0F2722",
    "border": "#1A4D3E",
    "header-border": "#1D5C4A",
    "text": "#E8F0EC",
    "text-muted": "#B8D0C8",
    "pill-bg": "#0C2D32",
    "pill-border": "#2D6B5E",
    "playhead": "#E74C3C",
    "sample-bubble-text": "#FFFFFF",
    "sample-bubble-select": "#FDE047",
    "sample-bubble-missing": "#FB8A7E",
    "meter-green": "#34D399",
    "meter-yellow": "#FBBF24",
    "meter-red": "#F87171",
    "transport": "#0C2D32",
    "transport-active": "#00674F"
  },
  "palette": ["#982A00", "...8 slot colors, 6-digit hex..."],
  "palette-unsorted": "#555E6A",
  "fonts": {
    "chrome": "Josefin Sans",
    "label": "Ubuntu",
    "mono": "JetBrains Mono"
  },
  "depth": {
    "gradient-header": "linear-gradient(90deg, ...)",
    "gradient-ruler": "linear-gradient(180deg, ...) | none",
    "gradient-lane": "linear-gradient(180deg, ...) | none",
    "shadow-sample-bubble-text": "1.5px 1.5px 2px rgba(0,0,0,0.55) | none",
    "gradient-transport": "linear-gradient(180deg, ...) | radial-gradient(...) | flat color",
    "gradient-transport-active": "backlit lamp / LED / flat accent background",
    "shadow-transport": "box-shadow or none",
    "shadow-transport-active": "glow box-shadow or none",
    "shadow-pill": "box-shadow for pill-family chrome or none",
    "shadow-lane": "inset lane-well box-shadow or none",
    "shadow-playhead": "playhead glow box-shadow or none",
    "shadow-sample-bubble": "<x>px <y>px <blur>px <color> or none (canvas-parsed)",
    "border-sample-bubble": "<width>px <color> or none (canvas-parsed)",
    "gradient-sample-bubble": "linear-gradient(180deg, <top>, <bottom>) or none (canvas-parsed; colors space-free)",
    "shadow-meter": "box-shadow for meter fills or none"
  },
  "radius": "0.22rem",
  "radius-transport": "8px",
  "radius-sample-bubble": "6px",
  "border-width": "1px",
  "border-width-pill": "1px",
  "border-width-header": "1px",
  "sample-bubble-font-weight": "400",
  "sample-bubble-case": "none"
}
```

All 16 theme files exist in `public/themes/` with their own distinct token
values (no placeholder copies). Theme design rules (gradient layering,
contrast policy, case transforms, depth-token use, sanctioned exceptions)
are defined in the [Style Guide](../style-guide.md#theme-design-rules).

The tracker learns which
placements reference missing samples through a root-scoped backend query
`listMissingRelpaths(sampleFolder)` (`SELECT relpath FROM samples WHERE
root_id = ? AND scan_state = 2`), refreshed when the library loads and after
every completed scan. Missing-sample visual treatment follows the
[Style Guide](../style-guide.md#sample-bubbles).

## Acceptance Criteria (testable)

- [x] **AC-001:** App launches with the Emerald theme applied to all UI (header, content, footer) — no flash of default/unthemed appearance.
- [x] **AC-002:** The Emerald theme JSON implements all 23 `ThemeColors` entries plus the documented palette, font, depth, radius, border, and sample-bubble typography tokens.
- [x] **AC-003:** All bundled fonts are loaded from local files — no external network requests for fonts.
- [x] **AC-004:** Theme selector lists all 16 themes: Emerald, Enterprise, Neon Rave, Warm Analog, IDE, Rust Industrial, Club PA, Beton Brut, Mono, Cosmic, Neon, Vintage, Rack, Soft, Riso, Arcade.
- [x] **AC-005:** Default selection in the theme selector is "Emerald".
- [x] **AC-006:** Selecting any theme from the dropdown immediately applies that theme across the entire UI.
- [x] **AC-007:** Selecting Emerald from the dropdown (when already Emerald) is a no-op — no visual flicker.
- [x] **AC-008:** Theme-dependent semantic colors are defined in the JSON source of truth. Local color literals are limited to invariant neutral overlays, selection ink, and defensive canvas fallbacks.
- [x] **AC-009:** Switching from Home Screen to Player and back does not change the active theme or cause a re-apply flicker.
- [x] **AC-010:** The Emerald theme JSON file is valid and parseable by a JSON validator — no syntax errors, no duplicate keys.
- [x] **AC-011:** Placements and sample bubbles are painted from the active theme's `palette` by slot;
  switching themes recolors placements and browser tiles without reloading, and the canvas and DOM resolve identical colors for the same slot.
- [x] **AC-012:** The lane canvas draws beat lines in `--bg-grid` and bar lines in `--border`; no theme renders beat lines from the structural border color.
- [x] **AC-013:** A sample bubble whose sample row is missing (`scan_state = 2`) renders 45-degree hazard stripes derived from `--sample-bubble-missing`.
- [x] **AC-014:** Canvas sample-bubble labels honor `--sample-bubble-font-weight`, `--sample-bubble-case`, and `--shadow-sample-bubble-text` (shadow dropped under dark ink), identically to DOM bubbles.
- [x] **AC-015:** Border widths come from `--border-width`, `--border-width-pill`, and `--border-width-header`; Beton Brut renders 2px structural rules and a 3px header rule.
- [x] **AC-016:** The playhead renders a triangular cap colored from `--playhead`.
- [ ] **AC-017:** Home retains a labeled 8-by-2 grid of UI-Size-scaled theme
  preview swatches with explicit selected state, while the selected theme name appears
  only once on Home: in the header selector.
- [x] **AC-018:** Every native select trigger, option popup, and custom dropdown
  menu maintains at least 4.5:1 text contrast in all 16 bundled themes. Native
  option rows have an explicit themed background rather than a white user-agent
  fallback. The automated contrast check rejects malformed colors unless they
  use the required `#RRGGBB` form.
- [x] **AC-019:** Soft theme `--text-muted` maintains at least 4.5:1 contrast
  against its normal text-bearing base, panel, lane, chrome, and pill surfaces.
- [ ] **AC-020:** The footer exposes one global UI Size selector with values 32,
  44, and 56 on both Home and Player. The app defaults to 32 and persists the
  choice outside project files.
- [ ] **AC-021:** Switching UI Size applies one coherent token set to app chrome,
  controls, targets, panels, Mixer components, spacing, and supporting type.
- [ ] **AC-022:** Sample bubbles and lanes use the documented 26/39, 36/54, and
  46/68 pixel height pairs. Tracker, browser, and drag-image bubble rectangles
  match at each size, while bubble width and musical placement do not change.
- [ ] **AC-023:** Built Chromium proof at 1920x1080, UI Size 56, and an open Mixer
  shows the full ruler and one complete lane with no vertical scrollbar,
  clipping, overlap, or shrunken interaction targets.

## Non-Goals (deferred to later specs)

- No theme import/export — themes are bundled with the app, not loaded from
  external files at runtime.
- No theme validation/sanitization for untrusted theme files (relevant when
  import is added).
- No theme persistence across app restarts — app always starts in Emerald
  until an app-state theme preference store is wired.
- No custom theme creation or editing UI.
- No theme preview thumbnails in the dropdown.
- No light/dark mode toggle separate from theme selection.
