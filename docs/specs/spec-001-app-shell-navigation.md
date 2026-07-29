# Spec 001 — App Shell & Navigation

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** PARTIAL — the shell and navigation are
implemented. Operating-system Media Session actions in AC-016 and the
cross-platform production matrix in AC-017 are pending.
**Depends on:** *(root — no dependencies)*

## Objective

Establish the two-view application shell. Show a **Home Screen** when no project
is active. Show a **MixJam Player** when a project is active.
The Player owns an exclusive **Settings** modal opened from its footer.
Implement view switching, the header bar, and the footer.

## User Stories

- **US-001:** As a user, I open the app and see a clear Home Screen action. I know how to start.
- **US-002:** As a user, I click "Start New MixJam" and see the full MixJam Player. I can then start arranging.
- **US-003:** As a user, I see the app brand and a timer in the Player header. I know my app and work time.
- **US-004:** As a user, I can use a home link to return from the Player to the Home Screen.
- **US-005:** As a user, I see a version string in the footer so I know which build I am running.
- **US-006:** As a user, I can open Settings from the Player footer without
  leaving the Tracker. One predictable modal contains app preferences, folder
  selection, and project audio settings.

## Scope

### Home Screen

- **App icon:** the app uses a bundled, platform-decodable icon from the
  `public/` folder. Windows uses `app-icon.ico`. Linux and macOS use
  `app-icon-512.png`.
