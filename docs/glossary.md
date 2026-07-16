# Glossary

## Quick index

- [App state](#app-state)
- [Arrangement](#arrangement)
- [Arrangement capacity](#arrangement-capacity)
- [Bottom Workspace](#bottom-workspace)
- [Category](#category)
- [Channel](#channel)
- [Clip](#clip)
- [Clip bubble](#clip-bubble)
- [Clip placement](#clip-placement)
- [Effect chain](#effect-chain)
- [External project](#external-project)
- [FolderRef](#folderref)
- [FX](#fx)
- [FX chain](#fx-chain)
- [Lane](#lane)
- [Library](#library)
- [Library sync](#library-sync)
- [Middle Strip](#middle-strip)
- [MixJam](#mixjam)
- [MixJam Browser](#mixjam-browser)
- [Musical span](#musical-span)
- [Native BPM](#native-bpm)
- [Player](#player)
- [Project](#project)
- [Project BPM](#project-bpm)
- [Read-only import](#read-only-import)
- [Recent Projects rail](#recent-projects-rail)
- [Sample](#sample)
- [Sample Browser](#sample-browser)
- [Sample bubble](#sample-bubble)
- [Sample Folder](#sample-folder)
- [Sample reference](#sample-reference)
- [Sample type](#sample-type)
- [Session](#session)
- [Skin](#skin)
- [Song](#song)
- [Song Controls](#song-controls)
- [Song end](#song-end)
- [Song length](#song-length)
- [Song panel](#song-panel)
- [Song Progress Bar](#song-progress-bar)
- [Source duration](#source-duration)
- [Subcategory](#subcategory)
- [Tag](#tag)
- [Theme](#theme)
- [Track](#track)
- [Tracker](#tracker)
- [Transport](#transport)
- [Transport Ribbon](#transport-ribbon)
- [User Folder](#user-folder)
- [Voice](#voice)

## App state

Host-local context outside the current project: selected folders, persisted
directory handles, permissions, settings, current view, caches, and transient
runtime flags. App state is not a [session](#session) and is not stored in the
`.mixjam` project format.

## Arrangement

The project-owned timeline content: [lanes](#lane) and their
[clip placements](#clip-placement). The [Tracker](#tracker) is the visual
surface used to edit the arrangement. An arrangement is part of a
[song](#song), which also owns Song settings, Mixer state, routing, and FX.

## Arrangement capacity

The fixed addressable range of the arrangement: 999 bars in 4/4, or 31,968
ticks at 8 ticks per beat. Capacity limits placement and navigation but is not
[song end](#song-end) or song length. Empty capacity is not serialized into a
`.mixjam` file. See [spec 005](specs/spec-005-audio-playback-engine.md) and
[spec 006](specs/spec-006-player-timeline-panels.md).

## Category

A node in the hierarchical organizational tree used to browse and filter
[samples](#sample). Categories may be derived from Sample Folder directories or
created by the user. A sample has one primary category and may have additional
[subcategory](#subcategory) assignments. Categories are distinct from flat
[tags](#tag) and from acoustic [sample type](#sample-type) metadata.

## Channel

Exclusively a mixer signal-processing and routing path. A channel owns mixer
state such as gain, pan, mute, solo, metering, and effects. It is distinct from
a [lane](#lane), even when the current default routing is lane N to channel N.

Do not use *channel* for a lane, an audio file's channel count, an active voice,
or a generic engine route when discussing MixJam product concepts. See
[spec 007](specs/spec-007-mixer.md).

## Clip

Use [clip placement](#clip-placement). *Clip* alone is too easy to mistake for
a second visual object or for the source audio file.

## Clip bubble

Use [sample bubble](#sample-bubble). *Clip bubble* is a legacy term and does
not name a separate or variable-width visual representation.

## Clip placement

The nonvisual arrangement record that places a [sample](#sample) on a
[lane](#lane), including its start tick and [musical span](#musical-span). The
Tracker renders the referenced sample as a [sample bubble](#sample-bubble);
placement data does not create a second kind of visual object.

## Effect chain

Use [FX chain](#fx-chain). The two terms name the same ordered processor chain;
*FX chain* is preferred in compact product and persistence language.

## External project

Use [read-only import](#read-only-import) for a project opened from outside the
[User Folder](#user-folder). *External project* may describe its origin, but it
does not imply a second project format.

## FolderRef

An opaque application identifier that keys a persisted directory handle. A
`FolderRef` is not an absolute path, URL, or directory name. File access always
resolves a relative path through the referenced handle. See
[architecture.md](architecture.md) and
[spec 003](specs/spec-003-folder-app-state-management.md).

## FX

The per-[channel](#channel) insert-effects workflow and its peer panel in the
[Bottom Workspace](#bottom-workspace). An *FX sample* instead means a source
audio file whose [sample type](#sample-type) is an effect sound; it remains a
[sample](#sample), not a signal processor.

## FX chain

The ordered list of insert-effect slots owned by one mixer [channel](#channel).
Signal flows through the slots in order, and the complete chain is project-owned
state serialized in the `.mixjam` file. See
[spec 010](specs/spec-010-audio-effects.md).

## Lane

A horizontal arrangement row in the [Tracker](#tracker). A lane owns clip
placements and lane-level controls such as mute, solo, and pan.
Lane state is separate from [channel](#channel) state and mixer routing. See
[spec 005](specs/spec-005-audio-playback-engine.md) and
[spec 006](specs/spec-006-player-timeline-panels.md).

## Library

A named saved query over the indexed samples, stored as `rule_json`. A library
is not a folder, copied collection, playlist, or set of duplicated files. See
[data-model.md](data-model.md) and [query-schema.md](query-schema.md).

## Library sync

The automatic incremental reconciliation of the active
[Sample Folder](#sample-folder) with its indexed [samples](#sample). It starts
after an accessible Sample Folder is selected or restored and runs at most once
for that folder during an app session. Existing indexed data remains usable
while sync runs. A manual Re-scan invokes the same pipeline only as a recovery
action for files changed while MixJam is already open. Uniform folder
calibration is an analysis workflow, not a second library sync.

## Middle Strip

The complete full-width composite band in the [Player](#player). It includes
the [Song Progress Bar](#song-progress-bar) as its first row, followed by the
project identity and project menu, edit-history controls,
[Transport Ribbon](#transport-ribbon), sample search, transient
[library sync](#library-sync) status, and a compact utility menu. The utility
menu contains Keyboard Shortcuts and the single low-prominence manual Re-scan
recovery action. The Middle Strip never exposes Uniform Folder Calibration. It
is fixed
between the Tracker and Bottom Workspace, so Bottom Workspace resizing does
not move the progress bar out of this band. It is not a synonym for the
Transport Ribbon. See
[spec 006](specs/spec-006-player-timeline-panels.md).

## Bottom Workspace

The full-width tabbed region below the [Middle Strip](#middle-strip) in the
[Player](#player). Its peer tabs are Song, Mixer, FX, and Samples. Use *Bottom
Workspace* for the shared container; use the individual tab name for the
workflow shown inside it. See [spec 006](specs/spec-006-player-timeline-panels.md).

## MixJam

The `.mixjam` file format. A MixJam file serializes a [song](#song) or
[project](#project); *MixJam* does not name a separate in-memory object nested
inside the project.

## MixJam Browser

The [Player](#player) region that lists and opens `.mixjam` files. It is
distinct from the [Sample Browser](#sample-browser). The older name *Recent
Projects rail* describes the same region too narrowly.

## Musical span

The project-owned duration of a sample expressed in ticks as `durationTicks`.
It determines placed playback boundaries and [sample bubble](#sample-bubble)
width. The first span is derived from [source duration](#source-duration) using
[Native BPM](#native-bpm) when available, or the current
[Project BPM](#project-bpm) otherwise. Later placements with the same
[sample reference](#sample-reference) reuse that span; Project BPM edits never
mutate it. See [spec 009](specs/spec-009-time-stretching.md).

## Native BPM

Tempo metadata associated with a source sample and captured as placement
provenance. Native BPM helps establish the first [musical span](#musical-span)
and controls unplaced preview rate. It may be unknown, late, or manually edited,
so it is not the timing authority after a musical span exists.

## Player

The complete active song view: Tracker, Sample Browser, MixJam Browser, Middle
Strip, Transport Ribbon, mixer, [Song panel](#song-panel), and the other
active-project regions. *Player* does not mean only the audio engine, a preview
widget, or the Tracker. See
[spec 001](specs/spec-001-app-shell-navigation.md) and
[spec 006](specs/spec-006-player-timeline-panels.md).

## Project

An exact synonym for [song](#song): the loaded or newly created document that
the app edits and that the `.mixjam` format represents. *Project* is common in
technical persistence and implementation discussions.

## Project BPM

The tempo owned by the active [project](#project) and its
[Transport](#transport). It maps musical ticks to elapsed seconds and controls
rendered playback rate. Changing Project BPM does not move placements, change
their [musical spans](#musical-span), or resize sample bubbles.

## Read-only import

A [project](#project) opened from outside the [User Folder](#user-folder). The
source file is readable, but the project has no current writable path in the
app. Its first Save uses Save As and must choose a destination inside the User
Folder; after that save, it is an ordinary writable project. See
[spec 011](specs/spec-011-project-save-load.md).

## Recent Projects rail

Use [MixJam Browser](#mixjam-browser). The legacy name incorrectly suggests
that the region is limited to a recency list rather than `.mixjam` browsing.

## Sample

One indexed local audio-file source from the active [Sample Folder](#sample-folder),
identified by its [sample reference](#sample-reference). A sample is source
data, not its arrangement placement and not its visual representation.

## Sample Browser

The [Player](#player) region for searching, filtering, previewing, and selecting
indexed samples. It browses samples from the active Sample Folder; it does not
browse `.mixjam` files or define saved [libraries](#library).

## Sample bubble

The visual snapshot of a sample or WAV file, regardless of context. Every
sample bubble is 24px high. In a project, its width represents the sample's
[musical span](#musical-span) in ticks at the Player's shared pixels-per-tick
scale, with a 12px minimum. [Project BPM](#project-bpm) changes never move or
resize placed bubbles: they change how quickly the source audio is rendered
inside that stable musical span. The Sample Browser reuses the same stored span
for an already-placed sample, so the same sample remains perfectly identical
everywhere in the UI. Placement data and UI context never create a different
geometry. Drag-image canvases may add transparent padding for shadows, pointer
offset, or a group badge, but the sample-bubble rectangle inside them keeps the
shared dimensions.

## Sample Folder

The user-selected, read-only physical input root containing audio files. The
app indexes and reads it but never writes projects or exports into it. It is
not a [library](#library) or the [Sample Browser](#sample-browser). See
[spec 003](specs/spec-003-folder-app-state-management.md).

## Sample reference

The location-independent identity used to resolve a [sample](#sample). In the
runtime index it is the `(root_id, relpath)` pair. In a `.mixjam` placement,
`sampleRef` stores only the path relative to the active Sample Folder root.
Sample references never contain absolute paths or embedded audio bytes.

## Sample type

Acoustic classification metadata such as Kick, Snare, Bass, FX, Vocal, or Loop.
It may come from analysis or a manual override and is labeled *Type* in the UI.
Sample type never assigns or replaces an organizational [category](#category)
or [tag](#tag). See [spec 008](specs/spec-008-sample-analysis.md).

## Session

The current unsaved state of a [project](#project). It covers both a new
project with no backing `.mixjam` file and unsaved modifications made after a
`.mixjam` file was loaded or saved. Folder selections, permissions, and host
settings are [app state](#app-state), not session data.

## Skin

Use [theme](#theme) for a concrete named token set or JSON definition.
*Skinning* describes the app's ability to change its appearance; a skin is not
a second artifact type beside a theme.

## Song

An exact synonym for [project](#project): the loaded or newly created document
currently being edited in the Player. It is represented on disk by the
`.mixjam` format. Its [arrangement capacity](#arrangement-capacity) is distinct
from its exact [song end](#song-end).

## Song Controls

Use [Song panel](#song-panel) for the Bottom Workspace region. *Song Controls*
is the visible heading and implementation shorthand for the controls inside
that panel, not a sibling region or a separate reveal surface.

## Song end

The exact exclusive end tick of the latest [clip placement](#clip-placement)
across all lanes, represented internally as `songEndTick`. An empty song ends
at tick 0. Muting, soloing, missing sample files, and internal silence do not
change it. Song end is derived from placements and is not serialized or rounded
to a beat or bar. It is distinct from [arrangement capacity](#arrangement-capacity).

## Song length

Use [song end](#song-end) when referring to the content-derived end of the
arrangement. Do not use *song length* for the fixed 999-bar arrangement
capacity.

## Song panel

The peer panel selected by the Song tab in the
[Bottom Workspace](#bottom-workspace). It contains Project BPM, Master Volume,
and Output Level controls. Use *Song panel* for the region and
[Song Controls](#song-controls) only for its visible heading or implementation
shorthand.

## Song Progress Bar

The always-rendered, skinnable horizontal control in the first row of the
[Middle Strip](#middle-strip), directly below the [Tracker](#tracker). It is a
direct child of the Middle Strip and remains there when the Bottom Workspace is
resized. It shows and changes which part of the
[arrangement capacity](#arrangement-capacity) is
visible without seeking the playhead or changing transport state. Its thumb
represents the visible fraction of that capacity and follows the Tracker's
horizontal scroll position. The control remains visible but disabled when the
entire arrangement capacity fits in the Tracker viewport.

Use *Song Progress Bar*, not *horizontal scrollbar*, *timeline slider*, or
*transport progress bar*, for this Player control.

## Source duration

The immutable length of a source audio file in seconds. It remains file
metadata and may be shown in sample details or used to calculate playback rate.
Once a [musical span](#musical-span) exists, source duration does not control
placed geometry or scheduled duration by itself.

## Subcategory

A non-root [category](#category) node. Subcategories represent deeper Sample
Folder directory levels or user-created hierarchy, and category filtering may
include all descendants. They are not child tags.

## Tag

A user-defined, optionally colored label assigned many-to-many to
[samples](#sample). Tags are independent of the hierarchical
[category](#category) tree and acoustic [sample type](#sample-type) metadata.

## Theme

A named set of design-token values stored as a JSON definition and applied to
the entire app at runtime. *Theme* is the canonical name for each selectable
appearance; [skinning](#skin) names the capability, not a second artifact type.
See [spec 002](specs/spec-002-theming-skin-system.md).

## Track

Use [lane](#lane). *Track* has no MixJam domain role and must not be used as a
synonym for lane or mixer channel.

## Tracker

The playlist or arrangement region inside the [Player](#player). It contains
the timeline, ruler, playhead, lanes, and clip placements onto which samples
are dropped. It displays the [arrangement](#arrangement) but is not the
arrangement data or the whole active Player view.

## Transport

The playback state and control subsystem: play, pause, stop, seek, BPM timing,
and playhead progression. It is distinct from the visual
[Transport Ribbon](#transport-ribbon) that exposes its controls.

## Transport Ribbon

The subregion of the [Middle Strip](#middle-strip) that contains transport
controls and nothing else: Skip Back, Jump to End, Play/Pause, and Stop.
Project identity, project actions, edit history, sample search, library status,
Re-scan, and Keyboard Shortcuts belong to the Middle Strip but remain outside
the Transport Ribbon.

## User Folder

The user-selected, read-write physical output root. The app writes `.mixjam`
files, exports, and app configuration into it. It is distinct from the
read-only [Sample Folder](#sample-folder). See
[spec 003](specs/spec-003-folder-app-state-management.md).

## Voice

A single triggered sample-playback instance in the audio engine, backed by a
one-shot `AudioBufferSourceNode`. A voice is transient and is not a sample,
lane, mixer channel, or Voice/Vocal [sample type](#sample-type). See
[spec 005](specs/spec-005-audio-playback-engine.md).
