# Spec 018 — MixJam Generator Wizard

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** IMPLEMENTED — the wizard, registry, job
lifecycle, transactional save, and regeneration paths ship. Human listening
sign-off on the musical output remains open (spec-021).

**Depends on:**

- spec-003 (Folder & App State Management)
- spec-004 (Sample Library)
- spec-008 (Sample Analysis)
- spec-011 (Project Save & Load and its generator metadata contract)
- spec-021 (Generator Arrangement Model)

## Objective

Add a one-click **MixJam Generator** wizard in the Home view. It turns an
analyzed Sample Folder into a ready-to-play `.mixjam` project. The repository
bundles its profiles as auto-discovered JSON templates. Adding another valid
template must require only one new JSON file, with no TypeScript, engine,
worker, or UI registration change.

The feature serves first-time producers and users of vintage software such
as eJay or Sony Acid. It is a style-guided arrangement tool. It does not claim
to infer a genre from audio analysis.

**This spec owns the product contract** — the Home card, the wizard, parameters,
the template registry, job lifecycle, naming, transaction, metadata, and
regeneration. **Spec-021 owns the musical contract** — the occupancy envelope,
section arcs, boundary ops, pool coherence, and mix/FX/pan. A change to what the
arrangement sounds like belongs there, not here.

## User Stories

- **US-001:** As a user, I see a **Generate MixJam** card after I select a
  Sample Folder. I can start a song without manual sample placement.
- **US-002:** As a user, the wizard waits for the current sync and analysis job.
  Generation then uses a stable analyzed snapshot.
- **US-003:** As a user, I can choose a profile, BPM, intensity, duration, and
  seed before generating.
- **US-004:** As a user, the same seed, profile version, generator version, and
  corpus snapshot produce a semantically equivalent project.
- **US-005:** As a user, the app saves the generated project transactionally in
  my User Folder. It uses a non-overwriting name and appears in the MixJam Browser.
- **US-006:** As a user, I see a clear error when the planner cannot fill required
  sample roles. The app never exposes a partial project.
- **US-007:** As a user, I can regenerate a saved generated project either
  exactly or explicitly against the current corpus.
- **US-008:** As a user, generated sample bubbles keep the same source-group
  colors as the same samples in the Sample Browser.
- **US-009:** As a user, generated songs use compatible material and a
  recognizable arrangement arc instead of continuously tiling samples.
- **US-010:** As a user with a mixed Sample Folder, I choose one coherent
  analysis cluster. The app does not use a misleading root-wide BPM median.

## Scope

### Home view entry

The Home workflow column includes an independent **Generate a MixJam** sibling
card below Library Setup and Create or Open. A Sample Folder selection shows the
card. The action requires access to both folders and a writable User Folder. The
card remains at normal contrast while unavailable. The app disables only its
secondary action. It keeps the prerequisite visible and links it through
`aria-describedby`.

Scanner progress appears only in Library
Setup. The generator card does not duplicate it.

Its states are:

- **Ready:** the User Folder is writable and the selected root has a completed
  sync and analysis job. **Generate** opens the wizard.
- **Preparing:** the root has a usable index but its current sync or analysis is
  still running. The app disables **Generate MixJam**, and the card shows
  the backend readiness reason while Library Setup shows progress. It does not
  start a duplicate job.
- **Needs preparation:** the root has no completed current analysis. **Prepare
  library** starts or awaits the existing sync/analysis lifecycle.
- **Empty or unavailable:** the card explains that the folder has no usable audio
  or that the app cannot read it. The card offers the existing retry path.

### Wizard flow

The wizard is a blocking modal with two steps:

1. **Parameters** — choose analysis cluster when needed, profile, BPM, intensity,
   duration, and seed.
2. **Generate** — show planning, selection, arrangement, and save progress. Then
   show the saved artifact and an **Open in Player** action.

There is no preview step. Planning happens once when the user clicks Generate.
The wizard keeps focus inside it and suppresses ordinary Player and transport
hotkeys. Closing it returns focus to the Home generator action or the
Player project-menu trigger that opened regeneration.

