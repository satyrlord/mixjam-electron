# Spec 013 — Sample Folder Builder (archive.org)

**Spec Validation Status:** STUB — NOT VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-003 (Folder & App State Management), spec-004 (Sample Library),
web-first architecture (Sample Folder is a persisted `FileSystemDirectoryHandle`)

Local semantic audio search belongs to
[spec-015](spec-015-semantic-audio-search.md); this spec covers only the
archive.org folder builder.

## Objective

Let a user who has no samples build a real Sample Folder from inside MixJam by
searching archive.org's public-domain and Creative Commons audio collections
and downloading selected items directly into their Sample Folder. This is the
onboarding path for new users: MixJam has no demo mode, and without a Sample
Folder the tracker is inaccessible. This feature provides a path forward for
users who do not already have samples.

## User Stories

- **US-001:** As a user with an empty Sample Folder, I can search archive.org
  audio from inside MixJam without leaving the app.
- **US-002:** As a user, I can preview a result before deciding to download it.
- **US-003:** As a user, I can download selected files into my Sample Folder
  and see them appear after automatic library sync.
- **US-004:** As a user, I can see the license of every item before I download
  it, so I know what I'm allowed to do with it.
- **US-005:** As a user, I see download progress and can cancel pending
  downloads.

## Scope (high-level — to be validated)

### Discovery

- Search backed by the archive.org Advanced Search API (`mediatype:audio`),
  scoped to a curated set of collections known to hold usable material
  (e.g. `opensource_audio`, netlabels, 78rpm/Great 78 Project).
- Results show title, collection, duration where available, and license.

### Download

- Selected files are written into the Sample Folder via the granted
  `FileSystemDirectoryHandle` (`createWritable()`), under a dedicated
  top-level subfolder (e.g. `archive.org/<item>/…`) so the existing
  folder-to-category mapping (spec-004) files them automatically.
- A completed download batch schedules the same incremental library sync owned
  by spec-004 through its app-mutation trigger. This trigger is not suppressed
  when the root already completed its once-per-session automatic sync. It
  schedules immediately when idle or sets a same-root dirty bit that guarantees
  one follow-up reconciliation after an active job. Repeated download events
  collapse into that one follow-up and do not prompt for a second manual scan
  action.
- License/attribution metadata is preserved (e.g. a sidecar `.json` or
  `ATTRIBUTION.txt` per item).

### Access gating and write permission

- Entry point appears on the Home Screen when a Sample Folder is configured
  but empty (or from the sample browser at any time).
- The Sample Folder stays **read-only** in normal use (spec-003 picks it with
  mode `'read'`). Write access is an **upgrade on demand**: when the builder
  starts a download batch, it calls `requestPermission({ mode: 'readwrite' })`
  on the existing Sample Folder handle from the user gesture — one extra
  prompt in the browser host, auto-granted in the Electron shell. The upgrade
  is not persisted as the folder's default role; day-to-day scanning and
  playback continue to require only read access.
- The feature never writes anywhere other than the Sample Folder's
  `archive.org/` subtree.

## Acceptance Criteria (draft)

- [ ] **AC-001:** Searching a known term returns archive.org audio results with license shown per item.
- [ ] **AC-002:** Downloading a result produces a real audio file inside the Sample Folder under the `archive.org/` subtree.
- [ ] **AC-003:** After download completes, automatic incremental sync makes the
  new samples appear in the browser with a category derived from their
  subfolder, even when session-start sync already ran.
- [ ] **AC-004:** Cancelling an in-flight download leaves no partial file in the Sample Folder.
- [ ] **AC-005:** The builder may be opened with the normal read-only Sample
  Folder handle, but a download cannot begin until read-write permission is
  granted for that handle.

## Non-Goals

- No sources other than archive.org (no Freesound, no YouTube ripping, no
  arbitrary URLs).
- No uploading or publishing back to archive.org.
- No in-app license filtering beyond displaying each item's license (v1 does
  not attempt legal interpretation).
- No automatic sample chopping/trimming of downloaded material — files land
  as-is; editing is out of scope.
- No bundled/curated starter pack shipped with the app (that would be demo
  mode by another name).

## Open Questions

- Preview before download: stream directly from archive.org (CORS permitting)
  or download-then-audition? Needs a CORS spike against real collection URLs.
- Curated collection list: which collections, and is the list hardcoded or
  remotely updatable?
- Format handling: many archive.org items are FLAC/OGG/78rpm MP3 — download
  as-is and rely on browser decode support, or transcode? (`AUDIO_EXTENSIONS`
  in `src/renderer/src/backend/indexer.ts` defines what the indexer accepts
  today.)
- Rate limiting / politeness: max concurrent downloads and item-size caps.

## References

- archive.org Advanced Search API — <https://archive.org/advancedsearch.php>
- archive.org developer portal (metadata & download endpoints) — <https://archive.org/developers/>
- Web-first architecture — [docs/architecture.md](../architecture.md)
