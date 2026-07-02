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
- **Window:** 1280×720, centered on screen, not resizable, no maximize button.
- Full-viewport layout with header, centered content area, and footer.
- **Header** (40px): brand "MixJam Electron" anchored to the left margin,
  theme selector dropdown (right, non-functional — lists theme names but
  selection has no effect until spec-002).
- **Content area:** two-column layout, vertically and horizontally centered
  (revised 2026-07-02 per design-review change request — the original single
  column of folder cards read as a configuration dialog, not a first screen).
  - Hero column (left): SVG brandmark (accent-gradient tile with a waveform
    pulse, painted with theme tokens only), "MixJam" wordmark, tagline, three
    quick-start steps, and a theme-swatch row that switches the active theme
    (same behavior as the header selector).
  - Setup column (right): a raised panel holding the two folder cards
    (spec-003), the launch gate, the Load MixJam link, and — when any exist —
    up to four recent projects that open on click (spec-006 AC-024).
  - "Start New MixJam" button — primary action, navigates to the MixJam Player.
  - "Load MixJam" link — secondary action, opens a native file picker filtered
    to the project file extension. If the user selects a file, navigates to
    the Player. If the user cancels the picker, stays on the Home Screen.
- **Footer** (40px): "Select User Folder" link anchored to the left
  margin, version string anchored to the right margin.
- The Home Screen has no timer and no home link.

### MixJam Player

- **Window:** 1920×1080, centered on screen, resizable, maximize button
  enabled.
- Header (40px): home link "&lt; Return to Main Menu" (left, only in
  Player), brand "MixJam Electron" (right of home link), timer
  absolutely centered, theme selector dropdown (right, non-functional —
  lists theme names but selection has no effect until spec-002).
- **Timer** displays `00:00.0` format, absolutely centered in the header
  regardless of left/right content width.
- The tracker content area below the header shows the structural skeleton of
  the app using the approved player region map: five empty labeled rectangular
  zones (Recent Projects rail, Player / Tracker region, full-width Middle
  Strip, Song Controls rail, Sample Browser region). No lane rows, no button
  icons, and no detailed sub-zones inside those regions — completely blank
  placeholders.
- **Footer** is unchanged from Home Screen.

### View Switching

- Clicking "Start New MixJam" on the Home Screen replaces the content area
  with the MixJam Player.
- Clicking "Load MixJam" opens the native file picker. If the user selects a
  file, the content area switches to the Player (the file is not
  actually loaded — the picker result is discarded in this spec). If the
  user cancels the picker, the app stays on the Home Screen.
- Clicking the home link "&lt; Return to Main Menu" in the Player header
  returns to the Home Screen.
- View switching must be instantaneous (no page reload, no navigation delay).
- When switching from Home to Player, the window resizes from 1280×720 to
  1920×1080 and the maximize button becomes available.
- When switching from Player to Home, the window resizes from its current
  size back to 1280×720 and the maximize button is removed.

### Header Bar (both views)

- Fixed 40px height, full width.
- **Home Screen state:** brand "MixJam Electron" anchored to the left margin.
  Theme selector dropdown on the right (non-functional — lists theme names
  but selection has no effect until spec-002).
- **Player state:** home link "&lt; Return to Main Menu" (left),
  brand "MixJam Electron" (right of home link), timer (absolute center),
  theme selector dropdown (right, non-functional — lists theme names but
  selection has no effect until spec-002). The home link is not present in
  the Home Screen state.
- The timer is always rendered via `position:absolute; left:50%; transform:translateX(-50%)`
  (or equivalent) — never a flex sibling.

### Footer (both views)

- Fixed 40px height, full width (same fixed size as the header).
- **Home Screen state:** left "Select User Folder" link (opens the User Folder
  picker and persists a valid selection to the session — same flow as the Home
  Screen folder card; renamed and wired 2026-07-02, previously a placeholder
  that discarded the picked folder), right version string.
- **Player state:** left "Select User Folder" link, right version string,
  and a center detail slot that may be populated by the Sample Browser
  selection model (spec-004).
