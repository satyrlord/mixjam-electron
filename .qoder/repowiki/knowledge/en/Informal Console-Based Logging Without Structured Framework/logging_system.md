## Overview

The MixJam Electron application uses **no dedicated logging framework**. All diagnostic output relies exclusively on built-in `console` methods (`console.error`, `console.warn`). There is no log-level management, no structured logging, no log rotation, no file-based sinks, and no centralized logger initialization.

## Approach and Patterns

### 1. No Logging Framework

- Zero imports of any logging library (winston, pino, bunyan, debug, etc.)
- No dedicated `log/` or `logging/` directory exists in the codebase
- No logger configuration files or initialization modules
- The `.qoder/repowiki/knowledge/en/Informal Error Handling via Try_Catch and Console Logging/error_handling.md` documentation explicitly confirms this informal approach

### 2. Console Methods Only

All logging uses native JavaScript console methods:

- **`console.error()`** — Used for unexpected failures across both main and renderer processes
- **`console.warn()`** — Appears only in example/documentation files (`.github/skills/deslop/EXAMPLES.md`), not in production source code

No usage of `console.log()`, `console.info()`, `console.debug()`, or `console.trace()` was found in the actual source files.

### 3. Logging Locations

**Main process** (`src/main/`):
- `index.ts`: Logs IPC handler failures (writing `mixjam.json`, reading sample bytes)
- `indexer-host.ts`: Logs worker thread errors during sample indexing
- `library.ts`: Logs filesystem read failures during category synchronization

**Renderer process** (`src/renderer/src/hooks/`):
- `useAppState.ts`: Logs recent project recording failures
- `useLibraryData.ts`: Logs version retrieval, recent projects loading, and sample query failures

### 4. Log Message Convention

All `console.error()` calls follow a consistent pattern: a descriptive prefix string followed by the error object:

```typescript
console.error('Failed to write mixjam.json on quit:', error)
console.error('Indexer worker error:', err)
console.error('syncCategoriesFromFolder: failed to read sample folder', sampleFolder, err)
console.error('Failed to query sample browser:', e)
```

Prefixes typically start with "Failed to" or describe the component context.

### 5. Error Handling Strategy

Logging is tightly coupled with a **silent-failure resilience pattern**:

- Main process operations return safe defaults (`null`, `[]`, `false`) after logging
- Errors are caught but rarely propagated to users
- Only one user-facing error message exists: `'Unable to load sample library.'` in `useAppState.ts`
- IPC boundaries do not translate or propagate errors structurally

## Key Files

| File | Role |
|------|------|
| `src/main/index.ts` | Main process entry point; logs session save/write failures and sample read errors |
| `src/main/indexer-host.ts` | Worker thread host; logs indexer errors |
| `src/main/library.ts` | Database operations; logs folder sync failures |
| `src/renderer/src/hooks/useLibraryData.ts` | Renderer data fetching; logs query and version errors |
| `src/renderer/src/hooks/useAppState.ts` | App state orchestration; logs project recording errors |
| `.qoder/repowiki/knowledge/en/Informal Error Handling via Try_Catch and Console Logging/error_handling.md` | Documentation confirming the informal approach |

## Conventions Developers Should Follow

1. **Use `console.error()` for unexpected async failures** — Include a descriptive prefix identifying the operation that failed.

2. **Do not introduce custom Error classes or logging frameworks** without team consensus — the codebase has no error type hierarchy or structured logging infrastructure.

3. **Return safe defaults after logging** in the main process (`null`, empty arrays, `false`) rather than throwing — this matches the existing resilience-oriented pattern.

4. **Do not throw across IPC boundaries** — IPC handlers should return nullable values for expected failure cases.

5. **User-facing errors are rare** — Only add new user-visible error states if the failure blocks core functionality. Use concise, non-technical messages.

## Known Gaps

As documented in the repository's own error handling knowledge card:

- No error boundary component in React
- No structured error logging (no log levels, no correlation IDs, no structured fields)
- No retry logic for transient failures
- No error telemetry or crash reporting
- Generic error messages provide no actionable guidance to users
- No log file persistence — all output goes to stdout/stderr only