# Architecture

## Decided stack

| Layer | Choice | Why it is constrained this way |
| ----- | ------ | ----------------------------- |
| Host | **Electron desktop app** | One distributed host. Electron loads the renderer from the privileged `app://bundle` origin and bundles Chromium. There is no web deployment. |
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
│ Electron renderer (`app://bundle`)                       │
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
│  │  • analyzer — evidence, contextual groups, and    │  │
│  │    cluster projections                            │  │
│  │  • generator — bounded planner scoring +          │  │
│  │    deterministic project planning                 │  │
│  └───────────────────────────────────────────────────┘  │
│  Folder handles in IndexedDB · preferences in localStorage│
│  Song, lanes, lane-owned Mixer state, and FX buses        │
│  in .mixjam                                               │
│  tracker/player (Web Audio) · skinnable via CSS vars     │
└─────────────────────────────────────────────────────────┘
   Electron main process:
     window sizing, app:// protocol, auto-granted fileSystem
     permission, and openExternal allowlist
     (exposed to the renderer as required window.shellAPI)
```

Rules of the process model:

- **All DB access lives in the backend worker.** opfs-sahpool requires the
  worker-only `FileSystemSyncAccessHandle` API and allows exactly one
  connection, so queries, indexing, and generator planning interleave on the
  same connection. The UI calls the async `BackendAPI` facade and receives plain
  JSON, such as a page of sample rows or a bounded neutral generator plan.
- **Backend job policy has one owner.** The worker entry module initializes the
  database and dispatches typed requests. A deep job-coordination module owns
  admission, queueing, replacement, cancellation, identity, and progress for
  library sync, the single analyzer, individual analyzer requests, and generator
  planning.
  Workflow-owned persistence modules group indexed-sample lifecycle, analysis
  provenance, and sample/saved-library SQL without opening another connection.
- **Renderer library-sync lifecycle has one owner.** A dedicated runtime hook
  filters root/job events, hydrates coalesced jobs, projects progress into one
  renderer state, and exposes automatic, manual, retry, and cancel actions.
  Browser queries and metadata mutations remain separate workflows. Home, the
  Middle Strip, and status controls share one presentation policy derived from
  that lifecycle state.
- **Analysis has one semantic owner.** The analyzer stores direct per-file
  BPM/key evidence, validates stereo-pair side evidence, derives directory and
  virtual source-cohort groups, infers zero or more coherent clusters, and
  persists current BPM/key/type projections.
  Directory ancestry and structured filename labels are evidence, not a promise
  that a complete folder is uniform. Batch and individual requests run the same
  engine. There is no folder-calibration analyzer beside it.
- **Renderer requests are windowed.** The virtual list asks for the visible
  slice + buffer (`LIMIT`/`OFFSET` or keyset pagination), never the full result set.
- **No absolute paths anywhere.** Folders are `FolderRef`s (an id keying a
  persisted directory handle); samples are `(root_id, relpath)`. Reading a file
  resolves the relpath through the root's handle, so reads cannot escape a
  granted folder by construction.
- **Folder access has one module owner.** It maps folder roles to permission
  modes, loads stored handles, distinguishes automatic access from explicit
  user-gesture recovery, resolves relative paths, and validates that picked
  files remain inside the selected root. Backend workflows do not load stored
  handles directly.
- **The shell does not provide filesystem fallbacks.** Automated Electron
  checks seed the renderer's `BackendAPI` test facade; environment
  variables and renderer-supplied paths never grant host filesystem access.
- **One active app instance per profile.** A Web Lock (`mixjam-app`) is taken
  before the app mounts; a competing window shows a friendly notice instead
  of failing on DB open.
- **Audio stays on the renderer main thread** (Web Audio API). The engine loads
  sample bytes through `BackendAPI.readSampleBytes(rootId, relpath)`.
- **Generated-project commit stays in the renderer.** The backend worker owns
  root/cluster-scoped queries, bounded arrangement scoring, and deterministic
  neutral planning. The generator may decode its bounded shortlist for planner
  metrics, but it consumes analyzer-owned BPM, key, and type and does not derive
  competing semantic values. The renderer adapts the plan, serializes it through
  the production project format, writes it inside the User Folder, and updates
  recent projects only after the write succeeds.
  A project support module interprets persisted generator metadata and returns
  planner parameters only for an exact supported generator/profile version;
  the generation hook owns dialog and job lifecycle, not metadata decoding.
- **The project model owns the complete saved snapshot.** Song settings and one
  to 64 stable-identity lanes live with their placements, name, mute, solo,
  pan, volume, and exactly four aligned Send values. The same snapshot owns
  exactly four fixed-order FX buses. There is no separate channel array or
  routing model. The project-state module also owns lane defaults, cloning,
  pure lane/Mixer edits, the lane/Return edit-history shape, and the adapter to
  playback graph data. Renderer hooks coordinate live editing but do not define persistence
  types or reconstruct project defaults.
- **Mixer channels are derived from lanes.** Adding a lane appends its channel;
  deleting a lane removes it. Array order defines channel position while the
  stable lane id preserves relationships. A channel label is exactly its lane
  name, with no derived prefix. No Mixer command adds, removes, routes, or
  reorders channels.
- **Graph reconciliation belongs to playback.** Playback consumes one complete
  project snapshot and reconciles lane gain, pan, mute/solo gating, dry output,
  four post-fader/post-pan Sends, four modular Return processors, Return levels,
  and Return limiters before the unchanged Master stage. A newly created engine
  hydrates that complete graph before use, including after Sample Folder
  replacement. Each lane has one pan stage in its channel path; voices do not
  add a second panner. Returns cannot feed one another.
- **Player preferences and global commands have policy owners.** One app-state
  module validates and persists panel layouts, the active Bottom Workspace tab,
  UI Size, expansion state, and MixJam Browser collapse. One shortcut module
  owns global matching, modal suppression, dispatch, and displayed command
  text. The Media Session API owns OS media actions; the shell does not register
  invasive system-wide shortcuts.
- **Player regions own their live behavior.** The Tracker interaction module
  owns selection, drag, scrolling, lane menus, and sample location. The Bottom
  Workspace module owns live panel refs, tab changes, expansion, and layout
  persistence calls. The Player view composes those regions and does not retain
  a second copy of their interaction state.
- **Host-local persistence follows its workflow.** Folder selection plus the
  best-effort `mixjam.json` mirror belong to app state. User Folder discovery,
  recent-project validation, merging, and ordering belong to the project
  catalog beside project file access.

## Non-goals for this phase

- Not a full-featured DAW. The tracker/player is intentionally eJay/Acid-simple.
- Not real-time collaboration, cloud sync, or plugin hosting.
- Not ML-based or cross-library-accuracy-guaranteed sample analysis; the v1
  heuristic WAV pipeline is documented in [indexing.md](indexing.md).
