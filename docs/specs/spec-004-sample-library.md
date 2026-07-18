# Spec 004 — Sample Library Browsing, Search & Tagging

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-003 (Folder & App State Management)

## Objective

Index the user's Sample Folder, build a searchable/browsable sample library with
virtualized rendering, and enable dynamic user-defined tagging with hierarchical
categories. Libraries are saved queries, not file copies.

## User Stories

- **US-001:** As a user, I open the tracker and see my sample library
  automatically indexed from the Sample Folder — I don't have to manually
  import files.
- **US-002:** As a user, I can browse samples in a scrollable bubble grid that stays
  responsive even with thousands of files.
- **US-002a:** As a user, when I select a sample I see its path, metadata, and
  tags in the Player footer without losing list width in the browser.
- **US-003:** As a user, I can search samples by filename and get instant
  results as I type.
- **US-004:** As a user, I can create custom tags and assign them to samples,
  building my own organizational system.
- **US-005:** As a user, I can organize samples with a parent/child category
  hierarchy that remains independent of tags.
- **US-006:** As a user, I can filter samples by tag/category and see only
  matching results.
- **US-007:** As a user, I can save a set of filters as a named "library"
  that I can reload later.

## Scope

### First-Run Indexing

- After an accessible Sample Folder is selected or restored, the app
  automatically schedules one incremental library sync for that root during
  the app session. Sync starts from Home and does not wait for Player entry.
- On the first sync, the app scans the folder for audio files (`.wav`, `.mp3`,
  `.flac`, `.ogg`, `.aiff`).
- Each file is registered in the SQLite database with: scan root + relpath
  (path relative to the Sample Folder), filename, extension, file size,
  modification time, and import date.
- **Phase 1:** file enumeration creates stub rows. Metadata columns (duration,
  sample rate, channels) are left empty.
- **Phase 2:** audio headers are parsed to fill duration, sample rate, and
  channels. Metadata parsing uses four concurrent readers; database updates
  stay serialized in the backend worker.
- The first sync is non-modal. Home shows phase and progress inside the Sample
  Folder card. If the user enters Player before `scan-done`, the Samples panel
  shows an empty syncing state and the Middle Strip carries the same job status.
  Navigation and project actions remain available.
- Samples are queried and displayed after `scan-done`; first-sync rows do not
  appear incrementally during phase 1 or phase 2.
- Scan status uses a native progress element with a visible text equivalent and
  an accessible label; indeterminate phases omit a fabricated numeric value.
- Indexing runs on a background thread/worker — the UI stays responsive.

### Automatic Incremental Sync and Manual Recovery

- A worker-owned scheduler keyed by the string `FolderRef.id` reconciles an
  indexed folder automatically once per app session after its handle is
  restored. Existing indexed samples stay browsable during this background
  sync.
- View changes, component remounts, and React development remount behavior do
  not schedule duplicate syncs. The backend worker runs one library job at a
  time. Duplicate requests for the same root return the existing job identity.
  Selecting a different root cancels the old root at its next checkpoint,
  discards its queued automatic request, and prioritizes the newly selected
  root.
- An app-owned filesystem mutation, such as a completed spec-013 download,
  schedules a sync even when the root already used its once-per-session
  automatic trigger. If the same root is active, the worker marks it dirty and
  guarantees one follow-up reconciliation after the current job; repeated
  mutation events collapse into that one follow-up.
- New files: added as stubs, queued for metadata extraction.
- Changed files: metadata is re-extracted; tags, bpm/key fields, and original
  import date are preserved, while filesystem-derived categories are recomputed.
- Missing files: marked as missing (not deleted) so tags survive a temporarily
  disconnected drive. Hidden from normal browsing.
- Unchanged files with a completed metadata attempt are not metadata-parsed or
  automatically analyzed again. Persisted root-completion, metadata-revision,
  and analysis-revision state make a completed empty folder valid and keep
  terminal metadata failures and valid NULL analysis results from being retried
  on every launch. The manual Re-scan action retries unchanged rows whose
  metadata is marked unavailable.
