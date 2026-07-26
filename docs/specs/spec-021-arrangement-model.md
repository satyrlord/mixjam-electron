# Spec 021 — Generator Arrangement Model

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** PARTIAL — the occupancy envelope, boundary ops,
pool coherence, lane-position pan, and the mix/FX contract are implemented.
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

Four code paths existed to enforce that target. All four are deleted. What
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
  A placement occupies every bar it sounds in; a clip ending exactly on a bar
  line does not claim the next bar.
- **Entries** are contiguous occupancy runs — how many times a lane enters the
  arrangement.
- The **sustained peak** is the 90th-percentile bar density, not the single-bar
  maximum. A riser, an impact, and every lane coinciding for one bar is a spike;
  measuring a plateau against it reports 1–3 bars even for arrangements that
  plainly hold an 8-bar peak.

### The envelope is a report

`createMixJamGeneratorPlan` hard-fails on **structural invariants only**:

- every placement lies inside the song and has a positive span,
- no two placements overlap on one lane,
- every placement of one sample carries the same span (spec-011 AC-016), so a
  trim is a decision about the *sample* and not about the site that placed it:
  percussion trims to the pattern's tightest stride and a roll to its tightest
  subdivision, never to the local one,
- some placement ends exactly at the song end,
- 8–32 lanes are populated,
- a profile's core lanes have compatible material,
- every lane's pan is within the mix-position cap (see §Pan).

Everything in the envelope table is reported by `npm run audit:mixjam` and
asserted in tests against the committed reference metrics. Enforcing an
aesthetic target inside planning is what grew the repair passes that
manufactured a wall of sound, and the reference library itself scores 13–16 of
16 — a project may miss a measure and still be right.

## Section arcs

A **profile** is the musical style contract; a **bundled template** is the JSON
document that declares one. Each profile carries **two or three section arcs**.
The seed picks one, so exact regeneration reproduces it: seed plus profile
version selects the arc, and the chosen arc's name is persisted on the plan as
`arcName`.

Sections are allocated in whole 8-bar phrases by weight, never in bars. A
low-weight section may receive zero phrases in a short song and simply vanish.
Within a section:

- `build` ramps optional lanes in across the section's phrases.
- `outro` ramps them out.
- `steady` holds the section's lane set, except that the final phrase of a
  section of three or more phrases sheds its outer layers — the subtraction into
  the boundary every reference project uses. Which lanes are shed rotates by
  section, so gaps spread across the arrangement.

**Lanes a section gates out stay out.** There is no coverage pass that drags an
absent lane back in. `ensureLaneDensity`, `ensureFamilyRatioPlacements`, the
`validateArrangement` density check, the phrase `motif: 'A' | 'B' | 'rest'`
machinery, and the two-phrase repetition ban are all deleted. A lane may now
hold one unchanged idea for a whole section, which is what the reference
trance's 56-bar arp does.

Percussion lanes drop their final bar before a section boundary. That silence
is the most common setup gesture in the reference library, and it is why a
four-on-the-floor kick stays under the never-above-90%-occupancy line without
ever being muted for a whole section.

## Boundary ops

A short declarative op list adds boundary accents. Ops address sections **by
name**, so a template stays duration-independent; the engine resolves names to
bars after section allocation. No op takes an expression or a condition, which
keeps spec-018's "no executable code in templates" non-goal intact.

| Op | Meaning |
| --- | --- |
| `swap` | At the named section, the lane changes to a numbered sibling — the next family if the lane has several, otherwise the next part of its one family. The lane keeps its role and identity. |
| `roll` | An accelerating one-shot ramp into the named boundary: 4 hits in the first bar, 8 in the next, 16 in the last, overwriting the lane's steady pattern for those bars. Percussion lanes only. |
| `tail` | Place the lane's material so it *ends* on the named boundary rather than starting there. The engine does the tail-clearance arithmetic. Sustained lanes only. |
| `rest` | Explicit silence across a named section range. |

