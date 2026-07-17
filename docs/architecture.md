# Architecture

## Decided stack

| Layer | Choice | Why it is constrained this way |
| ----- | ------ | ----------------------------- |
| Hosts | **Browser-first (Chromium) + thin Electron shell** | One backend, two hosts. Browser build is primary (GitHub Pages); Electron loads the same bundle from `app://`. Chromium-only. |
| UI | **React + TypeScript** | React was not the prior bottleneck; virtualization was. Prior React investment is kept. |
| UI primitives | **Project wrappers over Radix UI and react-resizable-panels** | Shared keyboard, focus, portal, collision, pointer, and ARIA behavior without third-party imports in features. |
| Large-list rendering | **Virtualized list/grid** (TanStack Virtual or react-window) | ~30–50 DOM rows exist at once, recycled on scroll. Mandatory for any view that can show many samples. |
| Data layer | **SQLite via `@sqlite.org/sqlite-wasm`** (opfs-sahpool VFS) in a backend Web Worker | Indexed SQL, never in-memory JS. FTS5 prefix search. No COOP/COEP. One connection via Web Lock. |
| File access | **File System Access API** | `showDirectoryPicker` grants a `FileSystemDirectoryHandle` in IndexedDB. Handles are contained to their subtree. Electron auto-grants `fileSystem`. |
| Library concept | **Saved filtered views over one master index** | A "library" is a saved query (`rule_json`), not copied files. See [data-model.md](data-model.md). |
| Theming | **Plain CSS / CSS custom properties** | Theme JSON files define tokens consumed as CSS variables. |
| Audio | **Web Audio API** lookahead-scheduler | Sample-accurate enough for an eJay/Acid tracker. Native addon escape hatch defined in [audio-engine.md](audio-engine.md). |

## Process model

```text
┌─────────────────────────────────────────────────────────┐
│ Renderer (identical bundle in every host)                │
│                                                          │
│  UI (React) ──> BackendAPI facade (contract:             │
│                 src/shared/backend-api.ts; impl:         │
│                 src/renderer/src/backend/client.ts)      │
│                      │ postMessage                       │
│  ┌───────────────────▼───────────────────────────────┐  │
│  │ Backend Worker (src/renderer/src/backend/worker.ts)│  │
│  │  • sqlite-wasm + opfs-sahpool — owns the one DB   │  │
│  │    connection, runs all queries                   │  │
│  │  • indexer — directory-handle traversal +         │  │
│  │    music-metadata parseBlob (see indexing.md)     │  │
│  │  • generator — bounded transient analysis +       │  │
│  │    deterministic project planning                 │  │
│  └───────────────────────────────────────────────────┘  │
│  Folder handles in IndexedDB · preferences in localStorage│
│  Song, arrangement, Mixer, routing, and FX in .mixjam     │
│  tracker/player (Web Audio) · skinnable via CSS vars     │
└─────────────────────────────────────────────────────────┘
   Host A: any Chromium browser (GitHub Pages, https)
   Host B: thin Electron shell (~150-line main process):
           window sizing, app:// protocol, auto-granted
           fileSystem permission, openExternal allowlist
           (exposed to the renderer as window.shellAPI)
```

Rules of the process model:

- **All DB access lives in the backend worker.** opfs-sahpool requires the
  worker-only `FileSystemSyncAccessHandle` API and allows exactly one
  connection, so queries, indexing, and generator planning interleave on the
  same connection. The UI calls the async `BackendAPI` facade and receives plain
  JSON, such as a page of sample rows or a bounded neutral generator plan.
- **Renderer requests are windowed.** The virtual list asks for the visible
  slice + buffer (`LIMIT`/`OFFSET` or keyset pagination), never the full result set.
- **No absolute paths anywhere.** Folders are `FolderRef`s (an id keying a
  persisted directory handle); samples are `(root_id, relpath)`. Reading a file
  resolves the relpath through the root's handle, so reads cannot escape a
  granted folder by construction.
- **The shell does not provide filesystem fallbacks.** Automated browser and
  Electron checks seed the renderer's `BackendAPI` test facade; environment
  variables and renderer-supplied paths never grant host filesystem access.
- **One tab.** A Web Lock (`mixjam-app`) is taken before the app mounts; a
  second tab shows a friendly notice instead of failing on DB open.
- **Audio stays on the renderer main thread** (Web Audio API). The engine loads
  sample bytes through `BackendAPI.readSampleBytes(rootId, relpath)`.
- **Generated-project commit stays in the renderer.** The backend worker owns
  root-scoped shortlisting, transient sample analysis, and deterministic neutral
  planning. The renderer adapts the plan, serializes it through the production
  project format, writes it inside the User Folder, and updates recent projects
  only after the write succeeds.

## Non-goals for this phase

- Not a full-featured DAW. The tracker/player is intentionally eJay/Acid-simple.
- Not real-time collaboration, cloud sync, or plugin hosting.
- Not ML-based or cross-library-accuracy-guaranteed sample analysis; the v1
  heuristic WAV pipeline is documented in [indexing.md](indexing.md).
