# Spec 011 — Project Save & Load

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED for breaking format version 4.
**Depends on:** spec-006 (Player Timeline & Panel Layout), spec-007 (Mixer),
spec-010 (Audio Effects)

## Objective

Implement project persistence: save the current arrangement, unchanged Song
settings, lane-owned Mixer settings, sends, and four return buses to a versioned
file, and load it back to restore the full project. These values belong to the project and must not
persist as app-level state across sessions. Samples are referenced by relative
path, never embedded.

## User Stories

- **US-001:** As a user, I can save my project to a .mixjam file so I can continue
  working on it later.
- **US-002:** As a user, I can open a saved .mixjam file and the Player restores
  all lanes, placements, Song settings, lane mixer settings, sends, and return FX
  exactly as I saved them.
- **US-003:** As a user, if a sample referenced in a .mixjam file is missing,
  I see a clear warning but the rest of the project still loads.
- **US-004:** As a user, my .mixjam files include a format version so unsupported
  project formats are rejected clearly instead of being interpreted incorrectly.
- **US-005:** As a user, projects I save or open appear in the MixJam Browser
  so I can reopen them quickly later.
- **US-006:** As a user, a new project or a different project starts from its
  own saved or default Song, lane Mixer, send, and return-bus state instead of
  inheriting values from a previous app session or project.

## Scope

### Project File Format

A project is a JSON file with a `.mixjam` extension, saved to the User Folder
(spec-003). The version-4 schema without the optional generator object
is:

