# Spec 018 — MixJam Generator Wizard

**Spec Validation Status:** STUB — NOT VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-003 (Folder & App State Management), spec-004 (Sample Library),
spec-008 (Sample Analysis), spec-011 (Project Save & Load)

## Objective

Add a one-click **MixJam Generator** wizard in the Home view that turns an already
analyzed Sample Folder into a ready-to-play `.mixjam` project. The wizard collects
the analyzed sample metadata, suggests parameters that the user can change, and then
generates a new project. The generator engine is highly parametrizable so it can
produce a wide variety of genres, BPMs, genre tropes, and arrangement types.

This feature is aimed at first-time producers and at users coming from older
apps such as eJay and Sony Acid, where automatic song generation was a central
app feature.

## User Stories

- **US-001:** As a user, I see a **Generate MixJam** card on the Home view after I
  have picked a Sample Folder, so I can start a new song without manually
  browsing or placing samples.
- **US-002:** As a user, the wizard can start indexing and analysis for me if my
  Sample Folder has not been analyzed yet, so I do not have to leave the wizard to
  prepare the library.
- **US-003:** As a user, the wizard suggests sensible defaults based on the
  analyzed samples (genre, BPM, arrangement intensity), and I can change them
  before generating the song.
- **US-004:** As a user, I can provide a seed so that the same parameter choices
  produce a reproducible song later.
- **US-005:** As a user, the generated `.mixjam` file is saved automatically into
  my User Folder with a generated name and appears in the MixJam Browser, so I can
  open it immediately.
- **US-006:** As a user, I see clear feedback when the generator cannot create a
  song because the Sample Folder lacks enough variety or has no analyzed samples.

## Scope

### Home view entry

The Home view from spec-003 gains a new **Generate MixJam** card, placed next to
the existing Sample Folder and recent-projects cards. The card is present whenever
a Sample Folder is selected. Its state depends on the selected root's analysis
status:

- **Ready:** The root has `hasUsableIndex` and at least one analyzed sample.
  The card shows a primary "Generate" action that opens the wizard.
- **Needs analysis:** The root has a usable index but analysis has not finished
  (or has never run). The card shows "Prepare library" and starts the full
  sync + analysis pipeline before opening the wizard.
- **No sample folder:** The card is disabled with a hint that a Sample Folder is
  required.
- **Empty folder:** The root is indexed but contains no audio files. The card is
  disabled with an explanatory message.

### Wizard flow

The wizard opens as a modal dialog over the Home view. It has three steps:

1. **Parameters** — choose genre, BPM, arrangement intensity, and seed.
2. **Preview summary** — review the selected profile, estimated duration, and the
   sample categories that will be used.
3. **Generate** — show progress, then reveal the saved `.mixjam` file with an
   **Open in Player** action.

### Parameter surface (first slice)

The first implementation exposes four user-editable parameters:

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `genre` | enum | derived from the most common category | e.g., `house`, `techno`, `drum-and-bass`, `hip-hop`, `ambient`, `pop` |
| `bpm` | integer | derived from detected BPM distribution | clamped to 60–180, with a "follow detected" option |
| `intensity` | enum | `medium` | `low`, `medium`, `high` — drives density, layering, and FX usage |
| `seed` | string | random hex | user can regenerate or type a value; stored in the generated project |

The wizard derives the defaults from the analyzed Sample Folder:

- `genre` is guessed from the top-level category with the most samples, mapped to
  a known genre profile. If no match is found, the default is `techno`.
- `bpm` defaults to the rounded median of detected sample BPM values. If fewer
  than 10 samples have detected BPM, the default is 128.
- `intensity` defaults to `medium`.
- `seed` is generated fresh for each wizard open.

### Genre profiles

A genre profile is a parametrizable recipe that the generator uses to pick
samples, assign lanes, and build an arrangement. The first slice defines six
profiles. Each profile declares:

- required sample categories (e.g., `Drum`, `Bass`, `Loop`, `Keys`, `Voice`,
  `Effect`)
- optional sample categories that improve the result but are not required
- lane template (names, default channel assignments, pan positions)
- arrangement rules (section count, section lengths, build/breakdown placement,
  density per intensity)
- FX preset suggestions per channel

Profiles are data-driven, not hardcoded in the generator engine. The engine
consumes a profile object and the selected sample set, then produces a
`ProjectData` object that can be passed to `serializeProject`.

### Sample selection

The generator queries the backend for samples that match the active genre
profile and the selected BPM. Matching uses the existing `SampleQueryRequest`
filter surface plus the analysis fields already in the database:

- category filter for required and optional roles
- BPM compatibility around the target BPM (tolerance derived from the profile)
- duration limits per role (e.g., one-shots vs. loops)

Selection is deterministic: for each role, the engine hashes the seed with the
role key and sorts candidates by that hash, then picks the first candidate that
passes the duration and compatibility checks. A readable candidate is preferred
over a damaged or unreadable one. If a required role cannot be filled, the
wizard reports a clear error and does not generate a partial song.

Stereo pairs are discovered by naming convention (`-l`/`-r`, `(l)`/`(r)`, etc.)
within the same category, matching the logic already used in
`scripts/generate-mixer-test-song.ts`.