- The center footer slot is empty when no sample is selected.
- Version string is derived from app metadata version (format: semantic
  version string, e.g. `0.5.0`). Clicking the version link opens the default
  system browser to `https://github.com/satyrlord/mixjam-electron`.

## Acceptance Criteria (testable)

Spec validation confirms these criteria are complete and testable as requirements.
Implementation validation should be tracked in implementation PR/test evidence.

- [x] **AC-001:** App launches at 1280×720 centered on screen (Home Screen), with no maximize button.
- [x] **AC-001a:** Home Screen header shows "MixJam Electron" brand anchored to the left margin.
- [x] **AC-002:** Home Screen content area shows "Start New MixJam" button and "Load MixJam" link.
- [x] **AC-003:** Footer is 40px height (same as header), shows "Select User Folder" left and clickable version string right on both views.
- [x] **AC-003a:** Clicking the version string in the footer opens the default system browser to `https://github.com/satyrlord/mixjam-electron`.
- [x] **AC-003b:** In Player state, selecting a sample may populate the center footer slot with sample details while the left settings link and right version string remain visible.
- [x] **AC-004:** Clicking "Start New MixJam" resizes the window to 1920×1080 centered, enables the maximize button, and switches the content area to the MixJam Player.
- [x] **AC-005:** In the Player, the header shows home link "&lt; Return to Main Menu", brand "MixJam Electron", and timer (`00:00.0`).
- [x] **AC-005a:** The home link "&lt; Return to Main Menu" is NOT present in the Home Screen header. It only appears in the Player header.
- [x] **AC-006:** The timer is absolutely centered in the header — it does not shift when left/right content changes.
- [x] **AC-007:** Clicking "Load MixJam" opens a native file picker. Selecting a file navigates to the Player (with window resize). Cancelling the picker stays on the Home Screen.
- [x] **AC-008:** Clicking the home link "&lt; Return to Main Menu" in the Player header resizes the window back to 1280×720, removes the maximize button, and returns to the Home Screen.
- [x] **AC-009:** Roundtrip: Home → Player → Home → Player works without visual glitches or state leaks, and window dimensions are correct at each step.
- [x] **AC-010:** The Player content area shows five empty labeled rectangular zones (Recent Projects, Player / Tracker, Middle Strip,
  Song Controls, Sample Browser) — no lane rows, no icons, and no detailed sub-zones inside those regions.
- [x] **AC-011:** The app occupies the full viewport height with no overflow scrollbar on the root.
- [x] **AC-012:** The app window displays the custom app icon from the `public/` folder, not the default Electron icon.

## Non-Goals (deferred to later specs)

- No theme switching — the app renders with a single hardcoded default look.
  Theming is spec-002.
- No real audio playback, no transport controls, no BPM — all Player content
  is structural placeholder. Audio engine is spec-005.
- No project file format, no actual file loading. Project save/load is spec-011.
- No folder selection for sample libraries. Folder management is spec-003.
- No sample data, no clip rendering, no lane interaction. Tracker timeline is spec-006.
- No settings persistence — the settings link in the footer is a placeholder.
- The file picker from "Load MixJam" does not read or validate the selected file.
- No keyboard shortcuts.
- No window resize constraints beyond the full-viewport rule.

## References

- [mixjam-sample-daw spec-002](../_archived/mixjam-sample-daw/specs/002-home-screen-with-skin-support/spec.md) — Home Screen layout, header, footer, version display.
- [mixjam-sample-daw spec-003](../_archived/mixjam-sample-daw/specs/003-tracker-view-shell/spec.md) — Tracker View shell, view switching, timer, placeholder zones.
- [mixjam-webjam spec-001](../_archived/mixjam-webjam/specs/001-shell-and-theming/spec.md) — Home page, launch gate, session restore.
- [mixjam-sample-daw style-guide §1–§3](../_archived/mixjam-sample-daw/docs/style-guide.md) — Shell layout, header bar rules, home screen layout.
