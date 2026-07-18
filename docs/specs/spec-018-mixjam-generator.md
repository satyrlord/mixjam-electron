# Spec 018 — MixJam Generator Wizard

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** CODE COMPLETE; ACCEPTANCE SIGN-OFF PENDING
(AC-017–AC-021 are implemented. AC-016 remains open only for manual listening
sign-off; real-corpus, built-Chromium, playback, and palette evidence is
recorded under `tmp/verify-generator-structure/`.)
**Depends on:** spec-003 (Folder & App State Management), spec-004 (Sample Library),
spec-008 (Sample Analysis), spec-011 (Project Save & Load, including its
version-3 generator metadata extension)

## Objective

Add a one-click **MixJam Generator** wizard in the Home view. It turns an
analyzed Sample Folder into a ready-to-play `.mixjam` project. The first slice
ships three polished, data-driven profiles: **techno**, **trance**, and
**house**. The engine is profile-driven so later profiles do not require changes
to selection or arrangement code.

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

## Scope

### Home view entry

The Home view gains a **Generate MixJam** card beside the Sample Folder and
recent-project cards. The card is visible when a Sample Folder is selected, but
its action is gated until both folders are accessible and the User Folder is
writable. The card explains the concrete missing prerequisite when gated. It
preserves the backend readiness message for preparation, empty, and unavailable
states instead of replacing those states with a generic wait message.

Its states are:

- **Ready:** the User Folder is writable and the selected root has a completed
  sync and analysis job. **Generate** opens the wizard.
- **Preparing:** the root has a usable index but its current sync or analysis is
  still running. The card shows existing progress and waits for that job; it
  does not start a duplicate job.
- **Needs preparation:** the root has no completed current analysis. **Prepare
  library** starts or awaits the existing sync/analysis lifecycle.
- **Empty or unavailable:** the card explains that the folder has no usable
  audio or cannot be read and offers the existing retry path.

### Wizard flow

The wizard is a modal with two steps:

1. **Parameters** — choose profile, BPM, intensity, duration, and seed.
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
| `profile` | enum | `techno` | `techno`, `trance`, `house` |
| `bpm` | integer or `follow detected` | corpus-derived | clamped to 60–180; mode and resolved value are both saved |
| `intensity` | enum | `medium` | `low`, `medium`, `high` |
| `durationSeconds` | integer | `180` | 30–600 seconds, one-second step |
| `seed` | safe token | generated hex | 1–64 ASCII characters matching `[A-Za-z0-9_-]+` |

BPM defaults to the median of positive BPM values in the eligible analyzed
corpus, using manual and analysis values. A corpus with no positive values uses
128 BPM. The current validated corpus therefore defaults to 140 BPM. The
`follow detected` choice recomputes this value when the corpus snapshot changes.
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

### Profiles

Profiles are pure JSON/TypeScript data. Each profile declares:

- a stable profile ID and profile schema version;
- required core acoustic roles and optional roles;
- the exact `coreLanes`; every lane not listed there is optional;
- explicit fallback chains for optional roles and documented substitutions for
  required roles;
- lane names, lane pans, and role assignments for the fixed 16-lane project;
- a section table with section names, bar proportions, density rules, and
  transition behavior;
- a phrase grammar for rhythmic patterns, motif reuse, rests, fills, and
  profile-specific variation;
- deterministic mixer gain/pan/mute/solo defaults and ordered FX chains; and
- BPM tolerance, key preference, duration limits, stereo-pair rules, transient
  audio-scoring weights, and intensity adjustments.

The section table is normative for each profile. The engine allocates whole bars
with largest-remainder rounding so the section lengths sum to `targetBars`.
Techno, trance, and house have distinct section tables and transition rules;
they are not aliases over one shared arrangement arc.

The first-slice profile contracts are:

| Profile | Core roles | Fallback/support roles | Section weights (in order) |
| --- | --- | --- | --- |
| `techno` | Kick, Bass, Synth | Hi-hat → Percussion; Loop → Atmosphere; FX → Other | Intro 8%, Groove 22%, Build 15%, Breakdown 10%, Drive 23%, Peak 14%, Outro 8% |
| `trance` | Kick, Bass, Synth, Loop | Synth → Loop; Loop → Synth; FX → Other | Intro 8%, Theme 18%, Lift 16%, Breakdown 12%, Main Theme 20%, Peak 18%, Outro 8% |
| `house` | Kick, Bass, Hi-hat | Hi-hat → Percussion; Vocal → Atmosphere; Loop → Synth; FX → Other | Intro 8%, Groove 24%, Vocal Entry 16%, Breakdown 10%, Groove Return 22%, Peak 12%, Outro 8% |