The worker returns a neutral, corpus-bound generator DTO from the shared
BackendAPI contract. The renderer adapts that DTO to `ProjectData` and commits
the exact plan through the production serializer and User Folder save path.
Commit begins automatically after plan validation. There is no second
confirmation. Any planning or selection error occurs before a file commit.

### Parameters

| Parameter | Type | Default | Contract |
| --- | --- | --- | --- |
| `tempoClusterPrefix` | analyzer context key | the only coherent group; unset for a mixed root | required when the root exposes more than one generator-eligible group |
| `profileId` | registered template ID | the template marked `default`; `techno` in the shipped set | any ID in the validated bundled-template registry |
| `bpm` | integer or `follow detected` | selected-cluster BPM | clamped to 60–180; mode and resolved value are both saved |
| `intensity` | enum | `medium` | `low`, `medium`, `high` |
| `durationSeconds` | integer | `180` | 30–600 seconds, one-second step |
| `seed` | safe token | generated hex | 1–64 ASCII characters matching `[A-Za-z0-9_-]+` |

The Parameters step shows each resolved group's context key, representative BPM
and key, confidence, and sample count. The wizard selects a single coherent group
without an extra choice. A mixed root requires an explicit group selection and is
never silently treated as one corpus. Unresolved groups are not selectable.

BPM defaults to the selected cluster's representative BPM. When analysis has no
confident tempo, `follow detected` is unavailable and the user must choose Fixed
BPM. That input falls back to 128 for editing. The `follow detected` choice
recomputes its value when the selected cluster snapshot changes. The generator
never takes a median over the complete Sample Folder.

The generator does not infer genre from
folders or acoustic analysis. Intensity is a fixed medium default because the
analysis pipeline has no arrangement-intensity signal.

Spec-021 defines the intensity changes.

This formula converts the duration target to whole 8-bar phrases:

```text
targetBars = 8 * roundHalfUp(durationSeconds * bpm / 1920)
```

The result is at least eight bars, so the generator uses eight-bar phrases. A
trailing partial phrase reads as a mistake in dance music. The generated project
ends exactly at `targetBars * TICKS_PER_BAR`. At 140 BPM and 180 seconds this is
104 bars and 3,328 ticks. The wizard reports the quantized duration produced by
the nearest whole-phrase result.

### Bundled template discovery and schema

The repository maintains product generator profiles as JSON files directly under
`src/shared/generator-templates/templates/`.
`src/shared/generator-template-sources.ts` lists them explicitly and the registry
validates them into one immutable set.
Membership is a build-time list, not a runtime file-system scan or glob.
The shipped engine must stay importable from a plain Node process.
Thus, the headless CLI can exercise it.

The worker and UI consume that registry. Neither keeps an enum, switch,
import list, nor separate registration table of profile IDs.

The bundled template schema is a closed, versioned contract. The runtime
validator is authoritative. `src/shared/generator-templates/schema.json` mirrors
it for editor feedback. Unknown fields, unknown enum values, and unsupported
schema versions are errors rather than forward-compatible guesses. Schema version
2 contains:

| Field | Contract |
| --- | --- |
| `$schema` | Optional editor hint pointing at the bundled schema; it does not affect planning. |
| `schemaVersion` | Integer `2`; versions the JSON document shape independently of musical profile revisions. |
| `id` | Stable lowercase ID matching `[a-z0-9]+(?:-[a-z0-9]+)*`; persisted as `generator.profileId`. |
| `label` | Non-empty user-facing string of at most 64 characters; never used for branching or deterministic selection. |
| `version` | Positive integer persisted as `generator.profileVersion`; bump it whenever a planning field changes in a way that can change the generated project, including adding or editing an arc. |
| `order` | Optional non-negative integer used for UI order; omitted values sort as `1000`, ties by `label`, then `id`. |
| `default` | Optional boolean; at most one bundled template may set it. Techno is the shipped default; the first sorted template is a defensive fallback only. |
| `bpmTolerance` | Finite BPM distance from 0 through 60 used to rank compatible candidates. |
| `coreLanes` | Unique lane indexes that must be active in every arc and must find compatible material. |
| `returns` | Up to two return buses, each naming a module (`aetherform-reverb`, `echoform-delay`), a built-in preset name, and a return level. A module may appear once. |
| `arcs` | One or more named arcs. Each holds ordered sections with unique names, positive weights totalling 100, valid indexes covering every lane, a phrase mode, and optional boundary operations. |
| `lanes` | Exactly 16 unique lane plans with type chains, span limits, roles, optional patterns or transitions, gain, pan, and one send level per declared return bus. |

