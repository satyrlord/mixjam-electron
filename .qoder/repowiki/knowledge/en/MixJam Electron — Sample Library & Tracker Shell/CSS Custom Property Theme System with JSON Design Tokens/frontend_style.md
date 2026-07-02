## Styling Architecture

The MixJam Electron application uses a **CSS custom property (CSS variable) theme system** driven by JSON design token files. There is no CSS preprocessor (Sass/Less), no utility-first framework (Tailwind), and no component library (MUI, Chakra). All styling is authored as plain CSS in a single stylesheet (`index.css`) with BEM-inspired class names.

### Core Approach

- **Design tokens**: Defined as JSON files in `public/themes/`. Each theme declares the same set of color, font, and radius keys; only values differ.
- **CSS custom properties**: Tokens are applied at runtime as CSS variables on `document.documentElement` (e.g., `--accent`, `--bg-base`, `--font-label`).
- **Single CSS file**: All component styles live in `src/renderer/src/index.css` (~795 lines). No per-component CSS modules or scoped stylesheets.
- **BEM-style class naming**: Classes follow a flat, descriptive convention (e.g., `.folder-card`, `.folder-card-head`, `.tracker-lane-mute-active`). No CSS-in-JS.

### Theme System

**Token schema** (from `spec-002-theming-skin-system.md`):

| Category | Tokens |
|---|---|
| Colors (16) | `accent`, `accent-dark`, `highlight`, `bg-base`, `bg-panel`, `bg-lane`, `bg-grid`, `chrome`, `border`, `header-border`, `text`, `text-muted`, `pill-bg`, `pill-border`, `playhead` |
| Fonts (3) | `font-chrome` (Josefin Sans), `font-label` (Ubuntu), `font-mono` (JetBrains Mono) |
| Radius (1) | `radius` |

**Eight named themes** are defined in the spec, but only **Emerald** is fully implemented:
- Emerald, Flat Studio, Neon Rave, Warm Analog, IDE, Rust Industrial, Screen Maximal, Club PA

Selecting any non-Emerald theme immediately resets to Emerald (per spec AC-006).

### Bootstrap & Runtime Application

1. **Synchronous bootstrap**: `bootstrapTheme()` runs before React mounts in `bootstrapApp.tsx`, applying Emerald tokens to `:root` and setting `data-theme-ready='true'`.
2. **FOUC prevention**: `body { visibility: hidden }` until `[data-theme-ready='true']` makes it visible — eliminates flash of unstyled content.
3. **Runtime switching**: `selectTheme()` writes new CSS variable values via `element.style.setProperty()` and updates `data-theme-key` attribute.
4. **No persistence**: Theme preference is not persisted across restarts; app always boots into Emerald.

### Typography

Three bundled fonts loaded from local TTF files in `src/renderer/public/fonts/`:
- **Josefin Sans** — header/chrome UI (`--font-chrome`)
- **Ubuntu** — body text, labels, buttons (`--font-label`)
- **JetBrains Mono** — monospace for ruler, timer, metadata (`--font-mono`)

Font faces are declared via `@font-face` rules in `index.css` with `font-display: swap`.

### Responsive Strategy

The app targets a **fixed desktop layout** with no responsive breakpoints or mobile adaptation:
- Fixed-height header (40px) and footer (40px)
- Flexbox and CSS Grid for internal layout (e.g., tracker view uses `grid-template-columns: 240px minmax(0, 1fr)`)
- `overflow: hidden` on `html, body` prevents page-level scrolling; scrollable regions use `overflow: auto` internally
- No media queries found in the codebase

### Key Conventions for Developers

1. **Never hardcode colors** — all color values must reference CSS custom properties (`var(--token-name)`). This is enforced by spec AC-008.
2. **Use existing class names** — add new classes to `index.css` following the BEM-like pattern (`.block`, `.block-element`, `.block--modifier`).
3. **Extend themes via JSON** — to add a new theme, create a JSON file in `public/themes/` matching the token schema, register it in `THEME_OPTIONS`, and add it to `IMPLEMENTED_THEMES` in `themes.ts`.
4. **Font usage** — reference fonts via `var(--font-chrome)`, `var(--font-label)`, or `var(--font-mono)` rather than font-family literals.
5. **Border radius** — use `var(--radius)` consistently; do not hardcode pixel/rem values for rounded corners.
6. **Visibility gating** — if adding new top-level elements, ensure they respect the `data-theme-ready` visibility pattern to avoid FOUC.