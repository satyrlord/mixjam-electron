# Spec 008 — Sample Analysis & Type Classification

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** PARTIAL — BPM, key, and type analysis
implemented; validated stereo-pair evidence not implemented
**Depends on:** spec-004 (Sample Library Browsing, Search & Tagging)

## Objective

Use one background analyzer to detect BPM, musical key, and acoustic sample
type. The analyzer combines raw per-file evidence with the context of a
real sample collection without assuming that a complete Sample Folder has one
tempo or key. Results populate acoustic metadata without changing categories or
tags.

## User Stories

- **US-001:** As a user, my sample library is analyzed automatically without a
  second calibration workflow.
- **US-002:** As a user, samples receive useful BPM, key, and acoustic type
  results even when individual files are short or ambiguous.
- **US-003:** As a user, product, style, author, and source-pack relationships
  may improve results across nested folders without flattening a mixed library.
- **US-004:** As a user, I can see progress and manually correct any automatic
  value.
- **US-005:** As a user, Generate MixJam can choose one coherent analysis
  cluster when my Sample Folder contains several tempos or keys.

## Scope

### One analysis pipeline

- One analyzer owns automatic sync analysis, individual re-analysis, contextual
  grouping, cluster inference, and the BPM/key/type semantics used by Generate
  MixJam. There is no Uniform Folder Calibration operation, confirmation, API,
  progress state, or product control.
- The analyzer runs in the backend worker and never blocks the UI.
- Automatic analysis follows indexing. It processes only new, changed,
  interrupted, or stale-revision samples. Per-field manual overrides are never
  replaced.
- Multi-field manual patches validate every supplied field before writing and
  commit as one transaction. A readable unsupported or damaged file clears
  stale automatic values; a transient read failure preserves them for retry.
- Batch progress reports `{ analyzed: N, total: M }`. `scan-done` exposes the
  indexed library before analysis begins. `analysis-done` refreshes the current
  windowed query and publishes current cluster summaries.
- Individual re-analysis uses the same decoder, raw evidence, and inference code
  as batch analysis. It has a typed sample/job identity and finishes only after
  the file evidence and contextual model commit.
- Automatic decoding supports PCM and IEEE-float WAV, including
  WAVE_FORMAT_EXTENSIBLE. Other indexed formats remain available for manual
  overrides until their decoder is implemented.

### Evidence model

The analyzer stores its direct per-file BPM and key results in `raw_bpm` and
`raw_musical_key` before deriving the user-facing `bpm` and `musical_key`.
Duration, sample type, and relative path come from the existing sample row.
Conservative structured BPM/key tokens in the relative path are additional
context evidence. A manual value is authoritative for that sample, but it is
excluded from group votes so one local correction cannot train sibling files.
Contextual projection never replaces the manual field itself.

Repeated numbered or stereo filename variants inside one directory are
collapsed to one voting cohort before group inference, so duplicated exports do
not dominate a context merely by file count.

### Validated stereo-pair evidence

The analyzer is the only owner of generator-safe stereo-side evidence. It may
set `stereo_pair_key` and `stereo_side` only when all of these checks pass:

- two readable, metadata-ready mono files are in the same directory;
- their basenames differ only by one terminal, separator-delimited `L`/`R` or
  `Left`/`Right` token, matched case-insensitively;
- exactly one file resolves to each side;
- sample rate matches; and
- duration differs by no more than one sample frame at that shared rate.

The normalized directory plus basename with the side token removed forms the
pair key. Ambiguous groups, an absent partner, stereo or unknown channel count,
metadata mismatch, or an unrecognized filename produce NULL evidence for every
candidate. A scan change or missing partner revalidates and clears both sides
atomically. The analyzer exposes the persisted pair key and side through the
windowed sample and generator DTOs. The generator consumes this evidence and
never parses a filename to infer pan.

Short one-shots, percussion, FX, and other ambiguous files may have NULL raw BPM
or key. An abstention is not a vote for another value. Sample type remains the
direct per-file classifier result and is independent of the organizational
category tree.

### Contextual groups

A contextual group is a set of current samples with one stable context key. The
root uses the empty key. Every directory prefix is evaluated, so a product or
style can resolve even when it contains many instrument subfolders. Structured
source-pack suffixes such as `SC1` or `SL4` also create virtual
`@cohort/<top-level>/<suffix>` keys that relate files across instrument
subfolders. No group is assumed uniform.

Each persisted group records its context key in `relpath_prefix`, depth, sample count, state,
representative BPM/key when resolved, BPM/key support, confidence, and analysis
revision. Its state is `resolved`, `mixed`, or `uncertain`.

