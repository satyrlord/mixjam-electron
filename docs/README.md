# MixJam Electron — Developer Guide

MixJam Electron is a desktop app with two parts:

1. A **sample-library browser and tagger** manages a large local collection.
   The target scale is 35GB+, 100,000+ samples, and 850+ folders.
   Flat searchable tags come from folder names or user input.
   The browser also provides full-text search, sorting, and filters.
2. A **tracker/player** arranges and plays these samples.
   It uses the simple eJay/Sony Acid model, not a full DAW model.

Two requirements control each architecture choice.
The app must perform at the target data scale and support pixel-accurate CSS themes.

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
- A desktop work area that can contain a 1920x1080 renderer content area.
  The native window frame needs more space.
  Thus, a physical 1080p display can have insufficient work area on some operating systems.
  Below this renderer size, MixJam shows only an unsupported-resolution notice.
  It does not mount the functional app.

The app has no native modules.
SQLite runs as WebAssembly (`@sqlite.org/sqlite-wasm`), so it needs no build toolchain or ABI rebuild.

## Getting started

```sh
npm install
npm run dev       # starts Electron with hot reload via electron-vite
```

If Electron does not start, check the `ELECTRON_RUN_AS_NODE` environment variable.
Remove this variable before you run `dev` or `build`.

The production renderer is loaded by Electron from the privileged
`app://bundle` origin. The renderer bundle is not deployed as a website.

## Build

```sh
npm run build     # production build via electron-vite
npm run preview   # preview the production build
```

The semantic version in `package.json` controls npm, the Electron runtime, packaged metadata, and the footer.
When you change this version, update the lockfile root version too.

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

Each Playwright run clears raw Electron coverage before it collects current-run data.
Thus, removed or renamed scenarios cannot add stale hits.

Electron E2E commands build first.
They then use Playwright to start `out/main/index.js` with a temporary user-data directory.
They test the packaged-style `app://bundle` renderer.
They do not use a static HTTP test server.

Both Electron test projects use the same launch policy. If a managed local
Windows environment terminates sandboxed child processes with a native
breakpoint, set `MIXJAM_ELECTRON_NO_SANDBOX=true` for that built-entry test
run. This test-only override never applies to a native packaged artifact.
Linux CI provides a 2560x1440 virtual display and an Openbox window manager.
This display contains the framed Electron window and its required 1920x1080 renderer area.
The tests use real maximize and unmaximize transitions.

The SQL-layer and indexer suites use sqlite-wasm with an in-memory database in a plain Node Vitest project.
All other suites use jsdom.

### Where a test belongs

Four locations, one rule each. A test in the wrong place is hard to find and
usually duplicates coverage that already exists somewhere else.

**`foo.test.ts`, beside `foo.ts`** — one module's behavior through its own
interface. This is the default. A test file is named after the module it tests,
so the subject is findable from the filename.

**`src/renderer/src/specs/`** — numbered acceptance tests that contain `AC-###` IDs from `docs/specs/`.
Use this location only for a contract that spans multiple modules.
Put a repeated test of one module through `<App/>` in that module's test.

**`src/renderer/src/architecture/`** — conformance checks that read source text instead of running it.
Use these checks for boundaries that a type cannot express.
For example, one check states that the engine imports no DOM.
These lint rules test files, not behavior.

**`tests/e2e/`, `tests/electron/`** — Playwright against the built
`app://bundle` renderer, for anything needing the real Chromium/Electron
surface.

Shared helpers live in `src/renderer/src/test/`:

- `render.tsx` — render with the app's context providers.
  Use this helper for project components instead of `@testing-library/react`.
  A bare sub-tree render differs from the app mount.
- `projectFixtures.ts` — lanes, placements, and channel snapshots.
  Do not write `sends: [0, 0, 0, 0]` by hand.
  The factory owns the four-Sends invariant.
- `backendApi.ts` — the typed `BackendAPI` facade, installed globally.
- `mockAudioContext.ts` — the Web Audio stand-in for jsdom.

### Test setup details

- Vitest globals are disabled (`globals: false`).
  `testing-library` automatic cleanup is off.
  `setup.ts` calls `cleanup()` in `afterEach`.
- The shared renderer `BackendAPI` mock is in `src/renderer/src/test/backendApi.ts`.
  The setup installs it as `window.backendAPI`.
- Vitest runs the `renderer` and `backend` projects.
  The `renderer` project uses jsdom for UI and app-state tests.
  The `backend` project uses Node and an in-memory database.
  `NODE_BACKEND_TESTS` in `vitest.config.ts` lists its suites.
- Indexer tests use a map-backed fake `FileSystemDirectoryHandle` and generated minimal WAV files.
  Thus, `parseBlob` extracts real metadata.
- `setup.ts` replaces `HTMLCanvasElement.getContext` with a no-op 2D context.
  The jsdom implementation throws "Not implemented."
  Tests that check drawing must install their own mock.
- On Windows, call `setSize()` before `setResizable(false)` or the size call is silently ignored.

## Type-checking and linting

```sh
npm run typecheck   # tsc -b across node (main/preload/shared) and web projects
npm run lint        # eslint
npm run fallow      # dead-code audit
npm run package:electron # package portable/AppImage/dmg artifacts
```

## Distribution

Electron packages are the only end-user artifacts. The current Production
workflow builds, tests, and publishes the Windows portable `.exe`.
Tag pushes that match `v*` attach it to a GitHub Release.
Manual runs keep it as a workflow artifact for 14 days.
AppImage and `.dmg` targets remain configured.
The current workflow does not build, test, upload, or release them.

Windows records the portable executable's hash, size, and signing state, then
launches that exact artifact with an isolated user-data directory. The gate
requires the portable NSIS bootstrap to produce a stable, responsive MixJam
Electron native window and records the process and window evidence before
cleanup. The bootstrap then starts a child process.
The deeper Playwright checks drive `win-unpacked/MixJam Electron.exe`.
This executable contains the same packaged app resources and keeps the main-process connection.

The Windows artifact run must collect UI Size 50 interaction evidence with 16 lanes.
The evidence must cover Tracker vertical wheel scrolling and keyboard focus reveal.
It must also cover Mixer horizontal scrolling with all specified input methods.
These methods are the horizontal wheel, Shift+wheel, Left/Right keys, and focus reveal for a clipped control.
Confirm that a plain vertical wheel does not move the Mixer horizontally.

Upload the test report, screenshots, and raw measurements with the package artifact.
The cross-platform release contract in spec-001 remains pending.
Hosted Linux and macOS builds must prove this contract.

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

The backend worker owns all database access.
The UI communicates with it through the typed `BackendAPI` facade.
The Electron shell adds only host capabilities.
The renderer stays sandboxed with no `nodeIntegration`.

## Specs

Feature specifications live in `docs/specs/`. They describe the target product
contract.
An acceptance criterion is implemented only when its evidence or linked test suite proves it.
The lane-bound Mixer, four-bus send/return FX,
format-7 project model, dynamic lane count, and global UI Size contracts are a
coordinated overhaul. Mixer routing and a standalone FX tab are outside the
product model and have no separate specification. Check each spec for its
acceptance wording and evidence.

Tests live beside the relevant source domain under `src/`.

## Theming and skinning

The UI is skinnable through named themes backed by CSS custom properties.
Theme definitions live in `public/themes/` as JSON files, are statically
imported into the renderer bundle at build time, and can be switched at runtime.
Visual design intent and art direction are centralized in the
[Style Guide](style-guide.md). Theme token mechanics and runtime behavior are
defined in [spec-002](specs/spec-002-theming-skin-system.md).
