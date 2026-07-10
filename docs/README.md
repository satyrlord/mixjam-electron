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
| --- | -------- |
| [glossary.md](glossary.md) | Canonical project terminology and disambiguation |
| [architecture.md](architecture.md) | Decided stack, process model, and non-goals |
| [data-model.md](data-model.md) | SQLite schema, the "libraries are saved queries" model |
| [query-schema.md](query-schema.md) | Current `rule_json` subset and target predicate-tree compiler |
| [indexing.md](indexing.md) | First-run scan, background metadata extraction, incremental re-scan |
| [audio-engine.md](audio-engine.md) | Web Audio lookahead scheduler and the native-addon escape hatch |

## Prerequisites

- Node.js 20.19+ or 22.12+
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
npm run test:e2e      # build and run browser Playwright tests
npm run test:e2e:electron # build and run the Electron smoke project
npm run test:all      # run vitest, then browser Playwright tests
npm run coverage:all  # collect unit and browser e2e coverage
npm run coverage:report # merge collected coverage reports
```

The SQL-layer and indexer suites run against sqlite-wasm with an in-memory
database in a plain Node vitest project; everything else runs under jsdom.

The test setup does not use vitest globals; `testing-library` auto-cleanup is
disabled. `afterEach(cleanup)` is called from `src/renderer/src/test/setup.ts`.
The shared BackendAPI mock for the renderer lives in
`src/renderer/src/test/backendApi.ts`.

## Type-checking and linting

```sh
npm run typecheck   # tsc -b across node (main/preload/shared) and web projects
npm run lint        # eslint
npm run fallow      # dead-code audit
npm run package:electron # package portable/AppImage/dmg artifacts
```

## Project structure

```text
src/
  shared/         BackendAPI contract (backend-api.ts) + shell IPC surface (ipc.ts)
  main/           Thin Electron shell — window, app:// protocol, permission auto-grant
  preload/        contextBridge script — the narrow ShellAPI (version, resize, openExternal)
  renderer/
    index.html    Renderer entry document
    public/       Bundled fonts
    src/          React app — sample browser, tracker, audio engine (Web Audio)
      backend/    Backend worker — sqlite-wasm (opfs-sahpool), indexer, session,
                  folder handles (IndexedDB), BackendAPI client facade
      engine/     transport, scheduler, audio engine, sample cache
      hooks/      React hooks — app state, transport, library data
      components/ UI components
      theme/      CSS variable theme loader
docs/             Architecture and design documentation
public/themes/    Skin JSON files
```

Some working directories are machine-local and gitignored: `tmp/` holds ad-hoc
scratch files, fixtures (`tmp/test-samples`), and verification scripts.

The backend worker owns all database access; the UI talks to it through the
typed BackendAPI facade. The Electron shell adds only host capabilities — the
renderer stays sandboxed with no `nodeIntegration`.

## Specs

Feature specifications live in `docs/specs/`. Specs 001-007 are implemented,
008-012 are validated but not implemented, 013-016 are unvalidated stubs, and
017 is an unvalidated draft. Check individual spec files for AC status and test
evidence; test files live alongside the relevant source domain under `src/`.

## Skinning

The UI is skinnable via CSS custom properties. Skin definitions live in
`public/themes/` as JSON files, are statically imported into the renderer bundle
at build time, and can be switched at runtime.
