# `rule_json` query schema

A library is a saved query. Its JSON is stored in
`library_rules.rule_json`.

The full predicate-tree contract in this document is the accepted target
architecture. The current implementation supports only a restricted v1 subset:

- saved libraries contain one top-level `and` group
- supported leaves are `text`, one `category`, and `tag` with `any`
- opening a library restores those three UI filter values
- the UI sends a flat `SampleQueryRequest` to the backend worker
- the backend compiles those flat fields to parameterized SQL

The current library parser does not validate `version`, group operators,
quantifiers, nested groups, or unknown leaves. Hand-authored rules outside the
supported subset must therefore not be treated as executable. Implementing the
validator and full compiler below remains required before later specs add leaf
kinds or boolean composition.

## Target design goals

- Express **tag AND/OR/NOT** logic, **category-tree** filtering (with descendants),
  **BPM/key range**, **text search**, **date-added**, and **duration** filters.
- Be **extensible**: new leaf types can be added without breaking stored rules.
- Compile to a single parameterized SQL `WHERE` clause — no in-memory filtering.

## Current supported shape

```json
{
  "version": 1,
  "root": {
    "kind": "group",
    "op": "and",
    "children": [
      { "kind": "text", "query": "kick" },
      {
        "kind": "category",
        "quantifier": "any",
        "categoryIds": [7],
        "includeDescendants": true
      },
      { "kind": "tag", "quantifier": "any", "tagIds": [1, 2] }
    ]
  }
}
```

All children are optional. Only the first category id is restored. Multiple tag
ids use `any` semantics in the backend query. The saved JSON is not used for
ad-hoc browser filtering; live filters travel through `SampleQueryRequest`.

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

// Categories. includeDescendants pulls in the whole subtree (recursive CTE).
{ "kind": "category", "quantifier": "any" | "all" | "none",
  "categoryIds": [7], "includeDescendants": true }

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

"WAVs tagged `kick` OR `snare`, in the *Drums* category tree, 90–140 BPM, not
tagged `broken`":

```json
{
  "version": 1,
  "root": {
    "kind": "group", "op": "and",
    "children": [
      { "kind": "ext", "in": ["wav"] },
      { "kind": "tag", "quantifier": "any", "tagIds": [11, 12] },
      { "kind": "category", "quantifier": "any", "categoryIds": [3], "includeDescendants": true },
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

- **group/and** → `(<child> AND <child> ...)`; **or** → `OR`; **not** →
  `NOT (<child>)`. An empty `and` group matches all; an empty `or` matches none.
- **tag**
  - `any` → `EXISTS (SELECT 1 FROM sample_tags st WHERE st.sample_id = samples.id AND st.tag_id IN (?, ?))`
  - `all` → one `EXISTS` per tag id (AND-ed), or a `GROUP BY ... HAVING COUNT(DISTINCT tag_id) = N`
  - `none` → `NOT EXISTS (... IN (...))`
- **category** → same `EXISTS` pattern against `sample_categories`; when
  `includeDescendants`, expand `categoryIds` through the recursive CTE in
  [data-model.md](data-model.md#category-tree-queries) first.
- **bpm / duration** → `samples.bpm >= ? AND samples.bpm <= ?` (emit only the
  bounds that are present). NULL values do not match a range (intended: untagged
  BPM is excluded from a BPM filter).
- **key / ext** → `samples.musical_key IN (...)` / `samples.ext IN (...)`.
- **text** → `samples.id IN (SELECT rowid FROM samples_fts WHERE samples_fts MATCH ?)`.
- **dateAdded** → bounds on `samples.date_added`; `withinDays` is resolved to
  `date_added >= (now - days*86400000)` **at query time** (never baked into stored
  JSON, so a saved "last 30 days" library stays relative).

Always bind values as parameters — never string-concatenate user input into SQL.

## Target versioning and migration

Once the full parser is implemented, `version` gates it. To evolve the format:

1. Add new leaf `kind`s additively — old rules keep working, no migration needed.
2. For a **breaking** change, bump `version`, write a `migrateRule(v_old → v_new)`
   transform, and run it lazily when a library is loaded (and persist the upgraded
   JSON back). Reject `version` values newer than the running build understands with
   a clear message.

A validator must run on every rule before it is compiled or saved, so malformed
rules fail fast at the boundary. Until that validator and compiler ship, later
specs must not extend the executable `rule_json` surface.
