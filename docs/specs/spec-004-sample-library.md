# Spec 004 — Sample Library Browsing, Search & Tagging

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-003 (Folder & App State Management)

## Objective

Index the user's Sample Folder. Build a searchable sample library with
virtualized rendering. Provide one flat tag system for folder-derived and
user-defined organization. Libraries are saved queries, not file copies.

## User Stories

- **US-001:** As a user, I see my Sample Folder library after I open the
  Tracker. The app indexes it automatically without a manual import.
- **US-002:** As a user, I can browse thousands of samples in a responsive, scrollable bubble grid.
- **US-002a:** As a user, I see the selected sample path, metadata, and tags in
  the Player footer. The browser keeps its list width.
- **US-003:** As a user, I can search samples by filename and get instant
  results as I type.
- **US-004:** As a user, I can create custom tags and assign them to samples,
  building my own organizational system.
- **US-005:** As a user, I can find folder-derived and custom tags through one searchable navigator.
  I do not traverse a category tree.
- **US-006:** As a user, I can filter samples by one or more tags and see only
  matching results.
- **US-007:** As a user, I can save a set of filters as a named "library"
  that I can reload later.

## Scope

### First-Run Indexing

- After the user selects or restores an accessible Sample Folder, the app schedules one incremental library sync.
  Each root gets one automatic sync per app session. Sync starts from Home and does not wait for Player entry.
- On the first sync, the app scans the folder for audio files (`.wav`, `.mp3`,
  `.flac`, `.ogg`, `.aiff`).
- The app registers each file in SQLite.
  The record contains its scan root, relative path, filename, extension, size,
  modification time, and import date.
- **Phase 1:** file enumeration creates stub rows. Metadata columns (duration,
  sample rate, channels) are left empty.
- **Phase 2:** Four concurrent readers parse audio headers to get duration, sample rate, and channels.
  Database updates
  stay serialized in the backend worker.
- The first sync is non-modal. Home shows phase and progress inside the Sample
  Folder card. If the user enters Player before `scan-done`, the Samples panel shows an empty sync state.
  The Middle Strip shows the same job status.
  Navigation and project actions remain available.
- The app queries and displays samples after `scan-done`. First-sync rows do not
  appear incrementally during phase 1 or phase 2.
- Scan status uses a native progress element with a visible text equivalent and
  an accessible label. Indeterminate phases omit a fabricated numeric value.
- Indexing runs on a background thread/worker — the UI stays responsive.

### Automatic Incremental Sync and Manual Recovery

- A worker-owned scheduler uses the string `FolderRef.id` as its key.
  It reconciles an indexed folder once per app session after handle restoration. Existing indexed samples stay browsable during this background
  sync.
- View changes, component remounts, and React development remount behavior do
  not schedule duplicate syncs. The backend worker runs one library job at a
  time. Duplicate requests for the same root return the existing job identity.
  Selecting a different root cancels the old root at its next checkpoint.
  It discards that root's queued request and gives priority to the new root.
- An app-owned filesystem mutation schedules a sync after the root uses its automatic trigger.
  A completed spec-020 download is one example. If the same root is active, the worker marks it dirty and
  guarantees one follow-up reconciliation after the current job. Repeated
  mutation events collapse into that one follow-up.
- New files: added as stubs, queued for metadata extraction.
- Changed files: the app extracts metadata again. It preserves tags, bpm/key fields, and the original import date.
  The app computes folder-derived tags again.
- Missing files: the app marks them as missing and does not delete them, so tags survive a temporarily
  disconnected drive. Hidden from normal browsing.
- Unchanged files with a completed metadata attempt are not metadata-parsed or
  automatically analyzed again. Persisted revision and completion state makes
  a completed empty folder valid. It prevents a retry of terminal metadata
  failures and valid NULL analysis results after each launch.
  The manual Re-scan action retries unchanged rows whose metadata status is unavailable.
- One manual **Re-scan Sample Folder** action invokes the same incremental pipeline.
  Use it only when files change after the session's automatic sync. It lives in the Middle Strip utility menu rather than as
  permanent primary chrome.
