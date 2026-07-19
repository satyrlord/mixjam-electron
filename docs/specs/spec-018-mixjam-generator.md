# Spec 018 — MixJam Generator Wizard

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** PARTIAL — the generator produces lane-owned
projects, excludes FX, removes empty lanes, and persists the format-4 output.
Some profile-level selection and stereo-evidence rules remain incomplete.
**Depends on:** spec-003 (Folder & App State Management), spec-004 (Sample Library),
spec-008 (Sample Analysis), spec-011 (Project Save & Load, including its
version-4 generator metadata contract)

## Objective

Add a one-click **MixJam Generator** wizard in the Home view. It turns an
analyzed Sample Folder into a ready-to-play `.mixjam` project. Repository-owned
profiles are bundled as auto-discovered JSON templates. **Techno**, **trance**,
and **house** remain the shipped baselines, but adding another valid template
must require only one new JSON file, with no TypeScript, engine, worker, or UI
registration change.

The feature is aimed at first-time producers and users of vintage software
such as eJay or Sony Acid. It is a style-guided arrangement tool;
it does not claim to infer a genre from audio analysis.

Generation must produce a deliberate musical arc, not only a structurally valid
project. Candidate compatibility, phrase-level repetition, rests, fills,
transitions, motif returns, and mix balance are part of the generator contract.

## User Stories

- **US-001:** As a user, I see a **Generate MixJam** card after selecting a
  Sample Folder, so I can start a song without manually placing samples.
- **US-002:** As a user, the wizard waits for the selected root's current sync
  and analysis job, so generation uses a stable analyzed snapshot.
- **US-003:** As a user, I can choose a profile, BPM, intensity, duration, and
  seed before generating.
- **US-004:** As a user, the same seed, profile version, generator version, and
  corpus snapshot produce a semantically equivalent project.
- **US-005:** As a user, the generated project is saved transactionally in my
  User Folder with a non-overwriting name and appears in the MixJam Browser.
- **US-006:** As a user, I see a clear error when required sample roles cannot
  be filled; the app never exposes a partial project.
- **US-007:** As a user, I can regenerate a saved generated project either
  exactly or explicitly against the current corpus.
- **US-008:** As a user, generated sample bubbles keep the same category colors
  as the same samples in the Sample Browser.
- **US-009:** As a user, generated songs use compatible material and recognizable
  profile-specific phrases instead of continuously tiling samples across a
  section.
- **US-010:** As a user with a mixed Sample Folder, I choose one coherent
  analysis cluster instead of receiving a project based on a misleading
  root-wide BPM median.

## Scope

### Home view entry

The Home workflow column includes an independent **Generate a MixJam** sibling
card below Library Setup and Create or Open. It is visible when a Sample Folder
is selected, but its action is gated until both folders are accessible and the
User Folder is writable. The card remains at normal contrast while gated. Only
its secondary action is disabled, with the concrete prerequisite kept visible
and linked through `aria-describedby`. Scanner progress appears only in Library
Setup; the generator card does not duplicate it.

Its states are:

- **Ready:** the User Folder is writable and the selected root has a completed
  sync and analysis job. **Generate** opens the wizard.
- **Preparing:** the root has a usable index but its current sync or analysis is
  still running. The **Generate MixJam** action is disabled and the card shows
  the backend readiness reason while Library Setup shows progress. It does not
  start a duplicate job.
- **Needs preparation:** the root has no completed current analysis. **Prepare
  library** starts or awaits the existing sync/analysis lifecycle.
- **Empty or unavailable:** the card explains that the folder has no usable
  audio or cannot be read and offers the existing retry path.

### Wizard flow

The wizard is a modal with two steps:

1. **Parameters** — choose analysis cluster when needed, profile, BPM,
   intensity, duration, and seed.
2. **Generate** — show planning, selection, arrangement, and save progress;
   then show the saved artifact and an **Open in Player** action.

There is no preview step. Planning happens once when the user clicks Generate.
The worker returns a neutral, corpus-bound generator DTO from the shared
BackendAPI contract. The renderer adapts that DTO to `ProjectData` and commits
the exact plan through the production serializer and User Folder save path.
Commit begins automatically after plan validation; there is no second
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
and key, confidence, and sample count. A single coherent group is selected
without an extra choice. A mixed root requires an explicit group selection and
is never silently treated as one corpus. Unresolved groups are not selectable.

BPM defaults to the selected cluster's representative BPM. When analysis has no
confident tempo, `follow detected` is unavailable and the user must choose Fixed
BPM; that input falls back to 128 for editing. The `follow detected` choice
recomputes its value when the selected cluster snapshot changes. The generator
never takes a median over the complete Sample Folder.
Genre is not inferred from folders or acoustic analysis. Intensity is a fixed
medium default because the analysis pipeline has no arrangement-intensity
signal.

The duration target is converted to bars with:

```text
targetBars = roundHalfUp(durationSeconds * bpm / 240)
```

The result is at least one bar. The generated project ends exactly at
`targetBars * TICKS_PER_BAR`. At 140 BPM and 180 seconds this is 105 bars,
3,360 ticks, and exactly 180 seconds. At other values the wizard reports the
quantized duration produced by the nearest whole-bar result.

### Bundled template discovery and schema

Product generator profiles are repo-maintained JSON files directly under
`src/shared/generator-templates/templates/`. The build discovers every
`*.json` file in that directory eagerly and constructs one immutable validated
registry. Discovery is build-time bundling, not a runtime filesystem scan. The
worker and UI consume that registry; neither keeps an enum, switch, import list,
nor separate registration table of profile IDs.