```json
{
  "formatVersion": 4,
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
  "lanes": [
    {
      "id": "lane-a7f3",
      "name": "Lane 1",
      "muted": false,
      "solo": false,
      "pan": 0,
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

- Each placement's `sampleRef` is a path relative to the Sample Folder root,
  never an absolute path or embedded audio bytes. `nativeBPM` is the analysis
  value captured when that placement was added; null means no native tempo was
  known, not that placed playback bypasses spec-009 tempo following.
- All placements with the same `sampleRef` use one project-owned
  `durationTicks` value. Conflicting spans are invalid project data rather than
  an implicit choice based on lane or array order.
- The 999-bar arrangement capacity from specs 005 and 006 is implicit and is
  never materialized as empty bar, beat, or tick records. A `.mixjam` file saves
  only actual project state and placement records.
- A placement end is exclusive: `startTick + durationTicks` may equal 31,968
  but may not exceed it. Capacity validation errors identify the placement's
  `durationTicks` field and state the exclusive-end calculation.
- `songEndTick` is derived on load as the latest placement end and is not stored
  as redundant timeline padding or metadata. Internal and trailing empty bars
  therefore add no project-file size.
- `song` contains every saved Song-panel control: project BPM, unchanged Master
  Volume (`masterGain`), and automatic clip-edge micro-fade settings. Live meter
  readings and transport position are runtime telemetry, not saved Song settings.
- `lanes` contains 1 through 64 entries. Each entry owns an immutable stable ID,
  arrangement data, gain, pan, mute, solo, and
  exactly four ordered sends corresponding to `FX1` through `FX4`. Array order
  is visible order. Numeric lane indices and channel IDs are not persisted.
- `fxBuses` contains exactly four entries in fixed `FX1`, `FX2`, `FX3`, `FX4`
  order. Each saves its fixed identity, module or Empty state, power, return
  level, enabled limiter, and every editable module parameter defined by
  spec-010. Returns are not lanes and do not count toward the 64-lane maximum.
- The canonical in-memory project model owns Song, lanes, placements, lane mixer
  state, the four return buses, defaults, and deep-cloning rules. Project
  serialization, New, load, and the
  MixJam Generator consume that model rather than importing persistence types
  or defaults from renderer hooks.
- `formatVersion` is incremented when the schema changes in a breaking way.
- `appVersion` records which app version saved the file.

### Strict version-4 validation

- Version 4 is a breaking boundary. The parser accepts `formatVersion: 4` only.
  It does not migrate format 3 or any other older format. An older file is
  rejected without changing active project state and reports that the file uses
  an unsupported project format and must be recreated in the current MixJam.
- Objects reject unknown keys. Required arrays and fields may not be omitted,
  duplicated, inferred, or repaired from array order.
- `lanes` must contain 1 through 64 entries. Stable lane IDs must be non-empty
  and unique. Array order defines visible order and numbering. Names must be
  trimmed and non-empty. Numeric Mixer fields must be
  finite and within their documented ranges. Every lane must contain exactly
  four finite send values in the inclusive 0 through 1 range.
- A lane owns its Mixer state. Version 4 rejects `channelId`, a top-level
  `channels` array, lane routing data, and per-channel insert FX.
- `fxBuses` must contain exactly four entries with no additions, omissions, or
  reordering. Their identities, indices, and names must be exactly
  `fx-1`/0/`FX1` through `fx-4`/3/`FX4`. Module payloads use the closed
  spec-010 union, including `{ "type": "empty" }` for Empty. Power and limiter
  fields are booleans, and return levels are finite values from 0 through 1.
- Placement validation remains strict, including safe relative paths, unique
  placement IDs, finite timing, arrangement capacity, and one consistent
  `durationTicks` for each `sampleRef`.

### Format version 4 generator metadata extension

Version 4 retains the optional project-owned `generator` object for generated
projects. Projects created or saved without it remain valid version-4 projects.

The object contains the generator version, stable profile ID and profile schema
version, safe seed, generation parameters, the indexed-corpus fingerprint, and
the Sample Folder key used for exact regeneration:

```json
{
  "formatVersion": 4,
  "generator": {
    "generatorVersion": 1,
    "profileId": "techno",
    "profileVersion": 2,
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
`@cohort/<top-level>/<SC|SL token>` key. It is stored so exact regeneration uses
the same coherent sample population. It is never an absolute filesystem path.

### Persistence Ownership

- `src/renderer/src/project/project-state.ts` owns the complete in-memory
  project state (Song, lanes, placements, lane Mixer state, and four buses), its canonical defaults,
  explicit cloning, and the nested transport-replacement shape. Save, load,
  New, and generator paths use this factory instead of reconstructing flattened
  field lists. The project-file module owns
  format validation and unsupported-version rejection, but it reuses this
  neutral state contract so
  adding a Song setting cannot silently omit a replacement or default path.
- Song settings, lane Mixer settings, sends, and return FX exist in memory while
  a project is active and persist only when written into that project's
  `.mixjam` file.
- Project-owned values must not be stored in or restored from `localStorage`,
  IndexedDB, OPFS app state, the recent-project registry, or another app-level
  persistence mechanism.
- Starting a blank project initializes BPM to 120, preserves the documented
  Master defaults, creates exactly eight lanes with default Mixer state and four
  0% sends, and creates the four fixed buses with Empty modules, module-host
  default power, 100% return level, and enabled limiters. Opening
  a project replaces all current project-owned state with that file's state;
  values are never merged with the previous project or session.
- App preferences that do not affect the song or its sound may remain app-level
  state. Examples include the selected Bottom Workspace tab, panel sizes,
  and collapsed panels.
- Closing with unsaved Song, lane Mixer, send, or return-FX changes may lose those changes because
  auto-save and crash recovery are out of scope.

### Repository Mixer Test-Song Generator

The repository provides a Node/TypeScript generator for durable manual-test
projects. It exercises the same `createDefaultLanes`, `placeSampleOnLane`,
`serializeProject`, and `parseProject` APIs used by the application instead of
driving the UI or hand-writing project JSON.

This developer fixture tool is not the spec-018 MixJam Generator wizard. Its
fixed 140 BPM, 70-bar, Ibiza-inspired contract exists for repeatable repository
testing; it does not constrain the product wizard's profiles or parameters.

- `npm run generate:mixer-test-song` reads WAV metadata from
  `tmp/test-samples` and writes an auto-incremented project such as
  `tmp/generated-songs/Ibiza-Melodic-Techno-Mixer-Test-001.mixjam`.
- `--samples-dir` and `--output-dir` override those defaults. To open a
  generated project, grant its output directory as the User Folder and grant
  the matching sample directory as the Sample Folder.
- Every run uses 140 BPM and a 70-bar arrangement. At 140 BPM this is exactly
  120 seconds.
- Each selected sample establishes its placement span using native BPM from
  metadata or an explicit filename label (`N BPM` or `BPM N`) when the value is
  within the product's accepted 20-400 BPM domain, otherwise the 140 BPM
  project tempo. Bare numeric filename tokens are identifiers, not tempo
  evidence. The generator persists the same native BPM provenance used for
  that calculation, matching the first-placement rule in spec-009.
- The 16 lanes have musical roles rather than arbitrary sample distribution:
  kick phrases, clap/snare, hi-hat/percussion, groove loops, bass, sequences,
  keys, stereo layers, stereo spheres, voice, rap, extra texture, and stereo
  transition FX.
- The arrangement uses a seven-section Ibiza-inspired melodic-techno arc:
  sunset DJ intro, tropical groove, melodic ascent, ocean-air breakdown,
  terrace buildup, Ibiza peak, and sunrise mix-out. The breakdown removes the
  five rhythm-and-bass lanes while melodic, atmospheric, vocal, and texture
  material continues; the peak restores all principal rhythm and melody lanes.
- The sample plan covers every folder-derived category in the current fixture
  library (`Bass`, `Drum`, `Effect`, `Keys`, `Layer`, `Loop`, `Rap`, `Seq`,
  `Sphere`, `Voice`, and `Xtra`). Stereo lanes use duration-matched left/right
  files, while mono lanes exclude either half of a discovered stereo pair.
- Each rhythmic, bass, melodic, vocal, rap, and texture lane alternates two
  distinct clips within one song. Seeded candidate ordering draws from the
  broader category pools, rejects unreadable or overlong clips, and keeps every
  generated result reproducible.
- Groove, bass, sequence, keys, stereo atmosphere, vocal, rap, texture, and
  transition roles prefer tropical, coastal, warm, and sun-themed fixture
  names when matching readable clips exist, then fall back to their broader
  category pools. This keeps the generator compatible with smaller corpora
  while making the repository corpus consistently Ibiza-inspired.
- A shared variation number selects one of four timing profiles for groove
  returns, vocal/rap calls and responses, and texture entries across the full
  two-minute arc. Runs use a generated seed by default, while `--seed`
  reproduces both sample selection and arrangement timing.
- The saved Mixer state may use deliberate lane volume and conditional pan.
  It applies non-center pan only through the shared spec-008 stereo-pair
  validator. Every Send is 0%, all four FX modules are Empty, Return levels are
  100%, and Return limiters retain their default enabled state. Developer and
  product generators never author FX or Send state.

Generated `.mixjam` files remain disposable test artifacts under `tmp/`; the
generator, its tests, and this contract are the durable repository assets.

### Save Flow

- "New" in the Middle Strip project menu starts a default project through the
  same reset path as the Home Screen's new-project action. Spec-006 owns the
  compact menu presentation.
- "Save" (Ctrl+S) writes to the current project file path.
- "Save As…" (Ctrl+Shift+S) opens a native file picker to choose a new
  location (defaults to User Folder). The chosen file must remain inside the
  User Folder; the app never writes project data elsewhere.
- Save shortcuts do not fire or suppress browser defaults from text-entry
  controls, on repeated keydown events, or while another project operation is
  busy.
- First save of a new project triggers "Save As…".
- Unsaved changes indicator: a dot/asterisk next to the project name in the
  Middle Strip. Any arrangement, Song, lane Mixer, send, or return-FX edit marks the
  project dirty.
- Save is atomic through the File System Access API writable stream: writes go
  to the implementation's temporary backing file and replace the target only
  when `close()` completes successfully. A failed write is aborted.
- A user-initiated open or save action requests access again when a persisted
  User Folder handle is in Chromium's `prompt` state. The action fails with
  the folder-required message only if access is unavailable afterward.

### Load Flow

- "Load MixJam" from the Home Screen or "Open" from the Player opens a native
  file picker filtered to `.mixjam`. The user may load a project from any
  folder because the picker grants read access to the selected file.
- A project opened outside the User Folder is a read-only import: it keeps its
  filename for display but has no current writable path. Its first Save opens
  Save As so it can be stored inside the User Folder. It does not enter the
  User Folder-relative recent-project registry until that save succeeds.
- On load:
  1. Parse JSON and validate `formatVersion`.
  2. Verify the Sample Folder contains all referenced samples.
  3. Replace the active project state with the saved lanes, placements, Song
     settings, lane Mixer state, sends, and four return buses.
  4. Missing samples show a warning badge on affected lanes.
- If `formatVersion` is not 4, show the unsupported-format message from Strict
  version-4 validation and leave the active project unchanged.

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
- Deduplication uses the relative path as the canonical key; no absolute
  filesystem paths are stored.
- Successfully opening a `.mixjam` file updates or inserts its registry entry.
- Successfully saving a new project path updates or inserts its registry entry.
- The MixJam Browser (spec-006) merges this registry with `.mixjam`
  files discovered by recursively scanning the current User Folder and
  deduplicates entries by canonical file path.
- When the rail is built, registry entries with `lastOpened` timestamps sort
  newest-first ahead of discovered-but-never-opened projects.

### Unsupported Formats

- Format version 4 has no migration from version 3 or earlier. Unsupported
  versions are rejected before project replacement or sample checks.
- App-level Song, Mixer, send, or return-FX storage from a prior format is not project data
  and must not be imported into, merged with, or allowed to override a new or
  loaded project. The spec-011 implementation may clean up those storage keys.

## Acceptance Criteria (testable)

- [ ] **AC-001:** "Save As…" writes a valid format-version-4 `.mixjam` JSON file to the chosen location.
- [ ] **AC-002:** Saving, closing the app, reopening, and loading the project
  restores all stable-ID lanes, placements, unchanged Song settings, lane Mixer
  state, exactly four sends per lane, and exactly four fixed return buses.
- [ ] **AC-003:** The unsaved changes indicator appears after any arrangement
  change, including lane add/delete/rename, or Song, lane Mixer, send, or return-FX modification
  and disappears after save.
- [x] **AC-004:** Ctrl+S saves to the current path; Ctrl+Shift+S triggers "Save As…".
- [x] **AC-005:** Loading a project with a missing sample file shows a warning badge on the affected lane(s) — other lanes load correctly.
- [ ] **AC-006:** Loading any project whose `formatVersion` is not 4 shows the
  clear unsupported-format error and does not change the active project. There
  is no version-3 migration.
- [x] **AC-007:** `sampleRef` fields are relative paths, never absolute paths, never base64-encoded audio.
- [x] **AC-008:** The project file survives a roundtrip: save → load → save produces an identical file (minus `modifiedAt` timestamp).
- [x] **AC-009:** Opening a `.mixjam` file adds or refreshes that file in the persisted recent-project registry.
- [x] **AC-010:** Saving a new `.mixjam` path adds or refreshes that file in the persisted recent-project registry.
- [ ] **AC-011:** Editing Song, lane Mixer, sends, or return FX does not write those values
  to app-level storage. Closing without saving and starting a new project uses
  the documented defaults rather than the previous session's values.
- [ ] **AC-012:** Loading project B after project A replaces all Song, lane Mixer,
  send, and return-bus state; no value from project A leaks into project B.
- [x] **AC-013:** If a saved project is edited without saving, closing and reopening the app and loading that project restores the last saved values, not the later unsaved values.
- [x] **AC-014:** User-initiated save actions can restore write access to a
  persisted User Folder handle whose permission state is `prompt`; opening a
  picker-selected project does not require User Folder permission.
- [x] **AC-015:** Save shortcuts are ignored without `preventDefault()` while
  focus is in a text-entry control, the keydown is a repeat, or project I/O is
  already busy.
- [x] **AC-016:** Loading rejects projects that assign conflicting
  `durationTicks` values to placements with the same `sampleRef`.
- [ ] **AC-017:** The repository test-song generator writes a format-4 project that
  roundtrips through the production project parser, has 140 BPM, spans exactly
  70 bars (120 seconds), contains 16 non-empty lanes, has four zero Sends on
  every lane, and leaves all four FX modules Empty.
- [x] **AC-018:** The repository test-song generator's placements cover every
  current fixture category while every saved `sampleRef` remains relative to
  the configured Sample Folder. Duration-matched stereo pairs remain paired on
  adjacent lanes.
- [ ] **AC-019:** The repository test-song project contains the documented
  seven-section Ibiza-inspired melodic-techno arrangement, uses style-biased
  sample pools,
  alternates clips on ten lanes, varies cue timing by seed, and includes
  deliberate lane volume plus only validated stereo-evidence pan.
- [x] **AC-020:** Repeated repository test-song generator runs never overwrite
  an existing project; filenames increase monotonically. A supplied seed
  reproduces the same sample selection and arrangement.
- [x] **AC-021:** The open picker loads a valid `.mixjam` file selected from
  outside the User Folder without requesting write access to that location.
- [x] **AC-022:** A project loaded from outside the User Folder has no writable
  current path; Save routes through Save As, and no write begins unless the
  selected destination is inside the User Folder.
- [x] **AC-023:** Saving a project serializes placement records without a
  preallocated 999-bar timeline, empty bar/beat/tick entries, or a redundant
  `songEndTick`; loading derives the exact end from the saved placements.
- [x] **AC-024:** Loading rejects a placement whose exclusive end tick
  (`startTick + durationTicks`) exceeds 31,968, and the validation error points
  to that placement's `durationTicks` field.
- [x] **AC-025:** Repository test-song placements calculate `durationTicks` from a
  selected sample's positive native BPM when available, otherwise from the
  140 BPM project tempo, and persist that same native BPM provenance.
- [ ] **AC-026:** New in the Middle Strip project menu starts the same exactly
  eight-lane blank project used by the Home Screen.
- [ ] **AC-027:** Saving and loading version 4 preserves the automatic clip-edge
  micro-fade enabled state and fractional 0-20 ms fade durations without
  changing the existing Master contract.
- [x] **AC-028:** New, load, save, transport replacement, and the generated test
  project use one complete nested Song-state contract and canonical default
  factory rather than independently listing Song fields.
- [ ] **AC-029:** Versions 3 and earlier are rejected clearly and atomically;
  the parser exposes no migration path into version 4.
- [ ] **AC-030:** A version-4 generator block validates, survives a load/save
  roundtrip, and preserves the profile, profile version, generator version,
  safe seed, parameters including an optional analysis-group key, corpus
  fingerprint, and Sample Folder key.
- [ ] **AC-031:** A generated version-4 project exposes its generator metadata to
  exact and current-corpus regeneration without storing it in app state or the
  recent-project registry.
- [ ] **AC-032:** Strict parsing rejects zero or more than 64 lanes, duplicate or
  malformed stable IDs, persisted numeric lane indices or channel IDs, and any
  lane whose sends are not exactly four finite 0-through-1 values.
- [ ] **AC-033:** Strict parsing rejects any bus count or order other than the
  exact `FX1` through `FX4` contract, invalid modules or numeric ranges, legacy
  `channels`/`channelId`/routing/insert-FX fields, and unknown object keys.

## Required version-4 evidence

- Project-file unit tests cover exact format-version acceptance, rejection of
  version 3, unknown-key rejection, 1/64 lane boundaries, stable IDs, lane array
  order, four sends, four ordered buses, module payloads, numeric ranges, safe
  relative paths, and unchanged placement validation.
- Project-state tests cover the exactly-eight-lane blank default, isolated
  cloning of lane mixer and return state, and atomic lane add/delete snapshots.
- Persistence integration tests cover complete replacement, dirty fingerprints,
  unsupported-format failure without state mutation, external Save As, and no
  app-level persistence of project-owned audio state.
- Built Chromium verification covers save/load roundtrips, missing-sample
  warnings, and exact restoration of lane identities, Mixer sends, return
  modules, return levels, power, and limiters.

## Non-Goals

- No project auto-save or recovery from crashes.
- No cloud sync or multi-device projects.
- No project export as audio stems or multitrack.
- No project templates or "New from template".
- No embedded sample data — samples are always referenced by path.
- No compression or binary format; projects remain plain JSON.
- No project password protection or encryption.
- No app-level persistence of Song, lane Mixer, sends, or return FX outside a
  `.mixjam` project file.
