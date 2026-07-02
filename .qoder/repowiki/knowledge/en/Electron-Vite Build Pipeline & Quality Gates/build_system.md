## Overview
The project uses an **electron-vite** build pipeline orchestrated via **npm scripts**. It features a multi-process architecture (main, preload, renderer) with strict TypeScript compilation, native module rebuilding (`better-sqlite3`), and a Vitest-based testing suite with coverage reporting.

## Build System Components

### 1. Core Build Tooling
- **Framework**: `electron-vite` (v5) handles the bundling of Electron main/preload processes and the React-based renderer.
- **Bundler**: Vite (v7) is used for the renderer process, enabling fast HMR during development.
- **Compiler**: TypeScript (v5) with project references (`tsconfig.node.json` for main/preload, `tsconfig.web.json` for renderer).
- **Native Modules**: `@electron/rebuild` is used in `postinstall` and pre-build hooks to recompile `better-sqlite3` against the Electron headers.

### 2. Key Scripts (`package.json`)
- **Development**: `npm run dev` triggers `electron-vite dev` after ensuring native modules are rebuilt.
- **Production Build**: `npm run build` triggers `electron-vite build`, outputting to the `out/` directory.
- **Testing**: `npm test` runs `vitest run`. Native module tests (`src/main/*.test.ts`) are isolated using `poolMatchGlobs: 'forks'` to avoid Vite transformation issues with `.node` bindings.
- **Linting**: `npm run lint` uses ESLint with `typescript-eslint` and `eslint-plugin-react-hooks`.
- **Dead Code Detection**: `npm run fallow` uses the `fallow` tool to identify unused code.

### 3. Configuration Architecture
- **`electron.vite.config.ts`**: 
  - Defines separate configs for `main`, `preload`, and `renderer`.
  - Uses `externalizeDepsPlugin()` for main/preload to keep Node/Electron dependencies external.
  - Injects `__APP_VERSION__` from `package.json` into the main process.
  - Configures multiple entry points for the main process (`index.ts` and `indexer.ts`) to support worker threads.
- **`vitest.config.ts`**:
  - Uses `jsdom` for renderer tests.
  - Routes native-module tests to a `node` environment with `forks` pool.
  - Generates coverage reports in `coverage-unit/` using `v8` provider.
- **`eslint.config.mjs`**:
  - Flat config format.
  - Differentiates globals for Node (main/preload) vs Browser (renderer) contexts.

### 4. Conventions & Rules
- **Native Module Handling**: Always run `npm run rebuild:electron` after installing or updating `better-sqlite3` or Electron versions. This is automated via `predev` and `prebuild` hooks.
- **Type Safety**: Strict mode is enabled in both TS configs. `noEmit` is used as Vite handles the actual emission.
- **Testing Isolation**: Tests interacting with SQLite must reside in `src/main/` and are excluded from the renderer coverage report.
- **No CI/CD Pipelines**: The `.github/workflows` directory is empty, indicating that build/test automation is currently local-only or managed externally.

## Key Files
- `package.json`: Script definitions and dependency management.
- `electron.vite.config.ts`: Core build configuration for Electron/Vite.
- `vitest.config.ts`: Test runner and coverage configuration.
- `tsconfig.json`: Root project reference file.
- `eslint.config.mjs`: Linting rules and environment separation.