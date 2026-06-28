# Spec 002 — Theming & Skin System

**Status:** ✅ VALIDATED
**Depends on:** spec-001 (App Shell & Navigation)

## Objective

Establish the theme system: 8 named themes defined as design tokens, a runtime
theme switching mechanism, and the Emerald theme as the fully implemented
baseline. All other themes are listed but deferred.

## User Stories

- **US-001:** As a user, I see the app in the Emerald theme by default so the
  UI has a consistent, polished look on first launch.
- **US-002:** As a user, I can see all 8 available theme names listed in the
  theme selector dropdown so I know what options exist.
- **US-003:** As a user, selecting the Emerald theme applies it immediately
  across the entire app (header, content, footer, all views).
- **US-004:** As a user, selecting any non-Emerald theme resets back to
  Emerald so I never see a broken half-themed state.

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
| `--radius` | Border radius | Clips, buttons, panels |

### Typography Tokens

| Token | Role | Font Family |
|---|---|---|
| `--font-chrome` | Header, chrome UI | Josefin Sans |
| `--font-label` | Body, labels, buttons | Ubuntu |
| `--font-mono` | Monospace (ruler, timer, code) | JetBrains Mono |

All three fonts must be bundled with the app and loaded from local files (no
external CDN or Google Fonts dependency). Font files live in `public/fonts/`.

### Eight Themes

| # | Theme Name | Token File Key | Status |
|---|---|---|---|
| 1 | Emerald | `emerald` | ✅ Fully implemented |
| 2 | Flat Studio | `studio` | ⬜ Listed only |
| 3 | Neon Rave | `rave` | ⬜ Listed only |
| 4 | Warm Analog | `analog` | ⬜ Listed only |
| 5 | IDE | `ide` | ⬜ Listed only |
| 6 | Rust Industrial | `rust` | ⬜ Listed only |
| 7 | Screen Maximal | `screen` | ⬜ Listed only |
| 8 | Club PA | `pa` | ⬜ Listed only |

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
- Changing the selection to any non-Emerald theme immediately resets back to
  Emerald.
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

### Theme File Format

Each theme is defined as a standalone JSON file in `public/themes/`:

```json
{
  "name": "Emerald",
  "key": "emerald",
  "colors": {
    "accent": "#00674F",
    "accent-dark": "#004434",
    ...
  },
  "fonts": {
    "chrome": "Josefin Sans",
    "label": "Ubuntu",
    "mono": "JetBrains Mono"
  },
  "radius": "0.22rem"
}
```

At minimum, the Emerald theme file exists. Stub files for the other 7 themes
may exist (with Emerald values copied as placeholders) or be created on demand
in later specs.

## Acceptance Criteria (testable)

- [ ] **AC-001:** App launches with the Emerald theme applied to all UI (header, content, footer) — no flash of default/unthemed appearance.
- [ ] **AC-002:** The Emerald theme uses the exact token values listed in the table above (all 16 color tokens + `--radius`).
- [ ] **AC-003:** The three bundled fonts (Josefin Sans, Ubuntu, JetBrains Mono) are loaded from local files — no external network requests for fonts.
- [ ] **AC-004:** The theme selector dropdown in the tracker header lists all 8 theme names in order: Emerald, Flat Studio, Neon Rave, Warm Analog, IDE, Rust Industrial, Screen Maximal, Club PA.
- [ ] **AC-005:** Default selection in the theme selector is "Emerald".
- [ ] **AC-006:** Selecting any non-Emerald theme from the dropdown immediately resets the selection back to Emerald — the app never displays a broken/incomplete theme.
- [ ] **AC-007:** Selecting Emerald from the dropdown (when already Emerald) is a no-op — no visual flicker.
- [ ] **AC-008:** Theme tokens are defined in a single source of truth (e.g. JSON file). No UI element uses hardcoded color values outside the token system.
- [ ] **AC-009:** Switching from Home Screen to Player and back does not change the active theme or cause a re-apply flicker.
- [ ] **AC-010:** The Emerald theme JSON file is valid and parseable by a JSON validator — no syntax errors, no duplicate keys.

## Non-Goals (deferred to later specs)

- Only Emerald is implemented. The other 7 themes are listed in the dropdown
  but have no distinct visual appearance.
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

- [mixjam-sample-daw spec-002](../_archived/mixjam-sample-daw/specs/002-home-screen-with-skin-support/spec.md) — Emerald theme tokens, WPF resource mapping, font families.
- [mixjam-webjam spec-001](../_archived/mixjam-webjam/specs/001-shell-and-theming/spec.md) — CSS custom property theme system, 8 themes, `data-theme` switching.
- [mixjam-sample-daw style-guide §2.2, §5.5](../_archived/mixjam-sample-daw/docs/style-guide.md) — Emerald token table, clip visual treatments per theme.
- [mixjam-sample-daw tech-stack §5](../_archived/mixjam-sample-daw/docs/tech-stack.md) — Theme JSON schema, WPF + WebView2 dual consumption.
