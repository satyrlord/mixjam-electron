# MixJam Electron — Developer Guide

A web-first Chromium app (GitHub Pages) with a thin Electron desktop shell,
in two halves:

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

## Prerequisites

- Node.js 20+
- A Chromium browser (the app uses the File System Access API and OPFS;
  Safari/Firefox support is explicitly not a goal)

There are no native modules — SQLite runs as WebAssembly
(`@sqlite.org/sqlite-wasm`), so no build toolchain or ABI rebuilds are needed.

## Getting started

```sh
npm install
npm run dev       # starts Electron with hot reload via electron-vite
```

If Electron fails to launch, check whether `ELECTRON_RUN_AS_NODE` is set in your
environment — remove it before running `dev` or `build`.

The browser build is `out/renderer` after `npm run build` — a static bundle that
any plain static file server can host (no COOP/COEP headers required; this is
what the GitHub Pages deploy publishes).

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

The SQL-layer and indexer suites run against sqlite-wasm with an in-memory
database in a plain Node vitest project; everything else runs under jsdom.

The test setup does not use vitest globals; `testing-library` auto-cleanup is
disabled. `afterEach(cleanup)` is called from `src/renderer/src/test/setup.ts`.
The shared BackendAPI mock for the renderer lives in
`src/renderer/src/test/backendApi.ts`.

## Type-checking and linting

```sh
npm run typecheck   # tsc -b across all three tsconfig files (main, preload, renderer)
npm run lint        # eslint
```

## Project structure

```text
src/
  shared/         BackendAPI contract (backend-api.ts) + shell IPC surface (ipc.ts)
  main/           Thin Electron shell — window, app:// protocol, permission auto-grant
  preload/        contextBridge script — the narrow ShellAPI (version, resize, openExternal)
  renderer/       React app — sample browser, tracker, audio engine (Web Audio)
    backend/      Backend worker — sqlite-wasm (opfs-sahpool), indexer, session,
                  folder handles (IndexedDB), BackendAPI client facade
    engine/       transport, scheduler, audio engine, sample cache
    hooks/        React hooks — app state, transport, library data
    components/   UI components
    theme/        CSS variable themes
docs/             Architecture and design documentation
public/themes/    Skin JSON files
```

Some working directories are machine-local and gitignored: `tmp/` holds ad-hoc
scratch files, fixtures (`tmp/test-samples`), and verification scripts.

The backend worker owns all database access; the UI talks to it through the
typed BackendAPI facade. The Electron shell adds only host capabilities — the
renderer stays sandboxed with no `nodeIntegration`.

## Specs

Feature specifications live in `docs/specs/`. Each spec has a matching test file
under `src/`. Specs 001-007 are fully implemented and tested; check individual
spec files for per-AC status.

## Skinning

The UI is skinnable via CSS custom properties. Skin definitions live in
`public/themes/` as JSON files and are loaded at runtime.