The normative `coreLanes` are techno `0,4,6`, trance `0,4,5,6`, and house
`0,2,4`. Those lanes are core; every other lane is optional. Core roles without
a documented fallback are hard requirements. A fallback is tried only when no
compatible, successfully analyzed candidate of the earlier type remains after
role, duration, readability, hard-key, and planner-kind filters. BPM only ranks
the remaining candidates. The Generate result reports each substitution.
Section rules add and remove layers according to the profile contract: every
profile starts sparse, increases density through its lift/build sections,
creates a lower-density breakdown, and restores its core roles before the
outro. The individual role gates and transition FX placements are profile data,
not engine branches.

The three first-slice profiles explicitly declare no stereo-pair request.
Transition left and Transition right are independent riser and impact roles,
not two halves of one stereo file. The profile schema retains an explicit
`stereoPairRules` list so a later profile must opt into pair discovery rather
than receiving it from a lane-name heuristic.

All profiles use this fixed lane-role template; unsupported roles use the listed
acoustic-type fallback in order:

| Lane | Role | Sample type chain | Maximum source span |
| ---: | --- | --- | ---: |
| 0 | Kick | Kick | 1 beat |
| 1 | Snare/Clap | Snare → Percussion | 1 beat |
| 2 | Hi-hat | Hi-hat → Percussion | 1 beat |
| 3 | Percussion | Percussion → Other | 1 beat |
| 4 | Bass | Bass | 4 bars |
| 5 | Loop | Loop → Synth | 4 bars |
| 6 | Synth A | Synth → Loop | 4 bars |
| 7 | Synth B | Synth → Loop | 4 bars |
| 8 | Vocal | Vocal → Atmosphere | 4 bars |
| 9 | Atmosphere | Atmosphere → Other | 8 bars |
| 10 | FX | FX → Other | 4 bars |
| 11 | Drum alternate | Percussion → Hi-hat → Snare | 1 beat |
| 12 | Loop alternate | Loop → Synth | 4 bars |
| 13 | Synth alternate | Synth → Loop | 4 bars |
| 14 | Transition left | FX → Other | 4 bars |
| 15 | Transition right | FX → Other | 4 bars |

Source spans must be positive. Limits are evaluated at the resolved project BPM.
Percussive one-shots must fit inside one beat so their profile pattern never
overlaps on one lane. Rhythmic and tonal loops are eligible only when their
standard placement-span calculation resolves to exactly 1, 2, 4, or 8 bars.
The generator never trims or invents a source span. A source that does not meet
the role rule is not eligible for that role.

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

| Intensity | Optional lanes | Distinct samples per active role | FX wet-value multiplier |
| --- | ---: | ---: | ---: |
| `low` | first 40% in lane order | 1 | 0.8 |
| `medium` | first 70% in lane order | 2 when available | 1.0 |
| `high` | all | 2 when available | 1.15, clamped to the effect's valid range |

Core lanes remain active whenever their section gate includes them. Optional
lane percentages use half-up rounding. This rule changes density without
changing section boundaries or the exact song end.

### Bounded audio scoring

Indexed metadata creates deterministic per-lane candidate queues. Core lanes are
queued first, followed by optional lanes in lane order. Metadata-cheap type and
musical-span eligibility runs before the 96-read shortlist is fixed. The worker
reads and decodes each relative path at most once. One planning job attempts at
most 96 unique files and retains at most 64 successful, role-compatible
analyses. Retention reserves capacity for every core lane that has not yet
received a compatible decoded candidate, so successful candidates for other
roles cannot starve a required role after earlier read, decode, or planner-kind
failures. A failure advances to the next deterministic candidate. Failure to
fill a core role after the bounded search aborts before save.

The transient analysis records no database state. It derives only the neutral
values needed by the planner:

- RMS and peak level;
- spectral centroid and transient density;
- attack strength and rhythmic regularity;
- whole-bar loop confidence and boundary continuity;
- energy slope for riser, impact, and sustained-texture decisions; and
- a planner kind: one-shot, rhythmic loop, tonal loop, vocal, atmosphere,
  riser, impact, or texture.

