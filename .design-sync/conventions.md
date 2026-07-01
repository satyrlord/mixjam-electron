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
- **Type:** `--font-chrome` (Josefin Sans — headers/brand), `--font-label`
  (Ubuntu — body/buttons), `--font-mono` (JetBrains Mono — timecodes, paths,
  numbers). All three ship as `@font-face` in the bundle.
- **Depth / shape:** `--gradient-header`, `--gradient-ruler`, `--gradient-lane`,
  `--shadow-clip-text`, `--radius`.

For a new element, reuse a class the components already use (`.folder-card`,
`.btn-primary`, `.manage-tab`, `.sample-bubble`, …) or write your own rule using
the tokens above. Class names come from the shipped stylesheet — read it before
inventing.

## Components and how they compose

- **App frame:** `Header` (brand, transport timer, theme selector) + `Footer`
  (version, selected-sample detail) top and bottom; both span the full window
  width — give them a full-width parent.
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
