# MixJam Electron — Developer Guide

A Windows Electron desktop app with two halves:

1. A **sample-library browser and tagger** over a large local collection (35GB+,
   100,000+ samples, 850+ folders) with dynamic tags, a category/subcategory tree,
   full-text search, sorting, and filtering.
2. A **tracker/player** for arranging and playing back those samples — deliberately
   eJay/Sony Acid-simple, not a full DAW.

Performance at that data scale and pixel-perfect CSS skinning are the two hard
requirements that drive every architectural choice.

## Document map

| Doc | Contents |
|---|---|
| [architecture.md](architecture.md) | Decided stack, process model, and non-goals |
| [data-model.md](data-model.md) | SQLite schema, the "libraries are saved queries" model |
| [query-schema.md](query-schema.md) | The `rule_json` predicate-tree format and how it compiles to SQL |
| [indexing.md](indexing.md) | First-run scan, background metadata extraction, incremental re-scan |
| [audio-engine.md](audio-engine.md) | Web Audio lookahead scheduler and the native-addon escape hatch |
| [decisions.md](decisions.md) | Decision log: resolved trade-offs and the triggers for revisiting them |

## Prerequisites

- Node.js 20+
- Windows (the app targets Win32; macOS/Linux are not tested)
- Python and a C++ build toolchain for `better-sqlite3` native compilation
  (the Visual Studio Build Tools workload "Desktop development with C++" covers this)

## Getting started

```sh
npm install       # installs deps and rebuilds better-sqlite3 for the Electron ABI
npm run dev       # starts Electron with hot reload via electron-vite
```

The first `npm install` takes longer than usual because `electron-rebuild` compiles
`better-sqlite3` against the Electron Node ABI. This is expected.

If Electron fails to launch, check whether `ELECTRON_RUN_AS_NODE` is set in your
environment — remove it before running `dev` or `build`.

## Build

```sh
npm run build     # production build via electron-vite
npm run preview   # preview the production build
```

## Testing

```sh
npm test              # run the full vitest suite (single pass)
npm run test:watch    # run vitest in watch mode
npm run test:coverage # run with v8 coverage report
```

Tests run in Node (not Electron), so `better-sqlite3` is rebuilt for the Node ABI
before each test run via the `pretest` script. Do not rebuild it manually between
test and dev runs — the pre-scripts handle it.

The test setup does not use vitest globals; `testing-library` auto-cleanup is
disabled. `afterEach(cleanup)` is called from `src/renderer/src/test/setup.ts`.
Shared IPC mocks for the renderer live in `src/renderer/src/test/electronApi.ts`.

## Type-checking and linting

```sh
npm run typecheck   # tsc -b across all three tsconfig files (main, preload, renderer)
npm run lint        # eslint
```

## Project structure

```
src/
  main/           Node/Electron main process — SQLite, IPC handlers, indexer
  preload/        contextBridge script — typed API surface exposed to the renderer
  renderer/       React app — sample browser, tracker, audio engine (Web Audio)
    engine/       transport, scheduler, audio engine, sample cache
    hooks/        React hooks — app state, transport, library data
    components/   UI components
    theme/        CSS variable themes
docs/             Architecture and design documentation
public/themes/    Skin JSON files
```

The main process owns all database access. The renderer communicates with it
exclusively over the typed contextBridge IPC — there is no `nodeIntegration`.

## Specs

Feature specifications live in `docs/specs/`. Each spec has a matching test file
under `src/`. Specs 001-005 are fully implemented. Spec-006 is partial — see
[AGENTS.md](../AGENTS.md) for the remaining acceptance criteria.

## Skinning

The UI is skinnable via CSS custom properties. Skin definitions live in
`public/themes/` as JSON files and are loaded at runtime. The Claude Design
HTML/CSS output is used as the reference skin — follow it closely when building
or modifying UI components.