Every referenced lane index must exist. Lane, section, and arc names are unique
within their scope. Beat offsets are unique integers from 0 through 31.
Percussion lanes require a beat pattern and are the only lanes that may declare
beat patterns or mutations.

Transition lanes require `riser` or `impact` and are
the only lanes that may declare a transition kind. A lane's declared pan is mix
position. The template parser caps it at ±0.35 (spec-021 §Pan).

Boundary ops must name a section their own arc declares. The `roll` and `tail` ops must bind to a
lane whose role can carry them. The planner deletes empty removable support lanes before
save, while the project retains from 8 through 32 populated lanes.

The filename stem must equal `id` exactly, so `techno.json` contains
`"id": "techno"`. IDs must be unique across all discovered files. A filename
mismatch, duplicate ID, duplicate lane, section, or arc name, multiple defaults,
malformed JSON, or schema/semantic failure rejects the complete registry. The app
must not omit only the bad template and continue with a partial set. The registry
validates before parameter validation or planning uses it. An unknown
`profileId`, invalid registry, or unsupported `schemaVersion` fails before a
corpus snapshot, fingerprint query, candidate query, or audio read.

Changing only `$schema`, `label`, `order`, or `default` does not require a
`version` bump because those fields do not affect a plan. Changing any other
planning field — including an arc — requires a bump. The ID itself is stable.
Changing it creates a different profile. A stored project supports exact
regeneration only when the running registry contains that same ID at that same
`profileVersion`. The app never substitutes a newer version silently.

The engine operates only on a validated template and generic acoustic-role,
section, phrase, op, transition, and lane-mix primitives. It must not compare a
template ID, label, filename, or genre name. Adding a template may compose the
schema's existing primitives. Adding a genuinely new musical primitive is a
schema-and-engine feature, not profile registration.

### Runtime and query ownership

The backend worker owns database access, cluster-scoped candidate filtering,
corpus snapshot creation, bounded planner scoring, and deterministic planning.
The renderer never pulls the full sample library into the UI. A
generator-specific BackendAPI operation returns a bounded, neutral
`MixJamGeneratorPlan` DTO. Shared API types must not import renderer project,
lane, or audio-processor types.

Each lane plan contains its final gain, pan, and
send vector. The plan's `returns` list names the buses the renderer configures.
The engine creates no mirror lanes: no stereo-side evidence exists, so every
lane plan carries a null `stereoPairId`.

Parameter validation, the worker, and the profile picker share the validated-template
registry. The picker renders registry metadata in `order`, `label`,
`id` order and sends the selected stable ID. The profile and arrangement engine
is pure and consumes one validated template plus enriched candidate DTOs. The
worker owns bounded file reads and transient arrangement scoring outside that
pure boundary. **Spec-008 remains the only owner of stored BPM, key, sample-type,
and pool-token semantics.** The renderer owns `serializeProject`, User Folder
writes, recent-project updates, and opening the resulting project.

Worker filtering must support:

- `rootId` scoping,
- a current, resolved `tempoClusterPrefix` context key,
- acoustic `sampleType` role filters plus role-folder diversity,
- positive duration and role-specific duration limits,
- current `scan_state = 1` metadata rows only,
- deterministic ordering and bounded result sets, and
- soft distance from the resolved project BPM, hard rejection of incompatible
  known keys, and the pool-coherence constraint in spec-021.