- One manual **Re-scan Sample Folder** action invokes the same incremental
  pipeline only for the rare case where files change after the session's
  automatic sync. It lives in the Middle Strip utility menu rather than as
  permanent primary chrome.
- A single "Cancel library sync" action is available while a job is active.
  Cancelling bumps a generation counter; the in-flight work stops at its next
  cancellation check.
  Already committed rows remain in the database, and the progress indicator
  enters a cancelled state immediately. A cancelled or failed first sync shows
  one contextual **Retry library sync** action in the current status surface.
  This recovery action is not permanent Middle Strip chrome and does not create
  a second scan variant.
- Progress and completion events include root and job identity, so switching
  Sample Folder during a scan cannot update the new root with stale events.
- Uniform Folder Calibration has its own state and commands. It is serialized
  by the backend worker but remains outside the library-sync lifecycle.
- Uniform Folder Calibration belongs to spec-008. It is not a second Re-scan
  action and is never exposed in the Middle Strip.

### Sample Browser Container

The sample browser occupies the Samples panel in the full-width Bottom
Workspace below the Middle Strip from spec-006. Its internal layout:

```text
.browser-region
  ├── .category-tree      — expandable category/subcategory tree (left portion)
  ├── .browser-resize-v   — internal vertical split handle
  └── .sample-pane        — main browser workspace
      ├── .filter-sort-row    — filters, result count, and sort controls
      └── .tiles              — virtualized rows of sample bubbles
```

- Song, Mixer, and FX are peer panels outside the Samples panel. Their controls
  do not live inside the sample browser.
- A vertical resize handle separates the category tree from the sample list
  inside the browser region (defined in spec-006). It supports pointer, touch,
  and keyboard resizing and exposes its current value through separator ARIA.
- Selected sample details do not open a third pane inside the browser region.
  They render in the center slot of the app-wide Player footer (spec-001) so
  the browser keeps its two-column tree/grid layout.

### Sample Browser Grid

- Samples render as the same 26px-high bubble used by the Tracker. Bubbles show
  the filename and source duration and retain identical geometry across views.
  Their shared width uses the Tracker's pixels-per-tick scale and the sample's
  project-owned musical span. Before first placement, the browser estimates the
  span from source duration and detected BPM, or the current project BPM when
  detection is unavailable, following spec-009.
  Canvas rounded rectangles clamp the theme radius to the actual bubble width
  and height, preserving the shared geometry at the minimum width.
- Sort controls support filename, duration, and date added. Selecting the active
  sort again toggles ascending/descending.
- Selecting a bubble highlights it, previews its audio, and populates the Player
  footer with the path, assigned tags, and decoded waveform.
- The grid does not use inline expansion.
- Functional development and scan checks use the real fixture corpus under
  `tmp/test-samples`. Scale validation against 100k+ samples remains deferred;
  do not hardcode the fixture count because that corpus changes over time.

### Full-Text Search

- A search input lives in the app-wide Middle Strip from spec-006. It filters
  the Samples panel without moving global search into a tab-scoped surface.
- As the user types, results filter in real-time (debounced, ~150ms).
- Search matches against filename and relpath.
- Results respect any active tag/category filter (search within filtered set).
- Empty search query shows all samples (subject to active filters).
- Search uses token-prefix matching through FTS5, not typo-tolerant fuzzy
  matching.
- Query results load as windowed pages on demand: the first page loads eagerly
  and the grid requests the next page as the user scrolls near the end of the
  loaded rows. The renderer never accumulates the full result set up front.

### Library Controls

- The Middle Strip owns sample search plus one compact library-status region
  for sync and analysis progress. Its utility menu contains the single manual
  Re-scan recovery action. Cancel is exposed only while a job is active.
- The Home Sample Folder card shows the same sync lifecycle while Home is
  visible. Progress follows the job across view changes without restarting it.
- The Samples panel's filter/sort row owns category and tag filters, the result
  count summary, and filename/duration/date-added sorting.
