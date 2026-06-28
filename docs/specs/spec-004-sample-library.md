# Spec 004 — Sample Library Browsing, Search & Tagging

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** ⏳ NOT IMPLEMENTED
**Depends on:** spec-003 (Folder & Session Management)

## Objective

Index the user's Sample Folder, build a searchable/browsable sample library with
virtualized rendering, and enable dynamic user-defined tagging with hierarchical
categories. Libraries are saved queries, not file copies.

## User Stories

- **US-001:** As a user, I open the tracker and see my sample library
  automatically indexed from the Sample Folder — I don't have to manually
  import files.
- **US-002:** As a user, I can browse samples in a scrollable list that stays
  responsive even with thousands of files.
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
- Each file is registered in the SQLite database with: filepath, filename,
  extension, file size, modification time, and import date.
- **Phase 1 (fast):** file enumeration — files appear in the browser within
  seconds. Metadata columns (duration, sample rate, channels) are left empty.
- **Phase 2 (background):** metadata extraction — audio headers are parsed to
  fill duration, sample rate, channels. This runs incrementally and does not
  block browsing.
- A progress indicator is shown during indexing (file count, phase).
- Indexing runs on a background thread/worker — the UI stays responsive.

### Incremental Re-Scan

- On subsequent launches, the app detects changes by comparing `(file size,
  modification time)` against the database.
- New files: added as stubs, queued for metadata extraction.
- Changed files: metadata re-extracted, but user data (tags, categories) is
  preserved.
- Missing files: marked as missing (not deleted) so tags survive a temporarily
  disconnected drive. Hidden from normal browsing.
- A manual "Re-scan" action triggers a full check of the Sample Folder.

### Sample Browser Container

The sample browser occupies the bottom browser panel zone in the MixJam Player.
Its internal layout:

```text
.browser
  ├── .category-tree    — expandable category/subcategory tree (left portion)
  └── .sample-list      — virtualized sample tiles with search bar (main area)
```

- The left control column (Volume slider, dB meter, BPM slider) and mixer
  section are deferred to spec-007 (Mixer). They live in a separate container.
- A vertical resize handle separates the category tree from the sample list
  (deferred to spec-006 for full panel layout).

### Sample Browser List
- Columns: filename, duration, BPM, tags, category, date added.
- Sortable by any column (click header to toggle ascending/descending).
- Selecting a sample shows its detail: path, metadata, assigned tags.
- **Development constraint:** initial implementation targets the `tmp/test-samples`
  folder (~67 files). Scale validation against 100k+ samples is deferred.

### Full-Text Search

- A search input at the top of the sample browser.
- As the user types, results filter in real-time (debounced, ~150ms).
- Search matches against filename and filepath.
- Results respect any active tag/category filter (search within filtered set).
- Empty search query shows all samples (subject to active filters).

### Dynamic Tagging

- Users can create, rename, and delete tags.
- Tags can be assigned to one or more samples.
- Tags have an optional color for visual identification.
- Tag assignment is many-to-many: one sample can have many tags, one tag can
  apply to many samples.
- Deleting a tag removes it from all assigned samples (no orphaned references).

### Category Tree

- Top-level categories are hardcoded buttons representing common sample types
  (e.g. Bass, Drums, FX, Synth, Vocal, Loop, Percussion, Atmosphere). Users
  can add new custom top-level categories.
- Subcategories are tag-based: users create custom tags and organize them
  under any category. This is the flexible, user-driven organizational layer.
- Filtering by a category shows samples in that category AND all tags beneath
  it.
- The category tree is displayed in the browser panel as an expandable tree:
  top-level categories as root nodes, tags as children.
- Categories and tags are stored in the same `categories` table with
  `parent_id` linking children to their parent category or tag.

### Libraries (Saved Queries)

- A library is a named, saved set of filter/search/tag criteria.
- Creating a library saves the current filter state under a user-chosen name.
- Opening a library applies its saved filters.
- Libraries do not copy or duplicate sample data — they are purely saved
  queries. Editing a sample's tags automatically updates all libraries that
  reference it.
- Deleting a library only removes the saved query, never the samples.

### Performance Constraints (from architecture)

- All filtering, sorting, and searching executes against SQLite — never
  in-memory JavaScript array operations on the full dataset.
- The UI requests windowed pages of results, not the entire dataset.
- Virtualized rendering ensures constant DOM node count regardless of result
  set size.
- Full-text search returns in < 50ms against the development dataset, with
  a target of < 5ms against 100k+ rows (deferred validation).

## Acceptance Criteria (testable)

- [ ] **AC-001:** After selecting a Sample Folder, the app begins indexing and shows a progress indicator (file count).
- [ ] **AC-002:** Indexed samples appear in the browser list as they are discovered (phase 1).
- [ ] **AC-003:** Sample metadata (duration, sample rate, channels) fills in incrementally (phase 2) without blocking browsing.
- [ ] **AC-004:** The sample list is virtualized — scrolling through all indexed samples is smooth with no layout jank.
- [ ] **AC-005:** Typing in the search field filters the sample list in real-time, matching against filename.
- [ ] **AC-006:** Clearing the search field restores the full sample list.
- [ ] **AC-007:** User can create a new tag, see it in the tag list, and assign it to a sample.
- [ ] **AC-008:** User can rename a tag — the rename reflects on all assigned samples.
- [ ] **AC-009:** User can delete a tag — it is removed from all assigned samples.
- [ ] **AC-010:** Hardcoded top-level category buttons are displayed (Bass, Drums, FX, Synth, Vocal, Loop, Percussion, Atmosphere).
- [ ] **AC-010a:** User can create a new custom top-level category.
- [ ] **AC-010b:** User can create a tag as a subcategory under any category. The tree displays correctly.
- [ ] **AC-011:** Filtering by a category shows samples in that category AND all its descendants.
- [ ] **AC-012:** User can save the current filter/search state as a named library.
- [ ] **AC-013:** Opening a saved library restores its filters and shows the matching samples.
- [ ] **AC-014:** Deleting a library removes only the saved query — samples and tags are unaffected.
- [ ] **AC-015:** Re-scanning detects new, changed, and missing files; changed files preserve their tags.
- [ ] **AC-016:** The sample list can be sorted by filename, duration, and date added (ascending/descending).

## Non-Goals (deferred to later specs)

- No BPM/key auto-detection during indexing — those columns stay NULL.
  Auto-analysis is spec-008.
- No waveform preview or audio playback from the browser.
- No 100k+ scale validation — development uses `tmp/test-samples` (~67 files).
- No content-hashing for dedup or move/rename detection.
- No live folder watching (file system events) — manual re-scan only.
- No drag-and-drop from browser to tracker timeline. Tracker is spec-006.
- No library export or sharing.
- No tag import/export.
- No batch tag operations (select multiple samples, apply tag to all).

## References

- [Current project data-model.md](../data-model.md) — SQLite schema, FTS5, indexes, category tree queries.
- [Current project indexing.md](../indexing.md) — Two-phase scan, change detection, incremental re-scan.
- [Current project query-schema.md](../query-schema.md) — `rule_json` predicate-tree format for saved libraries.
- [Current project architecture.md](../architecture.md) — Virtualization requirement, SQLite-in-main-process constraint.
- [mixjam-sample-daw tech-stack §3–§4](../_archived/mixjam-sample-daw/docs/tech-stack.md) — SQLite schema, FTS5 queries, virtualized sample browser.