The bundled template schema is a closed, versioned contract. The runtime
validator is authoritative; `src/shared/generator-templates/schema.json`
mirrors it for editor feedback. Unknown fields, unknown enum values, and
unsupported schema versions are errors rather than forward-compatible guesses.
Schema version 1 contains:

| Field | Contract |
| --- | --- |
| `$schema` | Optional editor hint pointing at the bundled schema; it does not affect planning. |
| `schemaVersion` | Integer `1`; versions the JSON document shape independently of musical profile revisions. |
| `id` | Stable lowercase ID matching `[a-z0-9]+(?:-[a-z0-9]+)*`; it is persisted as `generator.profileId`. |
| `label` | Non-empty user-facing string of at most 64 characters; it is not used for branching or deterministic selection. |
| `version` | Positive integer persisted as `generator.profileVersion`; bump it whenever a planning field changes in a way that can change the generated project. |
| `order` | Optional non-negative integer used for UI order; omitted values sort as `1000`, and ties sort by `label`, then `id`. |
| `default` | Optional boolean; at most one bundled template may set it to `true`. Techno is the shipped default. The first sorted template is only a defensive fallback when no template is marked. |
| `bpmTolerance` | Finite BPM distance from 0 through 60 used to rank compatible candidates. |
| `coreLanes` | Unique lane indexes whose section gates define the continuous acoustic anchors. |
| `sections` | Ordered records with unique names, positive weights totaling 100, valid lane indexes, and generic phrase modes; collectively they cover every required lane. |
| `lanes` | From 1 through 64 unique lane plans with type chains, span limits, roles, optional patterns or transitions, and optional volume. Generated lane plans never contain sends or FX. |

Every referenced lane index must exist. Lane and section names are unique within
one template. Beat offsets are unique integers from 0 through 31. Percussion
lanes require a beat pattern and are the only lanes that may declare beat
patterns or mutations. Transition lanes require `riser` or `impact` and are the
only lanes that may declare a transition kind. Volumes, acoustic types, role
kinds, phrase modes, and source-span limits must fit their shared supported
ranges. A lane pan may be non-center only when every distinct selected sample
on that lane has validated stereo-side evidence and all evidence consistently
identifies the same side. Uncertain, unpaired, mixed-side, or filename-only
evidence produces centered pan. Core lanes must be active. Empty removable
support lanes are deleted before save, while the project retains at least one
lane.

The filename stem must equal `id` exactly, so `techno.json` contains
`"id": "techno"`. IDs must be unique across all discovered files. A filename
mismatch, duplicate ID, duplicate lane or section name, multiple defaults,
malformed JSON, or schema/semantic failure rejects the complete registry; the
app must not omit only the bad template and continue with a partial set. The
registry validates before it is exposed to parameter validation or planning. An
unknown `profileId`, invalid registry, or unsupported `schemaVersion` fails
before a corpus snapshot, fingerprint query, candidate query, or audio read.

Changing only `$schema`, `label`, `order`, or `default` does not require a
`version` bump because those fields do not affect a plan. Changing any other
planning field requires a bump. The ID itself is stable; changing it creates a
different profile. One active bundled template exists per ID. A stored project
therefore supports exact regeneration only when the running registry contains
that same ID at that same `profileVersion`; the app never substitutes a newer
version silently.

The engine operates only on a validated template and generic acoustic-role,
section, phrase, transition, and lane-volume primitives. It must not compare a
template ID, label, filename, or genre name. Adding a template may compose the
schema's existing primitives. Adding a genuinely new musical primitive is a
schema-and-engine feature, not profile registration.

### Shipped baseline templates

Each template declares core acoustic anchors and the compatible role chain for
every lane; the exact `coreLanes`; lane labels, optional volumes, beat patterns,
and role assignments; its section table and generic phrase modes; and BPM
tolerance. Shared role grammar and intensity transformations remain
genre-neutral engine primitives and never inspect the template ID.

The section table is normative for each profile. The engine allocates whole bars
with largest-remainder rounding so the section lengths sum to `targetBars`.
Techno, trance, and house have distinct section tables and transition rules;
they are not aliases over one shared arrangement arc.

The shipped baseline profile contracts are:

| Profile | Core roles | Fallback/support roles | Section weights (in order) |
| --- | --- | --- | --- |
| `techno` | Kick, Bass, Synth | Hi-hat → Percussion; Loop → Atmosphere; FX → Other | Intro 8%, Groove 22%, Build 15%, Breakdown 10%, Drive 23%, Peak 14%, Outro 8% |
| `trance` | Kick, Bass, Synth, Loop | Synth → Loop; Loop → Synth; FX → Other | Intro 8%, Theme 18%, Lift 16%, Breakdown 12%, Main Theme 20%, Peak 18%, Outro 8% |
| `house` | Kick, Bass, Hi-hat | Hi-hat → Percussion; Vocal → Atmosphere; Loop → Synth; FX → Other | Intro 8%, Groove 24%, Vocal Entry 16%, Breakdown 10%, Groove Return 22%, Peak 12%, Outro 8% |

The normative `coreLanes` are techno `0,4,6`, trance `0,4,5,6`, and house
`0,2,4`. Those lanes are the continuous profile anchors. Every other declared
lane is a support-lane opportunity. The planner creates only purposeful lanes:
it keeps populated lanes, removes empty removable support lanes before save,
and never emits fewer than 1 or more than 64 lanes. Compatible secondary types
may add contrast even when the primary type exists. The Generate result reports
each used secondary type as a substitution. If bounded analysis cannot fill a
required core role, generation fails before save and names that role and its
compatible types. BPM only ranks compatible candidates.
Section rules add and remove layers according to the profile contract: every
profile starts sparse, increases density through its lift/build sections,
creates a lower-density breakdown, and restores its core roles before the
outro. The individual role gates and transition-sample placements are profile data,
not engine branches.

