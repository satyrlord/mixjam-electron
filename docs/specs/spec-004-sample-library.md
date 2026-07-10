# Spec 004 — Sample Library Browsing, Search & Tagging

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
**Depends on:** spec-003 (Folder & Session Management)

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
- **US-005:** As a user, I can organize tags into a parent/child hierarchy
  (categories and subcategories).
- **US-006:** As a user, I can filter samples by tag/category and see only
  matching results.
- **US-007:** As a user, I can save a set of filters as a named "library"
  that I can reload later.

## Scope

### First-Run Indexing

- On first launch after the Sample Folder is selected, the app scans the folder
  for audio files (`.wav`, `.mp3`, `.flac`, `.ogg`, `.aiff`).
- Each file is registered in the SQLite database with: scan root + relpath
  (path relative to the Sample Folder), filename, extension, file size,
  modification time, and import date.
- **Phase 1:** file enumeration creates stub rows. Metadata columns (duration,
  sample rate, channels) are left empty.
- **Phase 2:** audio headers are parsed to fill duration, sample rate, and
  channels. Metadata parsing uses four concurrent readers; database updates
  stay serialized in the backend worker.
- A full-screen progress overlay is shown through both phases of a folder's
  first scan. Samples are queried and displayed after `scan-done`; they do not
  appear incrementally during phase 1 or phase 2.
- Indexing runs on a background thread/worker — the UI stays responsive.

### Incremental Re-Scan

- An already indexed folder is not scanned automatically on subsequent
  launches. The user triggers change detection with Re-scan.
- New files: added as stubs, queued for metadata extraction.
- Changed files: metadata is re-extracted; tags, bpm/key fields, and original
  import date are preserved, while filesystem-derived categories are recomputed.
- Missing files: marked as missing (not deleted) so tags survive a temporarily
  disconnected drive. Hidden from normal browsing.
- A manual "Re-scan" action triggers a full check of the Sample Folder. The
  existing browser remains visible and progress is shown in the toolbar rather
  than the first-scan full-screen overlay.
- A "Cancel scan" action is available during an active scan. Cancelling bumps a
  generation counter; the in-flight scan stops at its next cancellation check.
  Already committed rows remain in the database, and the progress indicator
  resets to idle immediately.

### Sample Browser Container

The sample browser occupies the lower-right browser region in the MixJam
Player, to the right of the Song Controls rail and below the full-width Middle
Strip from spec-006. Its internal layout:

```text
.browser-region
  ├── .category-tree      — expandable category/subcategory tree (left portion)
  ├── .browser-resize-v   — internal vertical split handle
  └── .sample-pane        — main browser workspace
      ├── .browser-toolbar    — result count and filter status
      ├── .sort-row           — filename/duration/date-added sort controls
      └── .tiles              — virtualized rows of sample bubbles
```

- The Song Controls rail is a separate lower-left region from spec-006. The
  mixer column (spec-007) does not live inside the sample browser.
- A vertical resize handle separates the category tree from the sample list
  inside the browser region (defined in spec-006).
- Selected sample details do not open a third pane inside the browser region.
  They render in the center slot of the app-wide Player footer (spec-001) so
  the browser keeps its two-column tree/grid layout.

### Sample Browser Grid

- Samples render as the same fixed-height bubble used by the tracker. Bubbles
  show the filename and duration and retain identical geometry across views.
- Sort controls support filename, duration, and date added. Selecting the active
  sort again toggles ascending/descending.
- Selecting a bubble highlights it, previews its audio, and populates the Player
  footer with the path, assigned tags, and decoded waveform.
- The grid does not use inline expansion.
- Functional development and scan checks use the real fixture corpus under
  `tmp/test-samples`. Scale validation against 100k+ samples remains deferred;
  do not hardcode the fixture count because that corpus changes over time.

### Full-Text Search

- A search input lives in the browser toolbar at the top of the sample pane.
- As the user types, results filter in real-time (debounced, ~150ms).
- Search matches against filename and relpath.
- Results respect any active tag/category filter (search within filtered set).
- Empty search query shows all samples (subject to active filters).
- Search uses token-prefix matching through FTS5, not typo-tolerant fuzzy
  matching.
- Query results load as windowed pages on demand: the first page loads eagerly
  and the grid requests the next page as the user scrolls near the end of the
  loaded rows. The renderer never accumulates the full result set up front
  (revised 2026-07-02 to honour the windowed-pages hard rule; previously the
  renderer paged the entire set into memory).

### Browser Toolbar

- Left: search input.
- Middle: result count summary for the current filter/search set.
- Right: manual "Re-scan" action.
- Toolbar actions never bypass SQLite-backed query/filter flow; they only
  change the current browser query state or trigger the indexed re-scan path.