A riser ending at a section boundary and an impact starting at one are not ops:
they are what a `transition` lane does, and every section boundary gets them
where the lane is active.

If an eighth op is ever needed for one genre, that is a signal to reconsider the
model rather than to extend it.

## Pool coherence

Spec-008 owns filename-labeled tempo and key, and publishes a **pool token** —
the `(bpm, keyToken)` pair from the `NAME_<bpm>_<key>_<pack>` convention, e.g.
`140/A` or `125/X`. A pool token is a *pitch-coherence identity*, not a musical
key: `A` in this convention almost certainly means A minor, so `musicalKey`
stays null for a bare-letter label and no mode is guessed. There is no
competing planner-side parser.

The constraint binds to **stretching, not material**:

- All resampled pitched material in one project shares one pool token.
- **Natural-rate placements** (`nativeBPM: null`, true pitch) are exempt and may
  come from any pool. This is the technique the AmbientHouse reference uses to
  combine 160-native drums with 90-native pads, and a strict one-cluster rule
  would forbid it.
- A corpus with no filename labels has no pool token and is unaffected.

The **analysis cluster is the material pool**. Templates declare no folder names
and stay corpus-independent; the wizard's cluster picker is the genre lever, and
the headless CLI's `--cluster` stands in for it. Because the cluster already
bounds the material, category coverage is no longer a cross-genre requirement —
under a genre-first corpus that rule actively forced an Ambient pad and a Brazil
percussion loop into a Techno track.

Diversity now spreads over the **acoustic role folder** (`Bass`, `Beats`,
`Keys`, `Sphere`, `Vocals`, …), matched against a role vocabulary at any depth
rather than at a fixed segment index, because libraries nest a subgenre level.
A role is a planner *hint*: it breaks ties in candidate ranking and never
rewrites the stored `sampleType`, exactly as spec-018 already treats filename
transition words.

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
  `Dotted Motion`; techno `Small Room` + `Wide Tape Echo`; house and tropical
  house `Vocal Plate` + `Clean Slap`; melodic techno `Dark Hall` +
  `Dotted Motion`; ambient house `Shimmer Cloud` + `Endless Wash`.

### Pan

**Lane position** — where a lane sits in the image — is mix data the profile
declares, capped at |pan| ≤ 0.35 by the template parser. Nothing infers it from
a filename.

The generator creates no mirrored stereo pairs. No stereo-side evidence is
persisted anywhere, so every generated lane plan carries a null `stereoPairId`,
and symmetric values, lane names, and filename suffixes are never evidence of a
pair. Template-declared lane positions supply the required pan diversity within
the ±0.35 cap.

The persisted `stereoPairId` lane field remains part of the project format
(spec-011 AC-034). It describes current lane content: adding, moving,
duplicating, replacing, or deleting a placement on either paired lane clears the
shared ID from both; name and Mixer edits do not.

### Gain

Lane gain comes from the profile and follows the reference hierarchy: kick
0.60–0.78, bass 0.60–0.66, lead and voice 0.46–0.54, hats and stabs 0.32–0.46,
pads 0.34–0.44, spheres 0.30–0.38. Nothing sits above the kick.

RMS compensation applies only to sustained tonal roles, compared against other
tonal material — a drum one-shot's RMS is transient-shaped and not comparable to
a loop's. Compensation may move a lane by ±6 dB but never past 1.3× its profile
gain, so a quiet textural loop cannot climb over the kick.

## The reference baseline

Per the corpus-dependency decision, the `.mixjam` originals stay out of version
control. `src/shared/generator-reference-metrics.json` holds distilled metrics
for each reference project: the full envelope values, the density curve, and
per-lane rows (gain, pan, sends, placements, distinct samples, occupancy,
entries, span histogram). It must carry enough detail that a new measure rarely
needs the originals back — if both copies of a reference project are lost,
nothing it omits can be re-derived.

The reference baseline classifies every pan as non-pair and records pair maximum
as zero; symmetric lane positions are not evidence of a pair.