Transition left and Transition right are independent riser and impact roles,
not two halves of one stereo file. A lane name or filename suffix never implies
stereo side. Non-center pan requires validated side evidence for every distinct
sample used on that lane, with every item consistently left or consistently
right. Any uncertain, unpaired, or mixed evidence centers the complete lane.

The shipped baseline templates use the following role pool; unsupported roles
use the listed acoustic-type fallback in order. A template may declare from 1
through 64 purposeful lane plans and may compose a different validated role
layout. Empty removable lane plans do not survive project creation:

| Lane | Role | Sample type chain | Maximum source span |
| ---: | --- | --- | ---: |
| 0 | Kick | Kick | 1 beat |
| 1 | Snare/Clap | Snare → Percussion | 1 beat |
| 2 | Hi-hat | Hi-hat → Percussion | 1 beat |
| 3 | Percussion | Percussion → Other | 1 beat |
| 4 | Bass | Bass | 8 bars |
| 5 | Loop | Loop → Synth | 8 bars |
| 6 | Synth A | Synth → Loop | 8 bars |
| 7 | Synth B | Synth → Loop | 8 bars |
| 8 | Vocal | Vocal → Atmosphere | 8 bars |
| 9 | Atmosphere | Atmosphere → Other | 16 bars |
| 10 | FX | FX → Other | 16 bars |
| 11 | Drum alternate | Percussion → Hi-hat → Snare | 4 bars |
| 12 | Loop alternate | Loop → Synth | 8 bars |
| 13 | Synth alternate | Synth → Loop | 8 bars |
| 14 | Transition left | FX → Other | 8 bars |
| 15 | Transition right | FX → Other | 8 bars |

Source spans must be positive. Limits are evaluated at the resolved project BPM.
The four primary percussive lanes use one-shots that fit inside one beat so their
profile patterns never overlap. Drum alternate is a phrase lane and accepts up
to four bars. Rhythmic and tonal loops are eligible only when their standard
placement-span calculation resolves to exactly 1, 2, 4, or 8 bars. Atmosphere
and texture roles may cross one eight-bar phrase but must fit inside their
section. The generator never trims or invents a source span. When compatible
material longer than four bars has a legal window in the quantized song, every
successful plan places at least one such source at its complete span. Short
songs use a shorter compatible fallback when the long source cannot fit any
profile-approved section.

Bass, Synth, Loop, Vocal, and Atmosphere roles use the selected song key.
Exact-key matches rank above relative major/minor matches and unknown keys.
Incompatible known keys are rejected for tonal lanes. When no reliable song key
can be selected, the generator may use unknown-key tonal material, but it must
not combine conflicting known keys.

Profile BPM tolerances and section role gates are:

| Profile | BPM tolerance | Section active lanes |
| --- | ---: | --- |
| `techno` | ±8 BPM | Intro `2,3,5,9,10`; Groove `0,1,2,3,4,5,11`; Build `0,1,2,3,4,5,6,10,11,12,14,15`; Breakdown `6,7,8,9,10,13,14,15`; Drive `0–7,9–15`; Peak `0–15`; Outro `0,2,3,5,9,10,12,14,15` |
| `trance` | ±6 BPM | Intro `0,2,5,9,10`; Theme `0–2,4–7,9`; Lift `0–7,10,12,14,15`; Breakdown `6–10,13–15`; Main Theme `0–10,12–15`; Peak `0–15`; Outro `0,2,5,6,9,10,14,15` |
| `house` | ±8 BPM | Intro `0,2,3,5,9,10`; Groove `0–5,11,12`; Vocal Entry `0–5,8,12`; Breakdown `5,6,8–10,13`; Groove Return `0–6,8,11,12`; Peak `0–15`; Outro `0,2,3,5,9,10,12,14,15` |

Intensity applies one deterministic transformation after the section gate:

| Intensity | Support-lane density per section | Base distinct samples per role |
| --- | ---: | ---: |
| `low` | rotating 40% | 2 when available |
| `medium` | rotating 70% | 3 when available |
| `high` | all | 4 when available |

Core lanes remain active whenever their section gate includes them. Optional
lane percentages use half-up rounding. Selection rotates by section instead of
always taking the lowest lane numbers, and a minimal coverage pass adds any lane
not otherwise represented. Intensity therefore changes simultaneous density
and cue frequency without leaving an unused lane, changing section boundaries,
or changing the exact song end. Category coverage may add a distinct candidate
beyond a role's base count.

### Bounded planner scoring

Indexed metadata from the selected analyzer context key creates
deterministic per-lane and per-category candidate queues. Core lanes receive the
first reservation, then category and lane queues advance in balanced passes.
Type and musical-span eligibility run before the 96-read shortlist is fixed.
The worker reads and decodes each shortlisted relative path at most once. One
planning job attempts at most 96 unique files and retains at most 64 successful,
role-compatible scoring results. Reservations cover every feasible lane and
primary category, so abundant core material cannot starve support lanes or
smaller categories. Failure to fill a required core role aborts before save;
an unfilled removable support lane is pruned before persistence.

The transient scoring records no database state. It may derive arrangement
metrics such as RMS, peak, spectral centroid, transient density, attack strength,
rhythmic regularity, loop confidence, boundary continuity, energy slope, and a
planner kind. It consumes the shared analyzer's stored BPM, key, and sample type
and must not derive competing semantic values for those fields.