### Dynamic Tagging

- Users can create, rename, and delete tags.
- Tags can be assigned to one or more samples. Assignment UI: right-clicking a
  sample tile opens a context menu listing every tag with its assignment state;
  clicking toggles assign/unassign (added 2026-07-02 — assignment previously
  had no UI surface). Every browser item is an indexed DB row (the pre-index
  legacy folder browser was retired 2026-07-03), so tagging is always available.
- All tags render as filter chips in the browser's subcategory row; clicking a
  chip toggles that tag in the active filter (added 2026-07-02 — previously
  only already-active tags rendered, so tag filtering was unreachable).
- Tags have an optional color for visual identification.
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
- Filtering by a category shows samples in that category AND all its
  descendants (subcategories).
- The category tree is displayed in the browser panel as an expandable tree:
  top-level categories as root nodes, subcategories as children.

### Libraries (Saved Queries)

- A library is a named, saved set of filter/search/tag criteria.
- Creating a library saves the current filter state under a user-chosen name.
- Opening a library applies its saved filters: clicking a library's name in the
  manage panel parses its `rule_json` and restores the search text, category,
  and tag filters (wired 2026-07-02 — saved libraries previously had no open
  action).
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
  set size. Implementation (2026-07-02): tiles are packed into fixed-height
  rows in JS (equivalent to the previous flex-wrap layout, so bubble geometry
  is unchanged) and rows are virtualized with TanStack Virtual; only rows
  intersecting the scroll viewport are mounted. An unmeasured viewport
  (first paint, jsdom) falls back to rendering all rows.
- No current 100k-row latency claim has been measured. Any throughput or query
  latency claim must be recorded with the real fixture/library subset and the
  exact measurement procedure.

## Acceptance Criteria (testable)

- [x] **AC-001:** On a folder's first scan, the app shows a full-screen loader ("Scanning sample folder...") with phase and progress through both indexing phases.
- [x] **AC-002:** After `scan-done`, the browser queries the active folder and displays its indexed samples; first-scan results are not exposed before completion.
- [x] **AC-003:** Phase 2 persists duration, sample rate, and channel metadata; files whose metadata cannot be parsed remain stubs without aborting the scan.
- [x] **AC-004:** The sample bubble grid is virtualized — scrolling through indexed samples keeps a bounded DOM row count.
- [x] **AC-004a:** The sample browser shows a toolbar with search input, result count summary, a manual "Re-scan" action, and a "Cancel scan" action (visible only while a scan is running).
- [x] **AC-005:** Typing in the search field filters the sample grid in real-time, matching token prefixes in filename and relpath.
- [x] **AC-006:** Clearing the search field restores the full sample list.
- [x] **AC-006b:** Clearing or unselecting a category restores all matching samples across every SQLite result window, not only the first page.
- [x] **AC-006a:** Selecting a sample populates the center area of the Player footer with that sample's path, metadata, and assigned tags while the footer's left and right shell items remain visible.
- [x] **AC-007:** User can create a new tag, see it in the tag list, and assign it to a sample.
- [x] **AC-008:** User can rename a tag — the rename reflects on all assigned samples.
- [x] **AC-009:** User can delete a tag — it is removed from all assigned samples.
- [x] **AC-010:** "Unsorted" is the only hardcoded category tile; all other root categories are derived from the sample-folder structure (each top-level subdirectory becomes a category).
- [x] **AC-010a:** User can create a new custom top-level category via the manage panel.
- [x] **AC-010b:** User can create a subcategory under any category. The tree displays correctly.
- [x] **AC-011:** Filtering by a category shows samples in that category AND all its descendants.
- [x] **AC-012:** User can save the current filter/search state as a named library.
- [x] **AC-013:** Opening a saved library restores its filters and shows the matching samples.
- [x] **AC-014:** Deleting a library removes only the saved query — samples and tags are unaffected.
- [x] **AC-015:** Re-scanning detects new, changed, and missing files; changed files preserve their tags.
  The existing browser remains visible with toolbar progress, and cancellation retains already committed batches.
- [x] **AC-016:** The sample grid can be sorted by filename, duration, and date added (ascending/descending).
- [x] **AC-017:** Clicking a sample bubble previews its audio and renders its decoded waveform in the Player footer.

## Non-Goals (deferred to later specs)

- No BPM/key auto-detection during indexing — those columns stay NULL.
  Auto-analysis is spec-008.
- No 100k+ scale validation has been recorded. Functional development uses the
  changing real fixture corpus under `tmp/test-samples`.
- No content-hashing for dedup or move/rename detection.
- No live folder watching (file system events) — out of scope for v1 across
  all specs; manual re-scan only (see [indexing.md](../indexing.md#live-watching-optional-later)).
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
