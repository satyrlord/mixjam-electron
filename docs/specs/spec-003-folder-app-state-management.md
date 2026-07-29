# Spec 003 — Folder & App State Management

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-001 (App Shell & Navigation)

## Objective

Add a two-folder setup flow to the Home Screen. The user must select a **User
Folder** (output, read-write) and a **Sample Folder** (input, read-only).
The user must select both folders before entering the Player.
Folder selections persist as app state across restarts.

## User Stories

- **US-001:** As a user, I select a User Folder so the app has somewhere to save
  my projects and exports.
- **US-002:** As a user, I select a Sample Folder so the app knows where my
  sample files live.
- **US-003:** As a user, I must pick the User Folder first.
  The app then makes the Sample Folder available.
  This order gives the app a write destination before it reads samples.
- **US-004:** As a user, I cannot use "Start New MixJam" until I select both folders.
  A hint identifies the missing selection.
- **US-005:** As a user, the app restores my selected folders after launch.
  I do not have to select them after each launch.
- **US-006:** As a user, I see a clear error when a selected folder is not
  accessible. I can then select a new folder.

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

The Recent Projects rail remains below the hero. Spec-001 owns it.

### Folder Cards

Each card shows:

- **Icon** and **label** indicating the folder role (e.g. "User Folder",
  "Sample Folder").
- **"Pick Folder" button** — opens the File System Access directory picker.
- **Status text** — shows the selected folder name or a prompt when no selection exists.
  MixJam stores no absolute paths. A folder is a `FolderRef`, and IndexedDB stores its handle.
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
- The picker uses `startIn` to suggest the OS Documents folder.
- The Player Settings modal also exposes a **Select User Folder** action. It
  uses this same picker, validation, and persisted `FolderRef` flow. The Home
  Library Setup card remains the primary onboarding surface.

**Sample Folder card:**

- The app disables this card until the user selects a User Folder.
- Once the User Folder is set, the Sample Folder card becomes active and the
  user can pick the input folder.
- Role: read-only. The app reads audio samples from this folder but never
  writes to it.

### Create or Open

- The launch gate uses an independent card below Library Setup.
  Its action row uses a 2:1 width ratio. "Start New MixJam" leads the quieter outlined "Load MixJam" action.
- The app disables "Start New MixJam" until the user selects both folders.
- When disabled, a hint label appears below the button: "Select both folders
  above to start."
- Once both folders are set, the button becomes active and clicking it
  navigates to the MixJam Player (per spec-001).
- "Load MixJam" uses the same two-folder readiness gate.
  Project paths are User Folder-relative, and sample references are Sample Folder-relative.
  Both folders must be available before a project can load.

### Folder Picker Behavior

- Clicking "Pick Folder" opens the File System Access directory picker
  (`showDirectoryPicker`). Its mode matches the folder role.
  The User Folder uses `readwrite`. The Sample Folder uses `read`.
- Picking a folder again reuses its existing `FolderRef` through `isSameEntry`.
  Thus, the folder keeps its scan root and indexed samples.
- After selection, the app validates the folder is accessible:
  - User Folder: permission granted and writable (probed with a temp file).
  - Sample Folder: permission granted and readable.
- If validation fails, the card displays this error: "Cannot
  access this folder. Check permissions and try again."
- If validation succeeds, the card displays the folder name.
- The user can change the folder at any time by clicking "Pick Folder" again.
- If a saved folder no longer exists, the card shows this error:
  "Folder not accessible — pick a new one."
- If a saved folder reports `queryPermission() === 'prompt'`, the card offers "Restore access to `folder`".
  A user gesture requests permission again. This is a defensive
  recovery path because the Electron shell normally auto-grants access.
- `backend/folder-access.ts` owns role-to-permission mapping, stored-handle
  loading, automatic-access checks, explicit user-gesture recovery, relative
  path resolution, and picked-file containment. Other backend workflows do not
  import the handle store directly or request permission during background work.

### App State Persistence

- localStorage stores selected `FolderRef` values. IndexedDB stores their directory handles.
  Both survive app restarts on the same origin.
- On app launch, the app automatically loads the saved folders and restores them into the cards.
- If both folders restore successfully, the "Start New MixJam" button is immediately active.
  The user can enter the tracker without another folder selection.
- No network, no cloud sync.

### App Config File

When the user selects both folders, the app writes an app configuration file into the accessible User Folder:

- `mixjam.json` — app metadata (app version, folder names, last opened
  timestamp).

The app writes this file automatically through the User Folder directory handle after folder selection.
The user cannot edit it.

## Acceptance Criteria (testable)

- [x] **AC-001:** Library Setup shows the User Folder and Sample Folder controls side by side.
  One scanner row spans beneath them.
- [x] **AC-002:** User Folder card is always active — "Pick Folder" button is clickable.
- [x] **AC-003:** The app initially disables the Sample Folder card.
- [x] **AC-004:** The app activates the Sample Folder card only after the user selects a User Folder.
- [x] **AC-005:** The app disables "Start New MixJam" when either folder is unset.
- [x] **AC-006:** A hint label appears below the disabled button: "Select both folders above to start."
- [x] **AC-007:** When both folders are set, "Start New MixJam" becomes active and navigates to the MixJam Player on click.
- [x] **AC-008:** The app disables "Load MixJam" until both folders are available.
  It then activates the control and opens the spec-011 project picker.
- [x] **AC-009:** Each "Pick Folder" button opens the directory picker with the mode matching its folder role.
- [x] **AC-010:** Each card displays its selected folder name after successful validation.
- [x] **AC-010b:** The User Folder picker uses `startIn` to suggest the OS Documents folder.
- [x] **AC-010c:** Select User Folder in Player Settings uses the Home User Folder card's validated picker.
  It also uses the same saved app state.
  Neither surface stores an absolute path.
- [x] **AC-010a:** If a selected folder is not accessible (permissions error), the card shows: "Cannot access this folder. Check permissions and try again."
- [x] **AC-011:** Closing and reopening the app restores previously selected folders automatically.
- [x] **AC-012:** If both folders restore successfully on launch, "Start New MixJam" is immediately active.
- [x] **AC-013:** If a restored folder is inaccessible, its card shows this error: "Folder not accessible — pick a new one."
- [x] **AC-013a:** If a restored handle unexpectedly needs a permission
  re-grant, the card offers "Restore access to `folder`". Granting it validates
  the folder and opens the gate.
- [x] **AC-014:** The app writes a `mixjam.json` configuration file to the User Folder after the user selects both folders.
- [x] **AC-015:** Changing the User Folder while a Sample Folder is already selected does not clear the Sample Folder selection.
- [x] **AC-016:** Selecting or restoring an accessible Sample Folder schedules one automatic library sync per app session.
  Re-renders and Home/Player transitions do not start duplicate jobs.
- [x] **AC-017:** While Home is visible, the Library Setup scanner row shows
  the sync or analysis phase and progress. It collapses to a compact ready
  state after completion. Folder availability remains the launch gate, and an existing
  index remains usable during background sync. A cancelled or failed first sync
  remains visibly unindexed and offers Retry without a modal overlay.

## Non-Goals (deferred to later specs)

- The indexing pipeline and sync scheduling rules belong to spec-004. This spec
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
  once per app session. See
  [indexing.md](../indexing.md#sync-trigger-policy).
