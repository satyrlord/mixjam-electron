# MixJam Electron — Developer Guide

An Electron desktop app, in two halves:

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
| [style-guide.md](style-guide.md) | Centralized art direction: layout, typography, spacing, color, surfaces, interactions |
| [data-model.md](data-model.md) | SQLite schema, the "libraries are saved queries" model |
| [query-schema.md](query-schema.md) | Current `rule_json` subset and target predicate-tree compiler |
| [indexing.md](indexing.md) | First-run scan, background metadata extraction, incremental re-scan |
| [audio-engine.md](audio-engine.md) | Web Audio lookahead scheduler and the native-addon escape hatch |

## Prerequisites

- Node.js latest LTS
- Desktop work area large enough for a 1920x1080 renderer content area. The
  native window frame is additional, so a physical 1080p display may not expose
  enough usable work area on every operating system. Below that renderer size,
  MixJam shows only an unsupported-resolution notice and does not mount the
  functional application.

There are no native modules — SQLite runs as WebAssembly
(`@sqlite.org/sqlite-wasm`), so no build toolchain or ABI rebuilds are needed.

## Getting started

```sh
npm install
npm run dev       # starts Electron with hot reload via electron-vite
```

If Electron fails to launch, check whether `ELECTRON_RUN_AS_NODE` is set in your
environment — remove it before running `dev` or `build`.

The production renderer is loaded by Electron from the privileged
`app://bundle` origin. The renderer bundle is not deployed as a website.

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
npm run test:e2e      # build and run Electron Playwright tests
npm run test:e2e:electron # build and run the Electron smoke project
npm run test:all      # run vitest, then Electron Playwright tests
npm run coverage:all  # collect unit and Electron e2e coverage
npm run coverage:report # merge collected coverage reports
```

Electron E2E commands build first, then launch `out/main/index.js` directly
through Playwright with a temporary user-data directory. They exercise the
packaged-style `app://bundle` renderer; no static HTTP test server is used.
Linux CI provides a 2560x1440 virtual display so the framed Electron window can
contain the required 1920x1080 renderer content area.

The SQL-layer and indexer suites run against sqlite-wasm with an in-memory
database in a plain Node vitest project; everything else runs under jsdom.

### Test setup details

- Vitest globals are disabled (`globals: false`). `testing-library` auto-cleanup is off. `setup.ts` calls `cleanup()` in `afterEach`.
- The shared BackendAPI mock for the renderer lives in `src/renderer/src/test/backendApi.ts` (installed as `window.backendAPI`).
- Vitest runs two projects: `renderer` (jsdom) for UI and app-state, and `backend` (node) for sqlite-wasm suites (`backend/library.test.ts`, `backend/indexer.test.ts`) using an in-memory database.
- Indexer tests use a map-backed fake `FileSystemDirectoryHandle` plus generated minimal WAV files so `parseBlob` extracts real metadata.
- `setup.ts` stubs `HTMLCanvasElement.getContext` with a no-op 2D context (jsdom's own throws "Not implemented"). Tests that assert drawing must install their own mock.
- On Windows, call `setSize()` before `setResizable(false)` or the size call is silently ignored.

## Type-checking and linting

```sh
npm run typecheck   # tsc -b across node (main/preload/shared) and web projects
npm run lint        # eslint
npm run fallow      # dead-code audit
npm run package:electron # package portable/AppImage/dmg artifacts
```

## Distribution

Electron packages are the only end-user artifacts. The production workflow
builds on Windows, Linux, and macOS and produces a portable `.exe`, AppImage,
and `.dmg`. Tag pushes matching `v*` attach those files to a GitHub Release;
manual runs retain them as workflow artifacts for 14 days.

Signing and macOS notarization are not configured. Current packages are
unsigned and may trigger operating-system trust warnings. Do not describe a
release as signed or notarized until the production workflow has credentials
and a tagged run proves those steps.

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
      backend/    Backend worker — sqlite-wasm (opfs-sahpool), indexer, app state,
                  folder handles (IndexedDB), BackendAPI client facade
      engine/     transport, scheduler, audio engine, sample cache
      hooks/      React hooks — app state, transport, library data
      components/ UI components
      theme/      CSS variable theme loader
docs/             Architecture and design documentation
public/themes/    Theme JSON files
```

Some working directories are machine-local and gitignored: `tmp/` holds ad-hoc
scratch files, fixtures (`tmp/test-samples`), and verification scripts.

The backend worker owns all database access; the UI talks to it through the
typed BackendAPI facade. The Electron shell adds only host capabilities — the
renderer stays sandboxed with no `nodeIntegration`.

## Specs

Feature specifications live in `docs/specs/`. They describe the target product
contract; an acceptance criterion is implemented only when its own evidence or
the linked test suite proves it. The lane-bound Mixer, four-bus send/return FX,
format-4 project model, dynamic lane count, and global UI Size contracts are a
coordinated overhaul. Mixer routing and a standalone FX tab are outside the
product model and have no separate specification. Check each spec for its
acceptance wording and evidence; tests live beside the relevant source domain
under `src/`.

## Theming and skinning

The UI is skinnable through named themes backed by CSS custom properties.
Theme definitions live in `public/themes/` as JSON files, are statically
imported into the renderer bundle at build time, and can be switched at runtime.
Visual design intent and art direction are centralized in the
[Style Guide](style-guide.md). Theme token mechanics and runtime behavior are
defined in [spec-002](specs/spec-002-theming-skin-system.md).