The candidate query derives the top-level source group from the relative path and
converts it to a palette slot from 0 through 8. A source group never fills or
replaces an acoustic role. Every generated placement DTO carries the selected
sample's slot, and the renderer persists it through the existing spec-011
placement field.

Selection hashes the safe seed with the profile ID, profile version, and stable
lane index, then sorts by hash and relative path. Stable relative-path
tie-breaking is mandatory. The planner prefers rows with current readable metadata.

The renderer calls the existing missing-file check for every selected `sampleRef`
immediately before save. Any now-unreadable selection aborts the transaction.
Missing compatible material for a core lane produces a clear error. The planner
prunes an unfilled removable support lane before save.

Compatible secondary types may supplement primary types for variety. The app reports every used secondary type
in the Generate result. Transition roles prefer a matching analyzed riser or
impact. A typed FX candidate classified as texture may provide the same boundary
event when transient scoring does not label it confidently. The planner rejects
a known opposite transition kind.

The generator derives placement IDs from the seed, profile ID, profile version,
stable lane index, and ordinal. Generator code must not use `Date.now()`, `randomUUID()`, or
a process-global sequence.
Lane IDs use the same stable inputs and the template lane key.
They do not use the final array position.
Thus, support-lane removal does not change a surviving lane ID.

### Planning job lifecycle

The renderer creates a transient job ID and starts one root-scoped planning
request whose validated parameters carry the selected context key. Progress
events use the root and job identity and report `shortlisting`, `analyzing`, or
`arranging`, plus completed and total candidate counts where applicable.
`analyzing` here means bounded planner scoring, not BPM/key/type analysis. The
wizard shows the active phase instead of one indefinite Generating label.

The renderer owns one explicit planning or saving state per job ID. Cancelling
planning immediately releases that UI state, and progress, success, failure, or
cleanup from an older job cannot update a reopened or newer run. Close, Escape,
backdrop, and Cancel all cancel during planning. The renderer blocks every dismissal path
only after the renderer enters the saving state.

The worker serializes generator planning with sync and analyzer writes. User
cancellation, Sample Folder replacement, selected-cluster invalidation, or worker
shutdown marks the job cancelled. The worker checks cancellation between file
reads and before returning a plan. Cancellation before commit creates no file.

If a completed automatic job is current for a root, the app suppresses another
automatic sync request. It does not cancel active generation for that root.
The worker scopes readiness responses to the current root and request generation.
Thus, a stale response cannot update a new root's card.

Once the renderer starts its short transactional save, it disables cancellation. A write
failure before file creation completes removes the incomplete allocation and
leaves no recent-project row.

### Output, naming, and transaction

The renderer serializes the complete project with `serializeProject` and saves it
inside the User Folder. The filename uses the validated safe profile ID, BPM,
intensity, and a short digest of the safe seed:

```text
<profile>-<bpm>bpm-<intensity>-<seed-digest>-001.mixjam
```

The single-tab app serializes allocation and checks existing names. The
next suffix is one greater than the highest existing matching suffix, or `001`
when none exists. Deleted gaps are never reused, so suffixes remain monotonic.
The allocator never overwrites a project found by that check. Browser File System
Access has no cross-process exclusive-create primitive, so races with external
filesystem writers are outside this contract.

The app updates the recent-project registry only after the final write succeeds. Writes use the existing atomic File
System Access behavior. Successful file creation is the durable commit. A later
recent-project registration or list-refresh failure preserves and returns the
saved relative path and shows a recoverable warning. It does not delete the
project or report generation failure.

After a successful save the wizard remains on its completion state. The user must
click **Open in Player** explicitly.

### Generator metadata and regeneration

Generated projects use the strict spec-011 project format and persist:

