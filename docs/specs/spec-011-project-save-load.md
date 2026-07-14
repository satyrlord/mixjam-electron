# Spec 011 — Project Save & Load

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** IMPLEMENTED
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
  "formatVersion": 1,
  "appVersion": "v0.1.0",
  "createdAt": "2026-06-28T...",
  "modifiedAt": "2026-06-28T...",
  "song": {
    "bpm": 120,
    "masterGain": 0.8
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
  value captured when that placement was added; null means native-rate playback.
- All placements with the same `sampleRef` use one project-owned
  `durationTicks` value. Conflicting spans are invalid project data rather than
  an implicit choice based on lane or array order.
- `song` contains every saved Song-panel control. For v1 this is project BPM
  and Master Volume (`masterGain`). Live meter readings and transport position
  are runtime telemetry, not saved Song settings.
- `channels` contains the complete Mixer state: channel identity and presence,
  gain, pan, mute, solo, routing, and the ordered `fx` chain. Each FX entry saves
  its effect identity, type, bypass state, and every editable parameter defined
  by spec-010. Loading must not merge channel or FX values from another project.
- `formatVersion` is incremented when the schema changes in a breaking way.
- `appVersion` records which app version saved the file.

### Persistence Ownership

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
  `tmp/generated-songs/Classic-Trance-Mixer-Test-001.mixjam`.
- `--samples-dir` and `--output-dir` override those defaults. To open a
  generated project, grant its output directory as the User Folder and grant
  the matching sample directory as the Sample Folder.
- Every run uses 140 BPM and a 48-bar arrangement. At 140 BPM this is about
  82.3 seconds, inside the required 60-to-90-second manual-test window.
- The 16 lanes have musical roles rather than arbitrary sample distribution:
  kick, clap/build, percussion, beat loop, stereo drum loop, bass, stereo
  atmosphere, stereo anthem lead, piano harmony, vocal motif, extra texture,
  and stereo transition FX.
- The arrangement compresses the classic trance energy arc into six eight-bar
  sections: DJ-style intro, theme build, percussion-free breakdown, buildup,
  full anthem, and mix-out. This follows the breakdown/buildup/anthem formal
  model documented by the [University of North Texas thesis on trance and
  house form](https://digital.library.unt.edu/ark:/67531/metadc103332/), the
  kick/offbeat-bass relationship in Ableton's
  [Making Music](https://cdn-resources.ableton.com/resources/uploads/makingmusic/MakingMusic_DennisDeSantis.pdf),
  and Native Instruments' guidance to introduce layers gradually and remove
  percussion during the
  [trance breakdown](https://blog.native-instruments.com/trance-music/).
- The sample plan covers every folder-derived category in the fixture library
  (`Bass`, `Beats`, `Drum`, `FX`, `Keys`, `Loop`, `Sphere`, `Vocals`, and
  `Xtra`) plus the root-level `Unsorted` category. Tonal material uses the
  fixture's A-keyed samples; untuned material uses X-marked samples.
- A shared variation number selects compatible sample candidates across roles.
  Runs use a generated seed by default, while `--seed` makes a result
  reproducible. The selection policy is isolated from arrangement construction
  so broader random generation can be added without changing persistence.
- The saved Mixer state uses deliberate gain and pan differences and includes
  delay, reverb, and compressor chains so the result is immediately useful for
  manual Mixer and FX testing.

Generated `.mixjam` files remain disposable test artifacts under `tmp/`; the
generator, its tests, and this contract are the durable repository assets.

### Save Flow

- "Save" (Ctrl+S) writes to the current project file path.
- "Save As…" (Ctrl+Shift+S) opens a native file picker to choose a new
  location (defaults to User Folder).
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
  file picker filtered to `.mixjam`.
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
- Legacy app-level Song, Mixer, or FX storage is not project data and must not
  be imported into, merged with, or allowed to override a new or loaded project.
  The spec-011 implementation may delete obsolete project-state storage keys.

## Acceptance Criteria (testable)

- [x] **AC-001:** "Save As…" writes a valid `.mixjam` JSON file to the chosen location.
- [x] **AC-002:** Saving, closing the app, reopening, and loading the project restores all lanes, placements, Song settings (BPM and Master Volume), Mixer settings, routing, and complete ordered FX chains.
- [x] **AC-003:** The unsaved changes indicator appears after any arrangement, Song, Mixer, routing, or FX modification and disappears after save.
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
- [x] **AC-014:** User-initiated open and save actions can restore access to a
  persisted User Folder handle whose permission state is `prompt`.
- [x] **AC-015:** Save shortcuts are ignored without `preventDefault()` while
  focus is in a text-entry control, the keydown is a repeat, or project I/O is
  already busy.
- [x] **AC-016:** Loading rejects projects that assign conflicting
  `durationTicks` values to placements with the same `sampleRef`.
- [x] **AC-017:** The generator writes a project that roundtrips through the
  production project parser, has 140 BPM, spans exactly 48 bars (about 82.3
  seconds), and contains 16 non-empty lanes.
- [x] **AC-018:** The generated placements cover every fixture category,
  including `Unsorted`, while every saved `sampleRef` remains relative to the
  configured Sample Folder.
- [x] **AC-019:** The generated project contains the documented six-section
  trance arrangement and deliberate Mixer state with delay, reverb, and
  compressor effects.
- [x] **AC-020:** Repeated generator runs never overwrite an existing project;
  filenames increase monotonically. A supplied seed reproduces the same sample
  selection and arrangement.

## Implementation Evidence

- `src/renderer/src/project/project-file.test.ts` covers strict schema
  validation, safe relative paths, version-zero migration, newer-version
  rejection, roundtrips, and dirty fingerprints.
- `src/renderer/src/backend/project-files.test.ts` covers filtered open/save
  pickers, User Folder containment, writable close/abort behavior, direct
  reads/writes, permission restoration, denial, cancellation, and
  missing-sample checks.
- `src/renderer/src/hooks/useProjectPersistence.test.ts` covers complete state
  replacement, recent-project updates, Save As, unsaved reload behavior,
  defaults, missing samples, and project A to project B isolation.
- `src/renderer/src/hooks/useMixer.test.ts` proves Mixer and FX no longer
  hydrate from or persist to app-level storage.
- `src/renderer/src/components/PlayerView.test.tsx` covers the project controls,
  keyboard shortcut ownership, dirty identity, and affected-lane warning badge.
- `tests/e2e/project-save-load.spec.ts` drives project load, Save As, new-project
  reset, Mixer/FX restoration, and missing-sample warnings in built Chromium.
- `scripts/generate-mixer-test-song.test.ts` covers production-parser
  roundtrips, exact duration, all-category sample references, the
  percussion-free breakdown and full anthem, Mixer/FX variety, seeded
  reproducibility, and exclusive auto-incremented output.
- Real-corpus generator runs against `tmp/test-samples` produced consecutive
  projects with 16 populated lanes, 447 placements, no missing sample
  references, all ten categories, and an exact final tick of 1536.
- `tmp/verify-project-save-load/evidence.md` records production-bundle browser
  assertions and screenshots.

## Non-Goals

- No project auto-save or recovery from crashes.
- No cloud sync or multi-device projects.
- No project export as audio stems or multitrack.
- No project templates or "New from template".
- No embedded sample data — samples are always referenced by path.
- No compression or binary format (plain JSON only for v1).
- No project password protection or encryption.
- No app-level persistence of Song, Mixer, routing, or FX state outside a
  `.mixjam` project file.
