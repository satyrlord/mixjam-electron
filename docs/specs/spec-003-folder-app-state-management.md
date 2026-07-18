# Spec 003 — Folder & App State Management

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-001 (App Shell & Navigation)

## Objective

Add a two-folder setup flow to the Home Screen: the user must select a **User
Folder** (output, read-write) and a **Sample Folder** (input, read-only) before
entering the Player. Folder selections persist as app state across restarts.

## User Stories

- **US-001:** As a user, I select a User Folder so the app has somewhere to save
  my projects and exports.
- **US-002:** As a user, I select a Sample Folder so the app knows where my
  sample files live.
- **US-003:** As a user, I must pick the User Folder before the Sample Folder
  becomes available — the app enforces this order so it always has a write
  destination before reading samples.
- **US-004:** As a user, the "Start New MixJam" button is disabled until both
  folders are selected, with a hint explaining what's missing.
- **US-005:** As a user, when I reopen the app, my previously selected folders
  are restored automatically — I don't have to re-pick them on every launch.
- **US-006:** As a user, if a previously selected folder is no longer
  accessible, the app shows a clear error and lets me pick a new one.

## Scope

### Home Screen — Modified Layout

The Home Screen workflow column contains three independent sibling cards (see
spec-001). Folder selection and library state share the first card, while
project actions live in the second:

```text
workflow column (right side of two-column layout)
  ├── Library Setup card
  │   ├── User Folder control — output folder picker
  │   ├── Sample Folder control — input folder picker (initially disabled)
  │   └── scanner row — full width; active detail or compact ready state
  ├── Create or Open card
  │   └── Start New MixJam (2fr) | Load MixJam (1fr)
  └── Generate a MixJam card — owned by spec-018
```

The Recent Projects rail remains below the hero and is owned by spec-001.

### Folder Cards

Each card shows:

- **Icon** and **label** indicating the folder role (e.g. "User Folder",
  "Sample Folder").
- **"Pick Folder" button** — opens the File System Access directory picker.
- **Status text** — shows the selected folder's name, or a prompt if none
  selected. (MixJam stores no absolute paths; a folder is a `FolderRef` whose
  handle is persisted in IndexedDB.)
- **Library status** in the full-width scanner row below both folder controls —
  Unindexed, Syncing, Ready, Cancelled, or Error. Checking, syncing, and
  analysis expand the row with the current phase, native progress semantics,
  a visible text equivalent, and Cancel. Ready collapses to a compact status.
  Cancelled or failed first sync shows a contextual Retry action. Detailed
  behavior belongs to spec-004.
- **"Restore access" button** — defensive recovery shown if a restored handle
  reports that permission is not granted. The Electron shell normally grants
  file system access before the renderer loads.

**User Folder card:**

- Always enabled. The user can pick or change the output folder at any time.
- Role: read-write. The app writes projects, exports, and app config into
  this folder.
- The picker is hinted to start in the OS Documents folder (`startIn`).

**Sample Folder card:**

- **Disabled** (greyed out, non-interactive) until the User Folder is selected.
- Once the User Folder is set, the Sample Folder card becomes active and the
  user can pick the input folder.
- Role: read-only. The app reads audio samples from this folder but never
  writes to it.

### Create or Open

- The launch gate lives in an independent card below Library Setup. Its action
  row uses a 2:1 width ratio so "Start New MixJam" visually leads while "Load
  MixJam" remains a quieter outlined secondary action.
- "Start New MixJam" is **disabled** until both folders are selected.
- When disabled, a hint label appears below the button: "Select both folders
  above to start."
- Once both folders are set, the button becomes active and clicking it
  navigates to the MixJam Player (per spec-001).
- "Load MixJam" uses the same two-folder readiness gate. Project paths
  are User Folder-relative and sample references are Sample Folder-relative,
  so both folders must be available before a project can load.

### Folder Picker Behavior

- Clicking "Pick Folder" opens the File System Access directory picker
  (`showDirectoryPicker`) with the mode matching the folder role
  (`readwrite` for the User Folder, `read` for the Sample Folder).
- Picking a folder that was picked before reuses its existing `FolderRef`
  (via `isSameEntry`), so the folder's scan root and indexed samples survive
  re-picking.
- After selection, the app validates the folder is accessible:
  - User Folder: permission granted and writable (probed with a temp file).
  - Sample Folder: permission granted and readable.
- If validation fails, an error message is displayed on the card: "Cannot
  access this folder. Check permissions and try again."