- A single "Cancel library sync" action is available while a job is active.
  Cancelling bumps a generation counter. The in-flight work stops at its next
  cancellation check.
  Already committed rows remain in the database, and the progress indicator
  enters a cancelled state immediately. A cancelled or failed first sync shows
  one contextual **Retry library sync** action in the current status surface.
  This recovery action is not permanent Middle Strip chrome and does not create
  a second scan variant.
- Progress and completion events include the root and job identity.
  Thus, stale events cannot update a new root after a Sample Folder change.
- `hooks/useLibrarySyncRuntime.ts` is the renderer lifecycle owner. It filters
  those root/job events, hydrates coalesced work, and exposes sync, retry, and
  cancel actions. `useLibraryData` owns browse queries and mutations. Home,
  Middle Strip, and status controls derive shared capabilities from
  `lib/library-sync-presentation.ts` while keeping view-specific copy local.
  It does not load the app version or scan the User Folder for projects. Those
  are project-persistence and project-catalog responsibilities from spec-011.
- Contextual sample analysis is part of the single worker-owned analysis job.
  It has no separate command or scan variant. Spec-008 owns its inference rules.

### Sample Browser Container

The sample browser occupies the Samples panel in the full-width Bottom
Workspace below the Middle Strip from spec-006. Its internal layout:

```text
.browser-region
  ├── .tag-navigator      — searchable flat tag list (left portion)
  ├── .browser-resize-v   — internal vertical split handle
  └── .sample-pane        — main browser workspace
      ├── .sample-toolbar      — filter/results toolbar
      │   ├── .sample-filter-strip     — active tag filter chips
      │   └── .sample-results-controls — result count and sort controls
      └── .tiles              — virtualized rows of sample bubbles
```

- Song and Mixer are peer panels outside the Samples panel. Their controls
  do not live inside the sample browser.
- A vertical resize handle separates the tag navigator from the sample list
  inside the browser region (defined in spec-006). It supports pointer, touch,
  and keyboard resizing and exposes its current value through separator ARIA.
- Selected sample details do not open a third pane inside the browser region.
  They render in the center slot of the app-wide Player footer (spec-001).
  Thus, the browser keeps its two-column navigator/grid layout.

### Sample Browser Grid

