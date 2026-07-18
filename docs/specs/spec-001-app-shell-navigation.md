# Spec 001 — App Shell & Navigation

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** *(root — no dependencies)*

## Objective

Establish the two-view application shell: a **Home Screen** (displayed when no
project is loaded) and a **MixJam Player** (displayed when a project is active).
Implement view switching, the header bar, and the footer.

## User Stories

- **US-001:** As a user, I open the app and see a Home Screen with a clear call-to-action so I know how to begin.
- **US-002:** As a user, I click "Start New MixJam" and see the full MixJam Player layout appear so I can start arranging.
- **US-003:** As a user, I see the app brand and a timer in the header while working in the Player so I know what app I'm using and how long I've been working.
- **US-004:** As a user, I can return to the Home Screen from the Player via a home link so I can start over.
- **US-005:** As a user, I see a version string in the footer so I know which build I'm running.

## Scope

### Home Screen

- **App icon:** the default Electron app icon is replaced with the app icon
  from the `public/` folder.
- Window, header, content-area, and footer layout, sizing, and positioning
  follow the [Style Guide](../style-guide.md#layout-architecture).
- **Content area:** two primary columns, vertically and horizontally centered.
  - Hero column (left): the app logo from `public/app-icon-128.png`, "MixJam"
    wordmark, tagline, three quick-start steps, and a theme-preview grid that
    switches the active theme. The selected theme name appears only in the
    header selector.
  - Setup column (right): a raised panel holding the two folder cards
    (spec-003), the launch gate, and the Load MixJam link.
  - Recent Projects rail: when projects exist, a sibling region sits below the
    hero while the setup panel spans both desktop rows. It shows up to four
    projects that are selectable on click and load through spec-011. The
    four-item cap keeps Home geometry independent of the total project history.
    Responsive breakpoints follow the [Style Guide](../style-guide.md#layout-architecture).
  - "Start New MixJam" button — primary action, navigates to the MixJam Player.
    Visual treatment follows the [Style Guide](../style-guide.md#surface-treatments).
  - "Load MixJam" link — secondary action. Once both folders are available,
    it opens a file picker filtered to `.mixjam` (the File System Access
    `showOpenFilePicker`; the Electron shell surfaces it as a native dialog).
- The Home Screen has no timer and no home link.

### MixJam Player

- Window, header, content-area, footer, and region sizing follow the
  [Style Guide](../style-guide.md#layout-architecture).
- Header: home link "&lt; Return to Main Menu" (left, only in Player),
  brand "MixJam Electron" (right of home link), timer, and theme selector
  dropdown on the right (behavior owned by spec-002).
- **Timer** displays `00:00.0` format.
- The tracker content area below the header shows the structural skeleton of
  the app using the approved player region map: MixJam Browser and Tracker in
  the upper work band, a full-width Middle Strip, and a full-width Bottom
  Workspace. The Bottom Workspace contains Song, Mixer, FX, and Samples tabs;
  its detailed behavior belongs to spec-006.
- **Footer** is unchanged from Home Screen.

### View Switching

- Clicking "Start New MixJam" on the Home Screen replaces the content area
  with the MixJam Player.
- "Load MixJam" opens the project file picker and navigates to the Player only
  after a valid project loads. Cancelling stays on Home.
- Clicking the home link "&lt; Return to Main Menu" in the Player header
  returns to the Home Screen.
- View switching must be instantaneous (no page reload, no navigation delay).
- When switching from Home to Player, the window resizes from 1280×720 to
  1920×1080 and the maximize button becomes available.
- When switching from Player to Home, the window resizes from its current
  size back to 1280×720 and the maximize button is removed.

### Browser host (non-Electron runtime)

The browser build is the real app: the same bundle and backend used by the
Electron shell.

- The renderer always installs the real browser backend (sqlite-wasm over
  OPFS, File System Access folders, localStorage preferences, and `.mixjam`
  project state). Host detection only
  selects the optional `window.shellAPI` (present inside the Electron shell).
- There is **no demo mode**: with no granted Sample Folder the home screen
  gates the tracker exactly as on desktop. Onboarding for users without
  samples is spec-013 (Sample Folder Builder), not fake data.
- Window-management behaviors (resize to 1280×720 / 1920×1080, maximize
  button) are Electron-shell capabilities; in the browser the resize calls are
  no-ops and the app simply fills the tab. The window-sizing acceptance
  criteria below apply to the Electron host only.
- Folder picking uses the File System Access directory picker in both hosts
  (spec-003).
- The app runs in exactly one tab per origin (opfs-sahpool allows one DB
  connection); a second tab shows an "already open in another tab" notice.
- This enables full-featured deployment on static hosts like GitHub Pages
  (Chromium-only is an accepted constraint).

### Header Bar (both views)

- Sizing and positioning follow the [Style Guide](../style-guide.md#layout-architecture).
- **Home Screen state:** brand "MixJam Electron" anchored to the left margin.
  Theme selector dropdown on the right (behavior owned by spec-002).
- **Player state:** home link "&lt; Return to Main Menu" (left),
  brand "MixJam Electron" (right of home link), timer (center),
  and theme selector dropdown on the right (behavior owned by spec-002). The
  home link is not present in the Home Screen state.
- The timer is never a flex sibling of the left/right header content.

### Footer (both views)

- Sizing and positioning follow the [Style Guide](../style-guide.md#layout-architecture).
- **Home Screen state:** left "Select User Folder" link (opens the User Folder
  picker and persists a valid selection to app state through the same flow
  as the Home Screen folder card), right version string.
- **Player state:** left "Select User Folder" link, right version string,
  and a center detail slot that may be populated by the Sample Browser
  selection model (spec-004).
- The center footer slot is empty when no sample is selected.
- Version string is derived from the number of git commits at build time
  (format: `0.<commit-count>`, e.g. `0.43`). Falls back to the package.json
  version when git is unavailable. Clicking the version link opens the default
  system browser to `https://github.com/satyrlord/mixjam-electron`.

## Acceptance Criteria (testable)

Spec validation confirms these criteria are complete and testable as requirements.
Implementation validation should be tracked in implementation PR/test evidence.

- [x] **AC-001:** App launches at 1280×720 centered on screen (Home Screen), with no maximize button.
- [x] **AC-001a:** Home Screen header shows "MixJam Electron" brand anchored to the left margin.
- [x] **AC-002:** Home Screen content area shows "Start New MixJam" button and "Load MixJam" link.
- [x] **AC-002a:** Recent Projects is outside the raised setup panel, aligns
  below the hero while setup spans both desktop rows, and responds from four
  desktop columns to two columns at 900px and below.
- [x] **AC-002b:** The Home hero uses `public/app-icon-128.png` as the visible
  MixJam logo instead of a generated waveform mark.
- [x] **AC-002c:** At the default 1280×720 window size, including its shorter
  Electron renderer viewport, Home has no vertical overflow or scrollbar. Any
  number of available recent projects keeps the same layout because only the
  first four are rendered.
- [x] **AC-003:** Footer is 48px height (same as header), shows "Select User Folder" left and clickable version string right on both views.
- [x] **AC-003a:** Clicking the version string in the footer opens the default system browser to `https://github.com/satyrlord/mixjam-electron`.
- [x] **AC-003b:** In Player state, selecting a sample may populate the center footer slot with sample details while the left settings link and right version string remain visible.
- [x] **AC-004:** Clicking "Start New MixJam" resizes the window to 1920×1080 centered, enables the maximize button, and switches the content area to the MixJam Player.
- [x] **AC-005:** In the Player, the header shows home link "&lt; Return to Main Menu", brand "MixJam Electron", and timer (`00:00.0`).
- [x] **AC-005a:** The home link "&lt; Return to Main Menu" is NOT present in the Home Screen header. It only appears in the Player header.
- [x] **AC-006:** The timer is absolutely centered in the header — it does not shift when left/right content changes.
- [x] **AC-007:** Once both folders are available, clicking "Load MixJam"
  opens a filtered file picker and selecting a valid project navigates to the
  Player (with window resize in the Electron shell); cancelling stays on Home.
- [x] **AC-008:** Clicking the home link "&lt; Return to Main Menu" in the Player header resizes the window back to 1280×720, removes the maximize button, and returns to the Home Screen.
- [x] **AC-009:** Roundtrip: Home → Player → Home → Player works without visual glitches or state leaks, and window dimensions are correct at each step.
- [x] **AC-010:** The Player content area provides structural regions for the
  upper work band, full-width Middle Strip, and lower work band; spec-006 owns
  their detailed current layout and controls.
- [x] **AC-011:** The app occupies the full viewport height with no overflow
  scrollbar on the root. Home owns any required narrow-window vertical
  scrolling internally with both content limits reachable; the default
  1280×720 Electron window has no Home overflow.
- [x] **AC-012:** The app window displays the custom app icon from the `public/` folder, not the default Electron icon.
- [x] **AC-013:** In a browser-only host where `window.shellAPI` is missing, the renderer runs the
  full real app (browser backend, folder gating, theming) with no mock or demo data; window-resize
  calls are no-ops.
- [x] **AC-014:** Automatic library sync is non-modal and survives Home/Player
  view changes without restarting. Scan and analysis work never applies an
  app-wide blur or blocks navigation.

## Native Window Evidence

`tests/electron/smoke.spec.ts` queries the live Windows `BrowserWindow` through
Playwright's Electron main-process bridge. It verifies the centered 1280 by
720 non-resizable/non-maximizable Home state, the centered 1920 by 1080
resizable/maximizable Player state, and the return to Home. The renderer unit
suite separately verifies that the Home and Player navigation actions invoke
those shell capabilities.

The Windows-only `scripts/inspect-window-icon.ps1` probe reads the icon from the
live HWND and compares it with a 32 by 32 PNG rendered from `public/app-icon.ico`
by Electron's `nativeImage` implementation. The current probe measured a mean
absolute channel difference of 6.53 and 98.69 percent foreground overlap,
confirming the live MixJam skull rather than only the source asset's existence.
Raw bounds, display work area, frame states, icon metrics, and screenshots are
stored under `tmp/verify-electron-window-state/`.

`tests/e2e/compact-layout.spec.ts` verifies the full-width Recent Projects rail,
responsive four/two-column geometry, and root-versus-Home overflow ownership
with reachable scroll limits across representative themes in the production
Chromium bundle.
`tmp/verify-compact-layout/evidence.md` records the matching computed geometry
and screenshots.

## Non-Goals (deferred to later specs)

- No theme switching — the app renders with a single hardcoded default look.
  Theming is spec-002.
- No real audio playback, no transport controls, no BPM — all Player content
  is structural placeholder. Audio engine is spec-005.
- Project file format and persistence behavior belong to spec-011.
- No folder selection for sample libraries. Folder management is spec-003.
- No sample data, no sample-bubble rendering, no lane interaction. Tracker timeline is spec-006.
- No settings persistence — the settings link in the footer is a placeholder.
- No keyboard shortcuts.
- No window resize constraints beyond the full-viewport rule.
