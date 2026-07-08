# Architecture

## The two prior failures this stack is designed around

- **React (web)** became very slow at 100k samples. Root cause: rendering real DOM
  nodes for the full dataset instead of virtualizing — **not** a React limitation
  (Discord/Notion/Spotify render huge lists in React via windowing). The fix is
  virtualization, not a different framework.
- **C# / WPF** worked but looked dated and was painful to reskin. Root cause: proper
  reskinning needs deep XAML control-template authoring, a fundamentally harder
  paradigm than CSS. The fix is a real webview where CSS *is* the UI.

The chosen stack avoids re-fighting either problem. Keep these root causes in mind:
they are the reason for the two non-negotiables below (virtualize all large lists;
keep the UI a real webview).

## Decided stack

| Layer | Choice | Why it is constrained this way |
| ----- | ------ | ----------------------------- |
| Hosts | **Browser-first (Chromium) + thin Electron shell** | One backend, two hosts. Browser build is primary (GitHub Pages); Electron loads the same bundle from `app://`. Chromium-only. |
| UI | **React + TypeScript** | React was not the prior bottleneck; virtualization was. Prior React investment is kept. |
| Large-list rendering | **Virtualized list/grid** (TanStack Virtual or react-window) | ~30–50 DOM rows exist at once, recycled on scroll. Mandatory for any view that can show many samples. |
| Data layer | **SQLite via `@sqlite.org/sqlite-wasm`** (opfs-sahpool VFS) in a backend Web Worker | Indexed SQL, never in-memory JS. FTS5 fuzzy search. No COOP/COEP. One connection via Web Lock. |
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
│  └───────────────────────────────────────────────────┘  │
│  Folder handles in IndexedDB · session in localStorage   │
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
  connection, so queries and indexing interleave on the same connection. The UI
  calls the async `BackendAPI` facade and receives plain JSON (e.g. a page of
  sample rows for the virtual list).
- **Renderer requests are windowed.** The virtual list asks for the visible
  slice + buffer (`LIMIT`/`OFFSET` or keyset pagination), never the full result set.
- **No absolute paths anywhere.** Folders are `FolderRef`s (an id keying a
  persisted directory handle); samples are `(root_id, relpath)`. Reading a file
  resolves the relpath through the root's handle, so reads cannot escape a
  granted folder by construction.
- **One tab.** A Web Lock (`mixjam-app`) is taken before the app mounts; a
  second tab shows a friendly notice instead of failing on DB open.
- **Keep the Electron renderer sandboxed:** `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, a `contextBridge` preload exposing
  only the narrow `ShellAPI` (version, window resize, allowlisted openExternal).
- **Audio stays on the renderer main thread** (Web Audio API). The engine loads
  sample bytes through `BackendAPI.readSampleBytes(rootId, relpath)`.

## Non-goals for this phase

- Not a full-featured DAW. The tracker/player is intentionally eJay/Acid-simple, and
  narrower than MixJam Native's ambitions.
- Not real-time collaboration, cloud sync, or plugin hosting.
- Not auto-detection of BPM/key at scale in v1 (see [indexing.md](indexing.md)).

## Relationship to sibling projects

This project is **distinct** from MixJam Native (WinUI) and MixJam Web (React/Vite,
GitHub Pages). Do not share or copy schemas, docs, or code with them, and do not
assume their conventions apply here. Since the web-first re-architecture the entire
app is a portable web bundle; the Electron shell is ~150 lines and could be swapped
for any Chromium-based shell (or dropped entirely) without touching the app.