`npm run audit:mixjam -- <path|dir>` reports the envelope per project with a
density sparkline and a per-lane table. `--baseline` adds each measure's
distance from the reference range. `--emit-baseline <file>` rewrites the
distilled metrics.

## Acceptance Criteria

- [x] **AC-001:** `createMixJamGeneratorPlan` throws only on the structural
  invariants listed in §The envelope is a report. No density, coverage,
  family-ratio, or long-material rule throws.
- [x] **AC-002:** Every bundled profile carries two or three named section arcs
  whose weights each total 100, and the seed alone selects which arc a plan
  uses. The same seed reproduces the same arc.
- [x] **AC-003:** A lane a section gates out has no placement overlapping that
  section, and every arc's quietest section drops at least one core lane.
- [x] **AC-004:** No lane in any arc is scheduled in sections totalling more
  than 92 weight, and every arc's quietest section carries at most half the
  lanes of its busiest.
- [x] **AC-005:** `swap`, `roll`, `tail`, and `rest` ops resolve section names
  declared by their own arc; a `roll` binds to a percussion lane and a `tail` to
  a sustained one. An unresolvable or misapplied op is a template parse error.
- [x] **AC-006:** All stretched pitched placements in a plan share the plan's
  `poolToken`; natural-rate placements are exempt. A corpus without filename
  labels plans with a null pool token.
- [x] **AC-007:** A bare-letter filename label produces a pool token and leaves
  `musicalKey` null.
- [x] **AC-008:** Every profile declares exactly one reverb and one delay return
  by preset name, at least 70% of its lanes send into a return, and materializing
  a plan configures those two buses and leaves the rest Empty. An unknown preset
  name throws.
- [x] **AC-009:** Every template lane's declared pan is within ±0.35 and a
  generated project uses at least 6 distinct pan values. L/R-looking filenames
  create no pair, and no generated lane carries a `stereoPairId`.
- [x] **AC-010:** No lane's compensated gain exceeds 1.3× its profile gain, and
  no lane is louder than the kick.
- [x] **AC-011:** `computeMixJamMetrics` re-derives the committed reference
  metrics exactly, and the committed baseline carries per-lane rows and the
  density curve for every reference project.
- [x] **AC-012:** `npm run audit:mixjam` reports every envelope measure with its
  target, the measured value, and PASS/FAIL, plus a density sparkline and a
  per-lane table; `--baseline` adds distance from the reference range.

## Validation

- Unit: `src/shared/mixjam-metrics.test.ts`,
  `src/shared/sample-role-hints.test.ts`,
  `src/renderer/src/backend/generator-engine.test.ts`,
  `src/renderer/src/backend/generator-templates.test.ts`,
  `src/renderer/src/backend/generator-selection.test.ts`,
  `src/renderer/src/project/generated-project.test.ts`.
- Local gate: `npm run generate:mixjam` over `tmp/test-samples` for all six
  profiles, then `npm run audit:mixjam`. The absolute numbers depend on a corpus
  that is not in the repository, so CI can assert only the committed distilled
  metrics; a full generation run is a local gate.
- **Listening remains the real gate.** The envelope is necessary, not
  sufficient — it can be satisfied by a project that is still musically wrong.

## Non-Goals

- Inferring a genre from audio. The profile and the cluster carry the genre.
- Executable code, expressions, or conditionals inside templates.
- A per-lane timeline script. The coarse arc stays gate-driven; ops add boundary
  accents only.
- Throwing on an aesthetic measure.

## References

- `src/shared/mixjam-metrics.ts`, `src/shared/generator-envelope.ts`,
  `src/shared/generator-reference-metrics.ts`
- `src/shared/generator-templates.ts`, `src/shared/generator-templates/schema.json`
- `src/renderer/src/backend/generator-engine.ts`,
  `src/renderer/src/backend/generator-selection.ts`
- `scripts/audit-mixjam.ts`, `scripts/generate-mixjam.ts`