- If validation succeeds, the folder's name is displayed on the card.
- The user can change the folder at any time by clicking "Pick Folder" again.
- If a previously saved folder no longer exists, the card shows an error
  state: "Folder not accessible — pick a new one."
- If a previously saved folder exists but reports
  `queryPermission() === 'prompt'`, the card offers "Restore access to
  `folder`" and re-requests permission in a user gesture. This is a defensive
  recovery path because the Electron shell normally auto-grants access.

### App State Persistence

- Selected `FolderRef`s are persisted in localStorage; their directory handles
  are persisted in IndexedDB. Both survive app restarts on the same origin.
- On app launch, the persisted folders are loaded and restored into the cards
  automatically.
- If both folders restore successfully, the "Start New MixJam" button is
  immediately active — the user can enter the tracker without re-picking
  folders.
- No network, no cloud sync.

### App Config File

When both folders are selected and the User Folder is accessible, the app
writes an app configuration file into the User Folder:

- `mixjam.json` — app metadata (app version, folder names, last opened
  timestamp).

This file is written automatically after folder selection (through the User
Folder's directory handle). It is not user-editable.

## Acceptance Criteria (testable)

- [x] **AC-001:** Library Setup shows the User Folder and Sample Folder controls
  side by side, with one scanner row spanning beneath them.
- [x] **AC-002:** User Folder card is always active — "Pick Folder" button is clickable.
- [x] **AC-003:** Sample Folder card is initially disabled (greyed out, non-interactive).
- [x] **AC-004:** Sample Folder card becomes active only after a User Folder is selected.
- [x] **AC-005:** "Start New MixJam" button is disabled when either folder is unset.
- [x] **AC-006:** A hint label appears below the disabled button: "Select both folders above to start."
- [x] **AC-007:** When both folders are set, "Start New MixJam" becomes active and navigates to the MixJam Player on click.
- [x] **AC-008:** "Load MixJam" is disabled until both folders are available,
  then becomes active and opens the spec-011 project picker.
- [x] **AC-009:** Each "Pick Folder" button opens the directory picker with the mode matching its folder role.
- [x] **AC-010:** Selected folder names are displayed on their respective cards after successful validation.
- [x] **AC-010b:** The User Folder picker is hinted to start in the OS Documents folder.
- [x] **AC-010a:** If a selected folder is not accessible (permissions error), the card shows: "Cannot access this folder. Check permissions and try again."
- [x] **AC-011:** Closing and reopening the app restores previously selected folders automatically.
- [x] **AC-012:** If both folders restore successfully on launch, "Start New MixJam" is immediately active.
- [x] **AC-013:** If a restored folder is no longer accessible, its card shows an error state: "Folder not accessible — pick a new one."
- [x] **AC-013a:** If a restored handle unexpectedly needs a permission
  re-grant, the card offers "Restore access to `folder`"; granting it validates
  the folder and opens the gate.
- [x] **AC-014:** A `mixjam.json` app config file is written to the User Folder after both folders are selected.
- [x] **AC-015:** Changing the User Folder while a Sample Folder is already selected does not clear the Sample Folder selection.
- [x] **AC-016:** Selecting or restoring an accessible Sample Folder schedules
  exactly one automatic library sync for that folder during the app session.
  Re-renders and Home/Player transitions do not start duplicate jobs.
- [x] **AC-017:** While Home is visible, the Library Setup scanner row shows
  expanded sync or analysis phase and progress, then collapses to a compact
  ready state. Folder availability remains the launch gate, and an existing
  index remains usable during background sync. A cancelled or failed first sync
  remains visibly unindexed and offers Retry without a modal overlay.

## Non-Goals (deferred to later specs)

- The indexing pipeline and sync scheduling rules belong to spec-004; this spec
  only supplies the accessible Sample Folder trigger and status host.
- Project save/load behavior belongs to spec-011.
- No sample analysis or metadata extraction. Sample analysis is spec-008.
- No folder size calculation, free space check, or disk health validation.
- No multi-folder sample library (only one Sample Folder at a time).
- No drag-and-drop folder selection — the directory picker only.
- No cloud folder support (OneDrive, Google Drive, etc.) — local filesystem
  only.
- Continuous folder watching is optional follow-up work. The approved baseline
  performs automatic incremental sync after folder selection/restoration and
  once per app session; see
  [indexing.md](../indexing.md#sync-trigger-policy).
