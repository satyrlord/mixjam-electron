## Overview

This Electron application uses **npm** as its package manager with **lockfileVersion 3** (`package-lock.json`) for deterministic dependency resolution. The project leverages **electron-vite** as the build toolchain, which orchestrates separate builds for the main process, preload scripts, and renderer (React) process.

## Package Manager & Lockfile Strategy

- **Manager**: npm (standard Node.js package manager)
- **Lockfile**: `package-lock.json` using lockfileVersion 3 (supports workspaces and improved peer dependency handling)
- **Registry**: Default public npm registry (`https://registry.npmjs.org/`) — no private registries or custom `.npmrc` configuration detected
- **No vendoring**: Dependencies are installed to `node_modules/` via standard npm resolution; no vendor directory or offline caching strategy

## Dependency Structure

### Production Dependencies (minimal)
The runtime dependencies are intentionally minimal:
- `react@^18.3.1` — UI framework
- `react-dom@^18.3.1` — React DOM bindings

All other libraries (Electron, Vite, TypeScript, testing tools) are declared as `devDependencies`, reflecting that the Electron binary itself is bundled at build time rather than shipped as an npm dependency in production.

### Dev Dependencies (tooling-heavy)
Key development tooling groups:
- **Build**: `electron-vite@^5.0.0`, `vite@^7.1.12`, `@vitejs/plugin-react@^5.1.0`
- **TypeScript**: `typescript@^5.5.2`, `@types/node@^20.14.0`, `@types/react@^18.3.3`, `@types/react-dom@^18.3.0`
- **Linting**: `eslint@^10.6.0`, `typescript-eslint@^8.62.0`, `eslint-plugin-react-hooks@^7.1.1`
- **Testing**: `vitest@^4.1.9`, `@vitest/coverage-v8@^4.1.9`, `@testing-library/react@^16.2.0`, `jsdom@^25.0.1`, `playwright@^1.61.1`
- **Dead-code analysis**: `fallow@^2.103.0`

## Build Toolchain Integration

The `electron.vite.config.ts` uses the `externalizeDepsPlugin()` for both `main` and `preload` processes. This plugin ensures that Node.js/Electron native modules and npm dependencies are treated as external during bundling, preventing them from being inlined into the output bundles. The `renderer` process uses the standard React plugin for JSX transformation.

## Script-Based Lifecycle Management

Standard npm scripts define the development workflow:
- `npm run dev` — Start dev server via `electron-vite dev`
- `npm run build` — Production build via `electron-vite build`
- `npm run preview` — Preview built output
- `npm run typecheck` — TypeScript compilation check (`tsc -b` using project references)
- `npm run lint` — ESLint across all source files
- `npm run fallow` — Dead-code and unused-dependency detection
- `npm test` / `npm run test:watch` / `npm run test:coverage` — Vitest test execution

## Dependency Hygiene & Auditing

### Fallow Configuration (`.fallowrc.json`)
The project uses **fallow** for automated dependency hygiene:
- Detects unused files, exports, types, and dependencies
- Rules enforce errors for: `unused-dependencies`, `unused-dev-dependencies`, `unlisted-dependencies`
- Specific dependencies (`zundo`, `playwright-core`) are whitelisted in `ignoreDependencies` because they are used indirectly or at runtime
- Entry points defined for accurate reachability analysis: `src/renderer/src/main.tsx` and `src/renderer/index.html`

### allowScripts Field
The `package.json` includes an `allowScripts` field explicitly permitting postinstall scripts for:
- `electron@42.5.0` — Required for downloading the Electron binary
- `esbuild@0.25.12` and `esbuild@0.28.1` — Native binary installation for the bundler

This indicates the project may be using a package manager or security policy that restricts arbitrary script execution by default (e.g., pnpm's `allow-scripts` or a similar mechanism), though npm itself is the declared manager.

## TypeScript Project References

TypeScript compilation uses project references (`tsconfig.json` references `tsconfig.node.json` and `tsconfig.web.json`), enabling incremental builds and clear separation between Node-side code (main/preload) and web-side code (renderer). Build artifacts (`.tsbuildinfo` files) are committed, suggesting CI relies on incremental type-checking.

## Conventions for Developers

1. **Always commit `package-lock.json`** — Ensures reproducible builds across environments
2. **Run `npm run fallow` before committing** — Catches unused dependencies and dead code
3. **Use caret (`^`) version ranges** — All dependencies use semver-compatible ranges allowing minor/patch updates
4. **Keep production deps minimal** — Only React packages are runtime dependencies; everything else is dev-only
5. **Externalize Node/Electron deps in vite config** — The `externalizeDepsPlugin()` handles this automatically; do not manually bundle Node modules into the main/preload output
6. **Type-check with project references** — Use `npm run typecheck` (not raw `tsc`) to respect the multi-config setup