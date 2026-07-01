# MixJam — how to build with these components

MixJam is a desktop (Electron) music-sketch app: a sample-library browser and a
lane-based tracker. All 9 components are the real shipped code. This is a
**CSS-custom-property design system** — you style with tokens (`var(--*)`), and
themes are swapped by setting one attribute on the root.

## Theme setup — the one thing you must get right

Every visual comes from CSS custom properties that are applied **at runtime**,
and the app keeps `body { visibility: hidden }` until a theme is applied. So a
tree that isn't themed renders **blank**. Two rules:

1. **Wrap your tree in `<ThemeBootstrap>`** (from `window.MixJam`). It applies the
   default theme (Emerald) and reveals the UI. Without it you get an invisible
   page, not an unstyled one.
2. **To use a specific theme, set `data-theme-key` on a wrapping element** (or
   pass `themeKey` to `<ThemeBootstrap>`). There are 8 themes:
   `emerald` (default), `studio`, `rave`, `analog`, `ide`, `rust`, `screen`,
   `pa`. Each defines the *same* token names with different values, so any
   layout you build in one theme works in all 8 — design against the tokens, never
   hardcode a color.

```jsx
const { ThemeBootstrap, TrackerView } = window.MixJam;
// default (Emerald):
<ThemeBootstrap><div id="ds-root">{/* your composition */}</div></ThemeBootstrap>
// a specific theme — set the attribute the token blocks key off:
<ThemeBootstrap>
  <div data-theme-key="rave">{/* everything here is Neon Rave */}</div>
</ThemeBootstrap>
```

## The token vocabulary (style with these, not literals)

All tokens are `var(--<name>)`; the same names exist in every theme. Read
`styles.css` (and the `_ds_bundle.css` it imports) for the full set. The ones you
compose with most:

- **Surfaces:** `--bg-base` (app background), `--bg-panel` (cards/panels),
  `--bg-lane`, `--bg-grid`, `--chrome` (header/footer/rails).
- **Text:** `--text`, `--text-muted`.
- **Brand / interaction:** `--accent`, `--accent-dark`, `--highlight` (active
  state, links, focus).
- **Lines / chips:** `--border`, `--header-border`, `--pill-bg`, `--pill-border`.
- **Tracker specifics:** `--playhead`, `--clip-text`, `--clip-select`,
  `--clip-missing`.
- **Type:** `--font-chrome` (headers/brand), `--font-label` (body/buttons),
  `--font-mono` (timecodes, paths, numbers) — values vary per theme (e.g.
  Emerald: Josefin Sans / Ubuntu / JetBrains Mono; Rust Industrial: Special
  Elite for both chrome and label, JetBrains Mono for mono; Flat Studio,
  Neon Rave, Screen Maximal, Club PA: one family across all three tokens —
  Ubuntu, JetBrains Mono, JetBrains Mono, JetBrains Mono respectively).
  Josefin Sans, Ubuntu, JetBrains Mono, and Special Elite all ship as
  `@font-face` in the bundle.
- **Depth / shape:** `--gradient-header`, `--gradient-ruler`, `--gradient-lane`,
  `--shadow-clip-text`, `--radius`.
- **Theme-specific texture overlays:** Rust Industrial and Screen Maximal add
  a full-window pseudo-element overlay (grain/scratches for Rust; scanlines +
  VHS chroma drift for Screen) keyed off `[data-theme-key='rust'|'screen']`
  on `.app::before`/`.app::after` in `index.css` — not tokens, since they're
  theme-specific effects rather than shared design vocabulary. If you compose
  a full-window page (like `AppShell`), these apply automatically; they do
  not extend to `.scan-overlay` (a `position: fixed` modal outside `.app`).

For a new element, reuse a class the components already use (`.folder-card`,
`.btn-primary`, `.manage-tab`, `.sample-bubble`, …) or write your own rule using
the tokens above. Class names come from the shipped stylesheet — read it before
inventing.

## Components and how they compose

- **Whole window:** `AppShell` stacks `Header` + a body + `Footer` and owns the
  active theme (its header theme selector switches themes live) — the fastest way
  to compose a full MixJam page. Pass the tracker (or home) content as its
  `children`.
- **App frame:** `Header` (brand, transport timer, theme selector) + `Footer`
  (version, selected-sample detail) top and bottom; both span the full window
  width — give them a full-width parent. (`AppShell` wires these for you.)
- **Home:** `HomeScreen` (composes two `FolderCard`s + a launch gate). `FolderCard`
  is standalone too — folder picker with empty / set / error states.
- **Tracker:** `TrackerView` is the whole workspace (recent-projects rail, lanes,
  song controls, sample browser). It's a **CSS-grid page that fills its
  container** (`grid-template-rows: minmax(0,1fr) 44px minmax(0,1fr)`), so give it
  a real-height parent (e.g. a flex column at viewport height) or its rows
  collapse. `LaneClipCanvas` (a single lane's clip strip, canvas-drawn) and
  `ManagePanel` (tags/libraries/categories editor, an absolutely-positioned
  overlay needing a positioned, sized ancestor) are used inside it.
- **Scanning:** `ScanOverlay` (full-screen modal while indexing) and
  `ScanProgressBar` (compact inline status).

These are prop-driven and controlled — they take data + callbacks and hold no
data layer of their own (the real app wires them to Electron IPC). Pass realistic
props; see each component's `.prompt.md` for its API and worked examples.
