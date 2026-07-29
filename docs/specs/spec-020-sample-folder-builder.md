# Spec 020 — Sample Folder Builder (archive.org)

**Spec Validation Status:** STUB — NOT VALIDATED

**Spec Implementation Status:** NOT IMPLEMENTED

**Depends on:**

- spec-003 (Folder & App State Management)
- spec-004 (Sample Library)
- Electron renderer architecture

The renderer persists the Sample Folder as a `FileSystemDirectoryHandle`.

Local semantic audio search belongs to
[spec-015](spec-015-semantic-audio-search.md). This spec covers only the
archive.org folder builder.

## Objective

Let a user who has no samples build a real Sample Folder from inside MixJam.
The user searches archive.org public-domain and Creative Commons audio
collections. The user downloads selected items directly into the Sample
Folder. This is the
onboarding path for new users: MixJam has no demo mode, and without a Sample
Folder the tracker is inaccessible. This feature provides a path forward for
users who do not already have samples.

## User Stories

- **US-001:** As a user with an empty Sample Folder, I can search archive.org
  audio inside MixJam. I do not have to leave the app.
- **US-002:** As a user, I can preview a result before deciding to download it.
- **US-003:** As a user, I can download selected files into my Sample Folder.
  I see them after the automatic library sync.
- **US-004:** As a user, I can see each item license before I download it.
  The license shows how I can use the item.
- **US-005:** As a user, I see download progress and can cancel pending
  downloads.

## Scope (high-level, validation pending)

### Discovery

- Search uses the archive.org Advanced Search API (`mediatype:audio`). It uses a
  curated set of collections with usable material. Examples include
  `opensource_audio`, netlabels, `78rpm`, and the Great 78 Project.
- Results show title, collection, duration where available, and license.

### Download

- The builder uses the granted `FileSystemDirectoryHandle` and `createWritable()`.
  It writes selected files under a dedicated top-level subfolder, such as
  `archive.org/<item>/…`. The existing folder-to-tag mapping from spec-004 labels
  them automatically.
- A completed download batch schedules the same incremental library sync owned
  by spec-004 through its app-mutation trigger. This trigger is not suppressed
  when the root already completed its once-per-session automatic sync. It
  schedules immediately when idle or sets a same-root dirty bit that guarantees
  one follow-up reconciliation after an active job. Repeated download events
  collapse into that one follow-up and do not prompt for a second manual scan
  action.
- The builder preserves license and attribution metadata. It can use a sidecar
  `.json` file or an `ATTRIBUTION.txt` file for each item.

### Access gating and write permission

- The entry point appears on the Home Screen when a configured Sample Folder is
  empty. The sample browser always shows the entry point.
- The Sample Folder stays **read-only** in normal use (spec-003 picks it with
  mode `'read'`). Write access is an **upgrade on demand**.
  When the builder starts a download batch, it calls
  `requestPermission({ mode: 'readwrite' })` on the existing Sample Folder
  handle. The user gesture starts this call. The Electron
  shell auto-grants the upgrade.

  The upgrade
  does not change the folder's saved default role. Day-to-day scanning and
  playback continue to require only read access.
- The feature never writes anywhere other than the Sample Folder's
  `archive.org/` subtree.

## Acceptance Criteria (draft)

- [ ] **AC-001:** Searching a known term returns archive.org audio results with license shown per item.
- [ ] **AC-002:** Downloading a result produces a real audio file inside the Sample Folder under the `archive.org/` subtree.
- [ ] **AC-003:** After download completes, automatic incremental sync adds the
  new samples to the browser. It derives tags from their subfolder.
  This sync also runs when session-start sync has finished.
- [ ] **AC-004:** Cancelling an in-flight download leaves no partial file in the Sample Folder.
- [ ] **AC-005:** The builder can open with the normal read-only Sample Folder
  handle. A download cannot start until the user grants read-write permission
  for that handle.

## Non-Goals

- No sources other than archive.org (no Freesound, no YouTube ripping, no
  arbitrary URLs).
- No uploading or publishing back to archive.org.
- No in-app license filtering beyond displaying each item's license (v1 does
  not attempt legal interpretation).
- No automatic sample chopping/trimming of downloaded material — files land
  as-is. Editing is out of scope.
- No bundled/curated starter pack shipped with the app (that would be demo
  mode by another name).

## Open Questions

- Preview before download: stream directly from archive.org (CORS permitting)
  or download-then-audition? Needs a CORS spike against real collection URLs.
- Curated collection list: which collections, and is the list hardcoded or
  remotely updatable?
- Format handling: many archive.org items are FLAC, OGG, or 78 rpm MP3 files.
  Should the app download these files as-is or transcode them? `AUDIO_EXTENSIONS`
  in `src/renderer/src/backend/indexer.ts` defines the current accepted formats.
- Rate limiting / politeness: max concurrent downloads and item-size caps.

## References

- archive.org Advanced Search API — <https://archive.org/advancedsearch.php>
- archive.org developer portal (metadata & download endpoints) — <https://archive.org/developers/>
- Electron renderer architecture — [docs/architecture.md](../architecture.md)