Explicit transition words in a filename may remain a deterministic planner hint.
Matching uses token boundaries, so `sunrise` is not treated as `rise`; stereo-side
suffixes do not hide a token. This hint classifies an arrangement transition and
does not rewrite the sample's stored acoustic type.

### Phrase grammar

Section boundaries remain those in the profile tables. Each non-empty section
is divided into phrases of at most eight bars; a section tail may be shorter.
All loop entries start on bar boundaries. Profile data selects phrase variants;
the engine contains no genre-name branches.

The shared role rules are:

- Kick, Snare/Clap, Hi-hat, and Percussion use explicit beat-grid patterns with
  lane-local sample rotation and alternating B-pattern bars. High intensity adds
  the final-bar fill. They are never continuous section-length tiles, and
  coverage repair uses the same permitted beat offsets.
- Drum alternate, Bass, Loop, and Synth roles use reusable A/B phrase material.
  Compatible samples tile at their complete source span within an active phrase,
  and different lanes do not share one lockstep candidate index.
- A tonal motif introduced before a breakdown returns after the breakdown.
- Vocal entries use call and response and cannot occupy consecutive phrases.
- Atmosphere and texture entries support selected phrases and do not run for an
  entire multi-section arc.
- A riser ends at a section boundary. An impact starts at a section boundary.
  Transition left is the riser lane and Transition right is the impact lane.
  Both transition lanes contain boundary events only.
- A breakdown excludes Kick and Bass. A build adds layers across phrases. A peak
  restores the profile's core roles before the outro removes layers.
- One sample may not repeat unchanged for more than two complete phrases. Kick
  is the sole intentional repetition anchor and is the only exception.

The shipped baseline character is normative and comes from the JSON data:

| Profile | Phrase behavior |
| --- | --- |
| `techno` | Stable four-on-the-floor anchor, eight-bar percussion mutation, controlled dropouts, and short build fills. |
| `trance` | Theme introduction, lift variation, percussion-free breakdown, main-theme return, and denser peak harmony. |
| `house` | Four-on-the-floor anchor, off-beat hats, syncopated percussion, vocal space, and an A/B groove return. |

The seed selects compatible samples, A/B ordering, fills, and allowed dropouts.
It does not change section boundaries or remove the profile's required musical
arc. Low intensity uses fewer optional phrases and no B motif when one motif is
sufficient; its phrase DTOs therefore contain only A and rest motifs. Medium
uses at least three distinct samples per role when compatible material exists.
High uses at least four and adds optional rhythmic detail and fills but does not
add incompatible tonal material. Selection prefers unique files across lanes
before supply-constrained reuse. If the normal
phrase schedule does not reach the exact song end, the final anchor must still
obey the selected lane's beat-grid, bar-alignment, or transition-boundary rule.
Generation fails rather than inserting an off-grid repair placement.

Generated lane state uses the following volume defaults. Every lane starts
unmuted and unsoloed. The generator may set lane volume, but it always emits
all four sends at `0` and all four project FX slots as Empty.

| Role | Volume |
| --- | ---: |
| Kick | 0.78 |
| Snare/Clap | 0.50 |
| Hi-hat | 0.46 |
| Percussion | 0.42 |
| Bass | 0.58 |
| Loop / Loop alternate | 0.46 / 0.40 |
| Synth A / Synth B / Synth alternate | 0.46 / 0.42 / 0.38 |
| Vocal | 0.38 |
| Atmosphere | 0.34 |
| FX sample role | 0.40 |
| Drum alternate | 0.38 |
| Transition left / right | 0.34 |

Transient RMS values compensate for level differences between the selected
files. Each lane targets the median RMS of the selected set while preserving the
profile's base volume. Compensation is clamped to plus or minus 6 dB, and the
final lane volume is clamped to the existing 0–1 control range. Missing or
silent RMS data leaves the profile volume unchanged. Seeded volume
randomization is not allowed.

The product generator creates from 1 through 64 populated, purposeful lanes.
Before serialization, it removes every removable empty lane and validates the
remaining count. It keeps at least one lane. Mixer tracks follow those lanes
1:1. Generated output never selects a non-Empty FX module and never raises a
send above `0`.

### Runtime and query ownership

The backend worker owns database access, cluster-scoped candidate filtering,
corpus snapshot creation, bounded planner scoring, and deterministic planning. The renderer never
pulls the full sample library into the UI. A generator-specific BackendAPI
operation returns a bounded, neutral `MixJamGeneratorPlan` DTO. Shared API types
must not import renderer project, lane, or audio-processor types. Each lane plan
contains its final lane gain and arrangement data. The DTO does not plan a
separate channel array or insert effects that the renderer would discard; the
renderer supplies the fixed four zero Sends and four Empty project FX buses.

The validated-template registry is shared by parameter validation, the worker,
and the profile picker. The picker renders registry metadata in `order`,
`label`, `id` order and sends the selected stable ID. The profile and
arrangement engine is pure and consumes one validated template plus enriched
candidate DTOs.
The worker owns bounded file reads and transient arrangement scoring outside
that pure boundary. Spec-008 remains the only owner of stored BPM, key, and
sample-type semantics.
The renderer owns `serializeProject`, User Folder writes, recent-project updates,
and opening the resulting project because those operations use the existing
renderer persistence and File System Access contracts.

Worker filtering must support:

- `rootId` scoping;
- a current, resolved `tempoClusterPrefix` context key;
- acoustic `sampleType` role filters plus organizational-category diversity;
- positive duration and role-specific duration limits;
- current `scan_state = 1` metadata rows only;
- deterministic ordering and bounded result sets; and
- soft distance from the resolved project BPM plus hard rejection of
  incompatible known keys.

