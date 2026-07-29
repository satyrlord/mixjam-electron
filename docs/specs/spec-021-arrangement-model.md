# Spec 021 — Generator Arrangement Model

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** PARTIAL — the implementation includes the
occupancy envelope, boundary ops, pool coherence, lane-position pan, and mix/FX contract.
Human listening sign-off remains open.
**Depends on:** spec-008 (Sample Analysis — pool token ownership), spec-010
(Audio Effects — Echoform Delay parameters), spec-013 (Aetherform Reverb
parameters), spec-018 (MixJam Generator Wizard — the product contract)

## Objective

Spec-018 owns the *product*: the Home card, the wizard, job lifecycle, naming,
and regeneration. This spec owns the *music*: what plays, when it stops, how
loud, how wide, and through which effect.

It exists because the previous musical contract was measurably wrong, not
merely unimplemented. The hand-authored reference library — projects the user
judged excellent — fails the density rule the generator enforced:

| Project | Lanes ≥ 80% bar occupancy | Old rule required |
| --- | ---: | ---: |
| AmbientHouse-125-001 | 0 / 14 | 12 |
| House-125-002 | 0 / 16 | 13 |
| MelodicTechno-140-001 | 0 / 16 | 13 |
| Techno-140-002 | 1 / 16 | 13 |
| Trance-140-003 | 0 / 15 | 12 |
| TropicalHouse-125-001 | 0 / 16 | 13 |

Four code paths existed to enforce that target. The current implementation omits all four. What
replaces them is an **occupancy envelope** derived by measuring the reference
library, and it is a *report*, never a throw.

## The occupancy envelope

Measured by `computeMixJamMetrics` and evaluated by `evaluateOccupancyEnvelope`
(`src/shared/mixjam-metrics.ts`, `src/shared/generator-envelope.ts`).

| Measure | Target | Derived from |
| --- | --- | --- |
| Populated lanes | 12–18 | 13–16 observed |
| Bars | multiple of 8, 96–160 | 96–152 observed |
| Distinct samples | 24–40 | 20–37 observed |
| Distinct samples per lane | max ≤ 6, median 1–3 | median 1–2 observed |
| Mean lane occupancy | 30–55% | 30–50% observed |
| Lanes above 90% occupancy | 0 | 0 in 15 of 16 |
| Lanes below 50% occupancy | ≥ 30% of lanes | 31–86% observed |
| Entries per lane (mean) | 3–8 | 3.1–7.5 observed |
| Density curve minimum | ≤ 20% of peak | 1–2 of 8–14 observed |
| Quiet stretch at ≤ 45% of sustained peak | ≥ 8 bars | 8–32 observed |
| Peak stretch at ≥ 80% of sustained peak | ≥ 6 bars | 6–28 observed |
| Lanes with a non-zero send | ≥ 70% | 69–100% observed |
| Configured return modules | exactly 2 (reverb + delay) | all 16 |
| Distinct pan values | ≥ 6 | 6–13 observed |
| Max abs pan | ≤ 0.35 non-pair, ≤ 0.65 pair | 0.6 observed |
| Song ends on the 8-bar grid | required | all 16 |

Definitions that matter:

- **Occupancy** is the share of song bars in which a lane has audible material.
  A placement occupies every bar it sounds in. A clip ending exactly on a bar
  line does not claim the next bar.
- **Entries** are contiguous occupancy runs — how many times a lane enters the
  arrangement.
- The **sustained peak** is the 90th-percentile bar density, not the single-bar
  maximum. A riser, an impact, and every lane coinciding for one bar is a spike.
  Measuring a plateau against it reports 1–3 bars even for arrangements that
  plainly hold an 8-bar peak.

### The envelope is a report

`createMixJamGeneratorPlan` hard-fails on **structural invariants only**:

- every placement lies inside the song and has a positive span,
- no two placements overlap on one lane,
- every placement of one sample carries the same span (spec-011 AC-016).
  Thus, a trim applies to the sample, not one placement.
  Percussion uses the tightest stride in the pattern.
  A roll uses its tightest subdivision, not a local subdivision,
- some placement ends exactly at the song end,
- the generator populates 8–32 lanes,
- a profile's core lanes have compatible material,
- every lane's pan is within the mix-position cap (see §Pan).

The audit reports everything in the envelope table.
Tests compare the results with committed reference metrics.
Earlier aesthetic planning targets created repair passes and a wall of sound.
The reference library scores 13–16 of 16.
A correct project can miss one measure.

## Section arcs

A **profile** is the musical style contract. A **bundled template** is the JSON
document that declares one. Each profile carries **two or three section arcs**.
The seed picks one arc, so exact regeneration reproduces it.
The seed and profile version select the arc.
The plan stores the selected name as `arcName`.

The planner allocates sections by weight in whole 8-bar phrases, never in bars. A
low-weight section may receive zero phrases in a short song and simply vanish.
Within a section:

- `build` ramps optional lanes in across the section's phrases.
- `outro` ramps them out.
- `steady` holds the section lane set.
  For sections with three or more phrases, the final phrase removes outer
  layers. Each reference project uses this boundary subtraction.
  The planner rotates its lane removals by section, so gaps spread across the
  arrangement.

**Lanes a section gates out stay out.** There is no coverage pass that drags an
absent lane back in. `ensureLaneDensity`, `ensureFamilyRatioPlacements`, the
`validateArrangement` density check, the phrase `motif: 'A' | 'B' | 'rest'`
machinery, and the two-phrase repetition ban are all deleted. A lane may now
hold one unchanged idea for a whole section, which is what the reference
trance's 56-bar arp does.

Percussion lanes drop their final bar before a section boundary.
This silence is the most common setup gesture in the reference library.
It keeps a four-on-the-floor kick below 90% occupancy.
The kick does not need a full muted section.

## Boundary ops

A short declarative op list adds boundary accents. Ops address sections **by
name**, so a template stays duration-independent. The engine resolves names to
bars after section allocation. No op takes an expression or a condition, which
keeps spec-018's "no executable code in templates" non-goal intact.

| Op | Meaning |
| --- | --- |
| `swap` | At the named section, the lane changes to a numbered sibling — the next family if the lane has several, otherwise the next part of its one family. The lane keeps its role and identity. |
| `roll` | An accelerating one-shot ramp into the named boundary: 4 hits in the first bar, 8 in the next, 16 in the last, overwriting the lane's steady pattern for those bars. Percussion lanes only. |
| `tail` | Place the lane's material so it *ends* on the named boundary rather than starting there. The engine does the tail-clearance arithmetic. Sustained lanes only. |
| `rest` | Explicit silence across a named section range. |

A riser that ends at a boundary is not an op.
An impact that starts at a boundary is also not an op.
An active `transition` lane adds them to each section boundary.

If an eighth op is ever needed for one genre, that is a signal to reconsider the
model rather than to extend it.

## Pool coherence

Spec-008 owns filename-labeled tempo and key, and publishes a **pool token** —
the `(bpm, keyToken)` pair from the `NAME_<bpm>_<key>_<pack>` convention, e.g.
`140/A` or `125/X`.
A pool token is a *pitch-coherence identity*, not a musical key.
In this convention, `A` probably means A minor.

Thus, `musicalKey` stays null for a bare-letter label.
The app does not infer a mode. There is no
competing planner-side parser.

The constraint binds to **stretching, not material**:

- All resampled pitched material in one project shares one pool token.
- **Natural-rate placements** (`nativeBPM: null`, true pitch) are exempt and may
  come from any pool. The AmbientHouse reference uses this technique for
  160-native drums and 90-native pads. A strict one-cluster rule would forbid it.
- A corpus with no filename labels has no pool token. The rule does not affect it.

The **analysis cluster is the material pool**.
Templates declare no folder names and stay corpus-independent.
The wizard cluster picker is the genre control.
The headless CLI `--cluster` option replaces it.
The cluster already bounds the material, so cross-genre coverage is unnecessary.
That rule forced an Ambient pad and a Brazil percussion loop into a Techno track.

Diversity now spreads across the **acoustic role folder**.
Examples include `Bass`, `Beats`, `Keys`, `Sphere`, and `Vocals`.
A role vocabulary matches these folders at any depth.
This method supports libraries with a nested subgenre level.

A role is only a planner hint. It breaks ranking ties but does not change
`sampleType`. Spec-018 gives filename transition words the same role.

## Mix, FX, and pan

Sends and returns are part of the arrangement. 69–100% of lanes carry a non-zero
send in every reference project, and every one configures exactly two return
modules.

- A profile declares up to two return buses **by built-in preset name** plus a
  return level. Spec-010 and spec-013 keep ownership of the 19 + 23 module
  parameters, so no template duplicates module state. The engine resolves the
  name and fails loudly if the shipped preset list no longer has it.
- Each lane declares one send level per declared bus. The plan widens that
  vector into the project's four send slots.
- The shipped presets cover the measured genre recipes: trance `Ambient Bloom` +
  `Dotted Motion`. Techno `Small Room` + `Wide Tape Echo`. House and tropical
  house `Vocal Plate` + `Clean Slap`. Melodic techno `Dark Hall` +
  `Dotted Motion`. Ambient house `Shimmer Cloud` + `Endless Wash`.

### Pan

**Lane position** — where a lane sits in the image — is mix data the profile
declares, capped at |pan| ≤ 0.35 by the template parser. Nothing infers it from
a filename.

The generator creates no mirrored stereo pairs.
No stereo-side evidence persists, so each generated lane has a null
`stereoPairId`. Symmetric values, names, and suffixes do not prove a pair.
Template-declared lane positions supply the required pan diversity within
the ±0.35 cap.

The persisted `stereoPairId` lane field remains part of the project format
(spec-011 AC-034). It describes current lane content: adding, moving,
duplicating, replacing, or deleting a placement on either paired lane clears the
shared ID from both. Name and Mixer edits do not.

