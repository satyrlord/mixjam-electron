# MixJam Sample Library & Tracker — Documentation

A Windows Electron desktop app with two halves:

1. A **sample-library browser/tagger** over a huge local library (35GB+, 100,000+
   samples, 850+ folders) with dynamic tags, a category/subcategory tree, sorting,
   and filtering.
2. A **tracker/player** for arranging those samples — deliberately eJay/Sony
   Acid-simple, **not** a full DAW.

Performance at that data scale and pixel-perfect CSS skinning are the two hard
requirements that drive every architectural choice.

> This project is distinct from **MixJam Native** (WinUI) and **MixJam Web**
> (React/Vite, GitHub Pages). Do not share or copy schemas, docs, or code with
> them. See [architecture.md](architecture.md#relationship-to-sibling-projects).

## Document map

| Doc | Contents |
|---|---|
| [architecture.md](architecture.md) | The decided stack, the reasoning that constrains it, and non-goals. |
| [data-model.md](data-model.md) | SQLite schema, the "libraries are saved queries" model, indexing for scale. |
| [query-schema.md](query-schema.md) | The `rule_json` predicate-tree format and how it compiles to SQL. |
| [indexing.md](indexing.md) | First-run scan, background metadata extraction, incremental re-scan. |
| [audio-engine.md](audio-engine.md) | Web Audio lookahead scheduler and the native-addon escape hatch. |
| [decisions.md](decisions.md) | Decision log: resolved trade-offs and the triggers for revisiting them. |

## Status

Pre-implementation. The architecture is decided and the previously-open design
questions are now resolved (see [decisions.md](decisions.md)). No code is
scaffolded yet. When implementation starts, add build/lint/test commands to the
top-level `CLAUDE.md`.