The candidate query also joins the primary organizational category name. The
shared palette-slot helper converts that name to a slot from 0 through 8. A
category never fills or replaces an acoustic role, but it is a diversity
constraint after role compatibility: every primary category with a compatible
candidate in the bounded analyzed set must appear in the arrangement. Category
queues receive bounded-analysis reservations, and candidate assignment covers
scarce categories before filling per-lane variety. Every generated placement
DTO carries the selected sample's slot, and the renderer persists it through the
existing spec-011 placement field.

Candidates within the profile BPM tolerance of the resolved project BPM are
preferred. Unknown BPM is a deterministic fallback inside the selected context.
The planner prefers
the selected cluster key, or selects one song key from its current keyed tonal
members when the cluster key is unresolved. Stored BPM/key/type come from
spec-008; the planner does not recompute them.
Sharp and flat spellings are compared by canonical pitch and major/minor mode,
so enharmonic exact and relative-key matches behave identically. Missing or
mixed keys fall back according to the tonal rules above. Profile roles use acoustic sample types
(`Kick`, `Snare`, `Hi-hat`, `Percussion`, `Bass`, `Synth`, `FX`, `Vocal`,
`Loop`, `Atmosphere`, `Other`), never the organizational category field.

Selection hashes the safe seed with the profile ID, profile version, and stable
lane index, then sorts by hash and relative path. Stable relative-path
tie-breaking is mandatory.
Rows with current readable metadata are preferred. The renderer calls the
existing missing-file check for every selected `sampleRef` immediately before
save; any now-unreadable selection aborts the transaction. Missing compatible
material for a required or core lane produces a clear error. An unfilled
removable support lane is pruned before save. Compatible secondary types may
supplement primary types for variety, and every used secondary type is reported in the
Generate result. Transition roles prefer a matching analyzed riser or impact; a
typed FX candidate classified as texture may provide the same boundary event
when transient scoring does not label it confidently. A known opposite
transition kind is rejected, and `Other` still requires the matching planner
kind. Template schema version 1 selects lane candidates independently. It
consumes spec-008 stereo-pair evidence and performs no pair discovery itself.

### Arrangement and mixer generation

The pure engine builds neutral lane and placement DTOs using the same span rules
as manual projects. The renderer adapts them to `LaneState[]`. A positive native
BPM is captured on each placement; otherwise the selected project BPM is used
for the initial span. The engine must place samples so the final exclusive end
equals the quantized song boundary without trimming a source span. Every
placement carries a required palette slot from 0 through 8. Placement IDs are
derived from the seed, profile ID, profile version, stable lane index, and
ordinal; generator code must not use `Date.now()`, `randomUUID()`, or a
process-global sequence.

Lane IDs derive from the seed, profile ID, profile version, and the template
lane's stable key, not its final array position. Pruning a removable support
lane therefore does not change any surviving lane ID.

Each generated lane may include volume and conditional pan. The genre-neutral
engine sets every lane unmuted and unsoloed, every send to `0`, and every one of
the four FX slots to Empty. Intensity applies only the shared documented
arrangement-density transformations. Bounded RMS compensation may adjust lane
volume as documented above. Pan remains centered unless every distinct sample
on the lane has validated, consistent evidence for one stereo side. The
generator never guesses stereo side from an unvalidated filename and never
generates FX or send state.

### Planning job lifecycle

The renderer creates a transient job ID and starts one root-scoped planning
request whose validated parameters carry the selected context key. Progress
events use the root and job identity and report `shortlisting`, `analyzing`, or
`arranging`, plus completed and total
candidate counts where applicable. `analyzing` here means bounded planner
scoring, not BPM/key/type analysis. The wizard shows the active phase instead of
one indefinite Generating label.

The renderer owns one explicit planning or saving state per job ID. Cancelling
planning immediately releases that UI state, and progress, success, failure, or
cleanup from an older job cannot update a reopened or newer run. Close, Escape,
backdrop, and Cancel all cancel during planning. Every dismissal path is blocked
only after the renderer enters the saving state.

The worker serializes generator planning with sync and analyzer writes. User
cancellation, Sample Folder replacement, selected-cluster invalidation, or
worker shutdown marks the job cancelled. The worker checks cancellation between
file reads and before returning a plan. Cancellation before commit creates no
file.
If an automatic sync request targets a root whose completed automatic job is
already current, the request is suppressed without cancelling an active
generation for that same root. Readiness responses are scoped to both the
current root and request generation, so a stale response cannot update a new
root's card.
Once the renderer begins its short transactional save, cancellation is disabled;
a write failure before file creation completes removes the incomplete allocation
and leaves no recent-project row.

### Output, naming, and transaction

The renderer serializes the complete project with `serializeProject` and saves it
inside the User Folder. The filename uses the validated safe profile ID, BPM,
intensity, and a short digest of the safe seed:

```text
<profile>-<bpm>bpm-<intensity>-<seed-digest>-001.mixjam
```

Allocation is serialized inside the single-tab app and checks existing names.
The next suffix is one greater than the highest existing matching suffix, or
`001` when none exists. Deleted gaps are never reused, so suffixes remain
monotonic. The allocator never overwrites a project found by that check. Browser
File System Access has no cross-process exclusive-create primitive, so races
with external filesystem writers are outside this contract. The recent-project
registry is updated only after the final write succeeds. Writes use the existing
atomic File System Access behavior. Successful file creation is the durable
commit. A later recent-project registration or list-refresh failure preserves
and returns the saved relative path and shows a recoverable warning; it does not
delete the project or report generation failure. A later project-list refresh
discovers the committed file from the User Folder.

After a successful save the wizard remains on its completion state. The user must
click **Open in Player** explicitly.

### Generator metadata and regeneration