```json
{
  "generator": {
    "generatorVersion": 3,
    "profileId": "techno",
    "profileVersion": 6,
    "seed": "safe-token",
    "parameters": {
      "bpmMode": "follow-detected",
      "resolvedBpm": 140,
      "tempoClusterPrefix": "House",
      "intensity": "medium",
      "durationSeconds": 180
    },
    "corpusFingerprint": "...",
    "sampleFolderKey": "..."
  }
}
```

The serializer writes the template JSON field `version` as `profileVersion`.
`schemaVersion` versions the bundled JSON document shape and is not a project
parameter. The seeded arc selection is not a stored parameter either: seed plus
profile version selects it, so exact regeneration reproduces it.

The fingerprint remains a canonical hash of the complete indexed root snapshot
before cluster selection and parameter-specific shortlisting. It covers every
current generator-eligible row plus the canonical root analysis summary and its
resolved groups. The hash contains the stable FolderRef root key.
For each sorted record, it contains path, size, mtime, revisions, duration,
BPM, key, type, source-group name, and palette slot.
The fingerprint excludes timestamps because a no-op re-scan must preserve it.
Transient planner metrics and audio-byte hashing are out of scope.

**Regenerate** always creates a new artifact. Exact regeneration first resolves
the stored `(profileId, profileVersion)` pair against the validated bundled
registry. It uses that exact template, stored parameters, and seed and requires a
matching fingerprint, root, and cluster key. A matching ID at a different version
is not exact, and the app must never substitute it silently. Current-corpus regeneration
opens Parameters prefilled from metadata. If the stored cluster no longer exists,
the user must select a current cluster and confirm that semantic change.

Current-corpus regeneration may produce different selections. Both paths use the
same transactional save and monotonic naming rules.

The loaded project menu exposes **Regenerate** only for a valid generator block.
The app must support its generator version.
The running app must register the exact profile ID and version.

### Developer entry points

`npm run generate:mixjam` is a headless CLI over the shipped engine, and
`npm run audit:mixjam` reports the spec-021 envelope for any `.mixjam` file. They
are developer tools for exercising and measuring the engine without Electron, a
prepared index, or a UI. They are not product surfaces, and they are never wired
into the `generate-mix` skill — manual and programmatic generation are separate
tracks.

## Acceptance Criteria

- [x] **AC-001:** The Home workflow column shows Generate a MixJam as an
  independent sibling card. It appears after the user selects a Sample Folder.

  The card stays at
  normal contrast while its secondary action requires a writable User Folder.
  During active sync or analysis, the disabled action
  has a visible readiness reason linked through `aria-describedby`. Only Library
  Setup shows progress. The card loads readiness without an open dialog. It
  refreshes readiness as library preparation changes state.
- [x] **AC-002:** The wizard is a blocking modal with exactly two steps:
  Parameters and Generate. It traps focus, suppresses ordinary Player and
  transport hotkeys, restores focus to its opener, and has no preview step.
- [x] **AC-003:** The Parameters step lists every validated bundled template in
  deterministic registry order.
  It shows selected-cluster BPM and medium intensity.
  It permits 30–600 second duration and a validated safe-token seed.
  A mixed root requires
  coherent cluster selection and never defaults from a root-wide median.
- [x] **AC-004:** Duration uses nearest whole-phrase, half-up rounding.
  The project ends exactly at the resulting bar boundary.
  No placements overlap on a lane.
- [x] **AC-005:** Generation requires no active sync or analyzer job for the
  selected root. The selected analysis group must be current. Preparation
  reuses the existing scheduler and does not start duplicate work.
- [x] **AC-006:** Missing compatible material for a core lane fails with a clear
  error before the app writes a file. The planner removes an unfilled removable
  support lane. Generation still succeeds while 8–32 lanes stay populated.
- [x] **AC-007:** Two runs use the same seed, registered profile ID, profile
  version, generator version, root, cluster, and corpus fingerprint.
  They produce semantically equivalent plans and the same seeded section arc.
