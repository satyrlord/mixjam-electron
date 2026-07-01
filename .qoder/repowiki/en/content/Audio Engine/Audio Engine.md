# Audio Engine

<cite>
**Referenced Files in This Document**
- [transport.ts](file://src/renderer/src/engine/transport.ts)
- [player.ts](file://src/renderer/src/engine/player.ts)
- [scheduler.ts](file://src/renderer/src/engine/scheduler.ts)
- [audio-engine.ts](file://src/renderer/src/engine/audio-engine.ts)
- [channel.ts](file://src/renderer/src/engine/channel.ts)
- [voice.ts](file://src/renderer/src/engine/voice.ts)
- [sample-cache.ts](file://src/renderer/src/engine/sample-cache.ts)
- [lane-evaluation.ts](file://src/renderer/src/engine/lane-evaluation.ts)
- [playerShell.ts](file://src/renderer/src/lib/playerShell.ts)
- [useTransportEngine.ts](file://src/renderer/src/hooks/useTransportEngine.ts)
- [TrackerView.tsx](file://src/renderer/src/components/TrackerView.tsx)
- [useAppState.ts](file://src/renderer/src/hooks/useAppState.ts)
- [App.tsx](file://src/renderer/src/App.tsx)
- [LaneClipCanvas.tsx](file://src/renderer/src/components/LaneClipCanvas.tsx)
- [useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)
- [library.ts](file://src/main/library.ts)
- [audio-engine.md](file://docs/audio-engine.md)
- [spec-005-audio-playback-engine.md](file://docs/specs/spec-005-audio-playback-engine.md)
- [spec-006-player-timeline-panels.md](file://docs/specs/spec-006-player-timeline-panels.md)
- [spec-007-mixer.md](file://docs/specs/spec-007-mixer.md)
- [architecture.md](file://docs/architecture.md)
- [index.ts](file://src/main/index.ts)
- [ipc.ts](file://src/shared/ipc.ts)
- [player.test.ts](file://src/renderer/src/engine/player.test.ts)
</cite>

## Update Summary
**Changes Made**
- Enhanced timeline panel system with comprehensive beat and bar grid alignment
- Improved ruler and grid rendering with CSS variable integration
- Added new getComputedColor utility function for CSS property fallback resolution
- Implemented performance improvements to useLibraryData hook with paginated loading system
- Replaced single-page database queries with efficient pagination replacing legacy folder scanning

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Timeline Panel Enhancements](#timeline-panel-enhancements)
7. [Library Data Performance Improvements](#library-data-performance-improvements)
8. [Dependency Analysis](#dependency-analysis)
9. [Performance Considerations](#performance-considerations)
10. [Troubleshooting Guide](#troubleshooting-guide)
11. [Conclusion](#conclusion)
12. [Appendices](#appendices)

## Introduction
This document describes MixJam Electron's enhanced audio engine and playback system. The system features a sophisticated transport engine architecture with lookahead scheduling, comprehensive audio processing capabilities, and seamless integration between the tracker interface and real-time audio output. The engine implements a pure TypeScript architecture with Web Audio API integration, providing sample-accurate playback with low-latency scheduling and comprehensive audio processing features. Recent improvements include enhanced player lifecycle management, improved transport synchronization, sophisticated lane evaluation policies, and significant performance optimizations for the library data system.

## Project Structure
The audio engine is organized into distinct layers that work together to provide a complete playback solution. The architecture follows a layered approach with clear separation of concerns:

- **Transport Layer**: Handles playhead state, BPM control, and timing calculations
- **Scheduler Layer**: Manages lookahead scheduling with configurable timing parameters
- **Audio Engine Layer**: Controls Web Audio API, voice management, and audio routing
- **Player Orchestration**: Coordinates all components and manages playback lifecycle with improved state management
- **UI Integration**: Connects the audio engine to the tracker interface and user controls with synchronized playhead rendering
- **Timeline Panels**: Enhanced visual timeline with beat/bar grid alignment and CSS variable integration

```mermaid
graph TB
subgraph "Audio Engine Layers"
A["Transport Layer<br/>- BPM control<br/>- Playhead state<br/>- Tick calculations<br/>- State machine"]
B["Scheduler Layer<br/>- Lookahead scheduling<br/>- Timing precision<br/>- Event coordination<br/>- Audio clock synchronization"]
C["Audio Engine Layer<br/>- Web Audio API<br/>- Voice management<br/>- Channel routing<br/>- Sample caching"]
D["Player Orchestration<br/>- Component coordination<br/>- Playback lifecycle<br/>- Generation tracking<br/>- Preview scheduling"]
end
subgraph "UI Integration"
E["Player Shell<br/>- Lane management<br/>- Clip placement<br/>- Dimming policy<br/>- Visual feedback"]
F["Tracker Interface<br/>- Playhead visualization<br/>- Transport controls<br/>- Mixer integration<br/>- Transport-aware preview"]
G["Timeline Panels<br/>- Beat/bar grid alignment<br/>- CSS variable integration<br/>- Enhanced rendering<br/>- Performance optimization"]
end
A --> B
B --> C
C --> D
E --> D
F --> D
G --> F
```

**Diagram sources**
- [transport.ts:1-79](file://src/renderer/src/engine/transport.ts#L1-L79)
- [scheduler.ts:1-137](file://src/renderer/src/engine/scheduler.ts#L1-L137)
- [audio-engine.ts:1-204](file://src/renderer/src/engine/audio-engine.ts#L1-L204)
- [player.ts:1-230](file://src/renderer/src/engine/player.ts#L1-L230)
- [playerShell.ts:1-202](file://src/renderer/src/lib/playerShell.ts#L1-L202)
- [LaneClipCanvas.tsx:37-44](file://src/renderer/src/components/LaneClipCanvas.tsx#L37-L44)

**Section sources**
- [transport.ts:1-79](file://src/renderer/src/engine/transport.ts#L1-L79)
- [scheduler.ts:1-137](file://src/renderer/src/engine/scheduler.ts#L1-L137)
- [audio-engine.ts:1-204](file://src/renderer/src/engine/audio-engine.ts#L1-L204)
- [player.ts:1-230](file://src/renderer/src/engine/player.ts#L1-L230)
- [playerShell.ts:1-202](file://src/renderer/src/lib/playerShell.ts#L1-L202)

## Core Components

### Transport System
The transport system provides precise timing control with BPM management and playhead state tracking. It operates independently of the audio clock to maintain clean separation of concerns while ensuring synchronization through the Player's currentTick property.

**Key Features:**
- Pure state machine with stopped/playing/paused states
- BPM control with dynamic tempo changes
- Tick-to-time conversion for absolute scheduling
- No internal timers - relies on scheduler for timing
- Maintains transport state for UI controls while playhead is driven by audio clock

**Updated** Enhanced synchronization with Player.currentTick for perfect visual-audio alignment

**Section sources**
- [transport.ts:9-79](file://src/renderer/src/engine/transport.ts#L9-L79)

### Lookahead Scheduler
The scheduler implements the Chris Wilson "A Tale of Two Clocks" pattern with configurable timing parameters for optimal performance and improved synchronization with the audio clock.

**Key Features:**
- Configurable interval timing (default 25ms)
- Adjustable lookahead window (default 100ms)
- Self-correcting from audio clock drift
- Absolute time scheduling for sample accuracy
- Live BPM adaptation during playback
- Anchor-based currentTick calculation for paused state preservation

**Updated** Improved anchor-based currentTick calculation that preserves playhead position during pause/resume cycles

**Section sources**
- [scheduler.ts:15-137](file://src/renderer/src/engine/scheduler.ts#L15-L137)

### Audio Engine
The audio engine manages the Web Audio API infrastructure with comprehensive voice and channel management and enhanced sample caching capabilities.

**Key Features:**
- Lazy AudioContext creation for autoplay policy compliance
- Master gain stage with real-time metering
- Channel factory with independent gain/pan control
- Voice registry with lifecycle management
- Enhanced sample caching with LRU eviction policy
- Preview functionality with dedicated temporary routing

**Updated** Enhanced preview functionality with transport-aware scheduling and improved error handling

**Section sources**
- [audio-engine.ts:17-204](file://src/renderer/src/engine/audio-engine.ts#L17-L204)

### Player Orchestration
The Player class coordinates all audio engine components and manages the complete playback lifecycle with improved state management and generation tracking.

**Key Features:**
- Orchestrates transport, scheduler, and audio engine
- Manages playback state transitions with generation tracking
- Handles sample loading and caching with race condition prevention
- Implements monophonic playback with voice management
- Provides preview functionality with transport-aware scheduling
- Prevents stray voice starts after stop/pause/close operations

**Updated** Enhanced with playGeneration tracking to prevent race conditions where async buffer loads resolve after playback ends

**Section sources**
- [player.ts:18-230](file://src/renderer/src/engine/player.ts#L18-L230)

### Audio Processing Pipeline
Complete audio processing chain from sample data to final output with enhanced error handling and preview capabilities.

**Key Features:**
- Sample loading with asynchronous decoding and caching
- Voice creation and management with proper cleanup
- Channel routing with gain/pan control
- Master bus processing with metering
- Real-time audio graph manipulation
- Preview routing with dedicated temporary gain nodes

**Updated** Enhanced preview functionality with transport-aware scheduling and immediate cancellation support

**Section sources**
- [voice.ts:16-75](file://src/renderer/src/engine/voice.ts#L16-L75)
- [channel.ts:6-61](file://src/renderer/src/engine/channel.ts#L6-L61)
- [sample-cache.ts:27-107](file://src/renderer/src/engine/sample-cache.ts#L27-L107)

## Architecture Overview
The enhanced audio engine follows a layered architecture that separates concerns while maintaining tight integration between components. The system uses event-driven communication with clear interfaces between layers and improved synchronization between audio clock and visual playhead.

```mermaid
sequenceDiagram
participant UI as "Tracker Interface"
participant Player as "Player"
participant Transport as "Transport"
participant Scheduler as "Scheduler"
participant Engine as "Audio Engine"
participant Voice as "Voice"
UI->>Player : "User presses Play"
Player->>Transport : "play()"
Transport-->>Player : "state=playing"
Player->>Scheduler : "start(fromTick)"
Scheduler->>Engine : "currentTick()"
Engine-->>Scheduler : "playhead position"
Scheduler->>Player : "onSchedule(tick, when)"
Player->>Player : "triggersForTick(lanes, tick)"
Player->>Engine : "triggerVoice(buffer, channel, when)"
Engine->>Voice : "createAudioBufferSourceNode"
Voice-->>Engine : "voiceStarted"
Engine-->>Player : "voice registered"
Player->>UI : "Update playhead position via Player.currentTick"
```

**Updated** Enhanced synchronization where UI playhead is derived from Player.currentTick rather than transport state, ensuring perfect visual-audio alignment

**Diagram sources**
- [useTransportEngine.ts:235-244](file://src/renderer/src/hooks/useTransportEngine.ts#L235-L244)
- [player.ts:185-194](file://src/renderer/src/engine/player.ts#L185-L194)
- [scheduler.ts:75-87](file://src/renderer/src/engine/scheduler.ts#L75-L87)
- [audio-engine.ts:140-154](file://src/renderer/src/engine/audio-engine.ts#L140-L154)

**Section sources**
- [useTransportEngine.ts:126-166](file://src/renderer/src/hooks/useTransportEngine.ts#L126-L166)
- [player.ts:29-59](file://src/renderer/src/engine/player.ts#L29-L59)
- [scheduler.ts:59-137](file://src/renderer/src/engine/scheduler.ts#L59-L137)

## Detailed Component Analysis

### Transport System Architecture
The transport system provides a pure state machine interface that manages playback state and timing calculations without direct audio involvement, maintaining clean separation while ensuring UI synchronization.

```mermaid
classDiagram
class Transport {
+state : TransportState
+bpm : number
+play() void
+pause() void
+stop() void
+skipBack() void
+setBpm(bpm) void
+tickDurationSeconds() number
+tickToTime(tick, referenceTick, referenceTime) number
+destroy() void
}
class TransportState {
<<enumeration>>
stopped
playing
paused
}
Transport --> TransportState : uses
```

**Updated** Transport state is now primarily used for UI controls while the audio clock drives the actual playhead position

**Diagram sources**
- [transport.ts:9-23](file://src/renderer/src/engine/transport.ts#L9-L23)

**Section sources**
- [transport.ts:33-79](file://src/renderer/src/engine/transport.ts#L33-L79)

### Lookahead Scheduler Implementation
The scheduler implements a sophisticated timing system that bridges JavaScript timer imprecision with Web Audio API precision and maintains improved synchronization with the audio clock.

```mermaid
flowchart TD
Start(["Scheduler Start"]) --> Anchor["Anchor current audio time"]
Anchor --> Interval["Set up interval timer (25ms)"]
Interval --> Loop["Tick loop"]
Loop --> Horizon["Calculate lookahead horizon"]
Horizon --> Check{"Within lookahead?"}
Check --> |Yes| Schedule["Call onSchedule(tick, when)"]
Check --> |No| NextTick["Advance to next tick"]
Schedule --> NextTick
NextTick --> Loop
```

**Updated** Enhanced anchor-based currentTick calculation that preserves playhead position during pause/resume cycles

**Diagram sources**
- [scheduler.ts:75-87](file://src/renderer/src/engine/scheduler.ts#L75-L87)

**Section sources**
- [scheduler.ts:59-137](file://src/renderer/src/engine/scheduler.ts#L59-L137)

### Audio Engine Architecture
The audio engine manages the complete Web Audio API infrastructure with comprehensive voice and channel management and enhanced preview capabilities.

```mermaid
classDiagram
class AudioEngine {
-context : AudioContext
-masterGain : GainNode
-analyser : AnalyserNode
-activeVoices : Set~Voice~
+ensureContext() AudioContext
+createChannel() Channel
+triggerVoice(params) Voice
+previewBuffer(buffer, when, onEnded) Voice
+setMasterGain(value) void
+getMasterLevelDb() number
+stopAllVoices() void
+close() Promise~void~
}
class Channel {
+index : number
+input : AudioNode
+output : AudioNode
+gain : number
+pan : number
+setGain(value) void
+setPan(value) void
+disconnect() void
}
class Voice {
+id : number
+trackIndex : number
+state : VoiceLifecycle
+stop(when) void
}
AudioEngine --> Channel : creates
AudioEngine --> Voice : manages
```

**Updated** Enhanced preview functionality with dedicated temporary routing and improved error handling

**Diagram sources**
- [audio-engine.ts:37-103](file://src/renderer/src/engine/audio-engine.ts#L37-L103)
- [channel.ts:23-60](file://src/renderer/src/engine/channel.ts#L23-L60)
- [voice.ts:32-75](file://src/renderer/src/engine/voice.ts#L32-L75)

**Section sources**
- [audio-engine.ts:37-204](file://src/renderer/src/engine/audio-engine.ts#L37-L204)

### Player Orchestration Layer
The Player class serves as the central coordinator for all audio engine components, managing the complete playback lifecycle with enhanced state management and generation tracking.

```mermaid
graph TB
subgraph "Player Orchestration"
A["Player Class"]
B["AudioEngine Instance"]
C["Scheduler Instance"]
D["Channel Registry"]
E["Lane Voice Registry"]
F["Play Generation Tracking"]
end
subgraph "Playback Flow"
G["start(fromTick)"]
H["pause()"]
I["stop()"]
J["close()"]
K["previewSample()"]
end
A --> B
A --> C
A --> D
A --> E
A --> F
G --> C
G --> B
H --> C
H --> B
I --> C
I --> B
J --> C
J --> B
K --> B
```

**Updated** Enhanced with playGeneration tracking to prevent race conditions where async buffer loads resolve after playback ends

**Diagram sources**
- [player.ts:29-59](file://src/renderer/src/engine/player.ts#L29-L59)

**Section sources**
- [player.ts:29-230](file://src/renderer/src/engine/player.ts#L29-L230)

### Sample Processing Pipeline
Complete pipeline for sample loading, caching, and playback preparation with enhanced error handling and preview capabilities.

```mermaid
flowchart TD
Start(["Sample Request"]) --> CacheCheck{"Check cache"}
CacheCheck --> |Hit| ReturnCache["Return cached buffer"]
CacheCheck --> |Miss| LoadBytes["Load sample bytes"]
LoadBytes --> Decode{"Decode audio data"}
Decode --> |Success| CacheStore["Store in cache"]
Decode --> |Failure| Error["Throw SampleDecodeError"]
CacheStore --> ReturnBuffer["Return AudioBuffer"]
ReturnCache --> ReturnBuffer
Error --> HandleError["Handle decode failure"]
HandleError --> ReturnNull["Return null"]
```

**Updated** Enhanced error handling with proper cleanup and race condition prevention

**Diagram sources**
- [sample-cache.ts:61-86](file://src/renderer/src/engine/sample-cache.ts#L61-L86)

**Section sources**
- [sample-cache.ts:27-107](file://src/renderer/src/engine/sample-cache.ts#L27-L107)

### Lane Evaluation and Trigger Management
System for determining which clips should trigger at specific ticks, respecting mute/solo states and monophonic rules with enhanced dimming policy for visual feedback.

```mermaid
flowchart TD
Input(["EngineLanes & tick"]) --> SoloCheck{"Any lane soloed?"}
SoloCheck --> |Yes| AudibleSolo["Only solo lanes audible"]
SoloCheck --> |No| AudibleMuted["Only non-muted lanes audible"]
AudibleSolo --> ClipCheck["Check clips in audible lanes"]
AudibleMuted --> ClipCheck
ClipCheck --> StartTick{"Clip start == tick?"}
StartTick --> |Yes| AddTrigger["Add to triggers"]
StartTick --> |No| NextClip["Check next clip"]
AddTrigger --> NextClip
NextClip --> MoreClips{"More clips?"}
MoreClips --> |Yes| ClipCheck
MoreClips --> |No| ReturnTriggers["Return triggers array"]
```

**Updated** Enhanced with sophisticated dimming policy that separates visual feedback from audio audibility rules

**Diagram sources**
- [lane-evaluation.ts:53-72](file://src/renderer/src/engine/lane-evaluation.ts#L53-L72)

**Section sources**
- [lane-evaluation.ts:16-73](file://src/renderer/src/engine/lane-evaluation.ts#L16-L73)

### Enhanced Dimming Policy
The player shell implements a sophisticated dimming policy that provides visual feedback while maintaining audio flexibility for edge cases.

```mermaid
flowchart TD
Input(["LaneState & anySoloed"]) --> MuteCheck{"Lane muted?"}
MuteCheck --> |Yes| Dim["Dim lane (visual only)"]
MuteCheck --> |No| SoloCheck{"Any lane soloed?"}
SoloCheck --> |Yes| SoloCheck2{"Lane soloed?"}
SoloCheck --> |No| NoDim["No dimming"]
SoloCheck2 --> |Yes| NoDim
SoloCheck2 --> |No| Dim
```

**Updated** Visual dimming policy differs from audio audibility rules to provide clear visual feedback even when audio behavior is more nuanced

**Diagram sources**
- [playerShell.ts:141-149](file://src/renderer/src/lib/playerShell.ts#L141-L149)

**Section sources**
- [playerShell.ts:136-149](file://src/renderer/src/lib/playerShell.ts#L136-L149)

## Timeline Panel Enhancements

### Beat and Bar Grid Alignment
The timeline panel system has been significantly enhanced with comprehensive beat and bar grid alignment, providing precise visual synchronization between the audio engine and the tracker interface.

**Key Features:**
- Beat grid rendering with 1/8th note resolution (TICKS_PER_BEAT = 8)
- Bar grid rendering with 4/4 time signature alignment
- One tick per beat in ruler for perfect header-line alignment
- Enhanced visual grid with transparent beat lines and opaque bar lines
- CSS variable integration for consistent theming across components

**Updated** New comprehensive grid system with beat/bar alignment and improved visual hierarchy

**Section sources**
- [LaneClipCanvas.tsx:105-129](file://src/renderer/src/components/LaneClipCanvas.tsx#L105-L129)
- [TrackerView.tsx:364-371](file://src/renderer/src/components/TrackerView.tsx#L364-L371)

### CSS Variable Integration and Utility Functions
The timeline panels now utilize CSS variable integration for consistent theming and improved maintainability.

**Key Features:**
- getComputedColor utility function for CSS property fallback resolution
- getComputedAccent function for accent color retrieval
- CSS variable-based styling for borders, backgrounds, and accents
- Dynamic color resolution based on current theme variables

**Updated** New utility functions for CSS property resolution and enhanced theming support

**Section sources**
- [LaneClipCanvas.tsx:37-44](file://src/renderer/src/components/LaneClipCanvas.tsx#L37-L44)
- [LaneClipCanvas.tsx:102-103](file://src/renderer/src/components/LaneClipCanvas.tsx#L102-L103)
- [LaneClipCanvas.tsx:133](file://src/renderer/src/components/LaneClipCanvas.tsx#L133)

### Enhanced Ruler Rendering
The ruler component has been improved with better tick mark placement and bar numbering system.

**Key Features:**
- One tick per beat for perfect grid alignment
- Bar numbers displayed every 4 bars (1, 5, 9, 13...)
- Consistent spacing between lane head and ruler spacer
- Enhanced visual hierarchy with transparent beat lines and opaque bar lines

**Updated** Improved ruler rendering with precise beat/bar alignment and enhanced visual feedback

**Section sources**
- [TrackerView.tsx:364-371](file://src/renderer/src/components/TrackerView.tsx#L364-L371)
- [index.css:493-511](file://src/renderer/src/index.css#L493-L511)

## Library Data Performance Improvements

### Paginated Loading System
The useLibraryData hook has been significantly optimized with a paginated loading system that replaces single-page database queries and improves performance for large sample libraries.

**Key Features:**
- Page size of 500 items per request (DB_SAMPLE_PAGE_SIZE = 500)
- Sequential loading with offset-based pagination
- Query sequence tracking to prevent race conditions
- Efficient memory usage with progressive loading
- Improved responsiveness for large datasets

**Updated** New paginated loading system with 500-item page size replacing single-page queries

**Section sources**
- [useLibraryData.ts:71](file://src/renderer/src/hooks/useLibraryData.ts#L71)
- [useLibraryData.ts:178-217](file://src/renderer/src/hooks/useLibraryData.ts#L178-L217)

### Database Query Optimization
The database query system has been enhanced to handle large datasets efficiently while maintaining responsive user experience.

**Key Features:**
- Offset-based pagination with configurable page size
- Sequential query execution to prevent overwhelming the database
- Query cancellation through sequence tracking
- Progressive data loading with incremental updates
- Error handling with graceful degradation

**Updated** Optimized database queries with pagination replacing single-page scans

**Section sources**
- [useLibraryData.ts:186-202](file://src/renderer/src/hooks/useLibraryData.ts#L186-L202)
- [library.ts:281-293](file://src/main/library.ts#L281-L293)

### Legacy Fallback System
The system maintains backward compatibility with legacy folder scanning while optimizing for modern database-backed queries.

**Key Features:**
- Automatic detection of database indexing status
- Seamless transition between legacy and database queries
- Fallback mechanism for unindexed databases
- Progressive migration from folder scanning to database queries
- Maintained functionality during scan completion

**Updated** Enhanced fallback system with automatic database detection and seamless migration

**Section sources**
- [useLibraryData.ts:126-145](file://src/renderer/src/hooks/useLibraryData.ts#L126-L145)
- [useLibraryData.ts:220-229](file://src/renderer/src/hooks/useLibraryData.ts#L220-L229)

## Dependency Analysis
The audio engine components have well-defined dependencies that maintain loose coupling while enabling tight coordination and improved synchronization.

```mermaid
graph LR
Transport["transport.ts"] --> Scheduler["scheduler.ts"]
Scheduler --> AudioEngine["audio-engine.ts"]
AudioEngine --> Channel["channel.ts"]
AudioEngine --> Voice["voice.ts"]
AudioEngine --> SampleCache["sample-cache.ts"]
Player["player.ts"] --> Transport
Player --> Scheduler
Player --> AudioEngine
Player --> LaneEvaluation["lane-evaluation.ts"]
PlayerShell["playerShell.ts"] --> LaneEvaluation
PlayerShell --> Transport
UI["useTransportEngine.ts"] --> Player
UI --> PlayerShell
UI --> Transport
Timeline["LaneClipCanvas.tsx"] --> Transport
Timeline --> CSS["CSS Variables"]
Library["useLibraryData.ts"] --> Database["library.ts"]
```

**Updated** Enhanced dependency flow with timeline panel integration and library data performance improvements

**Diagram sources**
- [transport.ts:13](file://src/renderer/src/engine/transport.ts#L13)
- [scheduler.ts:13](file://src/renderer/src/engine/scheduler.ts#L13)
- [audio-engine.ts:9-11](file://src/renderer/src/engine/audio-engine.ts#L9-L11)
- [player.ts:9-13](file://src/renderer/src/engine/player.ts#L9-L13)
- [useTransportEngine.ts:18-19](file://src/renderer/src/hooks/useTransportEngine.ts#L18-L19)
- [LaneClipCanvas.tsx:37-44](file://src/renderer/src/components/LaneClipCanvas.tsx#L37-L44)
- [useLibraryData.ts:71](file://src/renderer/src/hooks/useLibraryData.ts#L71)

**Section sources**
- [transport.ts:1-79](file://src/renderer/src/engine/transport.ts#L1-L79)
- [scheduler.ts:1-137](file://src/renderer/src/engine/scheduler.ts#L1-L137)
- [audio-engine.ts:1-204](file://src/renderer/src/engine/audio-engine.ts#L1-L204)
- [player.ts:1-230](file://src/renderer/src/engine/player.ts#L1-L230)
- [playerShell.ts:1-202](file://src/renderer/src/lib/playerShell.ts#L1-L202)
- [useTransportEngine.ts:1-315](file://src/renderer/src/hooks/useTransportEngine.ts#L1-L315)
- [LaneClipCanvas.tsx:1-265](file://src/renderer/src/components/LaneClipCanvas.tsx#L1-L265)
- [useLibraryData.ts:1-427](file://src/renderer/src/hooks/useLibraryData.ts#L1-L427)

## Performance Considerations

### Timing Precision and Latency Optimization
The lookahead scheduler provides sample-accurate timing by bridging JavaScript timer imprecision with Web Audio API precision. The system uses absolute time scheduling to eliminate cumulative timing errors and enhanced synchronization between audio clock and visual playhead.

**Key Performance Features:**
- 25ms interval timing with 100ms lookahead window
- Self-correcting mechanism that catches up from audio clock drift
- Absolute AudioContext time scheduling prevents timer jitter accumulation
- Configurable timing parameters optimize for different use cases
- Enhanced anchor-based currentTick calculation preserves playhead position during pause/resume

### Memory Management and Sample Caching
The sample cache implements an LRU eviction policy to prevent unbounded memory growth while maintaining frequently accessed samples in memory with enhanced error handling.

**Memory Optimization Features:**
- Configurable maximum cache entries (default 64)
- Deduplicated in-flight decode requests prevent race conditions
- Automatic eviction of least-recently-used samples
- Efficient buffer reuse reduces garbage collection pressure
- Enhanced error handling with proper cleanup

### Audio Thread Safety and Real-time Processing
The engine maintains strict separation between UI and audio threads, with all Web Audio API operations occurring on the audio thread and improved state management.

**Real-time Processing Features:**
- All AudioBufferSourceNode operations on audio thread
- Voice lifecycle managed through proper event handling
- Channel connections established once and reused
- Master metering performed asynchronously to avoid blocking
- Enhanced generation tracking prevents race conditions

### UI Integration and Render Performance
The tracker interface efficiently updates the playhead position and visual feedback without impacting audio performance through improved synchronization mechanisms.

**UI Performance Features:**
- Visual playhead derived from Player.currentTick, not separate timer
- Minimal state updates during playback
- Efficient lane rendering with optimized clip positioning
- Master level meter updates at reduced frequency
- Enhanced dimming policy provides clear visual feedback

### Timeline Panel Performance
The enhanced timeline panels utilize efficient rendering techniques with CSS variable integration and optimized grid calculations.

**Timeline Performance Features:**
- Efficient canvas rendering with device pixel ratio scaling
- Optimized grid drawing with skip logic for bar positions
- CSS variable-based color resolution avoiding DOM queries
- Efficient hit-testing with precomputed rectangles
- Responsive layout with ResizeObserver integration

### Library Data Performance
The paginated library data system optimizes performance for large sample collections through intelligent loading strategies.

**Library Performance Features:**
- 500-item page size balancing memory usage and network efficiency
- Sequential loading preventing database overload
- Query cancellation preventing stale data processing
- Progressive loading improving perceived performance
- Efficient error handling with graceful fallback

## Troubleshooting Guide

### Common Issues and Solutions

**Transport Not Advancing**
- Verify transport state transitions: stopped → playing → paused → stopped
- Check that scheduler is running and receiving tick events
- Ensure BPM is set to positive value (> 0)
- Confirm that transport.play() is called and scheduler.start() is executed
- Verify that Player.currentTick is being used for UI updates rather than transport state

**Audio Dropouts or Glitches**
- Verify lookahead window is sufficient (≥ 50ms for typical use cases)
- Check that scheduler interval is appropriate (20-30ms recommended)
- Monitor active voice count - excessive voices can cause buffer underruns
- Ensure sample cache has adequate decoded buffers loaded
- Check for race conditions in async buffer loading

**Timing Drift or Desynchronization**
- Confirm that visual playhead is derived from Player.currentTick, not transport state
- Verify that all scheduling uses absolute AudioContext time
- Check that scheduler anchors are properly maintained during pause/resume
- Ensure transport state changes don't interfere with scheduler timing
- Verify that playGeneration tracking prevents stray voice starts

**Sample Loading Failures**
- Verify sample file integrity and format compatibility
- Check that sample cache is properly configured with sufficient capacity
- Confirm that decode errors are handled gracefully without crashing engine
- Ensure file permissions allow sample access through IPC
- Check for race conditions where async loads resolve after stop/pause

**Timeline Grid Misalignment**
- Verify beat and bar calculations match TICKS_PER_BEAT constant
- Check CSS variable resolution for border and accent colors
- Ensure canvas rendering accounts for device pixel ratio
- Confirm grid line positions use Math.round with 0.5 pixel offset
- Validate that bar lines are drawn separately from beat lines

**Library Data Loading Issues**
- Verify database indexing status before attempting paginated queries
- Check query sequence tracking prevents race conditions
- Monitor page size configuration for optimal performance
- Ensure error handling provides meaningful user feedback
- Validate that fallback to legacy scanning works correctly

**Updated** Enhanced troubleshooting guidance for new timeline panel features and library data performance improvements

**Section sources**
- [transport.ts:46-66](file://src/renderer/src/engine/transport.ts#L46-L66)
- [scheduler.ts:75-87](file://src/renderer/src/engine/scheduler.ts#L75-L87)
- [sample-cache.ts:77-82](file://src/renderer/src/engine/sample-cache.ts#L77-L82)
- [LaneClipCanvas.tsx:105-129](file://src/renderer/src/components/LaneClipCanvas.tsx#L105-L129)
- [useLibraryData.ts:178-217](file://src/renderer/src/hooks/useLibraryData.ts#L178-L217)

## Conclusion
MixJam Electron's enhanced audio engine provides a comprehensive, production-ready solution for tracker-style audio playback with significant improvements in synchronization, state management, user experience, and performance optimization. The layered architecture ensures clean separation of concerns while maintaining tight integration between timing, scheduling, and audio processing components. The lookahead scheduler pattern delivers sample-accurate timing with minimal latency, while the orchestration layer manages complex playback scenarios including monophonic behavior, preview functionality, and real-time parameter changes. The enhanced player implementation prevents race conditions and stray voice starts, while the improved transport synchronization ensures perfect visual-audio alignment. The sophisticated dimming policy provides clear visual feedback while maintaining flexible audio behavior. The new timeline panel system offers precise beat and bar grid alignment with CSS variable integration, and the library data system provides optimized performance through paginated loading. The system's modular design enables future enhancements while maintaining stability and performance for the core tracker playback experience.

## Appendices

### Transport State Machine
```mermaid
stateDiagram-v2
[*] --> Stopped
Stopped --> Playing : "play()"
Playing --> Paused : "pause()"
Paused --> Playing : "play()"
Playing --> Stopped : "stop()"
Stopped --> Stopped : "stop()"
Paused --> Stopped : "stop()"
```

**Updated** Transport state is now primarily used for UI controls while audio clock drives actual playhead position

**Diagram sources**
- [transport.ts:46-58](file://src/renderer/src/engine/transport.ts#L46-L58)

### Playback Lifecycle Management
```mermaid
sequenceDiagram
participant User as "User Action"
participant Player as "Player"
participant Scheduler as "Scheduler"
participant Engine as "AudioEngine"
User->>Player : "start(fromTick)"
Player->>Engine : "resume()"
Engine-->>Player : "AudioContext ready"
Player->>Scheduler : "start(fromTick)"
Scheduler-->>Player : "running=true"
loop While playing
Scheduler->>Player : "onSchedule(tick, when)"
Player->>Player : "handleScheduledTick()"
Player->>Engine : "triggerVoice()"
Engine-->>Player : "voice created"
end
User->>Player : "pause()"
Player->>Scheduler : "stop()"
Scheduler-->>Player : "running=false"
Player->>Player : "clear lane voices"
User->>Player : "stop()"
Player->>Scheduler : "reset(0)"
Player->>Engine : "stopAllVoices()"
Player->>Player : "clear lane voices"
Player->>Player : "reset lastScheduledTick"
```

**Updated** Enhanced with generation tracking and improved state cleanup during pause/stop operations

**Diagram sources**
- [player.ts:145-174](file://src/renderer/src/engine/player.ts#L145-L174)
- [scheduler.ts:94-116](file://src/renderer/src/engine/scheduler.ts#L94-L116)

### Timeline Visualization and Playback Coordination
The tracker interface maintains perfect synchronization between visual playhead and audio output through the Player's currentTick property, which is derived from the audio clock rather than a separate timer. This ensures that the visual playhead never drifts from the audible output, providing a consistent user experience. The enhanced timeline panels provide precise beat and bar grid alignment with CSS variable integration for consistent theming.

**Updated** Enhanced synchronization through Player.currentTick integration and improved anchor-based calculations with new timeline panel features

**Section sources**
- [useTransportEngine.ts:149-154](file://src/renderer/src/hooks/useTransportEngine.ts#L149-L154)
- [player.ts:67-69](file://src/renderer/src/engine/player.ts#L67-L69)
- [TrackerView.tsx:115-122](file://src/renderer/src/components/TrackerView.tsx#L115-L122)
- [LaneClipCanvas.tsx:105-129](file://src/renderer/src/components/LaneClipCanvas.tsx#L105-L129)

### Enhanced Dimming Policy Implementation
The player shell implements a sophisticated dimming policy that provides clear visual feedback while maintaining audio flexibility. The policy separates visual dimming from audio audibility rules, ensuring that users receive appropriate visual cues even in complex mute/solo scenarios.

**Updated** New dimming policy that differs from audio audibility rules for better user experience

**Section sources**
- [playerShell.ts:141-149](file://src/renderer/src/lib/playerShell.ts#L141-L149)
- [lane-evaluation.ts:43-48](file://src/renderer/src/engine/lane-evaluation.ts#L43-L48)

### Enhanced Error Handling and Voice Lifecycle Management
The Player class implements robust error handling and voice lifecycle management to prevent race conditions and ensure proper cleanup during playback operations.

**Key Features:**
- Play generation tracking prevents stray voice starts after stop/pause/close
- Enhanced sample loading with proper error recovery and cleanup
- Robust voice lifecycle management with double-processing guards
- Immediate cancellation support for preview functionality
- Proper resource cleanup during engine shutdown

**Updated** Comprehensive error handling improvements with enhanced race condition prevention

**Section sources**
- [player.ts:38-40](file://src/renderer/src/engine/player.ts#L38-L40)
- [player.ts:202-214](file://src/renderer/src/engine/player.ts#L202-L214)
- [voice.ts:52-60](file://src/renderer/src/engine/voice.ts#L52-L60)
- [player.test.ts:107-140](file://src/renderer/src/engine/player.test.ts#L107-L140)

### Timeline Panel System Architecture
The enhanced timeline panel system provides precise visual synchronization between audio timing and visual representation through beat/bar grid alignment and CSS variable integration.

**Key Features:**
- Beat grid rendering with 1/8th note resolution
- Bar grid rendering with 4/4 time signature
- One tick per beat in ruler for perfect alignment
- Transparent beat lines with opaque bar lines
- CSS variable-based color resolution
- Device pixel ratio aware canvas rendering

**Updated** New timeline panel system with comprehensive grid alignment and enhanced visual feedback

**Diagram sources**
- [LaneClipCanvas.tsx:105-129](file://src/renderer/src/components/LaneClipCanvas.tsx#L105-L129)
- [TrackerView.tsx:364-371](file://src/renderer/src/components/TrackerView.tsx#L364-L371)

**Section sources**
- [LaneClipCanvas.tsx:37-44](file://src/renderer/src/components/LaneClipCanvas.tsx#L37-L44)
- [LaneClipCanvas.tsx:101-129](file://src/renderer/src/components/LaneClipCanvas.tsx#L101-L129)
- [TrackerView.tsx:364-371](file://src/renderer/src/components/TrackerView.tsx#L364-L371)

### Library Data Performance Architecture
The paginated library data system optimizes performance for large sample collections through intelligent loading strategies and efficient memory management.

**Key Features:**
- 500-item page size for optimal performance
- Sequential loading with offset-based pagination
- Query sequence tracking for race condition prevention
- Progressive data loading with incremental updates
- Graceful fallback to legacy scanning

**Updated** New paginated loading system with performance optimizations and improved user experience

**Diagram sources**
- [useLibraryData.ts:71](file://src/renderer/src/hooks/useLibraryData.ts#L71)
- [useLibraryData.ts:178-217](file://src/renderer/src/hooks/useLibraryData.ts#L178-L217)

**Section sources**
- [useLibraryData.ts:71](file://src/renderer/src/hooks/useLibraryData.ts#L71)
- [useLibraryData.ts:178-217](file://src/renderer/src/hooks/useLibraryData.ts#L178-L217)
- [library.ts:281-293](file://src/main/library.ts#L281-L293)