### Analysis clusters

An analysis cluster is a resolved contextual group selected from the context tree.
Cluster summaries are derived from persisted group rows rather than stored in a
second cluster table.

- Tempo clustering compares exact candidates and musically plausible half- or
  double-tempo aliases. Duration-grid and onset evidence must agree before an
  ambiguous alias is promoted.
- Key clustering canonicalizes pitch plus major/minor mode across raw and
  structured path evidence. NULL detections abstain.
- A resolved parent is one cluster. A mixed parent exposes its nearest resolved,
  non-overlapping descendant or cohort groups as selectable clusters. Multimodal
  evidence must split by context or remain mixed; it must never be collapsed to
  the largest root-wide mode.
- A sample first considers its virtual source cohort, then its deepest resolved
  directory ancestor. It inherits BPM/key only when that group has adequate
  support. Otherwise its automatic projection remains its raw result or NULL.
- Manual values remain attached to their sample and win over an inferred
  cluster projection. Clearing a manual value allows the same analyzer to
  project the current automatic result again.

The analyzer exposes root-scoped cluster summaries for browsing and generation.
It does not expose a user promise that all files in a folder share one BPM or
key.

### BPM and key detection

- Raw BPM evidence comes from onset/IOI analysis; contextual inference combines
  it with duration-grid, structured path-label, and resolved-group support.
- Raw musical-key evidence comes from chromagram analysis; contextual inference
  combines it with structured path-label and resolved-group support.
- Either field remains NULL when evidence is insufficient or contradictory.
- Automatic values expose `analysis` provenance in existing sample surfaces;
  raw evidence and group summaries remain available to backend diagnostics and
  generator readiness.

### Sample type and generator scoring

The analyzer's decoded buffer produces acoustic sample type. The generator may
retain its bounded audio scoring pass for arrangement-only measures such as:

- RMS energy;
- spectral centroid;
- zero-crossing rate;
- onset, transient, and rhythmic-regularity measures;
- duration, loop, and boundary-continuity measures; and
- energy slope and a planner kind such as one-shot, rhythmic loop, tonal loop,
  vocal, atmosphere, riser, impact, or texture.

The acoustic type is one of Kick, Snare, Hi-hat, Percussion, Bass, Synth, FX,
Vocal, Loop, Atmosphere, or Other. `sample_type` remains separate from
`samples.category_id`; analysis never replaces organizational categories.

Generate MixJam must consume persisted BPM, key, and sample type. Its bounded
scoring pass must not derive competing semantic values for those fields.

### Incremental invalidation

- A new or byte-changed file resets its metadata and analysis revisions. Its raw
  evidence and automatic projections are stale until that file is decoded again.
- A path change invalidates membership in the old/new directory and cohort
  groups.
  With the current `(root_id, relpath)` identity it appears as missing plus new;
  content move detection remains out of scope.
- After pending files are decoded, group summaries and automatic projections for
  the affected root are rebuilt from stored raw evidence. Unchanged siblings are
  not decoded. A grouping-only algorithm revision also reuses raw evidence.
- Updated group rows and contextual projections commit atomically, so a
  cancelled job cannot expose a partially rewritten model.
- Browsing may continue against the last completed model while an incremental
  update runs. Generate MixJam waits for the selected root and chosen cluster to
  be current.

### Manual override

- Any automatic BPM, key, or sample type may be overridden.
- Manual fields survive sync, contextual regrouping, and re-analysis.
- Clearing a manual field clears its value and source, then queues that sample
  for the current automatic projection.
- The context-menu analysis editor shows each value and its `analysis`,
  `manual`, or unset provenance. Its analysis action routes through the one
  analyzer.
- Batch status uses native progress semantics with visible analyzed and total
  text. Fatal scan and analysis errors keep their backend message and correct
  root/job identity.

### Real-world validation corpus

Validation uses both controlled fixtures and real, nested collections. Record
the file count, byte count, relevant tree snapshot, and analyzer revisions with
every accuracy result.

`tmp/test-samples` is a confirmed 140 BPM/A-minor reference corpus. The
read-only `E:/_samples/eJay` inventory is a mixed-root structural corpus with
100,951 WAV files across product, style, instrument, and source-pack cohorts.
Its explicit labels demonstrate both locally uniform cohorts and genuine mixed
groups. Validation must include at least one resolved nested context, one
cross-folder source cohort, one mixed parent with resolved descendants, one
short/one-shot-heavy group, and one group whose correct result is unresolved.

## Acceptance Criteria

