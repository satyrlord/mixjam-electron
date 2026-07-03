# Spec 014 — Musical Compatibility Filtering

**Spec Validation Status:** STUB — NOT VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-004 (Sample Library — `rule_json` query engine),
spec-008 (Sample Analysis — populates `samples.bpm` and `samples.musical_key`)

## Objective

Let users filter the library by musical *compatibility* with a reference —
"everything that mixes with this" — instead of exact values. Two new
`rule_json` leaf kinds compile to plain parameterized SQL against the columns
and indexes that already exist (`idx_samples_bpm`, `idx_samples_key`):

- `keyCompatible` expands a reference key through Camelot-wheel adjacency
  (relative major/minor plus wheel neighbors) into a `musical_key IN (...)`
  set.
- `bpmCompatible` expands a reference BPM into tolerance ranges including
  half- and double-time equivalents.

Because a library is a saved query, saving a compatibility filter yields a
living "fits my track" library that grows as new samples are indexed and
analyzed. No model, no new storage, no schema change — pure compile-time
expansion in the rule compiler. This is the deterministic half of perceptual
library building; the embedding-based half ("sounds like") is
[spec-015](spec-015-semantic-audio-search.md).

## User Stories

- **US-001:** As a user, I can filter the sample browser by "compatible with
  key Am" and get samples in Am plus its harmonic neighbors (C, Em, Dm), not
  just exact-key matches.
- **US-002:** As a user, I can filter by "compatible with 120 BPM" and get
  samples near 120 as well as near 60 and 240 (half/double time).
- **US-003:** As a user, I can right-click any analyzed sample and choose
  "Find compatible" to filter the browser by that sample's detected key and
  BPM in one action.
- **US-004:** As a user, I can save the current compatibility filter as a
  library, and it automatically includes matching samples that are analyzed
  later.
- **US-005:** As a user, samples with no detected key or BPM are excluded
  from compatibility results (same semantics as the existing `bpm` range
  leaf: NULL never matches).

## Scope (high-level — to be validated)

### `rule_json` leaf kinds (additive, version stays 1)

Per the versioning policy in [query-schema.md](../query-schema.md), new leaf
kinds are additive and do not bump the format version. Old builds encountering
the new kinds fail with the existing clear unknown-kind error.

```jsonc
// Camelot-wheel adjacency around a reference key.
// neighbors: how many wheel steps to include (default 1).
{ "kind": "keyCompatible", "key": "Am", "neighbors": 1 }

// Tolerance band around a reference BPM, optionally including
// half-time and double-time bands.
{ "kind": "bpmCompatible", "bpm": 120, "tolerancePercent": 4,
  "includeHalfDouble": true }
```

- The stored JSON keeps the *reference* (semantic intent), not the expanded
  set — expansion happens at compile time, mirroring how `withinDays` is
  resolved at query time. If the adjacency table or tolerance policy improves
  later, saved libraries pick up the improvement for free.
- `keyCompatible` compiles to `samples.musical_key IN (?, ...)` over the
  expanded key set. Compatibility set for v1: the reference key itself, its
  relative major/minor (same Camelot slot, other letter), and the same-letter
  slots at distance `neighbors` in each direction.
- `bpmCompatible` compiles to an OR of inclusive ranges
  (`samples.bpm BETWEEN ? AND ?`), one per band: the reference band and, when
  `includeHalfDouble` is set, the same percentage band around `bpm / 2` and
  `bpm * 2`.
- All values bound as parameters, per the existing hard rule.

### Key canonicalization

- A single canonical key vocabulary (24 values, e.g. `Am`, `C#m`, `F`) shared
  with spec-008's detector output. Enharmonic spellings (`Db` vs `C#`)
  normalize to one canonical form at write time (spec-008) and at rule-compile
  time (this spec), so `IN` matching never misses an enharmonic equivalent.

### UI

- "Find compatible" appears in the sample context menu and detail panel,
  enabled only when the sample has a detected (or manually set) key or BPM.
  It applies `keyCompatible` and/or `bpmCompatible` leaves to the browser's
  ad-hoc filter, from which the existing save-as-library flow takes over.
- The active filter renders as editable chips like existing leaves (reference
  value, neighbor depth, tolerance).

## Acceptance Criteria (draft)

- [ ] **AC-001:** A `keyCompatible` leaf for `Am` with `neighbors: 1` matches
  samples in exactly {Am, C, Em, Dm} and no others (table-driven test over the
  full Camelot mapping).
- [ ] **AC-002:** A `bpmCompatible` leaf for 120 with `includeHalfDouble` and
  4% tolerance matches samples at 60, 120, and 240 within tolerance, and
  rejects 90.
- [ ] **AC-003:** Samples with NULL `musical_key` / `bpm` never match a
  compatibility leaf.
- [ ] **AC-004:** Compiled SQL is fully parameterized (no literal user values)
  and uses the existing `idx_samples_key` / `idx_samples_bpm` indexes (verified
  via `EXPLAIN QUERY PLAN`).
- [ ] **AC-005:** A saved compatibility library includes a newly analyzed
  matching sample after analysis completes, with no edit to the library.
- [ ] **AC-006:** "Find compatible" is disabled with an explanatory affordance
  on samples that have neither key nor BPM.
- [ ] **AC-007:** Enharmonic inputs (`Db` vs `C#`) produce identical match
  sets.

## Non-Goals

- No audio-content similarity — that is spec-015 (`similarTo`).
- No key/BPM *detection* — that is spec-008; this spec only consumes its
  columns.
- No pitch-shifting or re-tuning suggestions ("shift +2 semitones to fit") —
  filtering only.
- No user-editable Camelot mapping or custom compatibility rules in v1.
- No "energy boost" (+2 wheel steps) or other DJ-transition heuristics beyond
  plain adjacency in v1.

## Open Questions

- Canonical key vocabulary: exact 24-string set, and where normalization
  lives so spec-008 output, manual key entry, and this spec's compiler cannot
  drift (a shared module with the mapping table is the likely answer).
- Default `neighbors` depth (1 seems right for harmonic mixing practice) and
  whether the UI exposes it or hardcodes it in v1.
- Default `tolerancePercent`, and whether half/double bands default on or off
  for "Find compatible".
- Whether "Find compatible" combines key and BPM with AND (stricter, likely
  right) or OR when the sample has both.
- Should the browser surface how many samples were excluded for lacking
  analysis data (nudging users toward running analysis), or is that noise?

## References

- Camelot wheel / harmonic mixing — <https://mixedinkey.com/harmonic-mixing-guide/>
- `rule_json` format and versioning — [docs/query-schema.md](../query-schema.md)
- Detected key/BPM producer — [spec-008](spec-008-sample-analysis.md)