The analysis algorithm is deterministic for the same bytes and parameters. It
does not use machine learning, network services, wall-clock time, process-global
state, or persisted waveform assets.

### Phrase grammar

Section boundaries remain those in the profile tables. Each non-empty section
is divided into phrases of at most eight bars; a section tail may be shorter.
All loop entries start on bar boundaries. Profile data selects phrase variants;
the engine contains no genre-name branches.

The shared role rules are:

- Kick, Snare/Clap, Hi-hat, Percussion, and Drum alternate use explicit
  beat-grid patterns. They are never continuous section-length tiles.
- Bass, Loop, and Synth roles use reusable A/B motifs. Motif changes happen only
  at phrase boundaries, except for a documented final-bar fill.
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

Profile character is normative:

| Profile | Phrase behavior |
| --- | --- |
| `techno` | Stable four-on-the-floor anchor, eight-bar percussion mutation, controlled dropouts, and short build fills. |
| `trance` | Theme introduction, lift variation, percussion-free breakdown, main-theme return, and denser peak harmony. |
| `house` | Four-on-the-floor anchor, off-beat hats, syncopated percussion, vocal space, and an A/B groove return. |

The seed selects compatible samples, A/B ordering, fills, and allowed dropouts.
It does not change section boundaries or remove the profile's required musical
arc. Low intensity uses fewer optional phrases and no B motif when one motif is
sufficient; its phrase DTOs therefore contain only A and rest motifs. Medium
uses A/B variation when compatible material exists. High adds optional rhythmic
detail and fills but does not add incompatible tonal material. If the normal
phrase schedule does not reach the exact song end, the final anchor must still
obey the selected lane's beat-grid, bar-alignment, or transition-boundary rule.
Generation fails rather than inserting an off-grid repair placement.

Mixer state uses the following role defaults. Every channel starts unmuted and
unsoloed. Unlisted FX chains are empty. Preset names and values are those owned
by spec-010 and `engine/effects.ts`.

| Role | Gain | Pan | FX presets |
| --- | ---: | ---: | --- |
| Kick | 0.78 | 0 | Gentle Glue compressor |
| Snare/Clap | 0.50 | 0 | Tight Room reverb |
| Hi-hat | 0.46 | 0.12 | none |
| Percussion | 0.42 | -0.12 | none |
| Bass | 0.58 | 0 | Leveler compressor |
| Loop / Loop alternate | 0.46 / 0.40 | 0 | none |
| Synth A / Synth B / Synth alternate | 0.46 / 0.42 / 0.38 | -0.18 / 0.18 / 0 | Ping-Pong Eighths delay / Studio Room reverb / none |
| Vocal | 0.38 | 0 | Classic Echo delay, then Studio Room reverb |
| Atmosphere | 0.34 | 0 | Long Hall reverb |
| FX | 0.40 | 0 | Studio Room reverb |
| Drum alternate | 0.38 | 0.12 | none |
| Transition left / right | 0.34 | -0.60 / 0.60 | Long Hall reverb |

Profile overrides are limited to these concrete differences: trance adds Long
Hall after Synth A's delay and uses Classic Control on Kick; house uses Slapback
instead of Ping-Pong Eighths on Synth A and adds Gentle Glue to both Loop lanes.
Techno uses the common table unchanged.

Transient RMS values compensate for level differences between the selected
files. Each lane targets the median RMS of the selected set while preserving the
profile's base gain. Compensation is clamped to plus or minus 6 dB, and the final
channel gain is clamped to the existing 0–1 control range. Missing or silent RMS
data leaves the profile gain unchanged. Seeded gain or FX randomization is not
allowed.

The product generator always creates exactly 16 lanes. This is a spec-018
generator contract, not a general project-file requirement. A profile may leave
lanes empty and may use at most 16 mixer channels. Routing remains the existing
lane-index-to-channel-index contract.

### Runtime and query ownership

The backend worker owns database access, candidate filtering, corpus snapshot
creation, bounded audio analysis, and deterministic planning. The renderer never
pulls the full sample library into the UI. A generator-specific BackendAPI
operation returns a bounded, neutral `MixJamGeneratorPlan` DTO. Shared API types
must not import renderer `ProjectData`, `LaneState`, `ChannelState`, or
`EffectSlot` types.

The profile and arrangement engine is pure and consumes enriched candidate DTOs.
The worker owns file reads and transient analysis outside that pure boundary.
The renderer owns `serializeProject`, User Folder writes, recent-project updates,
and opening the resulting project because those operations use the existing
renderer persistence and File System Access contracts.