### Gain

Lane gain comes from the profile and follows the reference hierarchy.
Kick is 0.60–0.78, and bass is 0.60–0.66.
Lead and voice are 0.46–0.54. Hats and stabs are 0.32–0.46.
Pads are 0.34–0.44, and spheres are 0.30–0.38.
Nothing sits above the kick.

RMS compensation applies only to sustained tonal roles, compared against other
tonal material. A drum one-shot RMS is not comparable to a loop RMS.
Compensation can move a lane by ±6 dB.
It cannot exceed 1.3× the profile gain.
Thus, a quiet textural loop cannot become louder than the kick.

## The reference baseline

Per the corpus-dependency decision, the `.mixjam` originals stay out of version
control. `src/shared/generator-reference-metrics.json` holds distilled metrics
for each reference project. It contains full envelope values and density curves.
Per-lane rows contain gain, pan, sends, placements, distinct sample counts, occupancy,
entries, and span histograms. It must support new measures without the originals.
If both original copies are lost, no process can recover omitted data.

The reference baseline classifies every pan as non-pair and records pair maximum
as zero. Symmetric lane positions are not evidence of a pair.

`npm run audit:mixjam -- <path|dir>` reports the envelope per project with a
density sparkline and a per-lane table. `--baseline` adds each measure's
distance from the reference range. `--emit-baseline <file>` rewrites the
distilled metrics.

## Acceptance Criteria

- [x] **AC-001:** `createMixJamGeneratorPlan` throws only on the structural
  invariants listed in §The envelope is a report. No density, coverage,
  family-ratio, or long-material rule throws.
- [x] **AC-002:** Every bundled profile has two or three named section arcs.
  The weights in each arc total 100. The seed alone selects the plan arc.
  The same seed reproduces the same arc.
- [x] **AC-003:** A lane a section gates out has no placement overlapping that
  section. Every arc's quietest section drops at least one core lane.
- [x] **AC-004:** No lane uses sections with more than 92 total weight.
  Each quietest section has at most half the lanes of its busiest section.
- [x] **AC-005:** `swap`, `roll`, `tail`, and `rest` ops resolve section names
  declared by their own arc. A `roll` binds to a percussion lane and a `tail` to
  a sustained one. An unresolvable or misapplied op is a template parse error.
- [x] **AC-006:** All stretched pitched placements in a plan share the plan's
  `poolToken`. Natural-rate placements are exempt. A corpus without filename
  labels plans with a null pool token.
- [x] **AC-007:** A bare-letter filename label produces a pool token and leaves
  `musicalKey` null.
- [x] **AC-008:** Every profile declares exactly one reverb and one delay preset.
  At least 70% of its lanes send to a return.
  Plan creation configures those two buses and leaves the others Empty.
  An unknown preset name throws.
- [x] **AC-009:** Every template lane's declared pan is within ±0.35. A
  generated project uses at least 6 distinct pan values. L/R-looking filenames
  create no pair, and no generated lane carries a `stereoPairId`.
- [x] **AC-010:** No lane's compensated gain exceeds 1.3× its profile gain, and
  no lane is louder than the kick.
- [x] **AC-011:** `computeMixJamMetrics` re-derives the committed reference
  metrics exactly. The committed baseline carries per-lane rows and each
  reference project's density curve.
- [x] **AC-012:** `npm run audit:mixjam` reports every envelope measure with its
  target, measured value, and PASS/FAIL result. It also reports a density
  sparkline and a per-lane table. `--baseline` adds distance from the reference range.

## Validation

- Unit: `src/shared/mixjam-metrics.test.ts`,
  `src/shared/sample-role-hints.test.ts`,
  `src/renderer/src/backend/generator-engine.test.ts`,
  `src/shared/generator-templates.test.ts`,
  `src/renderer/src/backend/generator-selection.test.ts`,
  `src/renderer/src/project/generated-project.test.ts`.
- Local gate: `npm run generate:mixjam` over `tmp/test-samples` for all six
  profiles, then `npm run audit:mixjam`. The repository does not contain the
  required corpus. Thus, CI can assert only the committed distilled metrics. A
  full generation run is a local gate.
- **Listening remains the real gate.** The envelope is necessary, not
sufficient. A musically incorrect project can still satisfy it.

## Non-Goals

- Inferring a genre from audio. The profile and the cluster carry the genre.
- Executable code, expressions, or conditionals inside templates.
- A per-lane timeline script. The coarse arc stays gate-driven. Ops add boundary
  accents only.
- Throwing on an aesthetic measure.

## References

- `src/shared/mixjam-metrics.ts`, `src/shared/generator-envelope.ts`,
  `src/shared/generator-reference-metrics.ts`
- `src/shared/generator-templates.ts`, `src/shared/generator-templates/schema.json`
- `src/renderer/src/backend/generator-engine.ts`,
  `src/renderer/src/backend/generator-selection.ts`
- `scripts/audit-mixjam.ts`, `scripts/generate-mixjam.ts`
