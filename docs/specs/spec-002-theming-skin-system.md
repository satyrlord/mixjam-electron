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
Vintage, Rack, Soft, Riso, Arcade. Four of them (Beton Brut, Vintage, Soft,
Riso) are the app's first light themes.)

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
|---|---|---|
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
| `--radius-transport` | Transport button corner shape | Transport strip buttons (play/pause/stop/skip/undo/redo); `50%` = round hardware buttons (Analog, Rust), rounded-rect values for modern themes (amended 2026-07-07) |
| `--radius-clip` | Clip / sample-bubble corner radius, px (amended 2026-07-07) | Lane clips (canvas-drawn) and DOM sample bubbles; `0px` for hard-edged print/terminal themes, `6px` preserves the pre-token look |

Depth tokens (`depth.*` in the JSON, applied as the same-named CSS custom
properties) carry full gradient/shadow value strings so `index.css` never
inlines a color literal (AC-008):

| Depth token | Role |
|---|---|
| `--gradient-header` | Header background (gradient or flat color) |
| `--gradient-ruler` | Ruler shading layer over `--bg-panel` (`none` = flat) |
| `--gradient-lane` | Lane shading layer over `--bg-lane` (`none` = flat) |
| `--shadow-clip-text` | text-shadow on clip/bubble labels |
| `--gradient-transport` | Idle transport button surface |
| `--gradient-transport-active` | Active transport button surface (lamp/LED) |
| `--shadow-transport` | Idle transport button box-shadow |
| `--shadow-transport-active` | Active transport button box-shadow (glow) |
| `--shadow-pill` | box-shadow for pill-family chrome — theme selector, mute/solo, mixer M/S. Carries construction language: neumorphic extrusion (Soft), Win9x bevel (Vintage), offset slab (Arcade), riso overprint (amended 2026-07-07) |
| `--shadow-lane` | Inset well shadow on the lane clip area (Rack, Soft) (amended 2026-07-07) |
| `--shadow-playhead` | Playhead glow (Cosmic, Neon) (amended 2026-07-07) |
| `--shadow-clip` | Clip drop-shadow, parsed by the lane canvas — strict format `<x>px <y>px <blur>px <color>` or `none` (amended 2026-07-07) |
| `--border-clip` | Clip outline, parsed by the lane canvas — strict format `<width>px <color>` or `none`; gives Beton Brut/Arcade their hard ink borders (amended 2026-07-07) |

### Typography Tokens

Each theme defines font families for three typographic roles. The families listed
below are the **Emerald defaults**; individual themes may override any role with
a different bundled font (e.g. the Rust theme sets both chrome and label to
Special Elite). Every font listed in the table is bundled with the app.

| Token | Role | Emerald Default | Also Used By |
|---|---|---|---|
| `--font-chrome` | Header, chrome UI | Josefin Sans | Special Elite (Rust), IBM Plex Sans (Enterprise), Space Grotesk (Beton Brut), Space Mono (Mono), Orbitron (Cosmic), Chakra Petch (Neon), Arimo (Vintage), Barlow (Rack), Nunito (Soft), Archivo Black (Riso), Silkscreen (Arcade) |
| `--font-label` | Body, labels, buttons | Ubuntu | Special Elite (Rust), JetBrains Mono (IDE, Rave, PA), IBM Plex Sans (Enterprise), Space Grotesk (Beton Brut), Space Mono (Mono), Exo 2 (Cosmic), Chakra Petch (Neon), Arimo (Vintage), Barlow (Rack), Nunito (Soft), Archivo (Riso), VT323 (Arcade) |
| `--font-mono` | Monospace (ruler, timer, code) | JetBrains Mono | Space Mono (Mono, Riso), Cousine (Vintage), VT323 (Arcade) |

New themes bundle their own font files by default (amended 2026-07-07) —
a theme's authentic typeface is part of its identity, so implementation
downloads the real family into `src/renderer/public/fonts/` rather than
substituting an already-bundled face.

All fonts must be bundled with the app and loaded from local files (no
external CDN or Google Fonts dependency). Font files live in `src/renderer/public/fonts/`.

### Sixteen Themes

| # | Theme Name | Token File Key | Character | Status |
|---|---|---|---|---|
| 1 | Emerald | `emerald` | Dark green baseline | Fully implemented |
| 2 | Enterprise | `enterprise` | Dark cloud-platform blue | Fully implemented |
| 3 | Neon Rave | `rave` | Cyan/pink club glow | Fully implemented |
| 4 | Warm Analog | `analog` | Warm hardware, round cream transport | Fully implemented |
| 5 | IDE | `ide` | Neutral dark editor | Fully implemented |
| 6 | Rust Industrial | `rust` | Olive faceplate, bakelite knobs, red LED | Fully implemented |
| 7 | Club PA | `pa` | Black stage rig | Fully implemented |
| 8 | Beton Brut | `beton` | Raw concrete, black rules, brick-red jolt (light) | Fully implemented |
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
|---|---|
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
    "border-clip": "<width>px <color> or none (canvas-parsed)"
  },
  "radius": "0.22rem",
  "radius-transport": "8px",
  "radius-clip": "6px"
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

## Acceptance Criteria (testable)

- [x] **AC-001:** App launches with the Emerald theme applied to all UI (header, content, footer) — no flash of default/unthemed appearance.
- [x] **AC-002:** The Emerald theme uses the exact token values listed in the table above (all 22 color tokens + `--radius`).
- [x] **AC-003:** All bundled fonts are loaded from local files — no external network requests for fonts.
- [x] **AC-004:** The theme selector dropdown in the tracker header lists all 16 theme names in order: Emerald, Enterprise, Neon Rave, Warm Analog, IDE, Rust Industrial, Club PA, Beton Brut, Mono, Cosmic, Neon, Vintage, Rack, Soft, Riso, Arcade.
- [x] **AC-005:** Default selection in the theme selector is "Emerald".
- [x] **AC-006:** Selecting any theme from the dropdown immediately applies that theme across the entire UI.
- [x] **AC-007:** Selecting Emerald from the dropdown (when already Emerald) is a no-op — no visual flicker.
- [x] **AC-008:** Theme tokens are defined in a single source of truth (e.g. JSON file). No UI element uses hardcoded color values outside the token system.
- [x] **AC-009:** Switching from Home Screen to Player and back does not change the active theme or cause a re-apply flicker.
- [x] **AC-010:** The Emerald theme JSON file is valid and parseable by a JSON validator — no syntax errors, no duplicate keys.

## Non-Goals (deferred to later specs)

- No theme import/export — themes are bundled with the app, not loaded from
  external files at runtime.
- No theme validation/sanitization for untrusted theme files (relevant when
  import is added).
- No per-theme clip rendering treatments (gradient vs flat vs glow). Clip
  rendering is spec-006.
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
