# Tracker View Enhancements

<cite>
**Referenced Files in This Document**
- [TrackerView.tsx](file://src/renderer/src/components/TrackerView.tsx)
- [trackerProps.ts](file://src/renderer/src/components/trackerProps.ts)
- [SampleBrowser.tsx](file://src/renderer/src/components/SampleBrowser.tsx)
- [TransportStrip.tsx](file://src/renderer/src/components/TransportStrip.tsx)
- [LaneClipCanvas.tsx](file://src/renderer/src/components/LaneClipCanvas.tsx)
- [SampleTileGrid.tsx](file://src/renderer/src/components/SampleTileGrid.tsx)
- [playerShell.ts](file://src/renderer/src/lib/playerShell.ts)
- [sample-utils.ts](file://src/renderer/src/lib/sample-utils.ts)
- [useTransportEngine.ts](file://src/renderer/src/hooks/useTransportEngine.ts)
- [useTrackerShortcuts.ts](file://src/renderer/src/hooks/useTrackerShortcuts.ts)
- [useBpmEditor.ts](file://src/renderer/src/hooks/useBpmEditor.ts)
- [player.ts](file://src/renderer/src/engine/player.ts)
- [scheduler.ts](file://src/renderer/src/engine/scheduler.ts)
- [lane-evaluation.ts](file://src/renderer/src/engine/lane-evaluation.ts)
- [transport.ts](file://src/renderer/src/engine/transport.ts)
- [TrackerView.test.tsx](file://src/renderer/src/components/TrackerView.test.tsx)
</cite>

## Update Summary
**Changes Made**
- Updated architecture overview to reflect new prop consolidation pattern
- Added new sections for extracted components (SampleBrowser, TransportStrip)
- Updated component structure diagrams to show new prop grouping
- Enhanced API documentation with new interface definitions
- Updated dependency analysis to reflect improved modularity

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the Tracker View enhancements implemented in the renderer, focusing on how the tracker arranges clips, schedules audio, and provides a responsive editing experience. The recent major refactoring consolidates approximately 60 flat props into three cohesive domain-specific interfaces (browser, arrangement, transport), extracts reusable components (SampleBrowser, TransportStrip), and improves overall maintainability while preserving all existing functionality. It covers the UI components (tracker lanes, canvas-based clip rendering, sample browser), the transport engine, scheduling, lane evaluation, and keyboard shortcuts.

## Project Structure
The Tracker View spans several layers with improved modularity through prop consolidation:
- UI layer: React components for lanes, canvas drawing, and sample browser tiles
- State and data model: Lane state, clip operations, and utilities  
- Transport and scheduling: Pure TypeScript modules that drive timing and playback
- Engine orchestration: Player ties together scheduling, lane evaluation, and audio
- Prop interfaces: Domain-specific prop groupings for better type safety and organization

```mermaid
graph TB
subgraph "UI Layer"
TV["TrackerView.tsx"]
SB["SampleBrowser.tsx"]
TS["TransportStrip.tsx"]
LCC["LaneClipCanvas.tsx"]
STG["SampleTileGrid.tsx"]
end
subgraph "Prop Interfaces"
TP["trackerProps.ts<br/>Browser/Arrangement/Transport Props"]
end
subgraph "State & Data"
PS["playerShell.ts"]
SU["sample-utils.ts"]
end
subgraph "Hooks"
UTE["useTransportEngine.ts"]
USK["useTrackerShortcuts.ts"]
UBE["useBpmEditor.ts"]
end
subgraph "Engine"
P["player.ts"]
SCH["scheduler.ts"]
LE["lane-evaluation.ts"]
TR["transport.ts"]
end
TV --> SB
TV --> TS
TV --> LCC
TV --> STG
TV --> TP
SB --> TP
TS --> TP
TV --> UTE
TV --> USK
TV --> UBE
TV --> PS
TV --> SU
UTE --> P
UTE --> TR
UTE --> PS
P --> SCH
P --> LE
P --> TR
LCC --> PS
LCC --> SU
STG --> PS
STG --> SU
```

**Diagram sources**
- [TrackerView.tsx:1-50](file://src/renderer/src/components/TrackerView.tsx#L1-L50)
- [SampleBrowser.tsx:1-30](file://src/renderer/src/components/SampleBrowser.tsx#L1-L30)
- [TransportStrip.tsx:1-30](file://src/renderer/src/components/TransportStrip.tsx#L1-L30)
- [trackerProps.ts:1-91](file://src/renderer/src/components/trackerProps.ts#L1-L91)
- [LaneClipCanvas.tsx:1-60](file://src/renderer/src/components/LaneClipCanvas.tsx#L1-L60)
- [SampleTileGrid.tsx:1-40](file://src/renderer/src/components/SampleTileGrid.tsx#L1-L40)
- [playerShell.ts:1-40](file://src/renderer/src/lib/playerShell.ts#L1-L40)
- [sample-utils.ts:1-40](file://src/renderer/src/lib/sample-utils.ts#L1-L40)
- [useTransportEngine.ts:1-40](file://src/renderer/src/hooks/useTransportEngine.ts#L1-L40)
- [useTrackerShortcuts.ts:1-40](file://src/renderer/src/hooks/useTrackerShortcuts.ts#L1-L40)
- [useBpmEditor.ts:1-40](file://src/renderer/src/hooks/useBpmEditor.ts#L1-L40)
- [player.ts:1-40](file://src/renderer/src/engine/player.ts#L1-L40)
- [scheduler.ts:1-40](file://src/renderer/src/engine/scheduler.ts#L1-L40)
- [lane-evaluation.ts:1-40](file://src/renderer/src/engine/lane-evaluation.ts#L1-L40)
- [transport.ts:1-40](file://src/renderer/src/engine/transport.ts#L1-L40)

**Section sources**
- [TrackerView.tsx:1-50](file://src/renderer/src/components/TrackerView.tsx#L1-L50)
- [trackerProps.ts:1-91](file://src/renderer/src/components/trackerProps.ts#L1-L91)
- [playerShell.ts:1-40](file://src/renderer/src/lib/playerShell.ts#L1-L40)
- [useTransportEngine.ts:1-40](file://src/renderer/src/hooks/useTransportEngine.ts#L1-L40)

## Core Components
- **TrackerView**: Orchestrates lanes, ruler, playhead, BPM editor, transport controls, search, and context menus. Coordinates drag-and-drop from the sample browser into lanes and between lanes. Now receives consolidated prop objects instead of individual props.
- **SampleBrowser**: Extracted component handling sample library browsing, filtering, categorization, and tag management. Receives `TrackerBrowserProps` interface containing all browser-related state and callbacks.
- **TransportStrip**: Extracted component managing transport controls (play/pause/stop), BPM editing, undo/redo, search, and scan progress. Receives `TrackerTransportProps` interface.
- **LaneClipCanvas**: High-performance canvas rendering of clip bubbles per lane with selection highlights, hit-testing, and custom drag ghost images.
- **SampleTileGrid**: Virtualized grid of sample tiles sized consistently with tracker bubbles; supports dragging samples onto lanes and right-click context actions.
- **playerShell**: Immutable lane and clip manipulation functions, dimension constants, and conversion helpers (e.g., duration to ticks).
- **useTransportEngine**: Binds UI to the Player and Transport, manages undo/redo history, preview scheduling, and meter updates.
- **Scheduler**: Lookahead scheduler driven by the audio clock to schedule triggers precisely.
- **Lane Evaluation**: Pure logic to compute which clips trigger at a given tick based on mute/solo rules.
- **Transport**: Pure state machine for play/pause/stop and tick/time conversions.

**Updated** Major refactoring introduced prop consolidation and component extraction for better maintainability and reusability.

**Section sources**
- [TrackerView.tsx:26-50](file://src/renderer/src/components/TrackerView.tsx#L26-L50)
- [SampleBrowser.tsx:9-24](file://src/renderer/src/components/SampleBrowser.tsx#L9-L24)
- [TransportStrip.tsx:29-65](file://src/renderer/src/components/TransportStrip.tsx#L29-L65)
- [LaneClipCanvas.tsx:154-260](file://src/renderer/src/components/LaneClipCanvas.tsx#L154-L260)
- [SampleTileGrid.tsx:82-160](file://src/renderer/src/components/SampleTileGrid.tsx#L82-L160)
- [playerShell.ts:60-130](file://src/renderer/src/lib/playerShell.ts#L60-L130)
- [useTransportEngine.ts:146-184](file://src/renderer/src/hooks/useTransportEngine.ts#L146-L184)
- [scheduler.ts:59-118](file://src/renderer/src/engine/scheduler.ts#L59-L118)
- [lane-evaluation.ts:39-72](file://src/renderer/src/engine/lane-evaluation.ts#L39-L72)
- [transport.ts:36-81](file://src/renderer/src/engine/transport.ts#L36-L81)

## Architecture Overview
The Tracker View integrates UI and engine through a clean boundary with improved prop organization:
- UI components receive domain-specific prop groups instead of individual props
- useTransportEngine owns lifecycle of Transport and Player, exposes actions to UI
- Player coordinates AudioEngine, Scheduler, and lane evaluation
- Scheduler drives precise scheduling using the audio clock
- Lane evaluation computes triggers per tick respecting mute/solo

```mermaid
sequenceDiagram
participant App as "App Layer"
participant TV as "TrackerView"
participant SB as "SampleBrowser"
participant TS as "TransportStrip"
participant Hook as "useTransportEngine"
participant Player as "Player"
participant Sched as "Scheduler"
participant Eval as "lane-evaluation"
participant TE as "Transport"
App->>TV : "Pass browser/arrangement/transport props"
TV->>SB : "Pass browser slice"
TV->>TS : "Pass transport slice"
TV->>Hook : "onTransportPlay()"
Hook->>TE : "play()"
Hook->>Player : "start(fromTick)"
Player->>Sched : "start(fromTick)"
loop every ~25ms
Sched->>Player : "onSchedule(tick, when)"
Player->>Eval : "triggersForTick(lanes, tick)"
Eval-->>Player : "LaneTrigger[]"
Player->>Player : "triggerLane(...)"
end
TV->>Hook : "setBpm(value)"
Hook->>TE : "setBpm(value)"
Hook->>Player : "setBpm(value)"
```

**Diagram sources**
- [TrackerView.tsx:26-50](file://src/renderer/src/components/TrackerView.tsx#L26-L50)
- [SampleBrowser.tsx:18-24](file://src/renderer/src/components/SampleBrowser.tsx#L18-L24)
- [TransportStrip.tsx:48-65](file://src/renderer/src/components/TransportStrip.tsx#L48-L65)
- [useTransportEngine.ts:335-345](file://src/renderer/src/hooks/useTransportEngine.ts#L335-L345)
- [player.ts:162-183](file://src/renderer/src/engine/player.ts#L162-L183)
- [scheduler.ts:106-118](file://src/renderer/src/engine/scheduler.ts#L106-L118)
- [lane-evaluation.ts:53-72](file://src/renderer/src/engine/lane-evaluation.ts#L53-L72)
- [transport.ts:49-69](file://src/renderer/src/engine/transport.ts#L49-L69)

## Detailed Component Analysis

### TrackerView
Responsibilities:
- Renders lanes, ruler, playhead, middle strip (BPM editor, transport controls, search, scan progress).
- Handles rectangle selection (Ctrl+drag), clip/context menus, pan knobs, and drag-and-drop between lanes and from the sample browser.
- Integrates keyboard shortcuts via useTrackerShortcuts and inline BPM editing via useBpmEditor.
- **Updated**: Now receives three consolidated prop objects (browser, arrangement, transport) instead of individual props.

Key behaviors:
- Selection rectangle uses container geometry and scroll offsets to stay consistent during drag.
- Drag-and-drop supports single or group moves/duplicates (Shift to duplicate).
- Context menu actions include Delete and Locate in Browser (search + flash highlight).
- Pan control updates lane pan and applies to the active channel immediately.

```mermaid
flowchart TD
Start(["User Action"]) --> Type{"Action Type?"}
Type --> |Ctrl+Drag| RectSel["Start Rectangle Selection<br/>Compute x/y bounds"]
RectSel --> UpdateSel["Update selection rects and selectedClipIds"]
Type --> |Drop Sample| Place["Place sample on lane<br/>Snap to nearest tick"]
Type --> |Drop Clip| MoveDup["Move or Duplicate clip(s)<br/>Shift=duplicate"]
Type --> |Right-click Clip| Menu["Show context menu"]
Menu --> Delete["Delete clip"]
Menu --> Locate["Locate in Browser<br/>Search + Flash"]
Type --> |Pan Knob| Pan["Set lane pan<br/>Apply to channel"]
Type --> |Keyboard| Shortcuts["useTrackerShortcuts<br/>Delete/Undo/Redo/Space/?"]
UpdateSel --> End(["Render updated lanes"])
Place --> End
MoveDup --> End
Delete --> End
Locate --> End
Pan --> End
Shortcuts --> End
```

**Diagram sources**
- [TrackerView.tsx:238-297](file://src/renderer/src/components/TrackerView.tsx#L238-L297)
- [TrackerView.tsx:403-493](file://src/renderer/src/components/TrackerView.tsx#L403-L493)
- [TrackerView.tsx:386-401](file://src/renderer/src/components/TrackerView.tsx#L386-L401)
- [TrackerView.tsx:654-677](file://src/renderer/src/components/TrackerView.tsx#L654-L677)
- [useTrackerShortcuts.ts:41-77](file://src/renderer/src/hooks/useTrackerShortcuts.ts#L41-L77)

**Updated** Component now accepts consolidated prop interfaces for better maintainability.

**Section sources**
- [TrackerView.tsx:26-50](file://src/renderer/src/components/TrackerView.tsx#L26-L50)
- [TrackerView.tsx:118-220](file://src/renderer/src/components/TrackerView.tsx#L118-L220)
- [TrackerView.tsx:238-297](file://src/renderer/src/components/TrackerView.tsx#L238-L297)
- [TrackerView.tsx:403-493](file://src/renderer/src/components/TrackerView.tsx#L403-L493)
- [TrackerView.tsx:386-401](file://src/renderer/src/components/TrackerView.tsx#L386-L401)
- [TrackerView.tsx:654-677](file://src/renderer/src/components/TrackerView.tsx#L654-L677)
- [useTrackerShortcuts.ts:1-79](file://src/renderer/src/hooks/useTrackerShortcuts.ts#L1-L79)
- [useBpmEditor.ts:24-63](file://src/renderer/src/hooks/useBpmEditor.ts#L24-L63)

### SampleBrowser (Extracted Component)
Responsibilities:
- Manages sample library browsing, filtering, categorization, and tag assignment
- Handles category tree navigation and subcategory chips
- Provides search functionality and sorting options
- Manages sample tile grid display and drag operations
- Controls manage panel for tags, libraries, and categories

Key features:
- Vertical resize handle for category tree width adjustment
- Category-based color coding for sample tiles
- Tag assignment context menu for individual samples
- Integration with sample tile grid for virtualized display

```mermaid
classDiagram
class SampleBrowser {
+props : browser, bpm, pixelsPerTick, flashSamplePath, onSampleDragStart
+handleCatsResizeStart(e)
+handleSampleContextMenu(sample, e)
+render()
}
class TrackerBrowserProps {
+samples : SampleListItem[]
+searchQuery : string
+loading : boolean
+error : string | null
+totalCount : number
+hasMoreSamples : boolean
+selectedSamplePath : string | null
+selectedCategoryId : number | undefined
+selectedTagIds : number[]
+sortBy : SampleSortColumn
+sortDir : SampleSortDirection
+tags : TagItem[]
+categories : CategoryItem[]
+libraries : LibraryItem[]
+scanProgress : ScanProgress
+onSearchChange : (query : string) => void
+onLoadMoreSamples : () => void
+onSelectSampleDetail : (detail : FooterSampleDetail) => void
+onPreviewSample : (samplePath : string) => void
+onSelectCategory : (id : number | undefined) => void
+onToggleTagFilter : (id : number) => void
+onSortChange : (col : SampleSortColumn) => void
+onStartScan : () => void
+onCreateTag : (name : string, color? : string) => Promise<TagItem>
+onRenameTag : (id : number, name : string) => Promise<void>
+onDeleteTag : (id : number) => Promise<void>
+onAssignTagToSample : (sample : SampleListItem, tagId : number) => Promise<void>
+onUnassignTagFromSample : (sample : SampleListItem, tagId : number) => Promise<void>
+onCreateCategory : (name : string, parentId? : number) => Promise<CategoryItem>
+onDeleteCategory : (id : number) => Promise<void>
+onSaveLibrary : (name : string) => Promise<LibraryItem>
+onDeleteLibrary : (id : number) => Promise<void>
+onApplyLibrary : (library : LibraryItem) => void
}
SampleBrowser --> TrackerBrowserProps : "consumes"
```

**Diagram sources**
- [SampleBrowser.tsx:9-16](file://src/renderer/src/components/SampleBrowser.tsx#L9-L16)
- [trackerProps.ts:18-52](file://src/renderer/src/components/trackerProps.ts#L18-L52)

**Section sources**
- [SampleBrowser.tsx:18-277](file://src/renderer/src/components/SampleBrowser.tsx#L18-L277)
- [trackerProps.ts:18-52](file://src/renderer/src/components/trackerProps.ts#L18-L52)

### TransportStrip (Extracted Component)
Responsibilities:
- Manages transport controls (play, pause, stop, skip back)
- Handles BPM inline editing with validation
- Provides undo/redo functionality
- Integrates search input and scan progress
- Displays project information and keyboard shortcuts help

Key features:
- Inline BPM editing with Enter/Escape key support
- SVG transport icons with theme-aware styling
- Progress bar integration for scanning operations
- Accessible button labels and keyboard navigation

```mermaid
classDiagram
class TransportStrip {
+props : transportState, bpm, onSetBpm, canUndo, canRedo, onUndo, onRedo, onTransportPlay, onTransportPause, onTransportStop, onTransportSkipBack, searchQuery, onSearchChange, scanProgress, onStartScan, onOpenShortcuts
+render()
}
class TrackerTransportProps {
+transportState : 'stopped' | 'playing' | 'paused'
+bpm : number
+masterGain : number
+masterLevelDb : number
+canUndo : boolean
+canRedo : boolean
+onSetBpm : (bpm : number) => void
+onSetMasterGain : (value : number) => void
+onUndo : () => void
+onRedo : () => void
+onTransportPlay : () => void
+onTransportPause : () => void
+onTransportStop : () => void
+onTransportSkipBack : () => void
}
TransportStrip --> TrackerTransportProps : "consumes"
```

**Diagram sources**
- [TransportStrip.tsx:29-46](file://src/renderer/src/components/TransportStrip.tsx#L29-L46)
- [trackerProps.ts:75-90](file://src/renderer/src/components/trackerProps.ts#L75-L90)

**Section sources**
- [TransportStrip.tsx:48-180](file://src/renderer/src/components/TransportStrip.tsx#L48-L180)
- [trackerProps.ts:75-90](file://src/renderer/src/components/trackerProps.ts#L75-L90)

### LaneClipCanvas
Responsibilities:
- Draws clip bubbles on a canvas with theme-aware colors and text contrast.
- Maintains hit rectangles for mouse interactions and context menus.
- Provides a custom drag ghost image showing only the grabbed clip (and a badge for group drags).

Highlights:
- Uses shared bubble width calculation to keep visual consistency across views.
- Memoized component to avoid re-rendering on frequent playhead updates.
- Supports selection border overlay without changing clip footprint.

```mermaid
classDiagram
class LaneClipCanvas {
+props : clips,totalTicks,laneIndex,flashSamplePath,selectedClipIds
+draw()
+hitTest(clientX)
+handleContextMenu(e)
+handleMouseDown(e)
+handleDragStart(e)
}
class playerShell {
+clipScreenRect(clip,pixelsPerTick)
}
class sample_utils {
+bubbleTextColor(color)
}
LaneClipCanvas --> playerShell : "uses"
LaneClipCanvas --> sample_utils : "uses"
```

**Diagram sources**
- [LaneClipCanvas.tsx:154-260](file://src/renderer/src/components/LaneClipCanvas.tsx#L154-L260)
- [playerShell.ts:51-58](file://src/renderer/src/lib/playerShell.ts#L51-L58)
- [sample-utils.ts:73-83](file://src/renderer/src/lib/sample-utils.ts#L73-L83)

**Section sources**
- [LaneClipCanvas.tsx:154-260](file://src/renderer/src/components/LaneClipCanvas.tsx#L154-L260)
- [LaneClipCanvas.tsx:268-332](file://src/renderer/src/components/LaneClipCanvas.tsx#L268-L332)
- [LaneClipCanvas.tsx:334-364](file://src/renderer/src/components/LaneClipCanvas.tsx#L334-L364)

### SampleTileGrid
Responsibilities:
- Virtualizes rows of sample tiles with fixed height and gap, mirroring tracker bubble widths.
- Loads more pages when scrolling near the end of the loaded prefix.
- Supports drag start to place samples on lanes and right-click context actions.

Highlights:
- Row packing algorithm matches CSS flex-wrap behavior.
- Consistent bubble sizing ensures pixel identity across views.
- Memoization avoids unnecessary re-renders during playhead updates.

**Section sources**
- [SampleTileGrid.tsx:33-52](file://src/renderer/src/components/SampleTileGrid.tsx#L33-L52)
- [SampleTileGrid.tsx:118-136](file://src/renderer/src/components/SampleTileGrid.tsx#L118-L136)
- [SampleTileGrid.tsx:156-161](file://src/renderer/src/components/SampleTileGrid.tsx#L156-L161)
- [SampleTileGrid.tsx:175-210](file://src/renderer/src/components/SampleTileGrid.tsx#L175-210)

### playerShell (Data Model and Operations)
Responsibilities:
- Defines LaneState, LaneClip, FooterSampleDetail, and constants.
- Provides immutable operations: place, move, duplicate, remove, toggle mute/solo, set pan.
- Converts UI lanes to engine lanes and computes durations in ticks.

Complexity notes:
- Batched operations (moveClipGroup, duplicateClipGroup, removeClips) perform single-pass mutations to minimize re-renders and maintain stable lane identities.

**Section sources**
- [playerShell.ts:14-40](file://src/renderer/src/lib/playerShell.ts#L14-L40)
- [playerShell.ts:73-85](file://src/renderer/src/lib/playerShell.ts#L73-L85)
- [playerShell.ts:93-127](file://src/renderer/src/lib/playerShell.ts#L93-L127)
- [playerShell.ts:133-154](file://src/renderer/src/lib/playerShell.ts#L133-L154)
- [playerShell.ts:183-208](file://src/renderer/src/lib/playerShell.ts#L183-208)
- [playerShell.ts:235-283](file://src/renderer/src/lib/playerShell.ts#L235-283)
- [playerShell.ts:299-309](file://src/renderer/src/lib/playerShell.ts#L299-L309)
- [playerShell.ts:311-315](file://src/renderer/src/lib/playerShell.ts#L311-L315)

### useTransportEngine (Orchestration)
Responsibilities:
- Creates and destroys Transport and Player when entering/exiting tracker view.
- Mirrors currentTick from Player's audio clock to UI.
- Manages undo/redo stacks for clip edits.
- Schedules monophonic previews aligned to downbeats when transport is playing.
- Applies master gain and per-lane pan changes to the engine.

Key flows:
- Play/Pause/Stop synchronize Transport state and Player scheduling.
- Skip-back resets scheduler and UI playhead.
- Preview toggles same sample and respects transport timing.

**Section sources**
- [useTransportEngine.ts:146-184](file://src/renderer/src/hooks/useTransportEngine.ts#L146-L184)
- [useTransportEngine.ts:186-233](file://src/renderer/src/hooks/useTransportEngine.ts#L186-L233)
- [useTransportEngine.ts:308-328](file://src/renderer/src/hooks/useTransportEngine.ts#L308-L328)
- [useTransportEngine.ts:335-377](file://src/renderer/src/hooks/useTransportEngine.ts#L335-L377)

### Player (Audio Orchestration)
Responsibilities:
- Wires AudioEngine, Scheduler, and lane evaluation.
- Monophonic voice management per lane; new triggers cut off previous voices.
- Preview mode with toggle semantics and optional quantized scheduling.
- Channel pan application and lazy creation of channels.

Important details:
- Guard against race conditions with playGeneration to prevent stray voices after stop/pause.
- Current tick derived from scheduler's audio clock for tight UI sync.

**Section sources**
- [player.ts:29-62](file://src/renderer/src/engine/player.ts#L29-L62)
- [player.ts:99-137](file://src/renderer/src/engine/player.ts#L99-L137)
- [player.ts:162-183](file://src/renderer/src/engine/player.ts#L162-L183)
- [player.ts:203-240](file://src/renderer/src/engine/player.ts#L203-L240)

### Scheduler (Lookahead Timing)
Responsibilities:
- Drives scheduling using setInterval with lookahead window.
- Self-corrects from audio clock to avoid drift.
- Exposes currentTick and reset for UI synchronization.

Design notes:
- Anchor-based playhead computation ensures BPM changes do not retroactively shift already-played segments beyond one interval.

**Section sources**
- [scheduler.ts:59-118](file://src/renderer/src/engine/scheduler.ts#L59-L118)
- [scheduler.ts:130-147](file://src/renderer/src/engine/scheduler.ts#L130-L147)

### Lane Evaluation (Mute/Solo Policy)
Responsibilities:
- Computes audibility based on mute/solo flags.
- Returns triggers for clips starting exactly at the tick.

Policy:
- Solo overrides mute for soloed lanes.
- Visual dimming policy differs slightly for UX feedback.

**Section sources**
- [lane-evaluation.ts:39-48](file://src/renderer/src/engine/lane-evaluation.ts#L39-L48)
- [lane-evaluation.ts:53-72](file://src/renderer/src/engine/lane-evaluation.ts#L53-L72)
- [playerShell.ts:156-164](file://src/renderer/src/lib/playerShell.ts#L156-L164)

### Transport (Pure State Machine)
Responsibilities:
- Tracks state (stopped/playing/paused) and BPM.
- Provides tick-to-time conversion for scheduling previews.

**Section sources**
- [transport.ts:36-81](file://src/renderer/src/engine/transport.ts#L36-L81)

## Dependency Analysis
High-level dependencies with improved modularity:
- TrackerView depends on hooks and components for interaction and rendering, now receiving consolidated prop objects
- Extracted components (SampleBrowser, TransportStrip) consume specific prop interfaces
- Hooks depend on engine modules for orchestration and timing
- Canvas and tile grid depend on shared utilities for consistent visuals

```mermaid
graph LR
TV["TrackerView.tsx"] --> TP["trackerProps.ts"]
TV --> UTE["useTransportEngine.ts"]
TV --> USK["useTrackerShortcuts.ts"]
TV --> UBE["useBpmEditor.ts"]
TV --> LCC["LaneClipCanvas.tsx"]
TV --> STG["SampleTileGrid.tsx"]
TV --> SB["SampleBrowser.tsx"]
TV --> TS["TransportStrip.tsx"]
SB --> TP
TS --> TP
UTE --> P["player.ts"]
UTE --> TR["transport.ts"]
P --> SCH["scheduler.ts"]
P --> LE["lane-evaluation.ts"]
LCC --> PS["playerShell.ts"]
LCC --> SU["sample-utils.ts"]
STG --> PS
STG --> SU
```

**Diagram sources**
- [TrackerView.tsx:1-50](file://src/renderer/src/components/TrackerView.tsx#L1-L50)
- [trackerProps.ts:1-91](file://src/renderer/src/components/trackerProps.ts#L1-L91)
- [SampleBrowser.tsx:1-30](file://src/renderer/src/components/SampleBrowser.tsx#L1-L30)
- [TransportStrip.tsx:1-30](file://src/renderer/src/components/TransportStrip.tsx#L1-L30)
- [useTransportEngine.ts:1-40](file://src/renderer/src/hooks/useTransportEngine.ts#L1-L40)
- [useTrackerShortcuts.ts:1-40](file://src/renderer/src/hooks/useTrackerShortcuts.ts#L1-L40)
- [useBpmEditor.ts:1-40](file://src/renderer/src/hooks/useBpmEditor.ts#L1-L40)
- [LaneClipCanvas.tsx:1-40](file://src/renderer/src/components/LaneClipCanvas.tsx#L1-L40)
- [SampleTileGrid.tsx:1-40](file://src/renderer/src/components/SampleTileGrid.tsx#L1-L40)
- [player.ts:1-40](file://src/renderer/src/engine/player.ts#L1-L40)
- [scheduler.ts:1-40](file://src/renderer/src/engine/scheduler.ts#L1-L40)
- [lane-evaluation.ts:1-40](file://src/renderer/src/engine/lane-evaluation.ts#L1-L40)
- [transport.ts:1-40](file://src/renderer/src/engine/transport.ts#L1-L40)
- [playerShell.ts:1-40](file://src/renderer/src/lib/playerShell.ts#L1-L40)
- [sample-utils.ts:1-40](file://src/renderer/src/lib/sample-utils.ts#L1-L40)

**Updated** Improved modularity through prop consolidation and component extraction reduces coupling and improves testability.

**Section sources**
- [TrackerView.tsx:1-50](file://src/renderer/src/components/TrackerView.tsx#L1-L50)
- [trackerProps.ts:1-91](file://src/renderer/src/components/trackerProps.ts#L1-L91)
- [useTransportEngine.ts:1-40](file://src/renderer/src/hooks/useTransportEngine.ts#L1-L40)
- [player.ts:1-40](file://src/renderer/src/engine/player.ts#L1-L40)
- [scheduler.ts:1-40](file://src/renderer/src/engine/scheduler.ts#L1-L40)
- [lane-evaluation.ts:1-40](file://src/renderer/src/engine/lane-evaluation.ts#L1-L40)
- [transport.ts:1-40](file://src/renderer/src/engine/transport.ts#L1-L40)
- [playerShell.ts:1-40](file://src/renderer/src/lib/playerShell.ts#L1-L40)
- [sample-utils.ts:1-40](file://src/renderer/src/lib/sample-utils.ts#L1-L40)

## Performance Considerations
- Canvas rendering: LaneClipCanvas is memoized and redraws only when necessary, avoiding heavy DOM updates during 10Hz playhead/meter refreshes.
- Virtualization: SampleTileGrid virtualizes rows and loads more pages on demand, keeping large libraries responsive.
- Batched operations: playerShell batch functions reduce state churn and preserve lane identity for memoization.
- Lookahead scheduling: Scheduler self-corrects from the audio clock, minimizing drift and ensuring tight sync between sound and UI.
- Efficient selection: Rectangle selection computes geometry once at drag start and uses efficient hit-testing against precomputed clip rects.
- **Updated**: Prop consolidation reduces prop drilling and improves component re-render performance by limiting updates to relevant prop slices.

## Troubleshooting Guide
Common issues and resolutions:
- No sound on preview/play: Ensure AudioContext is resumed before scheduling; Player.start calls resume and sets lastScheduledTick appropriately.
- Stray voices after stop/pause: Player uses playGeneration to guard against late async buffer loads starting voices after playback ended.
- BPM change causing jumps: Scheduler folds anchor forward each pass so BPM changes only reinterpret within one interval, preventing retroactive jumps.
- Playhead drift: Visual playhead reads from Player.currentTick (audio clock), not wall-clock timers, ensuring lock-step with scheduling.
- Keyboard shortcuts firing in inputs: useTrackerShortcuts checks editable targets and ignores global shortcuts inside INPUT/TEXTAREA/SELECT/contentEditable.
- Incorrect drop snapping: nearestTick guards against zero/negative container widths and clamps snapped ticks to the last valid slot.
- **Updated**: If prop interface errors occur, ensure all required fields in browser/arrangement/transport prop objects are provided when testing or integrating components.

**Section sources**
- [player.ts:162-183](file://src/renderer/src/engine/player.ts#L162-L183)
- [player.ts:203-240](file://src/renderer/src/engine/player.ts#L203-L240)
- [scheduler.ts:75-98](file://src/renderer/src/engine/scheduler.ts#L75-L98)
- [useTrackerShortcuts.ts:41-77](file://src/renderer/src/hooks/useTrackerShortcuts.ts#L41-L77)
- [sample-utils.ts:116-135](file://src/renderer/src/lib/sample-utils.ts#L116-L135)
- [trackerProps.ts:1-91](file://src/renderer/src/components/trackerProps.ts#L1-L91)

## Conclusion
The Tracker View enhancements deliver a robust, high-performance arrangement interface with precise audio scheduling, intuitive editing gestures, and consistent visual design across views. The recent major refactoring significantly improves maintainability through prop consolidation (~60 flat props into three cohesive interfaces) and component extraction (SampleBrowser, TransportStrip). The separation of concerns—UI, state, scheduling, and engine—enables better testability and code organization, while optimizations like canvas rendering, virtualization, and batched operations ensure smooth operation even with large libraries. The new prop interface structure makes it easier to understand component responsibilities and reduces the risk of prop drilling issues.