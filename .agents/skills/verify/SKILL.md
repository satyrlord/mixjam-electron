---
name: verify
description: Verifies nontrivial MixJam renderer changes through production Electron pixels, computed styles, canvas samples, and interaction evidence.
---

# Verify MixJam Renderer

Verify renderer changes against the production Electron bundle.
Use real Chromium evidence for CSS, canvas, themes, and Tracker behavior.

## Build And Drive

1. Remove `ELECTRON_RUN_AS_NODE` from the command environment.
   Complete this step when the launch process lacks the variable.
2. Run `npm run build`.
   Complete this step when the build exits cleanly.
3. Create `tmp/verify-<slug>.ts` inside the repository.
   Complete this step when `npx tsx` can load the script.
4. Import `launchMixJamElectron` from `tests/electron/packaged-launch.ts`.
   Complete this step when the script uses the helper's isolated user-data policy.
5. Launch Electron through `launchMixJamElectron`.
   Complete this step when the helper returns the application page.
6. Drive only the changed user states.
   Complete this step when each changed state has objective evidence.
7. Store screenshots and a short report under `tmp/verify-<slug>/`.
   Complete this step when every artifact exists.
8. Call the helper's `close` function in a `finally` block.
   Complete this step when no launched Electron process remains.

If the run lacks real folders, read [REFERENCE.md](REFERENCE.md#mock-data).
If the change affects the Tracker, read [REFERENCE.md](REFERENCE.md#tracker-actions).

## Assert The Surface

- Read theme tokens through `getComputedStyle(document.documentElement)`.
- Compare resolved DOM colors as computed `rgb(...)` values.
- Sample canvas pixels with the observed `devicePixelRatio`.
- Ignore canvas pixels with alpha values below 250.
- Compare exact lowercase theme colors after the alpha filter.
- Assert behavior or computed values with each screenshot.

## Completion Criterion

Complete verification only when every numbered step meets its criterion.
Every changed visual or interaction contract needs an objective assertion.
Report exact failed assertions without claiming a pass.