Worker filtering must support:

- `rootId` scoping;
- acoustic `sampleType` role filters, distinct from organizational categories;
- positive duration and role-specific duration limits;
- current `scan_state = 1` metadata rows only;
- deterministic ordering and bounded result sets; and
- soft BPM ranking plus hard rejection of incompatible known keys.

The candidate query also joins the primary organizational category name. The
shared palette-slot helper converts that name to a slot from 0 through 8. The
slot is appearance data only: it never fills, replaces, or scores an acoustic
role. Every generated placement DTO carries the selected sample's slot, and the
renderer persists it through the existing spec-011 placement field.

Candidates within the profile BPM tolerance are preferred. Unknown BPM is a
deterministic fallback, not an automatic rejection. The planner selects one song
key from current, keyed tonal candidates. The schema has no separate
key-confidence field; current manual and analysis key values form the reliable
set. Sharp and flat spellings are compared by canonical pitch and major/minor
mode, so enharmonic exact and relative-key matches behave identically. Missing
or mixed keys fall back according to the tonal rules above. Profile roles use acoustic sample types
(`Kick`, `Snare`, `Hi-hat`, `Percussion`, `Bass`, `Synth`, `FX`, `Vocal`,
`Loop`, `Atmosphere`, `Other`), never the organizational category field.

Selection hashes the safe seed with the profile version and role key, then sorts
by hash and relative path. Stable relative-path tie-breaking is mandatory.
Rows with current readable metadata are preferred. The renderer calls the
existing missing-file check for every selected `sampleRef` immediately before
save; any now-unreadable selection aborts the transaction. Missing core roles
produce a clear error;
documented fallback chains may substitute secondary roles, and all substitutions
are reported in the Generate result. Stereo pairs use the existing naming
convention discovery and remain adjacent when a profile requests them.

### Arrangement and mixer generation

The pure engine builds neutral lane and placement DTOs using the same span rules
as manual projects. The renderer adapts them to `LaneState[]`. A positive native
BPM is captured on each placement; otherwise the selected project BPM is used
for the initial span. The engine must place samples so the final exclusive end
equals the quantized song boundary without trimming a source span. Every
placement carries a required palette slot from 0 through 8. Placement and FX IDs
are derived from the seed, profile version, role, and ordinal; generator code
must not use `Date.now()`, `randomUUID()`, or a process-global sequence.

Each profile's concrete mixer state includes gain, pan, mute/solo defaults, and
ordered delay, reverb, compressor, or other supported FX slots. Intensity may
apply only the profile's documented density and FX adjustments. Bounded RMS
compensation may adjust gain as documented above. Seeded random gain or FX state
is not allowed.

### Planning job lifecycle

The renderer creates a transient job ID and starts one root-scoped planning
request. Progress events use that root and job identity and report
`shortlisting`, `analyzing`, or `arranging`, plus completed and total candidate
counts where applicable. The wizard shows the active phase instead of one
indefinite Generating label.

The renderer owns one explicit planning or saving state per job ID. Cancelling
planning immediately releases that UI state, and progress, success, failure, or
cleanup from an older job cannot update a reopened or newer run. Close, Escape,
backdrop, and Cancel all cancel during planning. Every dismissal path is blocked
only after the renderer enters the saving state.

The worker serializes generator planning with sync, individual analysis, and
uniform calibration. User cancellation, Sample Folder replacement, or worker
shutdown marks the job cancelled. The worker checks cancellation between file
reads and before returning a plan. Cancellation before commit creates no file.
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
inside the User Folder. The filename uses a safe profile slug, BPM, intensity,
and a short digest of the safe seed:

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

Generated projects require the spec-011 version-3 migration and persist:

```json
{
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

The fingerprint is a canonical hash of the indexed snapshot before
parameter-specific shortlisting. It covers every current generator-eligible row
for the root: current metadata-ready state, positive duration, and a valid
acoustic sample type. The hash contains the stable FolderRef root key plus the
sorted records' relative path, size, mtime, metadata/analysis revisions,
duration, BPM, key, sample type, primary category name, and palette slot. Scan
completion timestamps are excluded because a no-op re-scan must preserve the
fingerprint. Audio-byte hashing is out of scope.

**Regenerate** always creates a new artifact. Exact regeneration uses the stored
parameters and seed and requires a matching fingerprint/root. Current-corpus
regeneration opens Parameters prefilled from metadata, requires explicit
confirmation, and may produce different selections. Both paths use the same
transactional save and monotonic naming rules.

The loaded project's Middle Strip menu exposes **Regenerate** only when the
project has a valid generator block whose generator and profile versions are
supported by the running app. It offers the exact and current-corpus paths
explicitly; a regular hand-authored or newer-version project has no regeneration
command.

## Acceptance Criteria

- [x] **AC-001:** The Home view shows a visible Generate MixJam card after a
  Sample Folder is selected and gates the action until the User Folder is
  accessible and writable. The card loads generator readiness independently of
  opening the dialog and refreshes it as library preparation changes state.
- [x] **AC-002:** The wizard has exactly two steps: Parameters and Generate; no
  preview step is present.
- [x] **AC-003:** The Parameters step exposes the three profiles, corpus-derived
  BPM, medium intensity, editable 30–600 second duration, and a validated
  safe-token seed.
- [x] **AC-004:** Duration uses nearest whole-bar, half-up rounding and the
  generated project ends exactly at the resulting bar boundary without
  overlapping placements on a lane.
- [x] **AC-005:** Generation is allowed only when no sync/analysis job is active
  for the selected root and the worker has no current metadata or analysis
  candidates pending. Preparation reuses the existing sync scheduler and does
  not start duplicate work.
- [x] **AC-006:** Preview is not required; Generate performs one deterministic
  planning pass, commits automatically after validation, and reports its actual
  selections, substitutions, sections, quantized duration, and mixer/FX summary
  in the completion or error state.
- [x] **AC-007:** The three profile definitions contain normative section tables,
  required/fallback roles, concrete mixer/FX state, and profile versions without
  engine-specific genre branches.
- [x] **AC-008:** Candidate selection uses worker-side validated type, duration,
  readability, BPM, key, and root filters; organizational categories are not
  treated as acoustic types.
- [x] **AC-009:** Missing core roles fail clearly; documented fallback roles are
  reported; no partial project is generated.
- [x] **AC-010:** With the same seed, profile version, generator version, and
  indexed corpus fingerprint, repeated planning produces semantically equivalent
  sample references, placements, spans, lanes, mixer state, and FX state.
- [x] **AC-011:** The project format-3 generator block roundtrips through the
  production parser and preserves all metadata needed for regeneration.
- [x] **AC-012:** Generated projects contain exactly 16 lanes, at most 16
  channels, relative sample references, and the complete nested project state.
- [x] **AC-013:** Output allocation is app-serialized, transactional, monotonic,
  and check-before-create non-overwriting. The renderer rechecks every selected
  sample reference before save. Failed or cancelled pre-commit runs leave no
  file or recent entry. Once creation completes, post-commit registry or refresh
  failures preserve and return the saved path with a recoverable warning.
- [x] **AC-014:** A successful save updates the MixJam Browser, remains on the
  completion state without replacing the loaded project, and opens only after an
  explicit Open in Player action.
- [x] **AC-015:** Exact regeneration creates a new artifact only when the stored
  corpus fingerprint/root matches; current-corpus regeneration requires explicit
  confirmation and may differ. The project menu exposes both paths only for a
  project with valid generator metadata. One exact-regeneration action performs
  one planning and save attempt.
- [ ] **AC-016:** The generated project passes focused unit tests, a real-corpus
  production-parser roundtrip, built-Chromium open/playback proof, and manual
  listening sign-off for techno, trance, and house.
- [x] **AC-017:** One planning job attempts no more than 96 unique files, retains
  no more than 64 successful role-compatible transient analyses, reserves
  retention capacity for unfilled core roles, reads each relative path at most
  once, reports typed progress, and can be cancelled before save without leaving
  a file or recent-project entry. Generator parameters are validated at the
  worker boundary before snapshot, fingerprint, or audio-file work begins.
- [x] **AC-018:** Techno, trance, and house plans satisfy their phrase contracts:
  beat-grid percussion, bar-aligned loops, bounded unchanged repetition,
  profile-specific A/B motifs, rests, fills, a lower-density breakdown, a motif
  return, boundary-only transitions, and a restored peak. Low intensity emits
  only A/rest phrase metadata, and exact-end anchoring never bypasses role-grid
  rules.
- [x] **AC-019:** Tonal lanes contain no incompatible known-key selections;
  enharmonic sharp/flat spellings compare consistently; percussive roles fit
  inside one beat; loop roles resolve to exact whole-bar spans; transient RMS
  compensation stays within plus or minus 6 dB and final gain stays within 0–1.
- [x] **AC-020:** Every generator candidate retains its primary organizational
  category for appearance only. Every generated placement stores a valid palette
  slot from 0 through 8, the slot participates in the corpus fingerprint, and
  built Chromium proves Tracker bubbles match Sample Browser colors and recolor
  correctly after a theme switch.
- [x] **AC-021:** For a fixed corpus and parameters, the same seed reproduces the
  complete plan, while different seeds create a measurable selection or phrase
  change without changing section boundaries or the required profile arc.

## Implementation Evidence

- `backend/generator-profiles.ts` owns the three versioned profiles, exact core
  lanes, phrase rules, transition kinds, Mixer defaults, and FX presets.
- `backend/generator-library.ts` owns root-scoped readiness, current-row
  selection, detected BPM, organizational-category palette retention, and the
  canonical corpus fingerprint. `generator-library.test.ts` covers those
  boundaries and every fingerprint field.
- `backend/generator-analysis.ts` owns deterministic shortlisting, the 96-read
  and 64-analysis bounds, core-role retention reservations, decode failure
  fallback, transient metrics, progress, and cancellation.
  `generator-analysis.test.ts` contains focused coverage for those contracts.
- `backend/generator-engine.ts` owns pure deterministic section, phrase,
  placement, Mixer, FX, compatibility, and gain planning.
  `generator-engine.test.ts` contains focused coverage for all three profiles,
  seed behavior, phrase structure, key rejection, span limits, exact song end,
  and gain bounds.
- `backend/generator-parameters.ts` validates the complete request before worker
  I/O. `backend/musical-key.ts` owns enharmonic parsing shared by manual analysis
  validation and generator compatibility.
- `project/generated-project.ts`, `hooks/useMixJamGenerator.ts`, and
  `components/MixJamGeneratorDialog.tsx` adapt and commit the neutral plan,
  expose cancellation and progress, and keep Open in Player explicit. Their
  adjacent tests cover these renderer boundaries.
- `tests/e2e/mixjam-generator.spec.ts` defines the built-browser color,
  generation, open, and playback checks. Its production-bundle run passed.
- `tmp/verify-generator-structure/evidence.md` records the full 8,014-file
  corpus fingerprint, bounded analysis counts, production-parser roundtrips,
  exact 3,360-tick ends, zero missing references, browser screenshots, playback
  proof, and cross-theme palette sampling for all automated parts of AC-016.
  Human listening sign-off remains pending.

## Validation

Run the focused behavior and persistence checks:

```sh
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

