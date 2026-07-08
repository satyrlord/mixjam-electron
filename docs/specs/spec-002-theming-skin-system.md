# Spec 002 — Theming & Skin System

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-001 (App Shell & Navigation)

## Objective

Establish the theme system: named themes defined as design tokens and a
runtime theme switching mechanism. All 16 themes (Emerald, Enterprise, Neon
Rave, Warm Analog, IDE, Rust Industrial, Club PA, Beton Brut, Mono, Cosmic,
Neon, Vintage, Rack, Soft, Riso, Arcade) are fully implemented with distinct
visual appearances; Emerald is the default.
(Amended 2026-07-07: Flat Studio (`studio`) was replaced by Enterprise
(`enterprise`) — a dark cloud-platform look with blue accent `#2F81F7`.
Saved `studio` keys fall back to Emerald via `normalizeThemeKey`.)
(Amended 2026-07-07, second pass: Screen Maximal (`screen`) was retired —
saved `screen` keys fall back to Emerald the same way — and nine new themes
landed from the candidate-mockup round: Beton Brut, Mono, Cosmic, Neon,
Vintage, Rack, Soft, Riso, Arcade. Three of them (Vintage, Soft,
Riso) are the app's first light themes.)
(Amended 2026-07-07, third pass — mockup parity: the sample-bubble palette
became theme-scoped (see "Sample Palette"), the previously unconsumed
`--bg-grid`, `--clip-missing`, and `--shadow-clip-text` tokens are now
rendered by the lane canvas, and construction tokens landed: border widths,
clip label typography, a clip gloss layer, and a meter glow. The old rule
"bubbles stay theme-invariant" is REVOKED — it is exactly why every theme
rendered the same warm clips regardless of palette.)

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
| `--chrome` | Chrome background | Header bar, transport strip, lane heads |
| `--border` | Default border | Panel borders, separators |
| `--header-border` | Header border | Header bottom edge |
| `--text` | Primary text | Body copy, labels |
| `--text-muted` | Muted / secondary text | Captions, placeholders, metadata |
| `--pill-bg` | Pill/control background | Buttons, chips, dropdowns |
| `--pill-border` | Pill/control border | Button borders, chip borders |
| `--playhead` | Playhead line color | Playhead vertical bar |
| `--clip-text` | Clip label text color | Clip bubble text |
| `--clip-select` | Selection highlight color | Selected clip border |
| `--clip-missing` | Missing-sample indicator | Clips referencing absent files |
| `--meter-green` | Meter safe zone | Channel dB meter (-60 to -12 dB) |
| `--meter-yellow` | Meter caution zone | Channel dB meter (-12 to -3 dB) |
| `--meter-red` | Meter danger zone | Channel dB meter (-3 to 0 dB) |
| `--transport` | Idle transport button base color; drives the derived `--on-transport` glyph ink (amended 2026-07-07) | Transport strip buttons |
| `--transport-active` | Active transport button base color; drives `--on-transport-active` (amended 2026-07-07) | Playing transport button |
| `--radius` | Border radius | Clips, buttons, panels |
| `--radius-transport` | Transport button corner shape | Transport strip buttons; `50%` = round hardware (Analog, Rust), rounded-rect for modern themes (amended 2026-07-07) |
| `--radius-clip` | Clip / sample-bubble corner radius, px (amended 2026-07-07) | Lane clips (canvas-drawn) and DOM sample bubbles; `0px` for hard-edged themes, `6px` preserves the pre-token look |
| `--border-width` | Structural hairline width (parity pass 2026-07-07) | Lane separators, panel borders, ruler edge — everything drawn with `--border`; `2px` gives Beton Brut its black rules |
| `--border-width-pill` | Control border width (parity pass 2026-07-07) | Pill-family borders (`--pill-border`): theme selector, mute/solo, M/S, transport, chips |
| `--border-width-header` | Header bottom-rule width (parity pass 2026-07-07) | Header bottom edge; `3px` on Beton Brut, `2px` on Vintage/Riso |
| `--clip-font-weight` | Clip / bubble label weight (parity pass 2026-07-07) | Canvas clip labels and DOM sample bubbles; `700` for statement themes (Beton, Mono, Neon), `600` Riso, `400` otherwise |
| `--clip-case` | Clip / bubble label case (parity pass 2026-07-07) | `uppercase` or `none`; canvas uppercases the drawn string, DOM uses `text-transform` |

Token consumption notes (parity pass 2026-07-07): `--bg-grid` is the lane
canvas beat-line color (bar lines stay `--border` for structural hierarchy);
`--clip-missing` fills the 45-degree hazard stripes drawn on clips whose
sample row is missing (`scan_state = 2`); `--shadow-clip-text` now applies to
canvas-drawn clip labels as well as DOM bubbles (both drop the shadow when the
per-slot ink resolves dark, matching `bubbleStyle`).

Depth tokens (`depth.*` in the JSON, applied as the same-named CSS custom
properties) carry full gradient/shadow value strings so `index.css` never
inlines a color literal (AC-008):

| Depth token | Role |
| --- | --- |
| `--gradient-header` | Header background (gradient or flat color) |
| `--gradient-ruler` | Ruler shading layer over `--bg-panel` (`none` = flat) |
| `--gradient-lane` | Lane shading layer over `--bg-lane` (`none` = flat) |
| `--shadow-clip-text` | text-shadow on clip/bubble labels |
| `--gradient-transport` | Idle transport button surface |
| `--gradient-transport-active` | Active transport button surface (lamp/LED) |
| `--shadow-transport` | Idle transport button box-shadow |
| `--shadow-transport-active` | Active transport button box-shadow (glow) |
| `--shadow-pill` | box-shadow for pill-family chrome — theme selector, mute/solo, mixer M/S. Neumorphic (Soft), Win9x bevel (Vintage), offset slab (Arcade), riso overprint (amended 2026-07-07) |
| `--shadow-lane` | Inset well shadow on the lane clip area (Rack, Soft) (amended 2026-07-07) |
| `--shadow-playhead` | Playhead glow (Cosmic, Neon) (amended 2026-07-07) |
| `--shadow-clip` | Clip drop-shadow, parsed by the lane canvas — strict format `<x>px <y>px <blur>px <color>` or `none` (amended 2026-07-07) |
| `--border-clip` | Clip outline, parsed by the lane canvas — strict format `<width>px <color>` or `none`; gives Beton Brut/Arcade their hard ink borders (amended 2026-07-07) |
| `--gradient-clip` | Clip/bubble gloss, canvas-parsed — `linear-gradient(180deg, <top>, <bottom>)` or `none`; stops are single hex tokens (`#RRGGBBAA`, never rgba()); Rack's pressed metal |
| `--shadow-meter` | box-shadow on meter fills (channel dB meter, loudness bar) — LED glow on Rack, `none` elsewhere (parity pass 2026-07-07) |

### Sample Palette (theme-scoped — parity pass 2026-07-07)

Every clip and sample bubble is painted from the active theme's `palette`:
eight slot colors plus `palette-unsorted`. Slots keep the fixed semantic
mapping (0 Drums/Percussion, 1 Loop, 2 Bass, 3 Keys/Guitar/Chords/Piano,
4 Synth/Lead, 5 Voice/Vocal/FX/Vox, 6 Arp, 7 Pad/Atmosphere/Xtra/Texture;
unknown names hash to a slot deterministically). This REVOKES the earlier
"bubbles stay theme-invariant" doctrine: the clip surface is the largest
colored area in the tracker, and a fixed warm palette made every theme render
the same orange clips. Each theme authors its slots inside its own color
family (Cosmic blues/violets, Riso pink/blue inks, Arcade PICO-8, Beton
concrete blacks with a brick jolt).

Decision — clips store the slot, not the color (ACCEPTED, supersedes the
"category colour stored at placement time, never recomputed" rule in
`playerShell.ts`): `LaneClip` and drag payloads carry `slot?: number`
(0-7, 8 = Unsorted). The hex resolves at draw time from the active palette,
so switching themes recolors every placed clip live. Slot storage keeps the
original stability goal — renaming a category never recolors placed clips —
while making color a theme concern. No persisted migration was needed:
project save/load (spec-011) has not landed, so clips only exist in session
state.

`applyTheme` derives per-slot custom properties so DOM bubbles restyle
without a React re-render: `--palette-0..8` (8 = unsorted), `--palette-ink-N`
(WCAG ink via the shared `bubbleTextColor` luminance picker), and
`--palette-shadow-N` (`var(--shadow-clip-text)` for light ink, `none` for
dark ink — dark ink under a dark text-shadow smears). The lane canvas reads
the same custom properties into its token cache, so canvas clips and DOM
bubbles can never disagree (AGENTS.md hard rule: a sample bubble renders
identically everywhere). Palette entries MUST be 6-digit hex — the ink
derivation needs a parseable luminance.

Contrast policy: slot colors are surfaces, not signals — the 3:1 signal gate
does not apply to them. Label contrast is guaranteed per slot by the derived
ink (white or near-black, whichever clears the higher ratio). Themes whose
slots sit close to `--bg-lane` (Soft, PA, Beton) compensate with
`--shadow-clip` or `--border-clip`, same as the mockups.

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

New themes bundle their own font files by default (amended 2026-07-07) —
a theme's authentic typeface is part of its identity, so implementation
downloads the real family into `src/renderer/public/fonts/` rather than
substituting an already-bundled face.

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
| 10 | Cosmic | `cosmic` | Blue-violet spatial depth, clip glow | Fully implemented |
| 11 | Neon | `neon` | Lime + cyan voltage, round glow buttons | Fully implemented |
| 12 | Vintage | `vintage` | Win9x silver bevels, teal clips (light) | Fully implemented |
| 13 | Rack | `rack` | Skeuomorphic rack-gear metal, inset lane wells | Fully implemented |
| 14 | Soft | `soft` | Neumorphic extrusion, teal on warm gray (light) | Fully implemented |
| 15 | Riso | `riso` | Two-ink risograph print, overprint shadows (light) | Fully implemented |
| 16 | Arcade | `arcade` | Cabinet purple, hard outlines, pixel type | Fully implemented |

Retired keys: `studio` (replaced by Enterprise) and `screen` (Screen Maximal,
removed 2026-07-07). Projects saved with a retired key open in Emerald via
`normalizeThemeKey`.

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

Emerald keeps the original warm 8-slot palette (`#982A00`, `#830000`,
`#AB4700`, `#BF6601`, `#D48915`, `#E6AD33`, `#BFAD00`, `#7DA500`; unsorted
`#555E6A`) — it was authored for Emerald in the predecessor design project,
so the default look is unchanged by the parity pass. Emerald's construction
tokens are the neutral defaults: `border-width` triple `1px`,
`clip-font-weight` `400`, `clip-case` `none`, `gradient-clip` `none`,
`shadow-meter` `none`.

### Theme Selector

- Present in both Home Screen and Player headers (right side).
- In spec-001 the selector was non-functional (listed themes, no effect).
  This spec makes it functional.
- Dropdown lists all 16 theme names.
- Default selection: **Emerald**.
- Changing the selection to any theme applies it immediately.
- The dropdown is fully functional (opens, items selectable, keyboard
  navigable) in both views.

### Runtime Behavior

- Emerald is applied on app startup before the first frame paints (no flash of
  unstyled content).
- Theme tokens are applied to the root element (e.g. `:root` or equivalent).
- All UI elements consume tokens exclusively — no hardcoded colors outside the
  token file.
- Switching between Home Screen and Player does not reset or re-apply the
  theme.
- Scrollbars are themed (added 2026-07-02 per design-review change request):
  every scroll surface styles `::-webkit-scrollbar*` from theme tokens
  (via `color-mix` over `--text`/`--bg-panel`) so the native light Windows
  scrollbar never appears on dark themes. The standard `scrollbar-color`
  property is deliberately not set — Chromium disables `::-webkit-scrollbar`
  styling when it is present, and Electron only renders through Chromium.
- Reduced motion (added 2026-07-02): a `prefers-reduced-motion: reduce` media
  block collapses decorative animation — the scan spinner (replaced by a
  static highlighted ring), the locate-in-browser flash (replaced by a static
  outline), and all transitions. (The Screen Maximal CRT flicker this block
  originally covered was removed with that theme on 2026-07-07.)
- Playhead cap (parity pass 2026-07-07): the playhead line carries a small
  downward triangle at its top (`::before`, colored from `--playhead`),
  matching the mockup marker.
- Live canvas restyle (parity pass 2026-07-07): switching themes notifies
  every mounted lane canvas to redraw after the token cache refreshes —
  previously the cache updated but placed clips kept the old theme's
  radius/shadow until the next data-driven redraw.

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
    "clip-text": "#FFFFFF",
    "clip-select": "#FDE047",
    "clip-missing": "#FB8A7E",
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
    "shadow-clip-text": "1.5px 1.5px 2px rgba(0,0,0,0.55) | none",
    "gradient-transport": "linear-gradient(180deg, ...) | radial-gradient(...) | flat color",
    "gradient-transport-active": "backlit lamp / LED / flat accent background",
    "shadow-transport": "box-shadow or none",
    "shadow-transport-active": "glow box-shadow or none",
    "shadow-pill": "box-shadow for pill-family chrome or none",
    "shadow-lane": "inset lane-well box-shadow or none",
    "shadow-playhead": "playhead glow box-shadow or none",
    "shadow-clip": "<x>px <y>px <blur>px <color> or none (canvas-parsed)",
    "border-clip": "<width>px <color> or none (canvas-parsed)",
    "gradient-clip": "linear-gradient(180deg, <top>, <bottom>) or none (canvas-parsed; colors space-free)",
    "shadow-meter": "box-shadow for meter fills or none"
  },
  "radius": "0.22rem",
  "radius-transport": "8px",
  "radius-clip": "6px",
  "border-width": "1px",
  "border-width-pill": "1px",
  "border-width-header": "1px",
  "clip-font-weight": "400",
  "clip-case": "none"
}
```

All 16 theme files exist in `public/themes/` with their own distinct token
values (no placeholder copies). `gradient-header` must be a complete
background value (it is not layered over another color); `gradient-ruler`
and `gradient-lane` are layered over `--bg-panel`/`--bg-lane`, so `none`
yields a flat surface.

Per-theme signal palettes (amended 2026-07-07): the meter triad
(`--meter-green/-yellow/-red`), `--clip-select`, `--clip-missing`, and
`depth.gradient-lane` are tuned per theme rather than shared across all
themes. Every value must pass a 3:1 non-text contrast gate: meter colors
against `--bg-base` (the meter track), `--meter-red` against `--pill-bg`
(mute-active fill, spec-007 AC-022), and `--clip-select`/`--clip-missing`
against `--bg-lane` (selection/focus outline and missing-clip fill).
Known waiver: Rust `meter-green` `#4A5A28` is a user-pinned faceplate
color that trades gate headroom for LG Drive fidelity.

