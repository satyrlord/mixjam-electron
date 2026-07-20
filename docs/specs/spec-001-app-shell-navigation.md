# Spec 001 — App Shell & Navigation

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** *(root — no dependencies)*

## Objective

Establish the two-view application shell: a **Home Screen** (displayed when no
project is loaded) and a **MixJam Player** (displayed when a project is active).
The Player owns an exclusive **Settings** modal opened from its footer.
Implement view switching, the header bar, and the footer.

## User Stories

- **US-001:** As a user, I open the app and see a Home Screen with a clear call-to-action so I know how to begin.
- **US-002:** As a user, I click "Start New MixJam" and see the full MixJam Player layout appear so I can start arranging.
- **US-003:** As a user, I see the app brand and a timer in the header while working in the Player so I know what app I'm using and how long I've been working.
- **US-004:** As a user, I can return to the Home Screen from the Player via a home link so I can start over.
- **US-005:** As a user, I see a version string in the footer so I know which build I'm running.
- **US-006:** As a user, I can open Settings from the Player footer so app
  preferences, folder selection, and project audio settings have one
  predictable modal without leaving the Tracker.

## Scope

### Home Screen

- **App icon:** the default Electron app icon is replaced with a bundled,
  platform-decodable app icon from the `public/` folder: `app-icon.ico` on
  Windows and `app-icon-512.png` on Linux and macOS.
