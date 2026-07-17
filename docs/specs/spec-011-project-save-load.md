# Spec 011 — Project Save & Load

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED for format version 3, including the
optional generator metadata extension and version-2 migration.
**Depends on:** spec-006 (Player Timeline & Panel Layout), spec-007 (Mixer),
spec-010 (Per-Channel Audio Effects)

## Objective

Implement project persistence: save the current arrangement, Song settings,
Mixer settings, routing, and FX settings to a versioned file, and load it back
to restore the full project. These values belong to the project and must not
persist as app-level state across sessions. Samples are referenced by relative
path, never embedded.

## User Stories

- **US-001:** As a user, I can save my project to a .mixjam file so I can continue
  working on it later.
- **US-002:** As a user, I can open a saved .mixjam file and the Player restores
  all lanes, placements, Song settings, Mixer settings, routing, and FX settings
  exactly as I saved them.
- **US-003:** As a user, if a sample referenced in a .mixjam file is missing,
  I see a clear warning but the rest of the project still loads.
- **US-004:** As a user, my .mixjam files include a format version so future
  versions of the app can migrate old projects.
- **US-005:** As a user, projects I save or open appear in the MixJam Browser
  so I can reopen them quickly later.
- **US-006:** As a user, a new project or a different project starts from its
  own saved or default Song, Mixer, and FX state instead of inheriting values
  from a previous app session or project.

## Scope

### Project File Format

A project is a JSON file with a `.mixjam` extension, saved to the User Folder
(spec-003). Schema:

```json
{
  "formatVersion": 2,
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
      "index": 0,
      "name": "Lane 1",
      "muted": false,
      "solo": false,
      "pan": 0,
      "channelId": "ch-1",
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
  "channels": [
    {
      "id": "ch-1",
      "index": 0,
      "name": "Channel 1",
      "gain": 0.8,
      "pan": 0,
      "muted": false,
      "solo": false,
      "fx": [
        {
          "id": "fx-1",
          "type": "delay",
          "bypassed": false,
          "timeMs": 375,
          "feedback": 0.35,
          "mix": 0.3,
          "pingPong": false,
          "tempoSync": false,
          "noteDivision": "1/8"
        }
      ]
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
- `song` contains every saved Song-panel control. This is project BPM,
  Master Volume (`masterGain`), and automatic clip-edge micro-fade settings.
  Version 2 adds `clipEdgeMicroFades`. Version-1 files migrate to the enabled
  2 ms fade-in and 4 ms fade-out defaults. The version increment is required
  because this field changes rendered sound; an older build must reject a
  version-2 project instead of silently opening it without the saved envelope
  behavior. Live meter readings and transport position are runtime telemetry,
  not saved Song settings.
- `channels` contains the complete Mixer state: channel identity and presence,
  gain, pan, mute, solo, routing, and the ordered `fx` chain. Each FX entry saves
  its effect identity, type, bypass state, and every editable parameter defined
  by spec-010. Loading must not merge channel or FX values from another project.
- `formatVersion` is incremented when the schema changes in a breaking way.
- `appVersion` records which app version saved the file.

### Format version 3 generator metadata extension

Spec 018 adds a format-3 migration for generated projects. Version 3 preserves
the complete version-2 document and adds one optional project-owned `generator`
object. Projects created or saved without the generator remain valid version-3
projects with no `generator` object.

The object contains the generator version, stable profile ID and profile schema
version, safe seed, generation parameters, the indexed-corpus fingerprint, and
the Sample Folder key used for exact regeneration:

```json
{
  "formatVersion": 3,
  "generator": {
    "generatorVersion": 1,
    "profileId": "techno",
    "profileVersion": 1,
    "seed": "safe-token",
    "parameters": {
      "bpmMode": "follow-detected",
      "resolvedBpm": 140,
      "intensity": "medium",
      "durationSeconds": 180
    },
    "corpusFingerprint": "...",
    "sampleFolderKey": "..."
  }
}
```

The v2-to-v3 migration is cumulative and idempotent. It leaves existing project
state unchanged and adds no generator metadata when none was present. The
production parser must validate the object when present, preserve it through
load/save roundtrips, reject unsupported future format versions, and expose it
to the regeneration workflow. The object is not app-level state and is never
stored in the recent-project registry.

### Persistence Ownership

- `src/renderer/src/project/project-state.ts` owns the complete in-memory Song
  settings contract, its defaults, cloning, and the nested transport-replacement
  shape. Save, load, New, and generator paths pass that complete `song` object
  instead of reconstructing flattened field lists. The project-file module owns
  format validation and migration, but it reuses this neutral state contract so
  adding a Song setting cannot silently omit a replacement or default path.
- Song settings, Mixer settings, routing, and FX settings exist in memory while
  a project is active and persist only when written into that project's
  `.mixjam` file.
- Project-owned values must not be stored in or restored from `localStorage`,
  IndexedDB, OPFS app state, the recent-project registry, or another app-level
  persistence mechanism. In particular, spec-011 replaces the app-level
  Mixer/FX persistence introduced by specs 007 and 010.
- Starting a new project initializes BPM to 120, Master Volume and channels to
  their documented defaults, default 1:1 routing, and empty FX chains. Opening
  a project replaces all current project-owned state with that file's state;
  values are never merged with the previous project or session.
- App preferences that do not affect the song or its sound may remain app-level
  state. Examples include the selected Bottom Workspace tab, panel sizes,
  and collapsed panels.
- Closing with unsaved Song, Mixer, or FX changes may lose those changes because
  auto-save and crash recovery are out of scope.

### Programmatic Mixer Test Song Generator

The repository provides a Node/TypeScript generator for durable manual-test
projects. It exercises the same `createDefaultLanes`, `placeSampleOnLane`,
`serializeProject`, and `parseProject` APIs used by the application instead of
driving the UI or hand-writing project JSON.

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
- The saved Mixer state uses deliberate gain and pan differences and includes
  delay, reverb, and compressor chains so the result is immediately useful for
  manual Mixer and FX testing.

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
  Middle Strip. Any arrangement, Song, Mixer, routing, or FX edit marks the
  project dirty.
- Save is atomic through the File System Access API writable stream: writes go
  to the implementation's temporary backing file and replace the target only
  when `close()` completes successfully. A failed write is aborted.
- A user-initiated open or save action requests access again when a persisted
  User Folder handle is in the browser's `prompt` state. The action fails with
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
     settings, Mixer settings, routing, and FX chains.
  4. Missing samples show a warning badge on affected lanes.
- If the `formatVersion` is higher than supported, show: "This project was
  created with a newer version of MixJam. Please update the app."

### Recent Projects Registry

- The app persists a recent-project registry separate from the project files
  themselves.
- Each entry stores at minimum:
  - project file path relative to the User Folder ('/'-separated)
  - display name derived from the filename
  - last-opened timestamp
- Deduplication uses the relative path as the canonical key (no absolute
  filesystem paths are stored, consistent with the web-first data model).
- Successfully opening a `.mixjam` file updates or inserts its registry entry.
- Successfully saving a new project path updates or inserts its registry entry.
- The MixJam Browser (spec-006) merges this registry with `.mixjam`
  files discovered by recursively scanning the current User Folder and
  deduplicates entries by canonical file path.
- When the rail is built, registry entries with `lastOpened` timestamps sort
  newest-first ahead of discovered-but-never-opened projects.

### Format Migration

- When loading an older `formatVersion`, apply migration transforms to bring
  the data up to the current version.
- Migrations are ordered, cumulative, and idempotent.
- The loaded data is migrated in memory; the file on disk is not overwritten
  until the user saves.
- App-level Song, Mixer, or FX storage from a prior format is not project data
  and must not be imported into, merged with, or allowed to override a new or
  loaded project. The spec-011 implementation may clean up those storage keys.

## Acceptance Criteria (testable)

- [x] **AC-001:** "Save As…" writes a valid `.mixjam` JSON file to the chosen location.
- [x] **AC-002:** Saving, closing the app, reopening, and loading the project
  restores all lanes and their edited names, placements, Song settings, Mixer
  settings, routing, and complete ordered FX chains.
- [x] **AC-003:** The unsaved changes indicator appears after any arrangement
  change, including a lane rename, or Song, Mixer, routing, or FX modification
  and disappears after save.
- [x] **AC-004:** Ctrl+S saves to the current path; Ctrl+Shift+S triggers "Save As…".
- [x] **AC-005:** Loading a project with a missing sample file shows a warning badge on the affected lane(s) — other lanes load correctly.
- [x] **AC-006:** Loading a project with a `formatVersion` higher than the app supports shows an error message and does not load.
- [x] **AC-007:** `sampleRef` fields are relative paths, never absolute paths, never base64-encoded audio.
- [x] **AC-008:** The project file survives a roundtrip: save → load → save produces an identical file (minus `modifiedAt` timestamp).
- [x] **AC-009:** Opening a `.mixjam` file adds or refreshes that file in the persisted recent-project registry.
- [x] **AC-010:** Saving a new `.mixjam` path adds or refreshes that file in the persisted recent-project registry.
- [x] **AC-011:** Editing Song, Mixer, or FX settings does not write those values
  to app-level storage. Closing without saving and starting a new project uses
  the documented defaults rather than the previous session's values.
- [x] **AC-012:** Loading project B after project A replaces all Song, Mixer, routing, and FX state; no value from project A leaks into project B.
- [x] **AC-013:** If a saved project is edited without saving, closing and reopening the app and loading that project restores the last saved values, not the later unsaved values.
- [x] **AC-014:** User-initiated save actions can restore write access to a
  persisted User Folder handle whose permission state is `prompt`; opening a
  picker-selected project does not require User Folder permission.
- [x] **AC-015:** Save shortcuts are ignored without `preventDefault()` while
  focus is in a text-entry control, the keydown is a repeat, or project I/O is
  already busy.
- [x] **AC-016:** Loading rejects projects that assign conflicting
  `durationTicks` values to placements with the same `sampleRef`.
- [x] **AC-017:** The generator writes a project that roundtrips through the
  production project parser, has 140 BPM, spans exactly 70 bars (120 seconds),
  and contains 16 non-empty lanes.
- [x] **AC-018:** The generated placements cover every current fixture
  category while every saved `sampleRef` remains relative to the configured
  Sample Folder. Duration-matched stereo pairs remain paired on adjacent lanes.
- [x] **AC-019:** The generated project contains the documented seven-section
  Ibiza-inspired melodic-techno arrangement, uses style-biased sample pools,
  alternates clips on ten lanes, varies cue timing by seed, and includes
  deliberate Mixer state with delay, reverb, and compressor effects.
- [x] **AC-020:** Repeated generator runs never overwrite an existing project;
  filenames increase monotonically. A supplied seed reproduces the same sample
  selection and arrangement.
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
- [x] **AC-025:** Generated placements calculate `durationTicks` from a
  selected sample's positive native BPM when available, otherwise from the
  140 BPM project tempo, and persist that same native BPM provenance.
- [x] **AC-026:** New in the Middle Strip project menu starts a default project
  through the same complete project-state reset used by the Home Screen.
- [x] **AC-027:** Saving and loading version 2 preserves the automatic clip-edge
  micro-fade enabled state and fractional 0-20 ms fade durations. An older
  version-1 project migrates to the enabled 2 ms/4 ms defaults.
- [x] **AC-028:** New, load, save, transport replacement, and the generated test
  project use one complete nested Song-state contract and canonical default
  factory rather than independently listing Song fields.
- [x] **AC-029:** Loading a version-2 project migrates it idempotently to version
  3 without changing project state and without inventing generator metadata.
- [x] **AC-030:** A version-3 generator block validates, survives a load/save
  roundtrip, and preserves the profile, profile version, generator version,
  safe seed, parameters, corpus fingerprint, and Sample Folder key.
- [x] **AC-031:** A generated version-3 project exposes its generator metadata to
  exact and current-corpus regeneration without storing it in app state or the
  recent-project registry.

## Implementation Evidence

- `src/renderer/src/project/project-file.test.ts` covers strict schema
  validation, safe relative paths, version-zero migration, newer-version
  rejection, version-1 and version-2 migration, generator roundtrips,
  dirty fingerprints,
  sparse capacity-free
  serialization, and field-specific rejection of exclusive placement ends
  beyond tick 31,968.
- `src/renderer/src/project/project-state.test.ts` covers canonical defaults,
  nested overrides, and isolated clones for project-replacement boundaries.
- `src/renderer/src/backend/project-files.test.ts` covers filtered open/save
  pickers, external read-only opens, User Folder write containment, writable
  close/abort behavior, direct reads/writes, cancellation, and missing-sample
  checks.
- `src/renderer/src/hooks/useProjectPersistence.test.ts` covers complete state
  replacement, external-project Save As routing, recent-project updates,
  unsaved reload behavior, clip-edge micro-fade save/load/defaults, missing
  samples, and project A to project B isolation.
- `src/renderer/src/hooks/useMixer.test.ts` proves Mixer and FX no longer
  hydrate from or persist to app-level storage.
- `src/renderer/src/components/PlayerView.test.tsx` covers the project controls,
  keyboard shortcut ownership, dirty identity, and affected-lane warning badge.
- `tests/e2e/project-save-load.spec.ts` drives project load, Save As, new-project
  reset, Mixer/FX restoration, and missing-sample warnings in built Chromium.
- `scripts/generate-mixer-test-song.test.ts` covers production-parser
  roundtrips, exact duration, all-category sample references, the
  percussion-free ocean-air breakdown and full Ibiza peak, style-biased sample
  selection, Mixer/FX variety, native-BPM placement spans, seeded
  reproducibility, exclusive auto-incremented output, the inclusive 20-400 BPM
  boundary, explicit filename labels, and rejection of bare numeric filename
  tokens such as `_01_`.
- `tmp/analyze-generator-bpm/` records the 8,014-file corpus inventory that
  found no metadata BPM values, no explicit filename BPM labels, and only four
  bare numeric filenames (`007`, `303`, `404`, and `666`). The inventory is the
  evidence for treating bare filename numbers as identifiers.
- A real-corpus generator run against `tmp/test-samples` produced a project
  with 16 populated lanes, 339 placements using 26 distinct samples, no
  missing sample references, all 11 categories, and an exact final tick of
  2240.
- `tmp/verify-project-save-load/evidence.md` records production-bundle browser
  assertions and screenshots.

## Non-Goals

- No project auto-save or recovery from crashes.
- No cloud sync or multi-device projects.
- No project export as audio stems or multitrack.
- No project templates or "New from template".
- No embedded sample data — samples are always referenced by path.
- No compression or binary format; projects remain plain JSON.
- No project password protection or encryption.
- No app-level persistence of Song, Mixer, routing, or FX state outside a
  `.mixjam` project file.