- [x] **AC-008:** A generated project passes a full strict spec-011 roundtrip.
  Every emitted placement, lane, and bus satisfies the loader.
  All placements for one `sampleRef` use the same `durationTicks`.
  This behavior satisfies spec-011 AC-016.
  Thus, scheduler shortening applies at every site.
  Placement and lane IDs derive only from stable seeded inputs —
  never from wall-clock time, a UUID, or array position.
- [x] **AC-009:** Planner scoring uses analyzer-owned BPM, key, and sample type.
  It does not recompute or rewrite them.
  One job tries at most 160 unique files and 96 analyses.
- [x] **AC-010:** The app serializes output allocation. Allocation is
  transactional, monotonic, and non-overwriting. A failed write leaves no partial
  project and no recent-project row. A post-commit registry failure keeps the saved project and
  reports a recoverable warning.
- [x] **AC-011:** Exact regeneration creates a new artifact. It requires a
  registered profile ID and version. The fingerprint, root, and cluster must match.
  A version mismatch offers current-corpus regeneration
  instead of silently substituting a newer template.
- [x] **AC-012:** Add one valid `<id>.json` file and its source-list entry.
  This registers picker, validation, planning, and metadata support.
  No other code change is necessary.

  Registry construction rejects malformed JSON, unsupported schema versions,
  unknown fields, filename/ID mismatches, duplicate IDs, multiple defaults, and
  semantic violations. Any such error rejects the whole registry. Ordering uses
  `order`, then `label`, then `id`. A fixture of 250 valid unique templates
  validates and exposes all templates.

Musical acceptance criteria — density, arcs, ops, pool coherence, mix, FX, and
pan — live in spec-021.

## Implementation Ownership

- `src/shared/generator-templates.ts` owns JSON parsing, schema and semantic
  validation, atomic registry construction, deterministic ordering, default
  selection, and the registered version map.
  `src/shared/generator-template-sources.ts` owns bundled membership.
  `src/shared/generator-templates/schema.json` mirrors the runtime contract for
  editor feedback. `src/shared/generator-templates/templates/*.json` owns all
  bundled profile labels, versions, arcs, lane roles, mix values, and returns.
  There is no second profile list in backend or UI code.
- `src/shared/backend-api.ts` exposes profile IDs as validated registry strings,
  not a closed union.
- The spec-008 analyzer owns group readiness and raw BPM/key evidence. It owns
  the stored BPM/key/type projections and the pool token.
- `backend/generator-library.ts` owns root/cluster-scoped readiness, bounded
  candidate queries, source-group palette retention, the derived pool token, and
  the canonical indexed-root fingerprint.
- `backend/generator-analysis.ts` owns deterministic lane shortlisting, bounded
  file reads, transient arrangement metrics, transition hints, progress, and
  cancellation. Its tests must prove that planning does not recompute BPM, key,
  or acoustic sample type.
- `backend/generator-engine.ts` owns pure deterministic arc, section, phrase, op,
  placement, gain, and pruning planning from generic template primitives.
- `backend/generator-selection.ts` owns compatible candidate ranking, family
  selection, and motif choice. `backend/generator-determinism.ts` owns shared
  seed hashing, stable ordering, and deterministic sampling. No umbrella
  planning module re-exports these owners or creates a cycle between them.
- `backend/generator-parameters.ts` validates the complete request, including a
  registry lookup for `profileId`, before worker I/O. `backend/musical-key.ts`
  owns enharmonic parsing shared by manual analysis validation and generator
  compatibility.
- `project/generated-project.ts`, `hooks/useMixJamGenerator.ts`, and
  `components/MixJamGeneratorDialog.tsx` adapt and commit the neutral plan.
  These modules create declared return buses and expose cancellation and progress.
  They render registry profiles and keep Open in Player explicit.
- `project/generator-support.ts` owns persisted generator-metadata
  interpretation, including the exact generator-version and registered
  profile-ID/version support check.
- `tests/e2e/mixjam-generator.spec.ts` defines the built-Electron color,
  generation, open, and playback checks.