- Window, header, content-area, and footer layout, sizing, and positioning
  follow the [Style Guide](../style-guide.md#layout-architecture).
- **Content area:** two primary columns, vertically and horizontally centered.
  - Hero column (left): the app logo from `public/app-icon-128.png`, "MixJam"
    wordmark, tagline, three quick-start steps, and a theme-preview grid that
    switches the active theme. The selected theme name appears only in the
    header selector.
  - Workflow column (right): three independent sibling cards with no enclosing
    panel. Library Setup owns the folder controls and scanner, Create or Open
    owns the project actions, and Generate a MixJam owns the generator entry.
  - Recent Projects rail: when projects exist, a sibling region sits below the
    hero while the workflow column spans both desktop rows. It shows up to four
    projects that are selectable on click and load through spec-011. The
    four-item cap keeps Home geometry independent of the total project history.
    Responsive breakpoints follow the [Style Guide](../style-guide.md#layout-architecture).
  - "Start New MixJam" button — the sole filled primary action, navigates to
    the MixJam Player. In the Create or Open card it occupies about two-thirds
    of the action row.
  - "Load MixJam" button — outlined secondary action in the remaining third of
    the Create or Open row. Once both folders are available,
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
  Workspace. The Bottom Workspace contains Master, Mixer, and Samples tabs;
  its detailed behavior belongs to spec-006.
- **Footer** adds Settings on the left and may show selected sample detail in
  the center. The version remains on the right.

### Settings Modal

- The Player footer Settings link replaces the former User Folder and UI Size
  footer controls. Home does not expose Settings because no project is active.
- Settings is an exclusive modal over the mounted Player/Tracker, not a view or
  content replacement. Existing playback may continue, while background
  pointer input and ordinary app hotkeys are blocked.
- The modal traps focus, focuses its Close control on open, closes with Close or
  Escape, ignores outside pointer interaction, and restores focus to the footer
  Settings trigger.
- Settings contains three sections:
  - **User Folder** uses the same picker, validation, and persistence flow as
    the Home Screen Library Setup card (spec-003).
  - **Zoom Level** exposes the app-wide UI Size preference as the segmented
    `75%`, `100%`, and `125%` control owned by spec-002.
  - **Clip Edge Fades** exposes the active project's sound setting owned by
    specs 005, 006, and 011.

### View Switching

- Clicking "Start New MixJam" on the Home Screen replaces the content area
  with the MixJam Player.
- "Load MixJam" opens the project file picker and navigates to the Player only
  after a valid project loads. Cancelling stays on Home.
- Clicking the home link "&lt; Return to Main Menu" in the Player header
  returns to the Home Screen.
- View switching must be instantaneous (no page reload, no navigation delay).
- When switching from Home to Player, the Electron shell ensures a 1920x1080
  content minimum, then maximizes the window once on the display that currently
  contains it. The app does not force a size or maximize state again after
  entry, so the user may restore, resize above the minimum, or move the Player
  window normally.
- When switching from Player to Home, the window unmaximizes and restores a
  1920x1080 renderer content area. The native frame is additional. The window
  remains resizable and maximizable in all views.
- Every view requires both a renderer width of at least 1920 CSS pixels and a
  renderer height of at least 1080 CSS pixels. Below either boundary, the
  renderer mounts only an unsupported-resolution notice. It does not mount
  Home, Player, navigation, project actions, or application hooks. Returning to
  a supported size mounts the application again.

### Electron host

Electron is the only supported runtime and the only end-user distribution.
The main process loads the renderer from `app://bundle`; the renderer requires
the preload-provided `window.shellAPI`. The renderer owns sqlite-wasm over OPFS,
File System Access folders, localStorage preferences, and `.mixjam` project
state. The shell owns only native window and allowlisted external-link actions.

There is no web deployment and no demo mode. With no granted Sample Folder,
the Home Screen gates the Player. Onboarding for users without samples is
spec-020, not fake data. A lifetime Web Lock protects the single opfs-sahpool
connection; a competing Electron window shows an already-open notice.

### Distribution

The only end-user artifacts are Electron packages. The production workflow
runs the unit suite, builds and packages natively on Windows, Linux, and macOS,
then verifies the native package on each matching GitHub-hosted runner. It
produces a portable `.exe`, AppImage, and `.dmg`. The Linux proof supplies the
AppImage's explicit generated path to the smoke test and launches that file,
never `linux-unpacked`. The macOS proof mounts the generated DMG at a temporary
mount point and launches `MixJam Electron.app/Contents/MacOS/MixJam Electron`
inside that mounted image, never the unpacked `mac` directory. These native
artifact proofs do not add `--no-sandbox`.

The Windows job records the portable executable's hash, size, and signing state,
then launches that exact artifact with an isolated user-data directory. The
gate requires the portable NSIS bootstrap to produce a stable, responsive
MixJam Electron native window and records the process and window evidence before
cleanup. Because the bootstrap starts a child process, the deeper Playwright
assertions then drive `win-unpacked/MixJam Electron.exe`, which contains the same
packaged application resources and preserves the main-process connection.

Every native artifact proof also runs the built Electron interaction probe at
UI Size 50 with 16 lanes. It records Tracker vertical wheel scrolling and
keyboard focus reveal; Mixer horizontal scrolling from a horizontal wheel,
Shift+wheel, and Left/Right keys; and focus reveal of a clipped Mixer control.
It confirms that plain vertical wheel input does not scroll the Mixer
horizontally. The workflow uploads the Playwright report, screenshots, and raw
measurements with the package artifacts. Manual workflow runs retain all of
those artifacts for 14 days. A `v*` tag attaches the three packages to its
GitHub Release only after those gates pass.

Code signing and macOS notarization are separate release-readiness gates. They
are not configured, so current artifacts are unsigned and must not be described
as signed, notarized, or warning-free.

### Header Bar (both views)

- Sizing and positioning follow the [Style Guide](../style-guide.md#layout-architecture).
- **Home Screen state:** brand "MixJam Electron" anchored to the left margin.
  Theme selector dropdown on the right (behavior owned by spec-002).
- **Player state:** home link "&lt; Return to Main Menu" (left),
  brand "MixJam Electron" (right of home link), timer (center),
  and theme selector dropdown on the right (behavior owned by spec-002). The
  home link is not present in the Home Screen state.
- The timer is never a flex sibling of the left/right header content.

### Operating-system media controls

- The renderer registers Media Session actions for `previoustrack`,
  `play`, `pause`, and `nexttrack`. Previous track seeks to tick 0, play and
  pause toggle transport state, and next track seeks to the song end.
- These operating-system actions remain allowed while a blocking modal is open
  and while MixJam is in the background, when the operating system selects
  MixJam as the active media session.
- This exception applies only to Media Session actions. It does not authorize
  application-wide `globalShortcut` registration or bypass ordinary in-app
  modal input blocking.

### Footer (both views)

- Sizing and positioning follow the [Style Guide](../style-guide.md#layout-architecture).
- Home shows only the version string on the right; its left and center slots are
  empty. User Folder selection remains in Home Library Setup.
- Player shows Settings on the left, the version on the right, and a center
  detail slot that may be populated by the Sample Browser selection model
  (spec-004).
- The center footer slot is empty when no sample is selected.
- Version string uses the semantic version from `package.json`, matching the
  packaged application metadata. Clicking the version link opens the default
  system browser to `https://github.com/satyrlord/mixjam-electron`.

## Acceptance Criteria (testable)

Spec validation confirms these criteria are complete and testable as requirements.
Implementation validation should be tracked in implementation PR/test evidence.

- [x] **AC-001:** App launches with a 1920x1080 renderer content area centered
  on screen (Home Screen), with maximize and resize enabled.
- [x] **AC-001a:** Home Screen header shows "MixJam Electron" brand anchored to the left margin.
- [x] **AC-002:** Home Screen content area shows "Start New MixJam" and "Load MixJam" buttons.
- [x] **AC-002a:** The right workflow column contains three independent sibling
  cards with no enclosing panel. Recent Projects remains outside that column,
  aligns below the hero, and uses four columns at the supported viewport size.
- [x] **AC-002b:** The Home hero uses `public/app-icon-128.png` as the visible
  MixJam logo instead of a generated waveform mark.
- [x] **AC-002c:** At the default 1920x1080 renderer content size, Home has no
  vertical overflow or scrollbar in
  idle, sync, analysis, error, or ready states. The Library Setup scanner
  expands for active work and collapses when ready. Any number of available
  recent projects keeps the same layout because only the first four are rendered.
- [x] **AC-003:** At base UI Size 30, footer and header are 48px high. The footer
  shows the clickable version string right on Home and Player. Player also shows
  Settings on the left. Spec-002 owns higher UI Size scaling.
- [x] **AC-003a:** Clicking the version string in the footer opens the default system browser to `https://github.com/satyrlord/mixjam-electron`.
- [x] **AC-003b:** In Player state, selecting a sample may populate the center footer slot with sample details while the left settings link and right version string remain visible.
- [x] **AC-003c:** Player Settings is an exclusive modal over the mounted
  Tracker. It traps focus, blocks background app input, closes with Close or
  Escape, ignores outside pointer input, and restores focus to its footer link.
- [x] **AC-003d:** The Settings modal contains Select User Folder, Zoom Level,
  and project-owned Clip Edge Fades. Home has no Settings link.
- [x] **AC-004:** Clicking "Start New MixJam" sets a 1920x1080 content minimum,
  maximizes the Electron window once on its current display, and switches to
  Player. Restoring or resizing above the minimum afterward is not overridden by
  the app.
- [x] **AC-005:** In the Player, the header shows home link "&lt; Return to Main Menu", brand "MixJam Electron", and timer (`00:00.0`).
- [x] **AC-005a:** The home link "&lt; Return to Main Menu" is NOT present in the Home Screen header. It only appears in the Player header.
- [x] **AC-006:** The timer is absolutely centered in the header — it does not shift when left/right content changes.
- [x] **AC-007:** Once both folders are available, clicking "Load MixJam"
  opens a filtered file picker and selecting a valid project navigates to the
  Player (with window resize in the Electron shell); cancelling stays on Home.
- [x] **AC-008:** Clicking the home link "&lt; Return to Main Menu" in the Player
  header unmaximizes the window, resizes to 1920x1080, and returns to the Home
  Screen. The window stays resizable and maximizable.
- [x] **AC-009:** Roundtrip: Home → Player → Home → Player works without visual glitches or state leaks, and window dimensions are correct at each step.
- [x] **AC-010:** The Player content area provides structural regions for the
  upper work band, full-width Middle Strip, and lower work band; spec-006 owns
  their detailed current layout and controls.
- [x] **AC-011:** At or above 1920x1080, the app occupies the full viewport
  height with no overflow scrollbar on the root. Below 1920 pixels wide or 1080
  pixels high, only the unsupported-resolution notice is mounted; no Home,
  Player, navigation, or project action remains operable.
- [x] **AC-012:** The app window uses a non-empty custom icon from the `public/`
  folder, not the default Electron icon. The runtime selects `app-icon.ico` on
  Windows and `app-icon-512.png` on Linux and macOS so Electron can decode the
  selected asset on every supported platform.
- [x] **AC-013:** The production renderer loads from `app://bundle`, requires
  the preload-provided `window.shellAPI`, and has no HTTP deployment or demo
  backend path.
- [x] **AC-014:** Automatic library sync is non-modal and survives Home/Player
  view changes without restarting. Scan and analysis work never applies an
  app-wide blur or blocks navigation.
- [x] **AC-015:** A lifetime Web Lock prevents a competing Electron window
  from opening the same OPFS database and shows an already-open notice.
- [ ] **AC-016:** Operating-system Media Session previous, play, pause, and next
  actions seek to tick 0, toggle playback, and seek to song end respectively.
  They work during blocking modals and while backgrounded when the operating
  system selects MixJam, without registering a global shortcut.
- [ ] **AC-017:** A `v*` tag completes the native Windows, Linux, and macOS
  production matrix and passes the unit suite. Windows records the portable
  executable metadata, launches the portable bootstrap to a responsive native
  window, and smoke-tests its packaged app directory. Linux launches the
  AppImage, and macOS mounts the DMG and launches its contained application;
  neither native artifact uses `--no-sandbox`. At UI Size 50 with 16 lanes, each
  proof uploads keyboard, wheel, and focus-reveal evidence, including the Mixer
  plain-vertical-wheel non-scroll assertion. It attaches one portable `.exe`,
  one AppImage, and one `.dmg` to the GitHub Release. Signing and notarization
  status is stated accurately.

## Native Window Evidence

`tests/electron/smoke.spec.ts` must query the live Windows `BrowserWindow`
through Playwright's Electron main-process bridge. It must verify the centered
1920x1080 renderer content bounds in the resizable/maximizable Home state, the once-maximized Player state on
the current display, manual restore without re-maximization, and the return to
Home (unmaximized to 1920x1080 content, still resizable and maximizable). The renderer
unit suite separately verifies that the Home and Player navigation actions invoke
those shell capabilities.
Linux CI uses a 2560x1440 virtual display with Openbox registered as its X11
window manager. The framed Electron window therefore has room for the required
1920x1080 renderer content area, and maximize and unmaximize requests exercise
the same window-manager contract as a desktop session. The smoke test treats
Electron's maximized state as authoritative and verifies renderer content bounds
separately. It does not equate raw window bounds with the display work area,
because X11 frame extents depend on the active window-manager theme.

The smoke test also asks Electron's `nativeImage` implementation to decode the
same platform-specific asset passed to the live `BrowserWindow` and requires a
non-empty result on Windows, Linux, and macOS.

Native artifact verification is not yet complete. The next manual or
tag-triggered Production run must preserve its package test report, screenshots,
and raw UI Size 50/16-lane interaction measurements. A passing local built
Electron probe proves the `app://bundle` interaction contract but does not prove
the AppImage or DMG delivery path.

The Windows-only `scripts/inspect-window-icon.ps1` probe reads the icon from the
live HWND and compares it with a 32 by 32 PNG rendered from `public/app-icon.ico`
by Electron's `nativeImage` implementation. The current probe measured a mean
absolute channel difference of 6.53 and 98.69 percent foreground overlap,
confirming the live MixJam skull rather than only the source asset's existence.
Raw bounds, display work area, frame states, icon metrics, and screenshots are
stored under `tmp/verify-electron-window-state/`.

`tests/e2e/compact-layout.spec.ts` verifies the full-width four-column Recent
Projects rail and root-versus-Home overflow ownership across representative
themes in the production Chromium bundle. Its single below-minimum test checks
both the width and height boundaries and proves that only the refusal surface
is available.
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
- No keyboard shortcuts.
- No functional application surface below the 1920x1080 CSS viewport minimum.
