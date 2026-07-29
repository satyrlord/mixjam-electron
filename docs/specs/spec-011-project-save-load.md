# Spec 011 — Project Save & Load

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED for breaking format version 7.
**Depends on:** spec-006 (Player Timeline & Panel Layout), spec-007 (Mixer),
spec-010 (Audio Effects)

## Objective

Implement project persistence. Save the arrangement, Song settings, lane Mixer
settings, sends, and four return buses to a versioned file.
Load the file to restore the complete project. These values belong to the project and must not
persist as app-level state across sessions. The project references samples by relative path.
It never embeds them.

## User Stories

- **US-001:** As a user, I can save my project to a .mixjam file.
  I can continue work on it later.
- **US-002:** As a user, I can open a saved .mixjam file.
  The Player restores all lanes, placements, Song settings, Mixer settings,
  sends, and return FX.
- **US-003:** As a user, I see a clear warning for a missing referenced sample.
  The rest of the .mixjam project still loads.
- **US-004:** As a user, my .mixjam files include a format version.
  The parser rejects unsupported formats clearly and does not misinterpret them.
- **US-005:** As a user, projects I save or open appear in the MixJam Browser.
  I can reopen them quickly later.
- **US-006:** As a user, each project uses its own saved or default state.
  This state includes Song, lane Mixer, sends, and return buses.
  A project does not inherit these values from another session or project.

## Scope

### Project File Format

A project is a JSON file with a `.mixjam` extension, saved to the User Folder
(spec-003). The version-7 schema without the optional generator object
is:

```json
{
  "formatVersion": 7,
  "appVersion": "v0.1.0",
  "createdAt": "2026-06-28T...",
  "modifiedAt": "2026-06-28T...",
  "song": {
    "bpm": 120,
    "masterGain": 0.8,
    "clipEdgeMicroFades": {
      "enabled": true,
      "fadeInMs": 2,
      "fadeOutMs": 4
    }
  },
  "masterBus": {
    "order": ["clip", "tube", "subeq", "comp", "max", "addeq", "tape", "width", "mbc", "lim"],
    "power": {
      "clip": true, "tube": true, "subeq": true, "comp": true, "max": true,
      "addeq": true, "tape": true, "width": true, "mbc": true, "lim": true
    },
    "params": {
      "gain.trim": 0, "clip.amount": 1.5, "clip.ceil": -0.5, "tube.drive": 2.5, "tube.mix": 100,
      "subeq.hp": 20, "subeq.mud": -1.5, "subeq.harsh": -1,
      "comp.thr": -16, "comp.ratio": 2, "comp.att": 10, "comp.rel": 300,
      "max.boost": 10, "addeq.low": 1, "addeq.air": 1, "tape.drive": 2, "tape.ips": 1,
      "width.width": 105, "width.mono": 120, "mbc.lo": 20, "mbc.mid": 15, "mbc.hi": 20,
      "lim.gain": 4, "lim.ceil": -1
    },
    "preset": "Cheat Sheet"
  },
  "lanes": [
    {
      "id": "lane-a7f3",
      "name": "Lane 1",
      "muted": false,
      "solo": false,
      "pan": 0,
      "stereoPairId": null,
      "gain": 0.8,
      "sends": [0, 0, 0, 0],
      "placements": [
        {
          "id": "placement-1",
          "sampleRef": "Kicks/kick_808.wav",
          "sampleName": "kick_808.wav",
          "nativeBPM": null,
          "startTick": 0,
          "durationTicks": 32,
          "durationSeconds": 0.5,
          "slot": 2
        }
      ]
    }
  ],
  "fxBuses": [
    {
      "id": "fx-1",
      "index": 0,
      "name": "FX1",
      "module": { "type": "empty" },
      "powered": true,
      "returnLevel": 1,
      "limiterEnabled": true
    },
    {
      "id": "fx-2",
      "index": 1,
      "name": "FX2",
      "module": { "type": "empty" },
      "powered": true,
      "returnLevel": 1,
      "limiterEnabled": true
    },
    {
      "id": "fx-3",
      "index": 2,
      "name": "FX3",
      "module": { "type": "empty" },
      "powered": true,
      "returnLevel": 1,
      "limiterEnabled": true
    },
    {
      "id": "fx-4",
      "index": 3,
      "name": "FX4",
      "module": { "type": "empty" },
      "powered": true,
      "returnLevel": 1,
      "limiterEnabled": true
    }
  ]
}
```

