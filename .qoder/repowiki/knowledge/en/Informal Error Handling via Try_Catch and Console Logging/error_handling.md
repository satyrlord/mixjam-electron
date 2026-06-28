## Overview

The MixJam Electron application uses an **informal, ad-hoc error handling approach** with no centralized error management system. Errors are handled through basic `try/catch` blocks and logged via `console.error()`. There are no custom error types, error codes, error boundaries, or structured error propagation mechanisms.

## Approach and Patterns

### 1. Silent Failure with Default Fallbacks (Backend)

In the main process (`src/main/session.ts`, `src/main/sample-browser.ts`), filesystem operations consistently use try/catch blocks that **swallow errors silently** and return safe defaults:

- `readSession()` returns `{ userFolder: null, sampleFolder: null }` on failure
- `readRecentProjects()` returns `[]` on failure
- `isDirectory()`, `isReadable()`, `isWritable()` return `false` on failure
- `scanSampleFolder()` skips unreadable directories/files by returning early from catch blocks

This pattern prioritizes resilience over visibility — the application continues operating even when configuration files are missing or corrupted.

### 2. Console Logging for Diagnostics (Both Processes)

Errors that should be visible to developers are logged via `console.error()`:

- **Main process** (`src/main/index.ts`): Logs failures writing `mixjam.json` during session save and app quit
- **Renderer process** (`src/renderer/src/hooks/useAppState.ts`): Logs failures reading app version, loading recent projects, querying samples, and recording recent projects

These logs are purely diagnostic — they do not trigger user-facing error messages or recovery flows.

### 3. User-Facing Error State (Renderer Only)

The only user-visible error handling is in `useAppState.ts` for the sample browser:

```typescript
catch (error) {
  console.error('Failed to query sample browser:', error)
  setSampleRows([])
  setSampleBrowserError('Unable to load sample library.')
}
```

A generic error string `'Unable to load sample library.'` is stored in React state and passed to UI components. This is the **only** error message surfaced to end users in the entire codebase.

### 4. IPC Boundary — No Error Propagation

The preload script (`src/preload/index.ts`) and IPC handlers (`src/main/index.ts`) do **not** implement any error translation or propagation:

- IPC handlers return `null`, `false`, or `undefined` on failure conditions
- The `ElectronAPI` interface defines all methods as returning `Promise<T>` but does not specify rejection behavior
- Errors thrown in main process handlers propagate as rejected promises to the renderer, where they are caught and logged

### 5. Input Validation via Type Guards

Instead of throwing validation errors, the codebase uses **type guard functions** that return booleans:

- `isFolderRole(value)` — validates folder role strings
- `isRecentProjectEntry(value)` — validates project entry shape
- `normalizeSession(value)` — sanitizes session data with fallbacks rather than throwing

## Key Files

| File | Role |
|------|------|
| `src/main/session.ts` | Filesystem operations with silent-failure try/catch pattern |
| `src/main/sample-browser.ts` | Directory scanning with per-entry error suppression |
| `src/main/index.ts` | IPC handlers with console.error logging |
| `src/renderer/src/hooks/useAppState.ts` | Renderer-side error catching, console logging, and one user-facing error state |
| `src/shared/ipc.ts` | IPC channel definitions and API types (no error contracts) |

## Conventions Developers Should Follow

1. **No custom Error classes exist** — do not introduce them without team consensus, as the codebase has no error type hierarchy or error code system.

2. **Use `try/catch` with `console.error`** for unexpected failures in async operations. Include a descriptive prefix string (e.g., `'Failed to query sample browser:'`).

3. **Return safe defaults on recoverable failures** in the main process (null, empty arrays, false) rather than throwing. This matches the existing resilience-oriented pattern.

4. **Do not throw across IPC boundaries** — IPC handlers should return nullable values (`null`, `false`) for expected failure cases. Let unexpected errors propagate as promise rejections.

5. **User-facing errors are rare** — only add new user-visible error states if the failure blocks core functionality. Use concise, non-technical messages.

6. **Type guards over exceptions** — prefer boolean-returning validation functions (`isFolderRole`, `isRecentProjectEntry`) over throwing validation errors.

## Gaps

- No error boundary component in React
- No structured error logging (no log levels, no correlation IDs)
- No retry logic for transient failures
- No error telemetry or crash reporting
- Generic error messages provide no actionable guidance to users