- Advanced Uniform Folder Calibration lives in Samples analysis management
  under spec-008, not beside Re-scan.
- These controls never bypass the SQLite-backed query/filter flow; they only
  change the current browser query state or trigger the indexed sync path.

### Dynamic Tagging

- Users can create, rename, and delete tags.
- Tags can be assigned to one or more samples. Assignment UI: right-clicking a
  sample tile opens a context menu listing every tag with its assignment state;
  clicking toggles assign/unassign. Every browser item is an indexed DB row, so
  tagging is always available.
- The sample menu follows the standard context-menu keyboard model, remains
  inside the viewport, returns focus on dismissal, and opens sample analysis in
  a collision-aware modal popover anchored to the originating sample bubble.
- All tags render as filter chips in the browser's subcategory row; clicking a
  chip toggles that tag in the active filter.
- Tags have an optional color for visual identification. The manage panel can
  set or clear that color during creation or later editing, and colored tags
  carry the same indicator in filter chips and sample context menus.
- Tag assignment is many-to-many: one sample can have many tags, one tag can
  apply to many samples.
- Deleting a tag removes it from all assigned samples (no orphaned references).
- `querySamples` returns each row's assigned tag ids and names (aggregated
  subqueries), so tiles and the footer show tags without N+1 lookups.

### Category Tree

- **"Unsorted"** is the only hardcoded top-level category. It serves as the
  fallback bucket for samples that cannot be assigned to any folder-derived
  category (flat files, unrecognised paths).
- All other top-level categories are **derived from the sample-folder
  structure**: each top-level subdirectory in the Sample Folder becomes a
  root category. If the Sample Folder is flat, only the "Unsorted" category
  exists.
- Subcategories are deeper folder levels: the first subdirectory under a
  category folder becomes a subcategory, and so on.
- Users can create additional custom top-level categories and subcategories
  via the manage panel; folder-derived and user-created categories coexist.
- The manage panel lists nested categories by their full hierarchy path and
  offers every depth as a parent, so users can create and delete categories
  below an existing subcategory without losing context.
- Filtering by a category shows samples in that category AND all its
  descendants (subcategories).
- The category tree is displayed in the browser panel as an expandable tree:
  top-level categories as root nodes, subcategories as children.

### Libraries (Saved Queries)

- A library is a named, saved set of filter/search/tag criteria.
- Creating a library saves the current filter state under a user-chosen name.
- Library metadata and its compiled rule are created in one transaction; a
  failed rule write leaves no orphan library row.
- Opening a library applies its saved filters: clicking a library's name in the
  manage panel parses its `rule_json` and restores the search text, category,
  and tag filters.
- Libraries do not copy or duplicate sample data — they are purely saved
  queries. Editing a sample's tags automatically updates all libraries that
  reference it.
- Deleting a library only removes the saved query, never the samples.
- The executable v1 subset is one `and` group containing optional `text`, one
  `category`, and `tag`-`any` leaves. The full predicate-tree compiler remains
  target architecture; see [query-schema.md](../query-schema.md).

### Performance Constraints (from architecture)

- All filtering, sorting, and searching executes against SQLite — never
  in-memory JavaScript array operations on the full dataset.
- The UI requests windowed pages of results, not the entire dataset.
- Virtualized rendering ensures constant DOM node count regardless of result
  set size. Tiles are packed into fixed-height rows and virtualized with
  TanStack Virtual; only rows intersecting the scroll viewport are mounted. A
  visible unmeasured viewport may render only a bounded first-paint window;
  hidden viewports mount no rows and never request another result page.
- No current 100k-row latency claim has been measured. Any throughput or query
  latency claim must be recorded with the real fixture/library subset and the
  exact measurement procedure.

## Acceptance Criteria (testable)

- [x] **AC-001:** A folder's first sync starts automatically from Home and
  shows accessible phase and progress without a full-screen overlay. Entering
  Player keeps the job running and shows a non-modal syncing state.
