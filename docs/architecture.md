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
|---|---|---|
| Shell | **Electron** | Real Chromium webview → CSS/web-font skins render pixel-perfect with no translation layer. This is the direct fix for the WPF skinning failure. Node backend keeps everything in JS/TS. |
| UI | **React + TypeScript** | React was not the prior bottleneck; virtualization was. Prior React investment is kept. |
| Large-list rendering | **Virtualized list/grid** (TanStack Virtual or react-window) | ~30–50 DOM rows exist at once, recycled on scroll. Mandatory for any view that can show many samples. |
| Data layer | **SQLite via `better-sqlite3`** in the main/Node process | Filtering/sorting 100k rows is an indexed SQL query, never in-memory JS array work. FTS5 for fuzzy name search. |
| Library concept | **Saved filtered views over one master index** | A "library" is a saved query (`rule_json`), not copied files. See [data-model.md](data-model.md). |
| Theming | **Plain CSS / Tailwind / CSS variables** | Claude Design HTML/CSS output is a good reference. |
| Audio | **Web Audio API** lookahead-scheduler | Sample-accurate enough for an eJay/Acid tracker. Native addon escape hatch defined in [audio-engine.md](audio-engine.md). |

## Process model

```
┌────────────────────────────────────────────────────────────┐
│ Electron main process (Node)                                │
│   • better-sqlite3 — owns the database, runs all queries    │
│   • IPC handlers — the renderer's only path to data         │
│   • indexer worker_thread — filesystem scan + metadata      │
│     (see indexing.md), reports progress over IPC            │
└───────────────▲────────────────────────────────────────────┘
                │ contextBridge IPC (typed, no nodeIntegration)
┌───────────────┴────────────────────────────────────────────┐
│ Renderer (React + TS)                                       │
│   • virtualized sample browser  • tag/category UI           │
│   • tracker/player (Web Audio runs here)                    │
│   • skinnable via CSS variables                             │
└────────────────────────────────────────────────────────────┘
```

Rules of the process model:

- **All DB access lives in the main process.** `better-sqlite3` is synchronous and
  native; it must not run in the renderer. The renderer asks for data over IPC and
  receives plain JSON (e.g. a page of sample rows for the virtual list).
- **Renderer requests are windowed.** The virtual list asks for the visible
  slice + buffer (`LIMIT`/`OFFSET` or keyset pagination), never the full result set.
- **Keep the renderer sandboxed:** `contextIsolation: true`, `nodeIntegration:
  false`, a `contextBridge` preload exposing a narrow typed API. This matters
  because the app reads arbitrary local files.
- **Audio stays in the renderer** (Web Audio API). Only file paths/metadata cross
  IPC; audio buffers are loaded in the renderer from disk via a custom protocol or
  `file://` access mediated by main.

## Non-goals for this phase

- Not a full-featured DAW. The tracker/player is intentionally eJay/Acid-simple, and
  narrower than MixJam Native's ambitions.
- Not real-time collaboration, cloud sync, or plugin hosting.
- Not auto-detection of BPM/key at scale in v1 (see [indexing.md](indexing.md)).

## Relationship to sibling projects

This project is **distinct** from MixJam Native (WinUI) and MixJam Web (React/Vite,
GitHub Pages). Do not share or copy schemas, docs, or code with them, and do not
assume their conventions apply here. The frontend is deliberately kept portable
(plain HTML/CSS/JS/React) so the Electron shell could later be swapped for Tauri
without a UI rewrite — see [decisions.md](decisions.md#d-002-electron-for-v1).