- [x] **AC-001:** One backend analyzer owns batch, individual, contextual, and
  BPM/key/type analysis. No Uniform Folder Calibration API or UI remains.
- [x] **AC-002:** Analysis runs in the worker, reports root/job-scoped progress,
  and leaves the windowed library responsive.
- [x] **AC-003:** Clear rhythmic and tonal fixtures produce reasonable BPM and
  key results; ineligible one-shots may abstain instead of adding false votes.
- [x] **AC-004:** Raw BPM/key evidence and acoustic sample type are produced from
  one analyzer decode; raw BPM/key are persisted separately from contextual
  projections.
- [x] **AC-005:** Manual BPM, key, and type values survive sync, regrouping, and
  re-analysis; clearing one permits automatic projection for that field.
- [x] **AC-006:** Every directory prefix is evaluated independently, and stable
  SC/SL suffixes may form a virtual cohort across instrument folders. A resolved
  product/style parent may cover nested folders while a mixed parent exposes
  resolved descendants or cohorts.
- [x] **AC-007:** A mixed root exposes multiple coherent cluster summaries or an
  unresolved state. It never exposes one root median as the detected tempo.
- [x] **AC-008:** On the confirmed `tmp/test-samples` corpus, at least 80 percent
  of all WAV files are within 5 BPM of 140 and at least 80 percent are exactly
  `Am`; NULL results count as misses.
- [x] **AC-009:** Controlled mixed-tempo, mixed-key, and half/double-tempo alias
  fixtures remain separated unless independent evidence supports one alias.
- [x] **AC-010:** Changing one file decodes only that file, then rebuilds the
  root's group summaries from stored raw evidence. A grouping-only revision
  performs no audio reads.
- [x] **AC-011:** Individual and batch requests use the same evidence and
  inference functions and cannot overlap a conflicting root mutation.
- [x] **AC-012:** Generate MixJam receives current resolved-group summaries and
  restricts candidates to the selected context key. Its bounded scoring pass
  does not recompute BPM, key, or sample type.
- [x] **AC-013:** The eJay structural fixture proves a resolved nested context,
  a cross-folder source cohort, a mixed parent with resolved descendants, and a
  heterogeneous root without flattening the complete library.
- [ ] **AC-014:** The stereo-pair validator persists left/right evidence only
  for unambiguous complementary mono files with matching sample rate and
  one-frame duration tolerance. It clears stale pairs atomically and exposes
  evidence to generator DTOs; ambiguous and unpaired files remain NULL.

## Implementation Ownership

- `backend/analysis.ts` owns direct per-file WAV decoding, BPM/key extraction,
  and acoustic sample-type classification.
- `backend/contextual-analysis.ts` owns structured path-label parsing, directory
  and SC/SL cohort groups, alias-aware tempo inference, group states, and final
  automatic projections.
- `backend/analysis-persistence.ts` owns raw evidence, atomic group replacement,
  stereo-pair evidence, manual-field protection, and the canonical root/cluster
  summary.
- `backend/analysis-runner.ts` owns batch and individual orchestration through
  the same analyzer path.
- `backend/schema.ts` owns the schema-v4 raw evidence and `analysis_groups`
  migration.
- `backend/generator-library.ts` consumes canonical group summaries; it does not
  define BPM, key, or acoustic sample type.

## Validation

Focused tests must cover raw evidence extraction, directory/cohort grouping,
multimodal states, abstentions, manual precedence, incremental invalidation,
atomic projection updates, and generator readiness DTOs. Run:

```sh
npm test -- src/renderer/src/backend/analysis.test.ts
npm test -- src/renderer/src/backend/analysis-library.test.ts
npm test -- src/renderer/src/backend/analysis-runner.test.ts
npm test -- src/renderer/src/backend/worker-scheduler.test.ts
npm run typecheck
npm run lint
npm run build
```

Real-corpus evidence must record analyzer revisions, path-group and cluster
summaries, raw evidence coverage, abstentions, alias conflicts, decoded file
count, reused-evidence count, and rebuilt-root count. Performance claims
must state the machine, corpus snapshot, cold/warm state, and measured workload.

## Non-Goals

- No precomputed waveform assets.
- No machine-learning or network analysis service.
- No user assertion that an entire Sample Folder is uniform.
- No second generator-owned BPM, key, or sample-type analyzer. Bounded
  arrangement scoring may decode shortlisted audio.
- No cross-library accuracy guarantee without recorded corpus evidence.
- No automatic MP3, FLAC, OGG, or AIFF decoding in the first implementation.