- [x] **AC-002:** After `scan-done`, the browser queries the active folder and displays its indexed samples; first-scan results are not exposed before completion.
- [x] **AC-003:** Phase 2 persists duration, sample rate, and channel metadata.
  Terminal unsupported or damaged files become metadata-unavailable without
  aborting the sync; transient I/O failure keeps the job incomplete for Retry.
- [x] **AC-004:** The sample bubble grid is virtualized — scrolling through
  indexed samples keeps a bounded DOM row count, and an inactive Samples tab
  mounts no sample rows or additional query pages while hidden.
- [x] **AC-004a:** The UI exposes one manual "Re-scan Sample Folder" recovery
  action, one compact library-status region, and Cancel only while active. It
  exposes no second scan variant. The Samples panel retains result count and
  filter/sort controls. A cancelled or failed first sync may expose one
  contextual "Retry library sync" action in that status region.
- [x] **AC-005:** Typing in the search field filters the sample grid in real-time, matching token prefixes in filename and relpath.
- [x] **AC-006:** Clearing the search field restores the full sample list.
- [x] **AC-006b:** Clearing or unselecting a category restores all matching samples across every SQLite result window, not only the first page.
- [x] **AC-006a:** Selecting a sample populates the center area of the Player footer with that sample's path, metadata, and assigned tags while the footer's left and right shell items remain visible.
- [x] **AC-007:** User can create a new tag with or without a color, later set
  or clear its color, see the visual indicator in tag affordances, and assign
  the tag to a sample.
- [x] **AC-008:** User can rename a tag — the rename reflects on all assigned samples.
- [x] **AC-009:** User can delete a tag — it is removed from all assigned samples.
- [x] **AC-010:** "Unsorted" is the only hardcoded category tile; all other root categories are derived from the sample-folder structure (each top-level subdirectory becomes a category).
- [x] **AC-010a:** User can create a new custom top-level category via the manage panel.
- [x] **AC-010b:** User can create and delete a subcategory under any category;
  the manage panel exposes the full hierarchy and the browser tree displays it
  correctly.
- [x] **AC-011:** Filtering by a category shows samples in that category AND all its descendants.
- [x] **AC-012:** User can save the current filter/search state as a named library.
- [x] **AC-013:** Opening a saved library restores its filters and shows the matching samples.
- [x] **AC-014:** Deleting a library removes only the saved query — samples and tags are unaffected.
- [x] **AC-015:** Automatic and manual incremental sync detect new, changed,
  missing, and restored files; changed files preserve their tags. Existing
  indexed samples remain usable, and cancellation retains committed batches.
- [x] **AC-015a:** Folder selection/restoration schedules at most one sync for
  that root during the app session. The worker-owned scheduler uses
  `FolderRef.id`, duplicate requests return the active job identity, and view
  changes never start another job.
- [x] **AC-015b:** A second automatic sync over an unchanged corpus performs
  zero metadata parses and zero sample analyses, including for persisted
  terminal metadata failures. Manual Re-scan may explicitly retry unavailable
  metadata.
- [x] **AC-015c:** A completed empty folder is a ready indexed root, while a
  cancelled or failed first sync remains incomplete and offers contextual
  Retry.
- [x] **AC-015d:** Root/job identity prevents progress or completion from an
  old folder being applied after the active Sample Folder changes.
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
- [x] **AC-018:** Sample actions use an accessible, viewport-aware context menu;
  the category/sample separator works by pointer, touch, and keyboard; and scan
  progress exposes native progress semantics plus visible status text.

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
- No dedicated detail pane inside the browser region; selected-sample details
  are footer-hosted.
- No library export or sharing.
- No tag import/export.
- No batch tag operations (select multiple samples, apply tag to all).

## References

- [Current project data-model.md](../data-model.md) — SQLite schema, FTS5, indexes, category tree queries.
- [Current project indexing.md](../indexing.md) — Two-phase scan, change detection, incremental re-scan.
- [Current project query-schema.md](../query-schema.md) — `rule_json` predicate-tree format for saved libraries.
- [Current project architecture.md](../architecture.md) — Virtualization requirement, SQLite-in-backend-worker constraint.