- Each placement's `sampleRef` is relative to the Sample Folder root.
  It is never an absolute path or embedded audio bytes. `nativeBPM` is the analysis
  value captured when that placement was added. Null means no native tempo was
  known, not that placed playback bypasses spec-009 tempo following.
- All placements with the same `sampleRef` use one project-owned
  `durationTicks` value. Conflicting spans are invalid project data rather than
  an implicit choice based on lane or array order.
- The 999-bar arrangement capacity from specs 005 and 006 is implicit.
  The serializer never creates empty bar, beat, or tick records. A `.mixjam` file saves
  only actual project state and placement records.
- A placement end is exclusive: `startTick + durationTicks` may equal 31,968
  but may not exceed it. Capacity validation errors identify the placement's
  `durationTicks` field and state the exclusive-end calculation.
- The loader derives `songEndTick` as the latest placement end.
  The serializer does not store it as redundant timeline padding or metadata. Internal and trailing empty bars
  therefore add no project-file size.
- `song` contains every saved project-wide sound setting.
  It contains Middle Strip BPM, Master Volume (`masterGain`), and automatic
  clip-edge micro-fade settings from Player Settings. Live meter
  readings and transport position are runtime telemetry, not saved Song settings.
- `lanes` contains 1 through 64 entries.
  Each entry owns an immutable ID, arrangement data, Mixer values, and an
  optional nullable `stereoPairId`.
  Each entry has four ordered sends for `FX1` through `FX4`. Array order
  is visible order. The serializer does not save numeric lane indices or channel IDs.

  Nothing currently sets a `stereoPairId`. The analyzer saves no stereo-side evidence, and the generator creates no mirror lanes.
  Thus, lanes store null or omit it. The format retains the field as the shared identity of a mirrored
  pair. Any placement edit on either paired lane clears the ID from both lanes.
  These edits include add, move, duplicate, replacement, and removal.

  After an edit, the ID no longer proves current content.
  Name and Mixer edits preserve it.
- `fxBuses` contains exactly four entries in fixed `FX1`, `FX2`, `FX3`, `FX4` order.
  Each saves its fixed identity, module or Empty state, power, return level, and enabled limiter.
  It also saves each editable module parameter that spec-010 defines.
  Returns are not lanes and do not count toward the 64-lane maximum.
- The canonical in-memory project model owns Song, lanes, placements, lane mixer
  state, the four return buses, defaults, and deep-cloning rules.
  Project serialization, New, load, and the MixJam Generator consume that model.
  They do not import persistence types or defaults from renderer hooks.
- The in-memory model requires all four return buses. Its construction, cloning,
  and serialization boundaries reject any other bus count before producing a
  project file.
- Increment `formatVersion` when the schema changes in a breaking way.
- `appVersion` records which app version saved the file.
- Version 7 adds the required spec-012 `masterBus` record.
  It stores an order permutation for the ten reorderable processors.
  It stores one power flag per processor and each strip parameter.
  It also stores the selected preset name or null.

  The pinned Gain Stage
  is always active and fixed before the Input Meter, so only `gain.trim`
  persists. `gain` is invalid in `order` and `power`. Spec-012 lists the
  record's rejection rules. This spec owns the wire format.

### Strict version-7 validation

- Version 7 is a breaking boundary. The parser accepts `formatVersion: 7` only.
  It does not migrate an older format.
  It rejects an older file without changing active project state.
  The error identifies an unsupported format that requires project recreation.
- Objects reject unknown keys. Do not omit, duplicate, infer, or repair required arrays and fields from array order.
- `masterBus.order` contains each of the ten downstream processor IDs exactly
  once. `masterBus.power` contains exactly those same ten keys with boolean
  values. A `gain` order entry or power key is invalid. `gain.trim` remains a
  required, finite parameter in its documented range.
- `lanes` must contain 1 through 64 entries. Stable lane IDs must be non-empty
  and unique. Array order defines visible order and numbering. Names must be
  trimmed and non-empty. Numeric Mixer fields must be
  finite and within their documented ranges. Every lane must contain exactly
  four finite send values in the inclusive 0 through 1 range.
- A lane owns its Mixer state. Format version 7 rejects `channelId`, a top-level
  `channels` array, lane routing data, and per-channel insert FX.
- `fxBuses` must contain exactly four entries with no additions, omissions, or
  reordering. Their identities, indices, and names must be exactly
  `fx-1`/0/`FX1` through `fx-4`/3/`FX4`. Module payloads use the closed
  spec-010 union, including `{ "type": "empty" }` for Empty. Power and limiter
  fields are booleans, and return levels are finite values from 0 through 1.