Run the repository checks and built-browser proof:

```sh
npm run typecheck
npm run lint
npm run build
npx playwright test tests/e2e/mixjam-generator.spec.ts --project=browser-e2e
```

Real-corpus verification records the corpus fingerprint, parameters, seed,
selected roles, transient-analysis counts, phrase structure, palette slots,
placement count, final tick, missing references, parser roundtrip, playback
proof, screenshots, and listening notes for techno, trance, and house under a
fresh `tmp/verify-generator-structure/` directory.

## Non-Goals and Deferred Decisions

- No separate preview step and no real-time preview inside the wizard.
- No favorite parameter presets in the first slice.
- No user-authored or downloadable profile system in the first slice; adding a
  profile file and registration remains the extension seam.
- No user-selected target key in the first slice; key preference is derived.
- No persistent generator-feature columns, waveform cache, full-library
  generator rescan, machine-learning classifier, or network analysis service.
- No user-visible generator-version choice.
- No audio generation, stem separation, upload, cloud sharing, or project export.
- No silent regeneration against a changed corpus and no destructive replacement
  of an existing generated project.

## References

- `src/renderer/src/lib/arrangement.ts` — placement and span helpers.
- `src/renderer/src/project/project-file.ts` — project serialization and parsing.
- `src/renderer/src/project/project-state.ts` — canonical project defaults.
- `src/shared/backend-api.ts` — BackendAPI contract and sample types.
- [spec-003](spec-003-folder-app-state-management.md) — Home folders and
  User Folder access.
- [spec-004](spec-004-sample-library.md) — sample querying and indexing.
- [spec-008](spec-008-sample-analysis.md) — BPM, key, and acoustic type analysis.
- [spec-011](spec-011-project-save-load.md) — `.mixjam` persistence and v3
  generator metadata migration.