Generated projects use the strict spec-011 version-4 format and persist:

```json
{
  "generator": {
    "generatorVersion": 1,
    "profileId": "techno",
    "profileVersion": 2,
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

The template JSON field `version` is serialized as `profileVersion` in project
metadata. `schemaVersion` versions the bundled JSON document shape and is not a
project parameter. Exact regeneration resolves the stored profile ID/version
pair against the validated registry, whose template has already passed the
running schema validator.

The fingerprint remains a canonical hash of the complete indexed root snapshot
before cluster selection and parameter-specific shortlisting. It covers every
current generator-eligible row plus the canonical root analysis summary and its
resolved groups. The hash contains the stable FolderRef root key plus the sorted
records' relative path, size, mtime, metadata/analysis revisions, duration, BPM,
key, sample type, primary category name, and palette slot. The selected context
key is stored in generator parameters. Scan completion timestamps are excluded
because a no-op re-scan must preserve the fingerprint. Transient planner metrics
and audio-byte hashing are out of scope.

**Regenerate** always creates a new artifact. Exact regeneration first resolves
the stored `(profileId, profileVersion)` pair against the validated bundled
registry. It uses that exact template, stored parameters, and seed and requires
a matching fingerprint, root, and cluster key. A matching ID at a different
version is not exact and must never be substituted silently.
Current-corpus regeneration opens Parameters prefilled from
metadata. If the stored cluster no longer exists, the user must select a current
cluster and confirm that semantic change. Current-corpus regeneration may
produce different selections. Both paths use the same transactional save and
monotonic naming rules.

The loaded project's Middle Strip menu exposes **Regenerate** only when the
project has a valid generator block whose generator version is supported and
whose exact profile ID/version pair is registered by the running app. It offers
the exact and current-corpus paths explicitly; a regular hand-authored project,
an unregistered profile, or an unsupported profile version has no regeneration
command.

## Acceptance Criteria

- [x] **AC-001:** The Home workflow column shows Generate a MixJam as an
  independent sibling card after a Sample Folder is selected. The card stays at
  normal contrast while its secondary action is gated until the User Folder is
  accessible and writable. During active sync or analysis, the disabled action
  has a visible readiness reason linked through `aria-describedby`; progress is
  shown only in Library Setup. Readiness loads independently of opening the
  dialog and refreshes as library preparation changes state.
- [x] **AC-002:** The wizard has exactly two steps: Parameters and Generate; no
  preview step is present.
- [x] **AC-003:** The Parameters step exposes every validated bundled template
  in deterministic registry order, selected-cluster BPM, medium intensity,
  editable 30–600 second duration, and a validated safe-token seed. A mixed
  root requires coherent cluster selection and never defaults from a root-wide
  median.
- [x] **AC-004:** Duration uses nearest whole-bar, half-up rounding and the
  generated project ends exactly at the resulting bar boundary without
  overlapping placements on a lane.
- [x] **AC-005:** Generation is allowed only when no sync/analyzer job is active
  for the selected root and the selected analysis group is current. Preparation
  reuses the existing scheduler and does not start duplicate work.
- [ ] **AC-006:** Preview is not required; Generate performs one deterministic
  planning pass, commits automatically after validation, and reports its actual
  selections, substitutions, sections, quantized duration, and lane-volume summary
  in the completion or error state.
- [ ] **AC-007:** Every discovered profile JSON contains normative section
  tables and phrase modes, required/fallback roles, beat patterns, optional
  lane-volume state, and a profile version without engine-specific genre branches.
  Techno, trance, and house remain the shipped baseline templates.
- [x] **AC-008:** Candidate selection uses worker-side validated type, duration,
  readability, BPM, key, root, selected context key, and group confidence;
  organizational categories are not acoustic types.
- [ ] **AC-009:** Missing compatible material for a required or core lane fails
  clearly. An unfilled removable support lane is pruned, secondary role types
  are reported, and no required lane is omitted.
- [ ] **AC-010:** With the same seed, registered profile ID and profile version,
  generator version, and indexed-root fingerprint, repeated planning produces
  semantically equivalent stable lane IDs, sample references, placements,
  spans, lanes, volume, validated pan, zeroed sends, and Empty FX slots.
- [ ] **AC-011:** The project format-4 generator block roundtrips through the
  production parser and preserves all metadata needed for regeneration.
- [ ] **AC-012:** Generated projects contain from 1 through 64 populated,
  purposeful lanes and the same number of 1:1 mixer tracks. Every removable
  empty lane is deleted before save, relative sample references remain valid,
  all sends are `0`, and all four FX slots are Empty.
- [x] **AC-013:** Output allocation is app-serialized, transactional, monotonic,
  and check-before-create non-overwriting. The renderer rechecks every selected
  sample reference before save. Failed or cancelled pre-commit runs leave no
  file or recent entry. Once creation completes, post-commit registry or refresh
  failures preserve and return the saved path with a recoverable warning.
- [x] **AC-014:** A successful save updates the MixJam Browser, remains on the
  completion state without replacing the loaded project, and opens only after an
  explicit Open in Player action.
- [ ] **AC-015:** Exact regeneration creates a new artifact only when the
  validated registry contains the stored profile ID at the stored profile
  version, the corpus fingerprint and root match, and the stored cluster key
  remains valid. A different registered version is never substituted.
  Current-corpus regeneration requires explicit confirmation and a new cluster
  choice when the old cluster disappeared. One exact-regeneration action
  performs one planning and save attempt.
- [ ] **AC-016:** The generated project passes focused unit tests, a real-corpus
  production-parser roundtrip, built-Chromium open/playback proof, and manual
  listening sign-off for techno, trance, and house.
- [ ] **AC-017:** One planning job attempts no more than 96 unique files, retains
  no more than 64 role-compatible scoring results, reserves candidates for
  unfilled lanes and categories, reads each relative path at most once, and can
  be cancelled before save without leaving a file or recent-project entry.
  Parameters are validated before snapshot, fingerprint, or audio-file work.
- [x] **AC-018:** Techno, trance, and house plans satisfy their phrase contracts:
  lane-local beat-grid percussion, phrase-tiled drum/bass/loop/synth material,
  bounded unchanged repetition, profile-specific A/B motifs, rests, high-only fills, a
  lower-density breakdown, a motif return, two populated boundary-transition
  lanes, and a restored peak. Low intensity emits only A/rest phrase metadata,
  every intensity uses every retained lane across the song, and exact-end anchoring never
  bypasses role-grid rules.
- [ ] **AC-019:** Tonal lanes contain no incompatible known-key selections;
  enharmonic sharp/flat spellings compare consistently; primary percussive roles
  fit inside one beat; loop roles resolve to exact whole-bar spans; available
  compatible material longer than four bars with a legal song window is placed
  at its full span;
  transient RMS compensation stays within plus or minus 6 dB and final gain
  stays within 0–1.
- [ ] **AC-020:** Every generator candidate retains its primary organizational
  category. Every category with compatible material and a legal placement
  window in the selected cluster shortlist appears in the arrangement without being
  treated as an acoustic type. Every
  generated placement stores a valid palette slot from 0 through 8, the slot
  participates in the corpus fingerprint, and built Chromium proves Tracker
  bubbles match Sample Browser colors and recolor correctly after a theme
  switch.
- [ ] **AC-021:** For a fixed indexed-root snapshot and parameters, the same
  seed reproduces the complete plan, while different seeds create a measurable
  selection or phrase change without changing section boundaries or the
  required profile arc.
- [ ] **AC-022:** Planner scoring consumes analyzer-owned BPM, key, and sample
  type. Its bounded decoder may derive arrangement metrics and transition hints,
  but it contains no competing BPM, key, or acoustic-type classifier.
- [x] **AC-023:** Adding one valid `<id>.json` file directly under
  `src/shared/generator-templates/templates/` adds a selectable and plannable
  profile in the next build without changing a TypeScript import, ID union,
  registry table, worker dispatch, engine branch, or UI option list.
- [x] **AC-024:** Registry construction rejects malformed JSON, unsupported
  schema versions, unknown fields or enum values, invalid semantics, a filename
  stem that differs from `id`, duplicate IDs, duplicate lane or section names,
  and multiple defaults. Failure is atomic and occurs before corpus, query,
  fingerprint, or audio-file work.
- [x] **AC-025:** Registry ordering is deterministic by `order`, then `label`,
  then `id`. Techno is the one shipped `default`; if a future valid set has no
  default, the first sorted template is selected defensively.
- [ ] **AC-026:** A valid non-baseline fixture ID exercises the same generic
  parameter, candidate, section, phrase, placement, and lane-volume path. Engine,
  worker, and UI code do not compare template IDs, labels, filenames, or genre
  names.
- [x] **AC-027:** Generator metadata roundtrips the registered template ID and
  profile version. Exact regeneration resolves that pair and refuses a missing
  ID or version instead of falling back to another registered template.
- [ ] **AC-028:** Techno, trance, and house are JSON schema-version-1 templates
  whose validated plans preserve their section, phrase, lane, selection,
  lane-volume, and deterministic output contracts while emitting no FX or sends.
- [x] **AC-029:** A registry fixture with at least 250 valid unique templates
  validates, sorts, and exposes every profile without a fixed-capacity limit or
  generated TypeScript ID list. Planning resolves only the selected template.
- [ ] **AC-030:** A generated lane is panned away from center only when every
  distinct sample used on it has validated stereo-side evidence and all evidence
  consistently identifies left or consistently identifies right. Uncertain,
  unpaired, mixed-side, and filename-only cases remain centered.

## Implementation Ownership

- `src/shared/generator-templates.ts` owns eager build-time discovery, JSON
  parsing, schema and semantic validation, atomic registry construction,
  deterministic ordering, default selection, and the registered version map.
  `src/shared/generator-templates/schema.json` mirrors the runtime contract for
  editor feedback. `src/shared/generator-templates/templates/*.json` owns all
  bundled profile labels, versions, lane patterns and roles, section phrase
  modes, transition kinds, and lane-volume defaults. There is no
  second profile list in backend or UI code.
- `src/shared/backend-api.ts` exposes profile IDs as validated registry strings,
  not a closed three-value union.
- The spec-008 analyzer owns group readiness, raw BPM/key evidence, and the
  stored BPM/key/type projections used by generator queries.
- `backend/generator-library.ts` owns root/cluster-scoped readiness, bounded
  candidate queries, organizational-category palette retention, and the
  canonical indexed-root fingerprint. `generator-library.test.ts` covers
  those boundaries and every fingerprint field.
- `backend/generator-analysis.ts` owns deterministic lane/category shortlisting,
  bounded file reads, transient arrangement metrics, transition hints, coverage
  reservations, progress, and cancellation. Its tests must prove that planning
  does not recompute BPM, key, or acoustic sample type.
- `backend/generator-engine.ts` owns pure deterministic section, phrase,
  placement, compatibility, lane-volume, empty-lane pruning, and validated
  stereo-side pan planning from generic
  template primitives. `generator-engine.test.ts` contains focused coverage for
  every discovered template and a non-baseline fixture, all-lane and
  all-category use, 30-second fallback, long-form placement, transition-kind
  separation, intensity behavior, legal coverage grids, richer sample rotation,
  seed behavior, phrase structure, key rejection, exact song end, lane-volume
  bounds, centered uncertain pan, zero sends, and Empty FX slots.
- `backend/generator-parameters.ts` validates the complete request, including a
  registry lookup for `profileId`, before worker I/O. `backend/musical-key.ts`
  owns enharmonic parsing shared by manual analysis validation and generator
  compatibility.
- `project/generated-project.ts`, `hooks/useMixJamGenerator.ts`, and
  `components/MixJamGeneratorDialog.tsx` adapt and commit the neutral plan,
  expose cancellation and progress, render profile choices from registry
  metadata, manage the generation lifecycle, and keep Open in Player explicit.
  Their adjacent tests cover these renderer seams.
- `project/generator-support.ts` owns persisted generator-metadata
  interpretation. It performs the exact generator-version and registered
  profile-ID/version support check and reconstructs fixed or follow-detected
  BPM parameters plus the optional analysis group. Unsupported metadata yields
  no planner parameters. This keeps both the project-file parser and generation
  hook free of profile-registry decoding policy.
- `tests/e2e/mixjam-generator.spec.ts` defines the built-Electron color,
  generation, open, and playback checks. Its production-bundle run passed.
- Existing structure evidence under `tmp/verify-generator-structure/` records
  production-parser roundtrips,
  exact 3,360-tick ends, zero missing references, browser screenshots, playback
  proof, and cross-theme palette sampling. The baseline profile-v2 structural
  rerun covers all retained lanes and all 11 current categories in each of
  techno, trance, and house, reaches 9.25- or 10-bar source spans, and uses
  37–40 distinct files. Human listening sign-off remains pending. It does not prove
  the contextual-cluster contract; a new verification run must add that
  evidence.

## Validation

Run the focused behavior and persistence checks:

```sh
npm test -- src/renderer/src/backend/generator-profiles.test.ts
npm test -- src/renderer/src/backend/generator-engine.test.ts
npm test -- src/renderer/src/backend/generator-analysis.test.ts
npm test -- src/renderer/src/backend/generator-library.test.ts
npm test -- src/renderer/src/backend/generator-parameters.test.ts
npm test -- src/renderer/src/backend/analysis-library.test.ts
npm test -- src/renderer/src/project/generated-project.test.ts
npm test -- src/renderer/src/project/project-file.test.ts
npm test -- src/renderer/src/components/LaneSampleBubbleCanvas.test.tsx
npm test -- src/renderer/src/hooks/useMixJamGenerator.test.ts
npm test -- src/renderer/src/components/MixJamGeneratorDialog.test.tsx
```

Run the repository checks and built-Electron proof:

```sh
npm run typecheck
npm run lint
npm run build
npx playwright test tests/e2e/mixjam-generator.spec.ts --project=electron-e2e
```

Real-corpus verification records the selected context key and group summary,
cluster fingerprint, parameters, seed, selected roles, bounded planner
read/analysis counts, proof that stored BPM/key/type remain unchanged, phrase
structure, palette slots, placement count, final tick, missing references,
parser roundtrip, playback proof, screenshots, and listening notes under a fresh
`tmp/verify-generator-structure/` directory. Include a mixed-root case in which
two cluster choices produce internally compatible candidate sets.

Template validation also adds a valid non-baseline fixture and proves that the
same registry-to-parameter-to-engine path plans it without source registration.
An at-least-250-template fixture proves the registry has no three-profile or
other hand-maintained capacity boundary.
Negative fixtures cover malformed JSON-shaped values, unknown schema fields and
versions, filename/ID mismatch, duplicate IDs, duplicate lane or section names,
multiple defaults, invalid lane references, unsupported acoustic types or
forbidden FX or send declarations, and out-of-range numeric values. A
planning-boundary test asserts that
rejection occurs before any corpus, query, fingerprint, or audio-read dependency
runs.

## Non-Goals and Deferred Decisions

- No separate preview step and no real-time preview inside the wizard.
- No favorite parameter presets in the first slice.
- No user-authored templates, runtime imports, runtime downloads, network
  catalog, plugin template source, or watched hot-reload directory. Templates
  are reviewed repository assets bundled at build time.
- No executable code, expressions, or scripts inside templates. JSON may only
  compose the schema's supported declarative primitives. A new primitive still
  requires a versioned schema and engine change.
- No user-selected target key in the first slice; key preference is derived.
- No generator-owned BPM, key, or acoustic-type analysis, waveform cache,
  full-library generator rescan, machine-learning classifier, or network
  analysis service. Bounded transient arrangement scoring remains planner work.
- No user-visible generator-version choice.
- No audio generation, stem separation, upload, cloud sharing, or project export.
- No silent regeneration against a changed corpus and no destructive replacement
  of an existing generated project.

## References

- `src/renderer/src/lib/arrangement.ts` — placement and span helpers.
- `src/renderer/src/project/project-file.ts` — project serialization and parsing.
- `src/renderer/src/project/project-state.ts` — canonical project defaults.
- `src/shared/backend-api.ts` — BackendAPI contract and sample types.
- `src/shared/generator-templates.ts` — bundled-template validator and registry.
- `src/shared/generator-templates/schema.json` — editor-facing template schema.
- [spec-003](spec-003-folder-app-state-management.md) — Home folders and
  User Folder access.
- [spec-004](spec-004-sample-library.md) — sample querying and indexing.
- [spec-008](spec-008-sample-analysis.md) — BPM, key, and acoustic type analysis.
- [spec-011](spec-011-project-save-load.md) — strict version-4 `.mixjam`
  persistence and generator metadata validation.