- Placement validation remains strict.
  It covers safe relative paths, unique placement IDs, finite timing, arrangement capacity, and one `durationTicks` per `sampleRef`.

### Format version 7 generator metadata extension

Version 7 retains the optional project-owned `generator` object for generated
projects. Projects created or saved without it remain valid version-7 projects.

The object contains generator, profile, and profile-version identifiers.
It also contains the safe seed and generation parameters.
The final fields are the corpus fingerprint and Sample Folder key for exact
regeneration:

```json
{
  "formatVersion": 7,
  "generator": {
    "generatorVersion": 3,
    "profileId": "techno",
    "profileVersion": 6,
    "seed": "safe-token",
    "parameters": {
      "bpmMode": "follow-detected",
      "resolvedBpm": 140,
      "tempoClusterPrefix": "Techno",
      "intensity": "medium",
      "durationSeconds": 180
    },
    "corpusFingerprint": "...",
    "sampleFolderKey": "..."
  }
}
```

The production parser validates the object when present, preserves it through
load/save roundtrips, and exposes it to regeneration. The object is not
app-level state and is never stored in the recent-project registry.

`parameters.tempoClusterPrefix` is optional. When present, it is the selected
spec-008 analysis-group key. It may be a relative directory prefix or a virtual
`@cohort/<top-level>/<SC|SL token>` key. The generator block stores it so exact regeneration uses
the same coherent sample population. It is never an absolute filesystem path.

### Persistence Ownership

- `src/renderer/src/project/project-state.ts` owns complete in-memory project
  state. This state contains Song, lanes, placements, Mixer state, and buses.
  The module also owns defaults, cloning, pure edits, and history shapes.
  It adapts the project state to the playback graph.

  Save, load, New, and generator paths use this owner instead of reconstructing
  flattened field lists. The project-file module owns format validation and
  unsupported-version rejection. It reuses this neutral state contract.
  Thus, a new Song setting cannot omit a replacement or default path.
- Song settings, lane Mixer settings, sends, and return FX exist in memory
  while a project is active. They persist only in that project's `.mixjam`
  file.
- Do not store or restore project-owned values in an app-level persistence mechanism.
  These mechanisms include `localStorage`, IndexedDB, OPFS app state, and the recent-project registry.
- The first project-state change marks the document dirty immediately.
  Exact fingerprint serialization can settle after a continuous gesture.
  Thus, Undo can clear the indicator without serializing each pointer move.
  Save and project replacement remain exact and immediate.
- A blank project uses BPM 120 and the documented Master defaults.
  It creates eight lanes with default Mixer state and four 0% sends.
  It creates four fixed buses with Empty modules and default power.
  Each bus has a 100% return level and an enabled limiter. Opening
  a project replaces all current project-owned state with that file's state.
  Values are never merged with the previous project or session.
- App preferences that do not affect the song or its sound may remain app-level
  state. Examples include the selected Bottom Workspace tab, panel sizes,
  and collapsed panels.
- Closing can lose unsaved Song, lane Mixer, send, or return-FX changes.
  Auto-save and crash recovery are out of scope.

### Save Flow

- "New" in the Middle Strip project menu uses the Home Screen new-project reset path.
  It starts a default project. Spec-006 owns the
  compact menu presentation.
- "Save" (Ctrl+S) writes to the current project file path.
- "Save As…" (Ctrl+Shift+S) opens a native file picker to choose a new
  location (defaults to User Folder). The chosen file must remain inside the
  User Folder. The app never writes project data elsewhere.
- Save shortcuts do not fire from text-entry controls or during repeated keydown events.
  They also do not fire while another project operation is busy. They do not suppress browser defaults in these cases.
- First save of a new project triggers "Save As…".
- Unsaved changes indicator: a dot/asterisk next to the project name in the
  Middle Strip. Any arrangement, Song, lane Mixer, send, or return-FX edit marks the
  project dirty.
- Save uses an atomic File System Access API writable stream.
  Writes use the implementation temporary backing file.
  They replace the target only after `close()` succeeds.
  The app aborts a failed write.
- A user open or save action requests access again for a saved User Folder handle in Chromium's `prompt` state.
  The action fails with
  the folder-required message only if access is unavailable afterward.

### Load Flow

