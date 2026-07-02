## Overview

MixJam Electron uses a **lightweight, file-driven configuration approach** with no dedicated configuration framework (no dotenv, no config libraries). Configuration is split across three layers:

1. **Build-time constants** injected via `electron-vite` (`__APP_VERSION__`)
2. **JSON theme tokens** loaded at runtime from `public/themes/*.json`
3. **Electron IPC contracts** defined in TypeScript shared modules

There are **no `.env` files**, no YAML/TOML configs, and no environment-variable-based runtime configuration beyond Electron's own dev-mode detection.

---

## Key Files and Packages

### Build Configuration
- **`electron.vite.config.ts`** — Defines the multi-process build pipeline (main, preload, renderer). Injects `__APP_VERSION__` as a compile-time constant by reading `package.json` at build time. Configures separate entry points for the main process (`index.ts`) and the indexer worker (`indexer.ts`).
- **`tsconfig.json`** — Project references pattern splitting Node-side (`tsconfig.node.json`) and web-side (`tsconfig.web.json`) compilation contexts.
- **`vitest.config.ts`** — Test runner configuration with environment-specific test routing (Node for native module tests, jsdom for renderer tests).

### Runtime Configuration
- **`src/shared/window-config.ts`** — Pure functions that construct `BrowserWindowConstructorOptions`. Window sizes (`HOME_WINDOW_SIZE`, `TRACKER_WINDOW_SIZE`) are frozen constants. No external config file drives these values.
- **`src/shared/ipc.ts`** — Typed IPC channel definitions and request/response schemas. Acts as the contract layer between main and renderer processes.
- **`public/themes/*.json`** — Eight theme definition files (`emerald.json`, `studio.json`, `rave.json`, `analog.json`, `ide.json`, `rust.json`, `screen.json`, `pa.json`). Each defines `colors`, `fonts`, `depth` (gradients/shadows), and `radius` tokens.
- **`src/renderer/src/theme/themes.ts`** — Imports all theme JSON files at build time, exports `THEME_OPTIONS`, type guards, and the `bootstrapTheme()` / `selectTheme()` functions that apply CSS custom properties to `document.documentElement`.

### Session / Persistence Configuration
- **`src/main/session.ts`** — Manages `session.json` and `mixjam.json` in the user data directory. Handles folder path persistence (User Folder, Sample Folder) and recent projects tracking.
- **`src/main/db.ts`** — SQLite database path resolution via `app.getPath('userData')`.

### Dev Environment Detection
- **`src/main/index.ts`** (lines 100–104) — The only use of `process.env`: checks for `ELECTRON_RENDERER_URL` to determine whether to load from the dev server or from built files. This is an electron-vite convention, not application-level configuration.

---

## Architecture and Conventions

### No Centralized Config Loader
The app does **not** have a unified config module. Instead:
- Build-time values are inlined via Vite's `define` option.
- Theme data is imported as static JSON modules.
- Window geometry is hardcoded in shared utility functions.
- Persistent state (folders, recent projects) lives in the Electron user-data directory, managed by the `session` module.

### Theme System: JSON Tokens → CSS Custom Properties
Themes follow a strict token schema:
- **Colors**: 17 named color tokens (e.g., `accent`, `bg-base`, `playhead`)
- **Fonts**: 3 font families (`chrome`, `label`, `mono`)
- **Depth**: 4 gradient/shadow CSS value strings
- **Radius**: Single border-radius value

At bootstrap (`bootstrapApp.tsx` → `bootstrapTheme()`), the default theme (`emerald`) is applied by writing CSS custom properties (`--accent`, `--bg-base`, etc.) onto `<html>`. Theme switching calls `selectTheme()`, which re-applies all tokens and sets `data-theme-key` for CSS attribute selectors (used for theme-specific effects like CRT scanlines in the `screen` theme).

### Build-Time Version Injection
`electron.vite.config.ts` reads `package.json` at build time and injects `__APP_VERSION__` via Vite's `define`. The main process declares this as a global (`declare const __APP_VERSION__: string`) and falls back to `app.getVersion()` if undefined. This ensures the version is correct in dev, packaged, and direct-launch scenarios where `app.getAppPath()` may not resolve to a manifest.

### IPC as Configuration Boundary
The `src/shared/ipc.ts` module defines channel names and typed request/response shapes. This is the **only** cross-process configuration boundary — the renderer never directly accesses filesystem paths or database handles; all such operations go through typed IPC handlers registered in `src/main/index.ts`.

---

## Rules Developers Should Follow

1. **Do not introduce `.env` files or dotenv** — The app has no environment-variable-based configuration beyond Electron's built-in dev-mode detection (`ELECTRON_RENDERER_URL`). Adding dotenv would conflict with the existing minimal approach.

2. **Theme changes must go through JSON token files** — Never hardcode colors, fonts, or gradients in CSS or TSX. All visual values must be defined in `public/themes/*.json` and consumed via CSS custom properties (`var(--token-name)`). See `spec-002-theming-skin-system.md` for the full specification.

3. **Window geometry is a shared constant** — If window sizes need to change, update `HOME_WINDOW_SIZE` / `TRACKER_WINDOW_SIZE` in `src/shared/window-config.ts`. Do not scatter size literals across components.

4. **IPC contracts live in `src/shared/`** — New main↔renderer communication channels must be defined in `src/shared/ipc.ts` with proper TypeScript types. Handlers are registered in `src/main/index.ts`; callers use `window.electronAPI` (exposed via preload).

5. **Persistent config goes to user-data directory** — Session state (`session.json`, `mixjam.json`, `library.db`) is stored via `app.getPath('userData')`. Do not write to the app installation directory or relative paths.

6. **Build-time constants use Vite `define`** — If new compile-time constants are needed, add them to `electron.vite.config.ts` under the appropriate process config (`main`, `preload`, or `renderer`). Declare them with `declare const` in consuming modules.

7. **No YAML/TOML/config libraries** — The project intentionally avoids configuration frameworks. Simple JSON files and TypeScript modules are the preferred mechanisms.