## Validation

```sh
npm test -- src/shared/generator-templates.test.ts
npm test -- src/renderer/src/backend/generator-engine.test.ts
npm test -- src/renderer/src/backend/generator-analysis.test.ts
npm test -- src/renderer/src/backend/generator-library.test.ts
npm test -- src/renderer/src/backend/generator-parameters.test.ts
npm test -- src/renderer/src/backend/filename-evidence.test.ts
npm test -- src/renderer/src/project/generated-project.test.ts
npm test -- src/renderer/src/project/project-file.test.ts
npm test -- src/renderer/src/hooks/useMixJamGenerator.test.ts
npm test -- src/renderer/src/components/MixJamGeneratorDialog.test.tsx
```

```sh
npm run typecheck
npm run lint
npm run build
npx playwright test tests/e2e/mixjam-generator.spec.ts --project=electron-e2e
```

Real-corpus verification records the selected context key, group summary,
cluster fingerprint, parameters, seed, and selected roles.
It records bounded planner read and analysis counts.
It proves that stored BPM, key, and sample type stay unchanged.
It records palette slots, placement count, final tick, missing references, and
parser roundtrip. Record playback proof, screenshots, and listening notes.

Include a mixed-root case in
which two cluster choices produce internally compatible candidate sets. The
musical measurement is `npm run audit:mixjam` against spec-021's envelope.

Template validation also adds a valid non-baseline fixture and proves that the
same registry-to-parameter-to-engine path plans it without source registration.
An at-least-250-template fixture proves the registry has no hand-maintained
capacity boundary.

Negative fixtures cover malformed values, schema errors,
unknown schema fields and versions, and filename/ID mismatches.
They cover duplicate IDs, duplicate lane, section, or arc names, and multiple defaults.
They cover invalid lane references and unsupported acoustic types.
They also cover invalid numeric ranges, pan, send vectors, and boundary ops.
A planning-boundary test asserts that rejection occurs before any corpus, query,
fingerprint, or audio-read dependency runs.

## Non-Goals and Deferred Decisions

- No separate preview step and no real-time preview inside the wizard.
- No favorite parameter presets in the first slice.
- No user-authored templates, runtime imports, runtime downloads, network
  catalog, plugin template source, or watched hot-reload directory. Templates are
  reviewed repository assets bundled at build time.
- No executable code, expressions, or scripts inside templates. JSON may only
  compose the schema's supported declarative primitives. A new primitive still
  requires a versioned schema and engine change.
- No user-selected target key in the first slice. The generator derives key preference.
- No generator-owned BPM, key, or acoustic-type analysis, waveform cache,
  full-library generator rescan, machine-learning classifier, or network analysis
  service. Bounded transient arrangement scoring remains planner work.
- No user-visible generator-version choice.
- No audio generation, stem separation, upload, cloud sharing, or project export.
- No silent regeneration against a changed corpus and no destructive replacement
  of an existing generated project.
- Genre inference from folder names or audio analysis.

## References

- `src/renderer/src/lib/arrangement.ts` — placement and span helpers.
- `src/renderer/src/project/project-file.ts` — project serialization and parsing.
- `src/renderer/src/project/project-state.ts` — canonical project defaults.
- `src/shared/backend-api.ts` — BackendAPI contract and sample types.
- `src/shared/generator-templates.ts` — bundled-template validator and registry.
- `src/shared/generator-templates/schema.json` — editor-facing template schema.
- [spec-003](spec-003-folder-app-state-management.md) — Home folders and User
  Folder access.
- [spec-004](spec-004-sample-library.md) — sample querying and indexing.
- [spec-008](spec-008-sample-analysis.md) — BPM, key, acoustic type, and pool
  token.
- [spec-011](spec-011-project-save-load.md) — strict `.mixjam` persistence and
  generator metadata validation.
- [spec-021](spec-021-arrangement-model.md) — the arrangement model, occupancy
  envelope, boundary ops, pool coherence, and mix/FX/pan.