- Samples render as the same bubble used by the Tracker. Bubble geometry,
  appearance, and behavior follow the [Style Guide](../style-guide.md#sample-bubbles).
  Before first placement, the browser estimates the span from source duration and detected BPM.
  Per spec-009, it uses the current project BPM when detection is unavailable.
- Sort controls support filename, duration, and date added. Selecting the active
  sort again toggles ascending/descending.
- Each browser bubble resolves its palette slot from the sample's top-level
  relative-path segment. A flat file uses the unsorted slot. Active tag filters
  never recolor a result or replace the slot stored in its drag payload.
- Selecting a bubble highlights it and previews its audio.
  It also puts the path, assigned tags, and decoded waveform in the Player footer.
- The grid does not use inline expansion.
- Functional development and scan checks use the real fixture corpus under
  `tmp/test-samples`. Scale validation against 100k+ samples remains deferred.
  Do not hardcode the fixture count because that corpus changes over time.

### Full-Text Search

- A search input lives in the app-wide Middle Strip from spec-006. It filters
  the Samples panel without moving global search into a tab-scoped surface.
- As the user types, results filter in real-time (debounced, ~150ms).
- Search matches against filename and relpath.
- Results respect any active tag filter (search within filtered set).
- Empty search query shows all samples (subject to active filters).
- Search uses token-prefix matching through FTS5, not typo-tolerant fuzzy
  matching.
- Query results load as windowed pages on demand. The first page loads eagerly.
  The grid requests the next page near the end of the loaded rows.
  Each page request belongs to one root/filter/sort generation.
  Changing a query input immediately invalidates pending pagination.

  A late response cannot append rows or release another generation's paging guard.
  The renderer never accumulates the full result set up front.

### Library Controls

- The Middle Strip owns sample search plus one compact library-status region
  for sync and analysis progress. Its utility menu contains the single manual
  Re-scan recovery action. The UI exposes Cancel only while a job is active.
- The Home Sample Folder card shows the same sync lifecycle while Home is
  visible. Progress follows the job across view changes without restarting it.
- The Samples panel's filter/results toolbar owns active tag filters, the
  result count summary, and filename/duration/date-added sorting.
- Those controls share one non-wrapping toolbar. The left side is a horizontally
  scrollable filter strip. The right side keeps the result count and one compact
  sort group visible. The count remains present at zero. Active tag filters are
  removable and expose their optional color indicator. The active sort exposes
  both pressed state and direction in its accessible name.
- The analyzer in spec-008 automatically produces contextual BPM, key, and type results.
  There is no separate analysis-management action.
- These controls never bypass the SQLite-backed query/filter flow. They only
  change the current browser query state or trigger the indexed sync path.
- Manage replaces the sample-results pane while it is open. Covered result and
  resize controls are not left in the accessibility tree or tab order. Focus
  enters the named Manage region and returns to the Manage toggle on close.

### Sample Browser States

- An unindexed or actively syncing first library uses a quiet, non-modal loading
  state in the Samples panel. It explains that MixJam is preparing the library
  and exposes busy semantics without showing incomplete scan rows.
- A filtered query with zero matches explains the result.
  It offers one action that clears search and tag filters together.
- A completed folder with no supported audio files is a valid folder-empty state.
  It is not an error or a prompt to run another scan.
- An unavailable Sample Folder directs the user to Home to restore or choose the
  folder. A cancelled first sync points to the contextual Retry action in the
  library-status surface. A failed first sync shows the worker-provided error and
  the same recovery path. These states do not add permanent scan controls inside
  the Samples panel.

### Tag Organization

- Users can create, rename, and delete tags.
- A user can assign tags to one or more samples. Right-clicking a sample tile
  exposes one **Edit tags** action that opens a searchable, collision-aware
  assignment surface. The UI never mounts the complete tag catalog once per
  sample tile.
- The sample menu follows the standard context-menu keyboard model.
  It stays inside the viewport and restores focus after dismissal.
  It opens sample analysis in a collision-aware modal popover at the source
  sample bubble.
- The left navigator searches the flat tag catalog and toggles filters. Only
  active filters render as chips in the results toolbar, so tag count does not
  expand permanent chrome.
- Tags have an optional color for visual identification.
  The manage panel can set or clear the color during creation or later edits.
  Colored tags use the same indicator in filter chips and sample menus.
- Tag assignment is many-to-many: one sample can have many tags, one tag can
  apply to many samples.
- Deleting a tag removes it from all assigned samples (no orphaned references).
- `querySamples` returns each row's assigned tag ids and names through aggregated subqueries.
  Thus, tiles and the footer show tags without N+1 lookups.

### Folder-Derived Tags

- The indexer turns each directory segment into one flat, globally shared tag.
  For example, `Hard Trance/Bass/kick.wav` receives `Hard Trance` and `Bass`,
  while `House/Bass/bass.wav` receives `House` and the same `Bass` tag identity.
  A sample directly in the Sample Folder root receives the hardcoded
  `Unsorted` tag.
- Folder-derived tags are root-scoped and read-only. A complete scan reconciles them.
  A cancelled or failed scan preserves the prior
  complete projection.
- User-created tags remain global and editable. When a user tag and a
  folder-derived tag share a name, they share one visible tag identity.
  They retain independent assignment provenance. The per-sample editor can pin
  or unpin the user provenance. The folder assignment stays visibly active.
  Thus, an explicit assignment can survive a later file move.
- A changed or moved file recomputes folder-derived assignments while keeping
  its user assignments. Missing rows retain user tags but do not keep obsolete
  folder tags visible.
- Multiple active tags use match-all semantics. Selecting `Bass` alone spans
  every parent, while selecting `Hard Trance` and `Bass` narrows to their
  intersection. A nested sample receives every directory-segment tag.
  Thus, selecting a top-level folder tag includes its deeper samples without a recursive category query.
- Assigning, unassigning, or deleting a tag invalidates the current windowed query.
  Thus, filtered membership and the result count reflect the committed SQLite state.
  A completed sync prunes selected ids that are no longer visible
  in the active root before refreshing results.

### Libraries (Saved Queries)

- A library is a named, saved set of filter/search/tag criteria.
- Creating a library saves the current filter state under a user-chosen name.
- The backend creates library metadata and its compiled rule in one transaction. A
  failed rule write leaves no orphan library row.
- Opening a library parses its `rule_json` and restores search text plus tag
  filters. Stale tag ids are ignored.
- Libraries do not copy or duplicate sample data — they are purely saved
  queries. Editing a sample's tags automatically updates all libraries that
  reference it.
- Deleting a library only removes the saved query, never the samples.
- The executable v1 subset is one `and` group containing optional `text` and one
  `tag`-`all` leaf. The full predicate-tree compiler remains
  target architecture. See [query-schema.md](../query-schema.md).

### Performance Constraints (from architecture)

- All filtering, sorting, and searching executes against SQLite — never
  in-memory JavaScript array operations on the full dataset.
- The UI requests windowed pages of results, not the entire dataset.
- Virtualized rendering keeps a constant DOM node count for each result set size.
  TanStack Virtual packs tiles into fixed-height rows and virtualizes them.
  The browser mounts only rows that intersect the scroll viewport. A
  visible unmeasured viewport may render only a bounded first-paint window.
  Hidden viewports mount no rows and never request another result page.
- `tests/e2e/ui-performance.spec.ts` proves the bound with fewer than 40
  mounted rows and fewer than 400 sample bubbles.
  It scrolls through exact `0`, `500`, and `1000` backend offsets.
  It also proves that each page mounts
  distinct samples. Repeatedly fetching offset zero or fully rendering a
  500-row page cannot satisfy the test.
- No current 100k-row latency measurement exists.
  Record each throughput or query latency claim with the real fixture or library subset.
  Also record the exact measurement procedure.

## Acceptance Criteria (testable)

- [x] **AC-001:** A folder's first sync starts automatically from Home.
  It shows accessible phase and progress without a full-screen overlay. Entering
  Player keeps the job running and shows a non-modal syncing state.
- [x] **AC-002:** After `scan-done`, the browser queries the active folder and displays its indexed samples.
  The browser hides first-scan results before completion.
- [x] **AC-003:** Phase 2 persists duration, sample rate, and channel metadata.
  Terminal unsupported or damaged files become metadata-unavailable without
  aborting the sync. Transient I/O failure keeps the job incomplete for Retry.
- [x] **AC-004:** The UI virtualizes the sample bubble grid.
  The DOM row count stays bounded as the user scrolls indexed samples.
  A hidden Samples tab mounts no rows or additional query pages.
- [x] **AC-004a:** The UI exposes one manual "Re-scan Sample Folder" recovery action.
  It exposes one compact library-status region and Cancel only while active. It
  exposes no second scan variant. The Samples panel retains result count and
  filter/sort controls. A cancelled or failed first sync may expose one
  contextual "Retry library sync" action in that status region.
- [x] **AC-005:** Typing in the search field filters the sample grid in real-time, matching token prefixes in filename and relpath.
- [x] **AC-006:** Clearing the search field restores the full sample list.
- [x] **AC-006b:** Clearing an active tag restores matching samples across every
  SQLite result window, not only the first page.
- [x] **AC-006a:** Selecting a sample adds its path, metadata, and assigned tags
  to the Player footer center. The left and right shell items stay visible.
- [x] **AC-007:** The user can create a tag with or without a color.
  The user can set or clear its color later.
  Tag controls show the color indicator, and the user can assign the tag.
- [x] **AC-008:** User can rename a tag — the rename reflects on all assigned samples.
- [x] **AC-009:** A user can delete a tag. The delete action removes it from all assigned samples.
- [x] **AC-010:** A complete sync assigns one shared tag per directory segment.
  Identically named subfolders under different parents share one tag identity,
  and flat-root samples receive the hardcoded `Unsorted` tag.
- [x] **AC-010a:** The tag navigator searches the flat catalog and toggles
  filters. It does not mount the catalog in the results toolbar.
  Only active tags appear as removable filter chips. A sync cannot leave an invisible
  stale tag id filtering the result set.
- [x] **AC-010b:** Folder-derived assignments are root-scoped and read-only.
  User-created tags are global and editable. Sync reconciliation never removes
  user assignments or another root's folder-derived projection.
  A user can independently pin the folder or user tag for a sample.
  Tag mutation completions reconcile through the current root.
  They cannot overwrite a new Sample Folder projection after a root switch.
- [x] **AC-011:** Multiple tag filters use match-all semantics. `Bass` alone
  spans parents. `Hard Trance` plus `Bass` narrows to their intersection.
  A top-level folder tag includes nested samples because they carry it directly.
  Membership mutations refresh the SQLite window and total count.
- [x] **AC-012:** User can save the current filter/search state as a named library.
- [x] **AC-013:** Opening a saved library restores search and valid tag filters
  and shows matching samples. Stale tag ids are ignored.
- [x] **AC-014:** Deleting a library removes only the saved query. It does not affect samples or tags.
- [x] **AC-015:** Automatic and manual incremental sync detect file and directory changes.
  Files can be new, changed, missing, or restored.
  Sync detects added, removed, renamed, moved, empty, and unsupported-only directories.
  A completed sync atomically replaces that Sample Folder's folder-derived tag projection.
  It preserves user tags and never exposes another Sample Folder's folder tags. Existing indexed
  samples remain usable, and cancellation retains the prior complete tag
  projection.
- [x] **AC-015a:** Folder selection/restoration schedules at most one sync for
  that root during the app session. The worker-owned scheduler uses
  `FolderRef.id`, duplicate requests return the active job identity, and view
  changes never start another job.
- [x] **AC-015b:** A second automatic sync over an unchanged corpus performs no metadata parse or sample analysis.
  This rule includes saved terminal metadata failures. Manual Re-scan may explicitly retry unavailable
  metadata.
- [x] **AC-015c:** A completed empty folder is a ready indexed root.
  A cancelled or failed first sync remains incomplete and offers contextual Retry.
- [x] **AC-015d:** Root and job identity block old progress, completion, and folder-derived tag updates.
  These old updates cannot apply after the active Sample Folder changes.
  Missing-path and paged-query responses obey the same
  root/generation rule. A folder change clears active tag filters immediately.
- [x] **AC-015e:** A completed app-owned filesystem mutation schedules or queues
  reconciliation even after the root's session-start sync. Mutation during an
  active same-root job guarantees one dirty-bit follow-up, while cross-root
  selection prioritizes the newly active root.
- [x] **AC-016:** The sample grid can be sorted by filename, duration, and date added (ascending/descending).
- [x] **AC-017:** Clicking a sample bubble previews its audio and renders its decoded waveform in the Player footer.
- [x] **AC-017a:** A Sample Browser bubble uses the same project-owned musical
  span and current pixels-per-tick scale as its Tracker representation. Before
  first placement it uses the spec-009 span estimate, so the first drop and both
  views remain pixel-identical.
- [x] **AC-018:** Sample actions use an accessible, viewport-aware context menu.
  The tag-navigator/sample separator works by pointer, touch, and keyboard.
  Scan progress exposes native progress semantics and visible status text. Manage
  replaces the results pane, receives focus, and restores focus when closed.

## Non-Goals (deferred to later specs)

- No BPM/key auto-detection during indexing — those columns stay NULL.
  Auto-analysis is spec-008.
- No 100k+ scale validation has been recorded. Functional development uses the
  changing real fixture corpus under `tmp/test-samples`.
- No content-hashing for dedup or move/rename detection.
- Continuous live watching is optional follow-up work. The baseline is
  once-per-session automatic sync plus one manual in-session recovery action
  (see [indexing.md](../indexing.md#live-watching-optional-later)).
- No drag-and-drop within the browser itself (reordering tiles). Drag to tracker lane is the primary placement mechanism (see spec-006).
- No dedicated detail pane inside the browser region. Selected-sample details
  are footer-hosted.
- No library export or sharing.
- No tag import/export or cloud synchronization.

## References

- [Current project data-model.md](../data-model.md) — SQLite schema, FTS5, and indexes.
- [Current project indexing.md](../indexing.md) — Two-phase scan, change detection, incremental re-scan.
- [Current project query-schema.md](../query-schema.md) — `rule_json` predicate-tree format for saved libraries.
- [Current project architecture.md](../architecture.md) — Virtualization requirement, SQLite-in-backend-worker constraint.
