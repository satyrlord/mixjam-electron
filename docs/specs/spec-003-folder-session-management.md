# Spec 003 — Folder & Session Management

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-001 (App Shell & Navigation)

## Objective

Add a two-folder setup flow to the Home Screen: the user must select a **User
Folder** (output, read-write) and a **Sample Folder** (input, read-only) before
entering the Tracker View. Session state persists across app restarts.

## User Stories

- **US-001:** As a user, I select a User Folder so the app has somewhere to save
  my projects and exports.
- **US-002:** As a user, I select a Sample Folder so the app knows where my
  sample library lives.
- **US-003:** As a user, I must pick the User Folder before the Sample Folder
  becomes available — the app enforces this order so it always has a write
  destination before reading samples.
- **US-004:** As a user, the "Start New MixJam" button is disabled until both
  folders are selected, with a hint explaining what's missing.
- **US-005:** As a user, when I reopen the app, my previously selected folders
  are restored automatically — I don't have to re-pick them every session.
- **US-006:** As a user, if a previously selected folder is no longer
  accessible, the app shows a clear error and lets me pick a new one.

## Scope

### Home Screen — Modified Layout

The Home Screen content area is extended with two folder selection cards,
inserted between the existing header/footer and the action buttons. The
modified content area:

```text
.home-content (centered column)
  ├── User Folder card      — output folder picker
  ├── Sample Folder card    — input folder picker (initially disabled)
  ├── "Start New MixJam" button  — disabled until both folders set
  └── "Load MixJam" link        — unchanged from spec-001
```

### Folder Cards

Each card shows:
- **Icon** and **label** indicating the folder role (e.g. "User Folder",
  "Sample Folder").
- **"Pick Folder" button** — opens a native folder picker dialog.
- **Status text** — shows the selected folder path, or a prompt if none
  selected.

**User Folder card:**
- Always enabled. The user can pick or change the output folder at any time.
- Role: read-write. The app writes projects, exports, and session config into
  this folder.
- Initial default path on Windows: `%USERPROFILE%\Documents\MixJam`.

**Sample Folder card:**
- **Disabled** (greyed out, non-interactive) until the User Folder is selected.
- Once the User Folder is set, the Sample Folder card becomes active and the
  user can pick the input folder.
- Role: read-only. The app reads audio samples from this folder but never
  writes to it.

### Launch Gate

- The "Start New MixJam" button is **disabled** until both folders are
  selected.
- When disabled, a hint label appears below the button: "Select both folders
  above to start."
- Once both folders are set, the button becomes active and clicking it
  navigates to the MixJam Player (per spec-001).
- The "Load MixJam" link remains functional regardless of folder selection
  state — it opens the file picker per spec-001 and does not require folders.

### Folder Picker Behavior

- Clicking "Pick Folder" opens a native OS folder picker dialog.
- The dialog title reflects the folder role (e.g. "Select User Folder" /
  "Select Sample Folder").
- After selection, the app validates the folder is accessible:
  - User Folder: must be readable and writable.
  - Sample Folder: must be readable (write access not required).
- If validation fails, an error message is displayed on the card: "Cannot
  access this folder. Check permissions and try again."
- If validation succeeds, the folder path is displayed on the card.
- The user can change the folder at any time by clicking "Pick Folder" again.
- If a previously saved folder is inaccessible on next launch (deleted, moved,
  permissions revoked), the card shows an error state: "Folder not accessible
  — pick a new one."

### Session Persistence

- Selected folder paths are persisted so they survive app restarts.
- On app launch, the persisted folders are loaded and restored into the cards
  automatically.
- If both folders restore successfully, the "Start New MixJam" button is
  immediately active — the user can enter the tracker without re-picking
  folders.
- Persistence uses a JSON file stored in the OS app data directory (e.g.
  `%APPDATA%/mixjam-electron/session.json` on Windows). No network, no
  cloud sync.

### Session Config File

When both folders are selected and the User Folder is accessible, the app
writes a session configuration file into the User Folder:

- `mixjam.json` — session metadata (app version, folder paths, last opened
  timestamp).

This file is written automatically after folder selection and on app close.
It is not user-editable.

## Acceptance Criteria (testable)

- [x] **AC-001:** Home Screen shows two folder cards: User Folder (top) and Sample Folder (bottom).
- [x] **AC-002:** User Folder card is always active — "Pick Folder" button is clickable.
- [x] **AC-003:** Sample Folder card is initially disabled (greyed out, non-interactive).
- [x] **AC-004:** Sample Folder card becomes active only after a User Folder is selected.
- [x] **AC-005:** "Start New MixJam" button is disabled when either folder is unset.
- [x] **AC-006:** A hint label appears below the disabled button: "Select both folders above to start."
- [x] **AC-007:** When both folders are set, "Start New MixJam" becomes active and navigates to the MixJam Player on click.
- [x] **AC-008:** "Load MixJam" link works regardless of folder selection state (per spec-001).
- [x] **AC-009:** Each "Pick Folder" button opens a native OS folder picker with the correct dialog title.
- [x] **AC-010:** Selected folder paths are displayed on their respective cards after successful validation.
- [x] **AC-010b:** When no User Folder has been chosen yet, the initial suggested location on Windows is `%USERPROFILE%\Documents\MixJam`.
- [x] **AC-010a:** If a selected folder is not accessible (permissions error), the card shows: "Cannot access this folder. Check permissions and try again."
- [x] **AC-011:** Closing and reopening the app restores previously selected folders automatically.
- [x] **AC-012:** If both folders restore successfully on launch, "Start New MixJam" is immediately active.
- [x] **AC-013:** If a restored folder is no longer accessible, its card shows an error state: "Folder not accessible — pick a new one."
- [x] **AC-014:** A `mixjam.json` session config file is written to the User Folder after both folders are selected.
- [x] **AC-015:** Changing the User Folder while a Sample Folder is already selected does not clear the Sample Folder selection.

## Non-Goals (deferred to later specs)

- No sample library scanning or manifest generation — that's spec-004.
- No project file loading beyond the file picker (spec-001 placeholder
  behavior). Project save/load is spec-011.
- No sample analysis or metadata extraction. Sample analysis is spec-008.
- No folder size calculation, free space check, or disk health validation.
- No multi-folder sample library (only one Sample Folder at a time).
- No drag-and-drop folder selection — native picker dialog only.
- No cloud folder support (OneDrive, Google Drive, etc.) — local filesystem
  only.
- No folder watching for live changes (folder watch is spec-004).

## References

- [mixjam-webjam spec-001](../_archived/mixjam-webjam/specs/001-shell-and-theming/spec.md) — Two-folder model, launch gate, session restore, `mixjam.json`.
- [mixjam-webjam README](../_archived/mixjam-webjam/README.md) — File System Access API, IndexedDB persistence, Chromium-only constraint.