- "Load MixJam" from the Home Screen or "Open" from the Player opens a native
  file picker filtered to `.mixjam`. The user may load a project from any
  folder because the picker grants read access to the selected file.
- A project opened outside the User Folder is a read-only import.
  It keeps its display filename but has no current writable path. Its first Save opens
  Save As so the user can store it inside the User Folder. It does not enter the
  User Folder-relative recent-project registry until that save succeeds.
- On load:
  1. Parse JSON and validate `formatVersion`.
  2. Verify the Sample Folder contains all referenced samples.
  3. Replace the active project state with the saved lanes, placements, Song
     settings, lane Mixer state, sends, and four return buses.
  4. Missing samples show a warning badge on affected lanes.
- If `formatVersion` is not 7, show the unsupported-format message from Strict
  version-7 validation and leave the active project unchanged.

### Recent Projects Registry

- The app persists a recent-project registry separate from the project files
  themselves.
- The project-catalog module owns registry validation, User Folder discovery,
  dead-entry removal, merging, ordering, and the bounded MixJam Browser result.
  Folder-selection state and the `mixjam.json` configuration mirror remain in
  the separate app-state module.
- Each entry stores at minimum:
  - project file path relative to the User Folder ('/'-separated)
  - display name derived from the filename
  - last-opened timestamp
- Deduplication uses the relative path as the canonical key.
  The registry stores no absolute filesystem paths.
- Successfully opening a `.mixjam` file updates or inserts its registry entry.
- Successfully saving a new project path updates or inserts its registry entry.
- The MixJam Browser (spec-006) merges this registry with discovered `.mixjam` files.
  A recursive scan finds them in the current User Folder. The browser deduplicates entries by canonical file path.
- The catalog owner binds refreshes to the User Folder and the request generation that started them.
  An older folder or refresh can return a late result or failure.
  That result cannot replace or clear the active folder project list.
- When the UI builds the rail, registry entries with `lastOpened` timestamps sort
  newest-first ahead of discovered-but-never-opened projects.

### Unsupported Formats

- Format version 7 has no migration from version 6 or earlier.
  The parser rejects unsupported versions before project replacement or sample checks.
- App-level audio storage from a prior format is not project data.
  Do not import or merge it into a new or loaded project.
  Do not let it override the project.
  The spec-011 implementation can remove those storage keys.

## Acceptance Criteria (testable)

- [ ] **AC-001:** "Save As…" writes a valid format-version-7 `.mixjam` JSON file to the chosen location.
- [ ] **AC-002:** Save the project, close the app, reopen it, and load the
  project. The load restores lanes, placements, Song settings, and Mixer state.
  It restores four sends per lane and four fixed return buses.
- [ ] **AC-003:** The unsaved changes indicator appears immediately after each arrangement change.
  Changes include lane add/delete/rename or Song, lane Mixer, send, and return-FX modifications.
  It does not wait for deferred fingerprint
  serialization and disappears after save.
- [x] **AC-004:** Ctrl+S saves to the current path. Ctrl+Shift+S triggers "Save As…".
- [x] **AC-005:** Loading a project with a missing sample shows a warning badge on each affected lane.
  Other lanes load correctly.
- [x] **AC-006:** Loading a project whose `formatVersion` is not 7 shows the clear unsupported-format error.
  It does not change the active project. There
  is no version-6 migration.
- [x] **AC-007:** `sampleRef` fields are relative paths, never absolute paths, never base64-encoded audio.
- [x] **AC-008:** The project file survives a roundtrip: save → load → save produces an identical file (minus `modifiedAt` timestamp).
- [x] **AC-009:** Opening a `.mixjam` file adds or refreshes that file in the persisted recent-project registry.
- [x] **AC-010:** Saving a new `.mixjam` path adds or refreshes that file in the persisted recent-project registry.
- [ ] **AC-011:** Editing Song, lane Mixer, sends, or return FX does not write those values
  to app-level storage. Closing without saving and starting a new project uses
  the documented defaults rather than the previous session's values.
- [ ] **AC-012:** Loading project B after project A replaces all Song, lane Mixer,
  send, and return-bus state. No value from project A leaks into project B.
- [x] **AC-013:** Edit a saved project without saving, then restart the app.
  Loading restores the last saved values, not the unsaved values.
- [x] **AC-014:** User save actions can restore write access to a saved User Folder handle.
  This applies when its permission state is `prompt`. Opening a
  picker-selected project does not require User Folder permission.
