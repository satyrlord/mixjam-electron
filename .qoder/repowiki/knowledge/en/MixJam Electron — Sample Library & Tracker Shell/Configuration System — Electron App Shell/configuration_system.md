## Overview

The MixJam Electron application uses a **lightweight, file-based configuration system** with no dedicated configuration framework. Configuration is managed through three distinct layers:

1. **Build/tooling configuration** (TypeScript, Vite, ESLint, Vitest)
2. **Runtime session/user preferences** (JSON files in user data directories)
3. **Theme/skin configuration** (JSON theme files loaded at runtime)

There are **no environment variable files** (`.env`), **no feature flag systems**, and **no secrets management**. The only environment variable used is `ELECTRON_RENDERER_URL`, which is set by the `electron-vite` dev server for hot-reload during development.

---

## Key Files and Packages

### Build/Tooling Configuration
- **`electron.vite.config.ts`** — Defines the three-process build (main, preload, renderer) using `electron-vite` with `externalizeDepsPlugin()` for main/preload and `@vitejs/plugin-react` for the renderer.
- **`tsconfig.json`** — Project references pattern splitting Node-side (`tsconfig.node.json`) and browser-side (`tsconfig.web.json`) TypeScript compilation.
- **`vitest.config.ts`** — Test runner configuration with jsdom environment, coverage settings, and test file inclusion patterns.
- **`eslint.config.mjs`** — Flat config format with separate rules for Node (main/preload) and browser (renderer) contexts.
- **`.fallowrc.json`** — Dead-code analysis configuration for the `fallow` tool, specifying entry points, ignore patterns, and unused-export rules.

### Runtime Session/User Configuration
- **`src/main/session.ts`** — Core module for reading/writing session state as JSON files:
  - `session.json` — Stored in `app.getPath('userData')`, persists `userFolder` and `sampleFolder` paths between launches.
  - `recent-projects.json` — Registry of recently opened `.mixjam` project files with timestamps.
  - `mixjam.json` — Written into the user-selected folder on quit, contains `appVersion`, folder paths, and `lastOpened` timestamp.
- **`src/main/index.ts`** — Main process entry point that wires IPC handlers to session read/write operations and handles `before-quit` to persist config.

### Theme/Skin Configuration
- **`public/themes/emerald.json`** — JSON theme definition with color tokens, font families, and border radius. This is the only fully-implemented theme.
- **`src/renderer/src/theme/themes.ts`** — Theme resolution engine that:
  - Imports `emerald.json` directly via ES module import.
  - Defines `THEME_OPTIONS` listing 8 planned themes (only `emerald` is implemented).
  - Exports `resolveTheme()`, `selectTheme()`, and `bootstrapTheme()` functions that apply CSS custom properties to `document.documentElement`.
  - Falls back to `emerald` for any unimplemented or invalid theme key.

### Window/UI Configuration
- **`src/shared/window-config.ts`** — Pure functions defining window dimensions (`HOME_WINDOW_SIZE: 1280x720`, `TRACKER_WINDOW_SIZE: 1920x1080`), icon path construction, preload path construction, and resize behavior for home vs tracker views.

---

## Architecture and Conventions

### No Centralized Config Module
There is no single `Config` class, `config/` directory, or centralized configuration loader. Each concern manages its own configuration independently:
- Session state lives in `src/main/session.ts`
- Themes live in `src/renderer/src/theme/themes.ts`
- Window sizing lives in `src/shared/window-config.ts`

### File-Based Persistence Pattern
All persistent configuration uses JSON files with a consistent read/write pattern:
```typescript
// Read with fallback on error
try {
  return JSON.parse(await fs.readFile(path, 'utf8'))
} catch {
  return defaultValue
}

// Write with trailing newline
await fs.writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
```

### Environment Variables — Dev Only
The only environment variable usage is in `src/main/index.ts`:
```typescript
if (process.env['ELECTRON_RENDERER_URL']) {
  mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
} else {
  mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}
```
This is a standard `electron-vite` convention for distinguishing dev (Vite dev server) from production (bundled HTML file). There are no `.env` files, no `dotenv` usage, and no runtime env var configuration.

### Theme System Design
Themes follow a **design token** pattern (spec-002):
- All colors, fonts, and radii are defined as named tokens in JSON.
- Tokens are applied as CSS custom properties (`--accent`, `--bg-base`, etc.) on the root element.
- UI components reference tokens exclusively via CSS variables — no hardcoded colors.
- The `bootstrapTheme()` function runs at app startup to apply the default theme before React mounts.

### Path Resolution Conventions
- Icon and preload paths are constructed relative to `__dirname` using helper functions in `window-config.ts`.
- User-facing paths (folders, projects) are normalized using `node:path` utilities (`normalize`, `resolve`, `join`).
- Windows path case-insensitivity is handled via `canonicalizeProjectPath()` in `session.ts`.

---

## Rules Developers Should Follow

1. **No new configuration frameworks** — Do not introduce `dotenv`, `config`, `convict`, or similar libraries. The existing file-based JSON approach is intentional and sufficient.

2. **Session config goes in `src/main/session.ts`** — Any new persistent user preference should follow the existing read/write JSON pattern in this module, storing files in `app.getPath('userData')` or the user folder.

3. **Theme tokens must be complete** — When adding a new theme, all keys in `ThemeColors` and `ThemeFonts` must be defined. Partial themes fall back to `emerald`.

4. **CSS custom properties only** — UI components must never hardcode colors. Use `var(--token-name)` references. Add new tokens to the `ThemeColors` interface and all theme JSON files.

5. **Window sizing constants stay in `window-config.ts`** — Do not scatter dimension literals across components. Use `HOME_WINDOW_SIZE` and `TRACKER_WINDOW_SIZE` exports.

6. **Environment variables are dev-only** — Do not add runtime configuration via `process.env`. Use JSON config files or IPC-driven state instead.

7. **Normalize all external input** — Functions like `normalizeSession()` and `normalizeRecentProjects()` demonstrate the pattern: always validate and sanitize data read from disk before use.
