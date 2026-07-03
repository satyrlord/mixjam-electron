# Spec 002 — Theming & Skin System

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-001 (App Shell & Navigation)

## Objective

Establish the theme system: 8 named themes defined as design tokens and a
runtime theme switching mechanism. All 8 themes (Emerald, Flat Studio, Neon
Rave, Warm Analog, IDE, Rust Industrial, Screen Maximal, Club PA) are fully
implemented with distinct visual appearances; Emerald is the default.

## User Stories

- **US-001:** As a user, I see the app in the Emerald theme by default so the
  UI has a consistent, polished look on first launch.
- **US-002:** As a user, I can see all 8 available theme names listed in the
  theme selector dropdown so I know what options exist.
- **US-003:** As a user, selecting the Emerald theme applies it immediately
  across the entire app (header, content, footer, all views).
- **US-004:** As a user, selecting any theme applies it immediately across
  the entire app so I can use all 8 themes.

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
| `--radius` | Border radius | Clips, buttons, panels |

### Typography Tokens

Each theme defines font families for three typographic roles. The families listed
below are the **Emerald defaults**; individual themes may override any role with
a different bundled font (e.g. the Rust theme sets both chrome and label to
Special Elite). Every font listed in the table is bundled with the app.

| Token | Role | Emerald Default | Also Used By |
|---|---|---|---|
| `--font-chrome` | Header, chrome UI | Josefin Sans | Special Elite (Rust) |
| `--font-label` | Body, labels, buttons | Ubuntu | Special Elite (Rust), JetBrains Mono (IDE, Rave, PA, Screen) |
| `--font-mono` | Monospace (ruler, timer, code) | JetBrains Mono | — |
| *(none)* | — | Special Elite | Rust theme (chrome + label) |

All fonts must be bundled with the app and loaded from local files (no
external CDN or Google Fonts dependency). Font files live in `src/renderer/public/fonts/`.

### Eight Themes

| # | Theme Name | Token File Key | Status |
|---|---|---|---|
| 1 | Emerald | `emerald` | Fully implemented |
| 2 | Flat Studio | `studio` | Fully implemented |
| 3 | Neon Rave | `rave` | Fully implemented |
| 4 | Warm Analog | `analog` | Fully implemented |
| 5 | IDE | `ide` | Fully implemented |
| 6 | Rust Industrial | `rust` | Fully implemented |
| 7 | Screen Maximal | `screen` | Fully implemented |
| 8 | Club PA | `pa` | Fully implemented |

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
- Dropdown lists all 8 theme names.
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
  block collapses decorative animation — the Screen Maximal CRT flicker and
  VHS drift, the scan spinner (replaced by a static highlighted ring), the
  locate-in-browser flash (replaced by a static outline), and all
  transitions.

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
    "clip-select": "#FFE066",
    "clip-missing": "#FF6D6D",
    "meter-green": "#4CAF50",
    "meter-yellow": "#FFC107",
    "meter-red": "#F44336"
  },
  "fonts": {
    "chrome": "Josefin Sans",
    "label": "Ubuntu",
    "mono": "JetBrains Mono"
  },
  "depth": {
    "gradient-header": "linear-gradient(90deg, ...)",
    "gradient-ruler": "linear-gradient(180deg, ...)",
    "gradient-lane": "linear-gradient(180deg, ...)",
    "shadow-clip-text": "1.5px 1.5px 2px rgba(0,0,0,0.55)"
  },
  "radius": "0.22rem"
}
```

All 8 theme files exist in `public/themes/` with their own distinct token
values (no placeholder copies).

## Acceptance Criteria (testable)

- [x] **AC-001:** App launches with the Emerald theme applied to all UI (header, content, footer) — no flash of default/unthemed appearance.
- [x] **AC-002:** The Emerald theme uses the exact token values listed in the table above (all 22 color tokens + `--radius`).
- [x] **AC-003:** The four bundled fonts (Josefin Sans, Ubuntu, JetBrains Mono, Special Elite) are loaded from local files — no external network requests for fonts.
- [x] **AC-004:** The theme selector dropdown in the tracker header lists all 8 theme names in order: Emerald, Flat Studio, Neon Rave, Warm Analog, IDE, Rust Industrial, Screen Maximal, Club PA.
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
