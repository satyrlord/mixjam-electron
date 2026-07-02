## Overview

MixJam Electron does **not** use a dedicated logging framework (e.g., Winston, Pino, Bunyan, or debug). Instead, it relies exclusively on Node.js's built-in `console` API (`console.log`, `console.error`, `console.warn`) for all diagnostic output.

This is an **informal, ad-hoc approach** with no structured logging, no log-level management, no log rotation, and no centralized configuration.

## What System Is Used

- **Framework**: None — bare `console.*` calls only
- **Log levels used**: `console.error` (errors), `console.warn` (warnings in example code)
- **Structured fields**: None — messages are plain strings, sometimes with interpolated values
- **Sinks**: stdout/stderr (default console behavior)

## Key Files Using Console Logging

| File | Usage |
|------|-------|
| `src/main/index.ts` | `console.error` for session config write failures (lines 122, 166) and sample byte read failures (line 337) |
| `src/main/indexer-host.ts` | `console.error` for indexer worker thread errors (line 75) |
| `src/main/library.ts` | `console.error` for folder read failures during category sync (line 160) |
| `.design-sync/generate-theme-tokens.mjs` | `console.error` for build script output (line 54) |
| `.design-sync/overrides/source-kit.mjs` | Multiple `console.error` calls for design-sync tool diagnostics |

## Architecture and Conventions

### Current Patterns

1. **Error-only logging**: All production source files (`src/`) use `console.error` exclusively — never `console.log`, `console.info`, or `console.debug`. This indicates a convention of logging only when something goes wrong.

2. **No structured format**: Log messages are free-form strings, e.g.:
   ```typescript
   console.error('Failed to write mixjam.json:', error)
   console.error('Indexer worker error:', err)
   console.error('syncCategoriesFromFolder: failed to read sample folder', sampleFolder, err)
   ```

3. **No log suppression in tests**: The codebase has no mechanism to silence console output during test runs.

4. **Worker-thread error propagation**: The indexer worker (`src/main/indexer.ts`) does not use `console` at all — instead it sends `{ type: 'error', message: string }` messages back to the main process via `parentPort.postMessage()`, where the host logs them.

### Design Decisions (Inferred)

- **Simplicity over sophistication**: For a desktop app with a single user, basic console output is sufficient for debugging during development.
- **No persistent logs**: There is no file-based log sink, no log rotation, and no crash reporting integration.
- **Renderer has zero logging**: No `console.*` calls exist in any renderer source file (`src/renderer/**/*.{ts,tsx}`), suggesting UI-layer errors are handled through React error boundaries or state-based error display rather than console output.

## Rules Developers Should Follow

1. **Use `console.error` for unexpected failures**: When catching exceptions that should not silently fail, use `console.error` with a descriptive prefix and the error object.

2. **Avoid `console.log` in production code**: The existing codebase never uses `console.log`, `console.info`, or `console.debug` in `src/` files. Reserve these for temporary debugging only, and remove them before committing.

3. **Include context in error messages**: Prefix messages with the function or operation name (e.g., `'syncCategoriesFromFolder: failed to read sample folder'`) to aid troubleshooting.

4. **Do not introduce a logging framework without team consensus**: Adding Winston, Pino, or similar would be a significant architectural change requiring updates to all error-handling paths.

5. **Worker threads should propagate errors via IPC, not console**: Follow the pattern in `indexer.ts` — send structured error messages to the parent, which handles logging.

## Gaps and Risks

- **No log aggregation**: Errors in production builds are invisible to developers unless users manually inspect DevTools or terminal output.
- **No log levels**: Cannot selectively enable/disable verbosity.
- **No structured fields**: Cannot filter or query logs by component, severity, or correlation ID.
- **No test isolation**: Console output during tests may clutter test reports.
