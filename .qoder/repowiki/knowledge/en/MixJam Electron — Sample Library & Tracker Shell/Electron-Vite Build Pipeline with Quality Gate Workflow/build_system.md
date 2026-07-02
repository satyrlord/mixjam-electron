## Build System Overview

This repository uses **electron-vite** as the primary build orchestrator for an Electron desktop application with a React frontend. The build system is script-driven through npm, with no Makefiles, Dockerfiles, or CI pipeline configuration present in the `.github/workflows` directory (which is empty).

## Core Toolchain

### Build & Compilation
- **electron-vite** (`^5.0.0`): Multi-process bundler that handles three distinct Electron layers:
  - `main`: Node.js process (Electron main thread)
  - `preload`: Bridge layer between main and renderer
  - `renderer`: Chromium browser process (React UI)
- **Vite** (`^7.1.12`): Underlying bundler for the renderer process
- **TypeScript** (`^5.5.2`): Type checking via project references (`tsconfig.json` → `tsconfig.node.json` + `tsconfig.web.json`)
- **esbuild**: Fast transpilation (post-install scripts allowed via `allowScripts` field)

### Testing & Coverage
- **Vitest** (`^4.1.9`): Unit test runner with jsdom environment for React components
- **@vitest/coverage-v8**: V8-based coverage provider generating reports to `./coverage-unit`
- **Playwright** (`^1.61.1`): E2E testing framework (installed but no E2E test scripts defined in package.json)
- **Testing Library**: React component testing utilities

### Code Quality
- **ESLint** (`^10.6.0`): Linting with TypeScript ESLint and React Hooks plugin
- **fallow** (`^2.103.0`): Dead-code detection tool
- **markdownlint-cli2**: Markdown linting (configured via `.markdownlint.json` and `.markdownlint-cli2.jsonc`)

## Key Configuration Files

### `package.json` — Script Entry Points
All build operations are invoked through npm scripts:
- `npm run dev`: Start development server with hot-reload
- `npm run build`: Production build (outputs to `out/` directory)
- `npm run preview`: Preview production build locally
- `npm run typecheck`: Run TypeScript compiler in project-reference mode (`tsc -b`)
- `npm run lint`: ESLint across workspace
- `npm run fallow`: Dead-code audit
- `npm run test`: Run Vitest suite once
- `npm run test:watch`: Vitest watch mode
- `npm run test:coverage`: Generate coverage report

### `electron.vite.config.ts` — Build Orchestration
Defines three separate build targets with plugins:
- `main` and `preload`: Use `externalizeDepsPlugin()` to keep Node dependencies external (not bundled)
- `renderer`: Uses `@vitejs/plugin-react` for JSX transformation

### `tsconfig.json` — Project References
Uses TypeScript's composite/project reference pattern:
- `tsconfig.node.json`: Covers `src/main`, `src/preload`, `src/shared`, and config files (target ES2022, module ESNext)
- `tsconfig.web.json`: Covers `src/renderer` and `src/shared` (includes DOM libs, JSX react-jsx)
- Both use `noEmit: true` — actual output is handled by electron-vite/esbuild

### `vitest.config.ts` — Test Configuration
- Environment: `jsdom` for browser-like DOM simulation
- Setup file: `src/renderer/src/test/setup.ts`
- Test discovery: `src/renderer/src/**/*.test.{ts,tsx}` and `src/main/**/*.test.ts`
- Coverage: V8 provider, HTML/LCOV/text reporters, output to `./coverage-unit`
- Exclusions: `out/`, test files, `src/main/`, `src/preload/`, config files, type definitions, bootstrap entry point

### `eslint.config.mjs` — Flat Config
Uses ESLint's new flat config format with environment-aware rules:
- `src/main/**` and `src/preload/**`: Node.js globals
- `src/renderer/**`: Browser globals + React Hooks rules (`rules-of-hooks: error`, `exhaustive-deps: warn`)
- Ignores: `out/`, `dist/`, `node_modules/`, config files

## Architecture Conventions

### Three-Layer Separation
The build system enforces strict separation of Electron's three process types:
1. **Main process** (`src/main/`): Node.js APIs, file system access, IPC handlers
2. **Preload process** (`src/preload/`): Secure bridge exposing limited APIs to renderer
3. **Renderer process** (`src/renderer/`): React UI, runs in Chromium sandbox

Shared types/interfaces live in `src/shared/` and are included in both node and web TypeScript configs.

### Output Structure
Build artifacts are emitted to `out/` directory (referenced as `main` entry point in package.json). The `out/` directory structure mirrors source: `out/main/index.js`, `out/preload/index.js`, and renderer assets.

### No Packaging/Distribution Tooling
Notably absent:
- No `electron-builder`, `electron-forge`, or `@electron/packager` dependency
- No platform-specific build scripts (`.exe`, `.dmg`, `.AppImage` generation)
- No CI/CD workflow files in `.github/workflows/`
- No version bumping or release automation scripts

This suggests the project is in active development without finalized distribution packaging.

## Developer Rules & Conventions

### Quality Gate Workflow
The repository defines a formal **run-quality-gate** skill (in `.github/skills/run-quality-gate/`) that establishes a seven-gate sequential validation process:

1. **Problems gate**: Clear all VS Code diagnostics
2. **Markdown gate**: `npx markdownlint-cli2 "**/*.md"` must pass
3. **ESLint gate**: `npm run lint` must pass (auto-fix first, then manual)
4. **Fallow gate**: `npm run fallow` dead-code check must pass
5. **Unit-test gate**: `npm run test` must pass
6. **E2E gate**: Playwright tests if they exist (currently not applicable)
7. **Coverage gate**: `npm run test:coverage` — every cell (Statements, Branches, Functions, Lines) must be ≥80%

Key constraints:
- Gates execute strictly in order; failure at any gate stops progression
- No suppression of diagnostics/rules without explicit user permission
- Coverage exclusions require explicit approval
- Final report must document commands run, files changed, and remaining blockers

### Testing Patterns
- Co-located test files: `*.test.ts` / `*.test.tsx` alongside source
- Spec-driven tests: `src/renderer/src/specs/` contains tests mapped to design specs (`spec-001-app-shell-navigation.test.tsx`, etc.)
- Mock API layer: `src/renderer/src/test/electronApi.ts` provides test doubles for Electron IPC

### Type Checking Strategy
- `tsc -b` (build mode) leverages project references for incremental compilation
- Separate configs prevent mixing Node and browser type definitions
- `types` field in tsconfigs explicitly declares ambient type sources (`electron-vite/node`, `vite/client`, `node`)

### Coverage Policy
- Threshold: 80% minimum across all four metrics (Statements, Branches, Functions, Lines)
- Applies to both global summary and per-file tables
- Remediation must add tests or improve testability — never lower thresholds or add exclusions without approval
- Main process and preload code excluded from coverage reporting (only renderer tracked)