Case as a theme trait (amended 2026-07-07): Beton Brut, Mono, and Arcade
set the brand, lane names, and mixer labels in uppercase via
`[data-theme-key]` rules in `index.css`. Case is typography, not color, so
this lives in CSS rather than the token JSON without violating AC-008.
Parity pass 2026-07-07 widened the scope: Riso uppercases the brand (the
mockup wordmark is MIXJAM), Arcade uppercases its chrome controls (theme
selector, transport strip text, manage/sort buttons) because the arcade
mockup is uppercase throughout, and clip labels follow the `--clip-case`
token (Beton, Mono, Arcade) on both the canvas and DOM bubbles.

Construction as a theme trait (parity pass 2026-07-07): treatments a
single-value token cannot express live in `[data-theme-key]` blocks in
`index.css`, colorless by design (AC-008 still holds): Enterprise's header
gets `backdrop-filter: blur(4px)` over its translucent panels (its
`bg-panel`/`pill-bg` are rgba glass values — the one sanctioned exception to
"solid hex" since neither feeds a luminance derivation), and the Rust noise
overlay predates this rule. Bevels, slabs, and extrusions stay in the JSON
shadow tokens (Vintage's Win9x bevel is a 2px double-inset `shadow-pill`).

Missing-sample surfacing (parity pass 2026-07-07): the tracker learns which
placed clips reference missing samples through a root-scoped backend query
`listMissingRelpaths(sampleFolder)` (`SELECT relpath FROM samples WHERE
root_id = ? AND scan_state = 2`), refreshed when the library loads and after
every completed scan. The lane canvas fills those clips with 45-degree
hazard stripes in `--clip-missing` over a darkened variant.

## Acceptance Criteria (testable)

- [x] **AC-001:** App launches with the Emerald theme applied to all UI (header, content, footer) — no flash of default/unthemed appearance.
- [x] **AC-002:** The Emerald theme uses the exact token values listed in the table above (all 22 color tokens + `--radius`).
- [x] **AC-003:** All bundled fonts are loaded from local files — no external network requests for fonts.
- [x] **AC-004:** Theme selector lists all 16 themes: Emerald, Enterprise, Neon Rave, Warm Analog, IDE, Rust Industrial, Club PA, Beton Brut, Mono, Cosmic, Neon, Vintage, Rack, Soft, Riso, Arcade.
- [x] **AC-005:** Default selection in the theme selector is "Emerald".
- [x] **AC-006:** Selecting any theme from the dropdown immediately applies that theme across the entire UI.
- [x] **AC-007:** Selecting Emerald from the dropdown (when already Emerald) is a no-op — no visual flicker.
- [x] **AC-008:** Theme tokens are defined in a single source of truth (e.g. JSON file). No UI element uses hardcoded color values outside the token system.
- [x] **AC-009:** Switching from Home Screen to Player and back does not change the active theme or cause a re-apply flicker.
- [x] **AC-010:** The Emerald theme JSON file is valid and parseable by a JSON validator — no syntax errors, no duplicate keys.
- [x] **AC-011 (parity pass):** Clips and sample bubbles are painted from the active theme's `palette` by slot;
  switching themes recolors placed clips and browser tiles without reloading, and the canvas and DOM resolve identical colors for the same slot.
- [x] **AC-012 (parity pass):** The lane canvas draws beat lines in `--bg-grid` and bar lines in `--border`; no theme renders beat lines from the structural border color.
- [x] **AC-013 (parity pass):** A clip whose sample row is missing (`scan_state = 2`) renders 45-degree hazard stripes derived from `--clip-missing`.
- [x] **AC-014 (parity pass):** Canvas clip labels honor `--clip-font-weight`, `--clip-case`, and `--shadow-clip-text` (shadow dropped under dark ink), identically to DOM bubbles.
- [x] **AC-015 (parity pass):** Border widths come from `--border-width`, `--border-width-pill`, and `--border-width-header`; Beton Brut renders 2px structural rules and a 3px header rule.
- [x] **AC-016 (parity pass):** The playhead renders a triangular cap colored from `--playhead`.

## Non-Goals (deferred to later specs)

- No theme import/export — themes are bundled with the app, not loaded from
  external files at runtime.
- No theme validation/sanitization for untrusted theme files (relevant when
  import is added).
- ~~No per-theme clip rendering treatments (gradient vs flat vs glow).~~
  SUPERSEDED by the 2026-07-07 parity pass: clip treatments are now tokens
  (`shadow-clip`, `border-clip`, `gradient-clip`, `clip-font-weight`,
  `clip-case`, theme-scoped `palette`).
- No theme persistence across app restarts — app always starts in Emerald
  until a session/theme preference store is wired.
- No custom theme creation or editing UI.
- No theme preview thumbnails in the dropdown.
- No light/dark mode toggle separate from theme selection.

## References

- mixjam-sample-daw spec-002 — archived predecessor-project doc, not tracked in this repo — Emerald theme tokens, WPF resource mapping, font families.
- mixjam-webjam spec-001 — archived predecessor-project doc, not tracked in this repo — CSS custom property theme system, 8 themes, `data-theme` switching.
- mixjam-sample-daw style-guide §2.2, §5.5 — archived predecessor-project doc, not tracked in this repo — Emerald token table, clip visual treatments per theme.
- mixjam-sample-daw tech-stack §5 — archived predecessor-project doc, not tracked in this repo — Theme JSON schema, WPF + WebView2 dual consumption.