### Arrangement generation

The arrangement engine builds a `LaneState[]` from the selected samples and the
profile. It is parametrizable over:

- total song length in bars (default 32 bars for the first slice)
- section structure (intro, verse, chorus, breakdown, outro)
- intensity-driven layer density
- call-and-response or continuous tiling patterns
- transition FX placement at section boundaries

The engine uses the existing `placeSampleOnLane` and `placementDurationTicks`
utilities from `src/renderer/src/lib/arrangement` so that generated projects
behave like manually built projects.

### Mixer generation

The engine creates one mixer channel per lane using the profile's default gain,
pan, and FX preset assignments. The first slice keeps channel count equal to the
profile's lane template count (16 or fewer). Future slices can expand this when
spec-017 channel management is implemented.

### Output

The generated project is serialized with `serializeProject`, saved into the User
Folder with an auto-generated name, and recorded in the MixJam Browser via the
existing `recordRecentProject` path. The file name pattern is:

```text
<genre>-<bpm>bpm-<intensity>-<seed>.mixjam
```

If the name collides, a numeric suffix is appended. The saved project includes
a new `generator` metadata block that stores the seed, profile, and parameters so
that the same song can be regenerated later from the file.

### Generator script parametrizability

The generator script (the engine that runs in the backend worker or in a Node
script) is split into two parts:

1. **Profiles** — pure JSON/TypeScript data objects. Adding a new genre means
   adding a new profile file, not changing the engine.
2. **Engine** — consumes a profile, parameter object, and sample set, and returns a
   `ProjectData` object. It has no hardcoded genre knowledge.

This separation lets the project ship with a small set of profiles while keeping
the door open for user-contributed or downloadable profiles later.

## Acceptance Criteria (draft)

- [ ] **AC-001:** The Home view shows a **Generate MixJam** card when a Sample
  Folder is selected. The card state reflects whether the folder is ready,
  needs analysis, or is empty.
- [ ] **AC-002:** Clicking the card opens a wizard modal with three steps:
  Parameters, Preview Summary, and Generate.
- [ ] **AC-003:** The Parameters step defaults `genre`, `bpm`, and `intensity` from
  the analyzed Sample Folder data, and shows a generated `seed` that the user
  can edit or regenerate.
- [ ] **AC-004:** Changing the `seed` and regenerating with the same parameters
  produces the same `.mixjam` file (sample selection and arrangement are
  deterministic).
- [ ] **AC-005:** The Preview Summary step lists the selected profile, estimated
  duration, and the sample categories that will be used, with a warning if any
  required category is missing.
- [ ] **AC-006:** The Generate step shows progress while the engine selects samples
  and builds the arrangement, then saves the file and reveals an **Open in
  Player** action.
- [ ] **AC-007:** The generated `.mixjam` file is saved in the User Folder, appears
  in the MixJam Browser, and includes a `generator` metadata block with the seed,
  profile, and parameters.
- [ ] **AC-008:** If the Sample Folder is not analyzed, the wizard can trigger and
  await the sync + analysis pipeline before proceeding to the Parameters step.
- [ ] **AC-009:** If a required sample category is missing or no readable samples
  can be selected, the wizard shows a clear error and does not generate a partial
  song.
- [ ] **AC-010:** The generator engine is parametrizable: adding a new genre profile
  file and registering it does not require changing the engine's selection or
  arrangement logic.

## Non-Goals

- No real-time preview of the generated song inside the wizard. The user opens the
  saved `.mixjam` in the Player to hear it.
- No automatic upload or cloud sharing of generated songs.
- No stem separation or audio-content generation — the generator only arranges
  existing samples.
- No machine-learning-based genre/tempo analysis beyond the existing spec-008
  heuristic pipeline.
- No user-authored arrangement variations in the first slice. Variations are
  driven by the seed and the profile.

## Open Questions

- Should the wizard support saving a "favorite parameter preset" for quick reuse?
- Should the generated project automatically open in the Player after saving, or
  should the user explicitly click **Open in Player**?
- How many genre profiles should ship with the first slice? Six are proposed here.
- Should the generator prefer samples whose detected key matches a target key, or
  should it rely on BPM and category matching for the first slice?

## References

- `scripts/generate-mixer-test-song.ts` — existing CLI generator script that proves
  the sample-selection and arrangement logic for a single fixed genre.
- `src/renderer/src/lib/arrangement` — placement helpers reused by the generator.
- `src/renderer/src/project/project-file.ts` — project serialization and parsing.
- `src/renderer/src/project/project-state.ts` — default song state.
- `src/shared/backend-api.ts` — BackendAPI contract used to query samples and
  save the generated project.
- [spec-003](spec-003-folder-app-state-management.md) — Home view and folder
  state.
- [spec-004](spec-004-sample-library.md) — sample querying and library model.
- [spec-008](spec-008-sample-analysis.md) — BPM/key/type analysis that feeds
  parameter defaults.
- [spec-011](spec-011-project-save-load.md) — `.mixjam` format and MixJam Browser.
