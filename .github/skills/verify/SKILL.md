---
name: verify
description: Drive the built MixJam renderer end-to-end in Chromium to verify UI/theme/tracker changes at the real surface (pixels, computed styles, canvas pixel sampling). Use after nontrivial renderer changes, before committing.
---

# Verify (MixJam Electron)

Runtime verification recipe for renderer changes. Unit tests stub the canvas
(jsdom), so canvas drawing, theme tokens, and CSS construction can only be
verified by running the production bundle.

## Handle

1. `npm run build` — produces `out/renderer` (static, no COOP/COEP needed).
2. Serve it: `node scripts/serve-static.mjs <port>` (background).
3. Drive with Playwright's `chromium` from a script placed **inside the repo**
   (module resolution needs the repo `node_modules`), e.g. `tmp/verify-*.mjs`
   (`tmp/` is git- and eslint-ignored). Run with `node tmp/verify-*.mjs`.

A worked example from the 2026-07-07 theme-parity pass lives at
`tmp/verify-parity.mjs` (may be absent — tmp is not committed; recreate from
this recipe).

## Seeding the app without real folders

Inject a mock `window.backendAPI` via `page.addInitScript` **before**
`page.goto` — `main.tsx` keeps an existing `window.backendAPI`. Copy the mock
shape from `tests/e2e/fixtures.ts` and keep it in sync with
`src/shared/backend-api.ts` (a missing method usually degrades silently
behind try/catch — verify the feature it feeds, not just app boot).
Session pre-set with both folders makes "Start New MixJam" enabled
immediately.

## Driving the tracker

- Theme switch: `page.locator('.theme-selector').selectOption('<key>')`.
  Do NOT use `getByLabel('Theme')` — the home screen swatch buttons also
  carry Theme-ish labels (strict-mode violation, 17 matches).
- Place a clip: dispatch a synthetic `DragEvent('drop')` on the target
  `.tracker-lane-canvas` with a `DataTransfer` carrying
  `application/mixjam-sample` = JSON `FooterSampleDetail`
  (see `TrackerView.handleLaneCanvasDrop`). `Object.defineProperty` the
  `dataTransfer` onto the event. Use `duration: 4.0` so the clip is wide
  enough (>100px) for pixel assertions.
- Playhead only renders while playing: click the `Play` button first.

## Asserting

- Theme tokens: `getComputedStyle(document.documentElement)
  .getPropertyValue('--token')`.
- Canvas content: `canvas.getContext('2d').getImageData(...)` histogram.
  Skip pixels with alpha < 250 — transparent pixels unpremultiply to
  `#000000`-ish noise. Compare against exact theme hexes (lowercased).
- DOM bubbles resolve `var(--palette-N)` — computed `backgroundColor`
  returns the resolved `rgb(...)`.
- Screenshot every state; the screenshots are the evidence.

## Gotchas

- `ELECTRON_RUN_AS_NODE` is set user-wide on this machine — strip it from
  `env` before `_electron.launch` (Electron surface only; the Chromium
  route above does not care).
- Headless Chromium has `devicePixelRatio = 1`; the canvas draw code scales
  by dpr, so account for it if asserting at specific coordinates.