- [x] **AC-015:** Save shortcuts do not call `preventDefault()` in blocked
  contexts. These contexts include text input, repeated keydown, and busy
  project I/O.
- [x] **AC-016:** Loading rejects projects that assign conflicting
  `durationTicks` values to placements with the same `sampleRef`.
- [x] **AC-021:** The open picker loads a valid `.mixjam` file from outside the User Folder.
  It does not request write access to that location.
- [x] **AC-022:** A project loaded from outside the User Folder has no writable
  current path. Save routes through Save As, and no write begins unless the
  selected destination is inside the User Folder.
- [x] **AC-023:** Saving a project serializes placement records without a preallocated 999-bar timeline.
  It includes no empty bar, beat, or tick entries and no redundant `songEndTick`.
  Loading derives the exact end from the saved placements.
- [x] **AC-024:** Loading rejects a placement whose exclusive end tick (`startTick + durationTicks`) exceeds 31,968.
  The validation error points to that placement's `durationTicks` field.
- [ ] **AC-026:** New in the Middle Strip project menu starts the same exactly
  eight-lane blank project used by the Home Screen.
- [ ] **AC-027:** Version-7 save and load preserves automatic clip-edge fade
  state. It preserves fractional 0-20 ms fade durations.
  It does not change the Settings modal editor contract.
- [x] **AC-028:** New, load, save, transport replacement, and generated tests
  use one nested Song-state contract. They use one canonical default factory.
  They do not list Song fields independently.
- [x] **AC-029:** The parser rejects versions 6 and earlier clearly and atomically.
  The parser exposes no migration path into version 7.
- [ ] **AC-030:** A version-7 generator block validates and survives a
  load/save roundtrip. It preserves all generator identifiers and parameters.
  It preserves the optional analysis-group key, corpus fingerprint, and Sample
  Folder key.
- [ ] **AC-031:** A generated version-7 project exposes its generator metadata to exact and current-corpus regeneration.
  It does not store this metadata in app state or the recent-project registry.
- [ ] **AC-032:** Strict parsing requires 1 through 64 lanes.
  It rejects duplicate or malformed stable IDs and persisted numeric IDs.
  Each lane must have exactly four finite 0-through-1 send values.
- [ ] **AC-033:** Strict parsing requires the exact `FX1` through `FX4` bus
  order. It rejects invalid modules, ranges, legacy fields, and unknown keys.
- [x] **AC-034:** A lane's optional `stereoPairId` accepts only null or a
  non-empty trimmed string and survives save/load/save. Generated lanes always
  remain null. Any arrangement placement edit to either paired lane clears the
  identity from both lanes. Unrelated placement, name, and Mixer edits preserve
  it.
- [x] **AC-035:** Switching User Folders during project discovery ignores late success and failure from the previous folder.
  Only the
  newest request for the active folder may replace or clear the MixJam Browser
  catalog.

## Required version-7 evidence

The in-memory `ProjectState` matches the physical version-7 model: Song, lanes,
and four Return buses. Parsing, generation, dirty fingerprints, and persistence
do not synthesize or replace a second top-level channel array.

- Project-file unit tests cover:
  - exact format-version acceptance and version-6 rejection,
  - unknown keys, one-lane and 64-lane boundaries, stable IDs, and lane order,
  - four sends, four ordered buses, module payloads, and numeric ranges, and
  - safe relative paths and unchanged placement validation.
- Project-state tests cover the exactly-eight-lane blank default and isolated cloning of lane Mixer and Return state.
  They also cover atomic lane add/delete snapshots.
- Persistence integration tests cover complete replacement and immediate dirty
  state. They cover baseline reconciliation and unsupported-format failure
  without mutation. They cover external Save As and stale catalog results.
  They verify no app-level persistence of project-owned audio state.
- Project persistence owns app version, User Folder project discovery, and
  project-list refresh after a successful save. Sample-library state does not
  own or reload the project catalog.
- Built Chromium verification covers save/load roundtrips and missing-sample warnings.
  It also covers exact restoration of lane identities, Mixer sends, return modules, return levels, power, and limiters.

## Non-Goals

- No project auto-save or recovery from crashes.
- No cloud sync or multi-device projects.
- No project export as audio stems or multitrack.
- No project templates or "New from template".
- No embedded sample data — samples are always referenced by path.
- No compression or binary format. Projects remain plain JSON.
- No project password protection or encryption.
- No app-level persistence of Song, lane Mixer, sends, or return FX outside a
  `.mixjam` project file.
