## System Overview
The repository uses **npm** as its primary package manager, orchestrated by **electron-vite** for the Electron build pipeline. Dependencies are managed via a root `package.json` and a lockfile (`package-lock.json`). A secondary, isolated dependency set exists in `.ds-sync/` for design-system tooling.

## Key Files
- `package.json`: Declares runtime and dev dependencies, scripts, and allowed post-install scripts.
- `package-lock.json`: Ensures deterministic installs.
- `electron.vite.config.ts`: Configures Vite plugins, including `externalizeDepsPlugin()` to handle native modules.
- `.ds-sync/package.json`: Isolated dependencies for design-sync utilities (e.g., `ts-morph`, `esbuild`).

## Architecture & Conventions
1. **Native Module Rebuilding**: The project relies on `better-sqlite3`, a native Node.js addon. To ensure compatibility with Electron's specific Node version, the `postinstall` script runs `electron-rebuild -f -w better-sqlite3`. This is also explicitly triggered before `dev`, `build`, and `test` commands via `pre*` hooks.
2. **Dependency Externalization**: The `electron-vite` configuration uses `externalizeDepsPlugin()` for the `main` and `preload` processes. This prevents Vite from bundling Node.js/Electron-native dependencies (like `better-sqlite3` or `electron`) into the output, relying instead on Node's module resolution at runtime.
3. **Script Allowlisting**: The `allowScripts` field in `package.json` explicitly permits post-install scripts for `electron`, `esbuild`, and `better-sqlite3`, indicating a security-conscious approach to npm lifecycle scripts.
4. **Isolated Design Sync Env**: The `.ds-sync/` directory contains its own `package.json` and `package-lock.json`, suggesting a self-contained environment for design-system synchronization tasks, separate from the main application runtime.
5. **Type Resolution**: TypeScript configurations (`tsconfig.node.json`, `tsconfig.web.json`) use `moduleResolution: "bundler"` and `skipLibCheck: true`, optimizing for Vite's bundling behavior and faster type-checking.

## Developer Rules
- **Never remove `electron-rebuild`**: Native modules will fail to load in Electron if not rebuilt against the correct headers.
- **Respect `externalizeDepsPlugin`**: Do not attempt to bundle Node.js core modules or native addons in the `main`/`preload` Vite configs.
- **Use `npm run rebuild:electron` manually** if you update the Electron version or encounter native module errors after a branch switch.
- **Keep `.ds-sync` isolated**: Do not merge its dependencies into the root `package.json`; it serves a distinct tooling purpose.