- Window, header, content-area, and footer layout, sizing, and positioning
  follow the [Style Guide](../style-guide.md#layout-architecture).
- **Content area:** a state-adaptive hybrid with two primary columns. It keeps
  onboarding and repeat-launch work on one Home Screen without giving them
  equal weight in every state.
  - **Setup-priority composition:** while either required folder is unavailable,
    Library Setup and the quick-start guidance dominate. Project actions remain
    visible but keep their existing availability gates.
  - **Project-priority composition:** once both required folders are available,
    Create or Open, Recent Projects, and Generate a MixJam dominate. Library
    Setup becomes one always-visible compact status row. The row shows
    "Library ready," both selected folder names, and a quiet "Change folders"
    action. That action reveals the User Folder and Sample Folder controls
    inline. It does not open a new modal. Completed quick-start guidance no
    longer occupies the primary hierarchy.
  - Active sync, analysis, permission, and error states may expand the relevant
    status or recovery controls. They do not block navigation or replace the
    whole Home Screen.
  - The hero retains the app logo from `public/app-icon-128.png`, "MixJam"
    wordmark, and tagline. Setup guidance adapts to the active composition
    instead of remaining permanently expanded. Theme selection stays in the
    header selector. Home content does not duplicate it.
  - Library Setup, Create or Open, and Generate a MixJam remain independent
    workflow regions with no enclosing panel.
  - Recent Projects: when projects exist, a sibling region shows up to four
    readable project rows that load through spec-011. Each row prioritizes the
    display name, then a meaningful relative parent location and last-opened
    metadata when available. The full relative path remains available as
    accessible text or a tooltip. No recent project receives a filled or
    special "Continue" treatment: "Start New MixJam" remains the stable sole
    primary action. The four-item cap keeps Home geometry independent of the
    total project history.
  - "Start New MixJam" button — the sole filled primary action, navigates to
    the MixJam Player. In the Create or Open card it occupies about two-thirds
    of the action row.
  - "Load MixJam" button — outlined secondary action in the remaining third of
    the Create or Open row. Once both folders are available,
    it opens a file picker filtered to `.mixjam` (the File System Access
    `showOpenFilePicker`. The Electron shell surfaces it as a native dialog).
- The Home Screen has no timer and no home link.

### MixJam Player

- Window, header, content-area, footer, and region sizing follow the
  [Style Guide](../style-guide.md#layout-architecture).
- Header: the home link "&lt; Return to Main Menu" is leftmost and only appears
  in Player. The "MixJam Electron" brand follows it. The timer and theme
  selector dropdown are on the right. Spec-002 owns the selector behavior.
- **Timer** displays `00:00.0` format.
- The tracker content area below the header uses the approved player region
  map. The upper work band contains the MixJam Browser and Tracker. A full-width
  Middle Strip and a full-width Bottom Workspace follow. The Bottom Workspace
  contains Master, Mixer, and Samples tabs.
  Its detailed behavior belongs to spec-006.
- **Footer** adds Settings on the left and may show selected sample detail in
  the center. The version remains on the right.

### Settings Modal

- The Player footer exposes one Settings link for folder, UI Size, and project
  controls. Home does not expose Settings because no project is active.
- Settings is an exclusive modal over the mounted Player/Tracker, not a view or
  content replacement. Existing playback may continue. The modal blocks
  background pointer input and ordinary app hotkeys.
- The modal traps focus and initially focuses its Close control. Close or Escape
  closes it. The modal ignores outside pointer interaction. It restores focus
  to the footer Settings trigger.
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
  after a valid project loads. Canceling stays on Home.
- Clicking the home link "&lt; Return to Main Menu" in the Player header
  returns to the Home Screen.
- View switching must be instantaneous (no page reload, no navigation delay).
- When Home changes to Player, the Electron shell sets a 1920x1080 content
  minimum. It then maximizes the window once on its current display. The app
  does not force the size or maximize state again. The user may restore, resize,
  or move the Player window normally.
- When switching from Player to Home, the window unmaximizes and restores a
  1920x1080 renderer content area. The native frame is additional. The window
  remains resizable and maximizable in all views.
- Every view requires a renderer width of at least 1920 CSS pixels. It also
  requires a renderer height of at least 1080 CSS pixels. Below either boundary, the
  renderer mounts only an unsupported-resolution notice. It does not mount
  Home, Player, navigation, project actions, or application hooks. Returning to
  a supported size mounts the application again.

### Electron host

Electron is the only supported runtime and the only end-user distribution.
The main process loads the renderer from `app://bundle`. The renderer requires
the preload-provided `window.shellAPI`. The renderer owns sqlite-wasm over OPFS,
File System Access folders, localStorage preferences, and `.mixjam` project
state. The shell owns only native window and allowlisted external-link actions.

There is no web deployment and no demo mode. With no granted Sample Folder,
the Home Screen gates the Player. Onboarding for users without samples is
spec-020, not fake data. A lifetime Web Lock protects the single opfs-sahpool
connection. A competing Electron window shows an already-open notice.

### Distribution

The only end-user artifacts are Electron packages. The current Production
workflow runs the unit suite, builds the Windows portable `.exe`, and verifies
that package on `windows-latest`. AppImage and `.dmg` targets remain configured,
but the workflow does not build, test, upload, or release them. AC-017 defines
  the pending Windows, Linux, and macOS production matrix.

Its Linux proof must
launch the explicit generated AppImage rather than `linux-unpacked`. Its macOS
proof must mount the generated DMG and launch the application inside it rather
than the unpacked `mac` directory. Native artifact proofs do not add
`--no-sandbox`.

The Windows job records the portable executable's hash, size, and signing state.
It then launches that exact artifact with an isolated user-data directory. The
gate requires the portable NSIS bootstrap to produce a stable, responsive
MixJam Electron native window. It records the process and window evidence before
  cleanup.

The bootstrap starts a child process. The deeper Playwright assertions
then drive `win-unpacked/MixJam Electron.exe`. This file contains the same
packaged application resources and preserves the main-process connection.
When the app returns from the maximized Player view, it centers the native window
after Windows completes its asynchronous unmaximize transition.

The Windows native artifact proof also runs the built Electron interaction
probe at UI Size 50 with 16 lanes. It records Tracker vertical wheel scrolling
and keyboard focus reveal. It records Mixer horizontal scrolling from a
horizontal wheel, Shift+wheel, and Left/Right keys. It also records focus reveal
  for a clipped Mixer control.

It confirms that plain vertical wheel input does not scroll the Mixer
horizontally. The workflow uploads the Playwright report, screenshots, and raw
measurements with the package artifact. Manual workflow runs retain those
artifacts for 14 days. A `v*` tag attaches the verified portable `.exe` to its
GitHub Release. The pending matrix applies the same interaction proof to Linux
and macOS. It attaches all three packages only after their gates pass.

Code signing and macOS notarization are separate release-readiness gates. The
current configuration does not include them. Thus, current artifacts are
unsigned. Do not describe them as signed, notarized, or warning-free.

### Header Bar (both views)

- Sizing and positioning follow the [Style Guide](../style-guide.md#layout-architecture).
- **Home Screen state:** brand "MixJam Electron" anchored to the left margin.
  Theme selector dropdown on the right (behavior owned by spec-002).
- **Player state:** the home link "&lt; Return to Main Menu" is on the left.
  The "MixJam Electron" brand follows it. The header centers the timer. The theme
  selector dropdown is on the right. Spec-002 owns its behavior. The
  home link is not present in the Home Screen state.
- The timer is never a flex sibling of the left/right header content.

### Operating-system media controls

- The renderer registers Media Session actions for `previoustrack`,
  `play`, `pause`, and `nexttrack`. Previous track seeks to tick 0, play and
  pause toggle transport state, and next track seeks to the song end.
- These operating-system actions remain available while a blocking modal is
  open. They also remain available while MixJam runs in the background. The
  operating system must select MixJam as the active media session.
- This exception applies only to Media Session actions. It does not authorize
  application-wide `globalShortcut` registration or bypass ordinary in-app
  modal input blocking.

### Footer (both views)

- Sizing and positioning follow the [Style Guide](../style-guide.md#layout-architecture).
- Home shows only the version string on the right. Its left and center slots are
  empty. User Folder selection remains in Home Library Setup.
- Player shows Settings on the left and the version on the right. The Sample
  Browser selection model may populate a center detail slot (spec-004).
- The center footer slot is empty when the selection model has no sample.
- Version string uses the semantic version in `package.json`. The build inlines
  it into the main and renderer builds. Clicking the version link opens the
  default system browser to
  `https://github.com/satyrlord/mixjam-electron`.

## Acceptance Criteria (testable)

Spec validation confirms these criteria are complete and testable as requirements.
Track implementation validation in implementation PR/test evidence.

- [x] **AC-001:** App launches with a 1920x1080 renderer content area centered
  on screen (Home Screen), with maximize and resize enabled.
- [x] **AC-001a:** Home Screen header shows "MixJam Electron" brand anchored to the left margin.
- [x] **AC-002:** Home Screen content area shows "Start New MixJam" and "Load MixJam" buttons.
- [x] **AC-002a:** Home uses the setup-priority composition while either
  required folder is unavailable. It uses the project-priority composition once
  both folders are available. In the project-priority composition, one compact row
  shows "Library ready," both folder names, and a "Change folders" disclosure.
  The disclosure reveals both folder controls inline. Sync, permission, and
  error states expand their status and recovery controls in place. Project work
  holds the primary hierarchy, and the three workflow regions have no enclosing
  panel.
- [x] **AC-002b:** The Home hero uses `public/app-icon-128.png` as the visible
  MixJam logo instead of a generated waveform mark.
- [x] **AC-002c:** At the default 1920x1080 renderer content size, Home has no
  vertical overflow or scrollbar. This applies to idle, sync, analysis, error,
  and ready states. The Library Setup scanner
  expands for active work and collapses when ready. Any number of available
  recent projects keeps the same layout because Home renders only the first four.
- [x] **AC-002d:** Recent Projects renders at most four readable rows. Every row
  prioritizes the display name and exposes its relative location, last-opened
  metadata when available, and full relative path. "Start New MixJam" remains
  the sole filled primary action whether or not recent projects exist.
- [x] **AC-003:** At base UI Size 30, footer and header are 48px high. The footer
  shows the clickable version string right on Home and Player. Player also shows
  Settings on the left. Spec-002 owns higher UI Size scaling.
- [x] **AC-003a:** Clicking the version string in the footer opens the default system browser to `https://github.com/satyrlord/mixjam-electron`.
- [x] **AC-003b:** In Player state, a sample selection may populate the center
  footer slot. The left Settings link and right version string remain visible.
- [x] **AC-003c:** Player Settings is an exclusive modal over the mounted
  Tracker. It traps focus and blocks background app input. Close or Escape closes
  it. It ignores outside pointer input and restores focus to its footer link.
- [x] **AC-003d:** The Settings modal contains Select User Folder, Zoom Level,
  and project-owned Clip Edge Fades. Home has no Settings link.
- [x] **AC-004:** Clicking "Start New MixJam" sets a 1920x1080 content minimum.
  It maximizes the Electron window once on its current display and switches to
  Player. The app does not override later restoration or resizing above the
  minimum.
- [x] **AC-005:** In the Player, the header shows the home link and "MixJam
  Electron" brand. It also shows the `00:00.0` timer.
- [x] **AC-005a:** The home link "&lt; Return to Main Menu" is NOT present in the Home Screen header. It only appears in the Player header.
- [x] **AC-006:** The header centers the timer absolutely. Left or right content changes do not move it.
- [x] **AC-007:** Once both folders are available, "Load MixJam" opens a
  filtered file picker. A valid project selection navigates to the Player. The
  Electron shell resizes the window. Cancellation stays on Home.
- [x] **AC-008:** Clicking the Player home link unmaximizes the window and
  resizes it to 1920x1080. It also returns to the Home Screen. The window stays
  resizable and maximizable.
- [x] **AC-009:** The Home → Player → Home → Player roundtrip has no visual
  glitches or state leaks. Each step has the correct window dimensions.
- [x] **AC-010:** The Player content area contains an upper work band and a
  full-width Middle Strip. It also contains a lower work band. Spec-006 owns
  their detailed current layout and controls.
- [x] **AC-011:** At or above 1920x1080, the app occupies the full viewport
  height with no overflow scrollbar on the root. Below 1920 pixels wide or 1080
  pixels high, the renderer mounts only the unsupported-resolution notice. No Home,
  Player, navigation, or project action remains operable.
- [x] **AC-012:** The app window uses a non-empty custom icon from the `public/`
  folder, not the default Electron icon. The runtime selects `app-icon.ico` on
  Windows. It selects `app-icon-512.png` on Linux and macOS. Electron can decode
  the selected asset on every supported platform.
- [x] **AC-013:** The production renderer loads from `app://bundle` and requires
  the preload-provided `window.shellAPI`. It has no HTTP deployment or demo
  backend path.
- [x] **AC-014:** Automatic library sync is non-modal and survives Home/Player
  view changes without restarting. Scan and analysis work never applies an
  app-wide blur or blocks navigation.
- [x] **AC-015:** A lifetime Web Lock prevents a competing Electron window from
  opening the same OPFS database. The window shows an already-open notice.
- [ ] **AC-016:** Operating-system Media Session actions support previous, play,
  pause, and next. These actions seek to tick 0, toggle playback, and seek to
  song end respectively.
  They work during blocking modals and while backgrounded when the operating
  system selects MixJam, without registering a global shortcut.
- [ ] **AC-017:** A `v*` tag completes the native Windows, Linux, and macOS
  production matrix and passes the unit suite. Windows records the portable
  executable metadata. It launches the portable bootstrap to a responsive
  native window and smoke-tests its packaged app directory. Linux launches the
  AppImage, and macOS mounts the DMG and launches its contained application.

  Neither native artifact uses `--no-sandbox`. At UI Size 50 with 16 lanes, each
  proof uploads keyboard, wheel, and focus-reveal evidence. This includes the
  Mixer plain-vertical-wheel non-scroll assertion. It attaches one portable `.exe`,
  one AppImage, and one `.dmg` to the GitHub Release. The workflow states the
  signing and notarization status accurately.

## Native Window Evidence

`tests/electron/smoke.spec.ts` must query the live Windows `BrowserWindow`
through Playwright's Electron main-process bridge. It must verify centered
1920x1080 renderer content bounds in the resizable and maximizable Home state.
It must verify the once-maximized Player state on the current display. It must
verify manual restoration without re-maximization. It must verify the return to
Home at 1920x1080, without maximization.

The window must remain resizable and
maximizable. The renderer unit suite separately verifies the Home and Player
navigation actions. These actions must invoke the shell capabilities.

The pending Linux CI job uses a 2560x1440 virtual display with Openbox as its X11
window manager. The framed Electron window therefore has room for the required
1920x1080 renderer content area. Maximize and unmaximize requests exercise the
same window-manager contract as a desktop session. The smoke test treats
Electron's maximized state as authoritative and verifies renderer content bounds
separately. It does not equate raw window bounds with the display work area.
X11 frame extents depend on the active window-manager theme.

The smoke test asks Electron's `nativeImage` implementation to decode the asset
for the live `BrowserWindow`. It requires a non-empty result on the test
platform. AC-017 applies that check to
Windows, Linux, and macOS.

Native artifact verification is not yet complete. The next manual or
tag-triggered Production run must preserve its package test report and
screenshots. It must also preserve raw UI Size 50/16-lane interaction
measurements. A passing local built Electron probe proves the `app://bundle`
interaction contract. It does not prove the AppImage or DMG delivery path.

The Windows-only `scripts/inspect-window-icon.ps1` probe reads the icon from the
live HWND. It compares the icon with a 32 by 32 PNG from
`public/app-icon.ico`. Electron's `nativeImage` implementation renders the PNG.
The current probe measured a mean absolute channel difference of 6.53. It also
measured 98.69 percent foreground overlap. These results confirm the live MixJam
skull, not only the source asset's existence.

The smoke test writes raw bounds, display work area, frame states, icon metrics,
and screenshots to `tmp/verify-electron-window-state/`. The Production workflow
uploads that directory with the package artifact.

`tests/e2e/compact-layout.spec.ts` verifies the four-row Recent Projects list and
expanded library controls at the largest UI Size. It also verifies
root-versus-Home overflow ownership across representative themes in the
production Chromium bundle. One below-minimum test checks the width and height
boundaries. It proves that only the refusal surface is available.
`src/renderer/src/components/HomeScreen.test.tsx` verifies the compact ready
summary and inline folder disclosure. It verifies expanded setup and recovery
states, the sole primary action, recent-project metadata, and the four-project
cap.

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
