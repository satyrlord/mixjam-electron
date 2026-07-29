# `rule_json` query schema

A library is a saved query. Its JSON is stored in
`library_rules.rule_json`.

This document defines the accepted target predicate-tree contract.
The current implementation supports only a restricted v1 subset:

- saved libraries contain one top-level `and` group
- supported leaves are `text` and `tag` with `all`
- opening a library restores search text and valid tag ids
- the UI sends a flat `SampleQueryRequest` to the backend worker
- the backend compiles those flat fields to parameterized SQL

The current library parser validates this restricted shape atomically. Explicit
version 1 rules require the top-level `group` / `and` descriptors. Earlier
unversioned rules may omit those descriptors but must otherwise have the same
shape. The parser rejects the whole rule for any unsupported or malformed item.
These items include versions, group operators, quantifiers, nested groups, unknown leaves, and duplicate leaf kinds.
The parser does not apply a recognized subset with different semantics.

The full predicate-tree compiler below remains required before later specs add leaf kinds
or boolean composition.

## Target design goals

- Express **tag AND/OR/NOT** logic, **BPM/key range**, **text search**,
  **date-added**, and **duration** filters.
- Be **extensible**: new leaf types can be added without breaking stored rules.
- Compile to one parameterized SQL `WHERE` clause with no in-memory filters.

## Current supported shape

```json
{
  "version": 1,
  "root": {
    "kind": "group",
    "op": "and",
    "children": [
      { "kind": "text", "query": "kick" },
      { "kind": "tag", "quantifier": "all", "tagIds": [1, 2] }
    ]
  }
}
```

All children are optional. Multiple tag ids use `all` semantics in the backend
query. The saved JSON is not used for
ad-hoc browser filters. Live filters use `SampleQueryRequest`.

## Target shape: a versioned predicate tree

```jsonc
{
  "version": 1,
  "root": <node>
}
```

A `<node>` is either a **group** (boolean combinator) or a **leaf** (a condition).
Groups nest arbitrarily, which is what gives full AND/OR/NOT expressiveness.

### Group node

```jsonc
{
  "kind": "group",
  "op": "and" | "or" | "not",   // "not" negates its (single) child group/leaf
  "children": [ <node>, ... ]   // "not" takes exactly one child
}
```

### Leaf nodes

Every leaf has a `kind` discriminator. In the completed compiler, unknown
`kind`s must cause a clear error rather than a silent pass, so an old build
never mis-runs a newer rule.

```jsonc
// Tags. quantifier controls how multiple tagIds combine.
{ "kind": "tag", "quantifier": "any" | "all" | "none", "tagIds": [1, 2] }

// Numeric ranges. Either bound may be omitted (open-ended). Inclusive.
{ "kind": "bpm", "min": 120, "max": 140 }
{ "kind": "duration", "min": 0.0, "max": 2.0 }   // seconds

// Musical key — membership in a set.
{ "kind": "key", "in": ["Am", "C", "G"] }

// Full-text search over filename/relpath via FTS5.
{ "kind": "text", "query": "kick punchy" }

// Date added. Absolute (epoch ms) or relative; use one style per leaf.
{ "kind": "dateAdded", "after": 1704067200000, "before": 1735689599000 }
{ "kind": "dateAdded", "withinDays": 30 }

// File extension / format.
{ "kind": "ext", "in": ["wav", "aiff"] }
```

### Target example

"WAVs tagged `kick` OR `snare`, 90–140 BPM, not tagged `broken`":

```json
{
  "version": 1,
  "root": {
    "kind": "group", "op": "and",
    "children": [
      { "kind": "ext", "in": ["wav"] },
      { "kind": "tag", "quantifier": "any", "tagIds": [11, 12] },
      { "kind": "bpm", "min": 90, "max": 140 },
      { "kind": "group", "op": "not",
        "children": [ { "kind": "tag", "quantifier": "any", "tagIds": [99] } ] }
    ]
  }
}
```

## Target compilation to SQL

The completed query engine will walk the tree and emit a parameterized `WHERE`
fragment plus a parameter array. Outline:

- **group/and** → `(<child> AND <child> ...)`. **or** → `OR`. **not** →
  `NOT (<child>)`. An empty `and` group matches all. An empty `or` matches none.
- **tag**
  - `any` → `EXISTS (SELECT 1 FROM sample_tags st WHERE st.sample_id = samples.id AND st.tag_id IN (?, ?))`
  - `all` → one `EXISTS` per tag id (AND-ed), or a `GROUP BY ... HAVING COUNT(DISTINCT tag_id) = N`
  - `none` → `NOT EXISTS (... IN (...))`
- **bpm / duration** → `samples.bpm >= ? AND samples.bpm <= ?` (emit only the
  bounds that are present). NULL values do not match a range (intended: untagged
  BPM is excluded from a BPM filter).
- **key / ext** → `samples.musical_key IN (...)` / `samples.ext IN (...)`.
- **text** → `samples.id IN (SELECT rowid FROM samples_fts WHERE samples_fts MATCH ?)`.
- **dateAdded** → bounds on `samples.date_added`. Resolve `withinDays` to
  `date_added >= (now - days*86400000)` **at query time** (never baked into stored
  JSON, so a saved "last 30 days" library stays relative).

Always bind values as parameters.
Never join user input into an SQL string.

## Target versioning and migration

Once the full parser is implemented, `version` gates it. To evolve the format:

1. Add new leaf `kind`s without changing old kinds.
   Old rules continue to work without a migration.
2. For a **breaking** change, bump `version`, write a `migrateRule(v_old → v_new)`
   transform, and run it lazily when a library is loaded (and persist the upgraded
   JSON back).
   Reject newer `version` values with a clear message.

A validator must run on every rule before it is compiled or saved, so malformed
rules fail fast at the boundary. Until that validator and compiler ship, later
specs must not extend the executable `rule_json` surface.
