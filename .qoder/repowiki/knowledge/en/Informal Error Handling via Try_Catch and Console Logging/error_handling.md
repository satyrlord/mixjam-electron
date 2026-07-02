The MixJam Electron codebase employs an informal, ad-hoc error handling strategy centered on `try/catch` blocks and `console.error` logging. There is no centralized error boundary, global error middleware, or structured error reporting framework.

### Key Patterns

1. **Main Process (Electron IPC Handlers)**:
   - **Input Validation**: Critical IPC handlers in `src/main/index.ts` use explicit type guards to validate incoming arguments from the renderer. If validation fails, they often throw `TypeError` (e.g., `libraryCreateTag`, `libraryCreateCategory`) or return `null`/`undefined` to signal failure without crashing the main process.
   - **Graceful Degradation**: Filesystem operations (session loading, sample reading) are wrapped in `try/catch` blocks. Failures are logged to `console.error` and typically result in returning default values (e.g., empty session) or `null` to the renderer.
   - **Worker Error Propagation**: The `IndexerHost` manages a worker thread for library scanning. It listens for `error` events on the worker and translates them into a `{ status: 'error' }` state sent to the renderer via IPC, preventing unhandled worker crashes from taking down the app.

2. **Renderer Process (React Hooks)**:
   - **Async Error Swallowing**: React hooks like `useLibraryData` and `useAppState` wrap async IPC calls in `try/catch`. Errors are logged to `console.error` and local state (e.g., `error: string | null`) is updated to display user-facing messages in the UI.
   - **No Error Boundaries**: The application does not appear to use React Error Boundaries, meaning unexpected rendering errors could potentially unmount the entire component tree.

3. **Audio Engine**:
   - **Custom Error Types**: The `SampleCache` in `src/renderer/src/engine/sample-cache.ts` defines a custom `SampleDecodeError` class to wrap decoding failures, providing better context for audio-specific issues.

### Conventions
- **Return Null on Failure**: Many IPC handlers return `null` instead of throwing, pushing the burden of null-checking to the caller.
- **Console Logging**: `console.error` is the primary mechanism for debugging failed operations in both main and renderer processes.
- **Type Guards**: Extensive use of runtime type checking (`typeof`, `isFolderRole`) to prevent invalid data from propagating into core logic.