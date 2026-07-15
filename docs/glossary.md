# Glossary

## Quick index

- [App state](#app-state)
- [Bottom Workspace](#bottom-workspace)
- [Channel](#channel)
- [Clip](#clip)
- [Clip bubble](#clip-bubble)
- [Clip placement](#clip-placement)
- [Lane](#lane)
- [Library](#library)
- [Middle Strip](#middle-strip)
- [MixJam](#mixjam)
- [MixJam Browser](#mixjam-browser)
- [Player](#player)
- [Project](#project)
- [Recent Projects rail](#recent-projects-rail)
- [Sample](#sample)
- [Sample Browser](#sample-browser)
- [Sample bubble](#sample-bubble)
- [Sample Folder](#sample-folder)
- [Session](#session)
- [Song](#song)
- [Song Progress Bar](#song-progress-bar)
- [Track](#track)
- [Tracker](#tracker)
- [Transport](#transport)
- [Transport Ribbon](#transport-ribbon)
- [User Folder](#user-folder)

## App state

Host-local context outside the current project: selected folders, persisted
directory handles, permissions, settings, current view, caches, and transient
runtime flags. App state is not a [session](#session) and is not stored in the
`.mixjam` project format.

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
[lane](#lane), including its start tick and playback duration. The Tracker
renders the referenced sample as a [sample bubble](#sample-bubble); placement
duration does not create a differently sized kind of bubble.

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

## Middle Strip

The complete full-width composite band in the [Player](#player). It includes
the project name, [Transport Ribbon](#transport-ribbon), sample
search, Re-scan, and Help. It is not a synonym for the Transport Ribbon. See
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

## Player

The complete active song view: Tracker, Sample Browser, MixJam Browser, Middle
Strip, Transport Ribbon, mixer, Song Controls, and the other active-project
regions. *Player* does not mean only the audio engine, a preview widget, or the
Tracker. See [spec 001](specs/spec-001-app-shell-navigation.md) and
[spec 006](specs/spec-006-player-timeline-panels.md).

## Project

An exact synonym for [song](#song): the loaded or newly created document that
the app edits and that the `.mixjam` format represents. *Project* is common in
technical persistence and implementation discussions.

## Recent Projects rail

Use [MixJam Browser](#mixjam-browser). The legacy name incorrectly suggests
that the region is limited to a recency list rather than `.mixjam` browsing.

## Sample

One indexed local audio-file source from the active [Sample Folder](#sample-folder),
identified by its folder root and relative path. A sample is source data, not
its arrangement placement and not its visual representation.

## Sample Browser

The [Player](#player) region for searching, filtering, previewing, and selecting
indexed samples. It browses samples from the active Sample Folder; it does not
browse `.mixjam` files or define saved [libraries](#library).

## Sample bubble

The visual snapshot of a sample or WAV file, regardless of context. Every
sample bubble is 32px high. In a project, its width represents the sample's
placement-owned musical duration in ticks at the Player's shared
pixels-per-tick scale, with a 12px minimum. Project BPM changes never move or
resize placed bubbles: they change how quickly the source audio is rendered
inside that stable musical span. The Sample Browser reuses the same stored span
for an already-placed sample, so the same sample remains perfectly
identical everywhere in the UI. Placement duration and UI context never create
a different geometry. Drag-image canvases may add transparent padding for
shadows, pointer offset, or a group badge, but the sample-bubble rectangle
inside them keeps the shared dimensions.

## Sample Folder

The user-selected, read-only physical input root containing audio files. The
app indexes and reads it but never writes projects or exports into it. It is
not a [library](#library) or the [Sample Browser](#sample-browser). See
[spec 003](specs/spec-003-folder-app-state-management.md).

## Session

The current unsaved state of a [project](#project). It covers both a new
project with no backing `.mixjam` file and unsaved modifications made after a
`.mixjam` file was loaded or saved. Folder selections, permissions, and host
settings are [app state](#app-state), not session data.

## Song

An exact synonym for [project](#project): the loaded or newly created document
currently being edited in the Player. It is represented on disk by the
`.mixjam` format. Its scrollable arrangement capacity is 999 bars, but its
length is the exact latest placement-end tick across all lanes. Internal silence
does not end a song while any later placement remains. Empty capacity is not
serialized into the project file.

## Song Progress Bar

The always-rendered, skinnable horizontal control below the [Tracker](#tracker)
lanes. It shows and changes which part of the 999-bar arrangement capacity is
visible without seeking the playhead or changing transport state. Its thumb
represents the visible fraction of that capacity and follows the Tracker's
horizontal scroll position. The control remains visible but disabled when the
entire arrangement capacity fits in the Tracker viewport.

Use *Song Progress Bar*, not *horizontal scrollbar*, *timeline slider*, or
*transport progress bar*, for this Player control.

## Track

Use [lane](#lane). *Track* has no MixJam domain role and must not be used as a
synonym for lane or mixer channel.

## Tracker

The playlist or arrangement region inside the [Player](#player). It contains
the timeline, ruler, playhead, lanes, and clip placements onto which samples
are dropped. It is not the whole active Player view.

## Transport

The playback state and control subsystem: play, pause, stop, seek, BPM timing,
and playhead progression. It is distinct from the visual
[Transport Ribbon](#transport-ribbon) that exposes its controls.

## Transport Ribbon

The subregion of the [Middle Strip](#middle-strip) that contains transport
controls and nothing else. The project name, sample search, Re-scan,
and Help belong to the Middle Strip but are outside the Transport Ribbon.

## User Folder

The user-selected, read-write physical output root. The app writes `.mixjam`
files, exports, and app configuration into it. It is distinct from the
read-only [Sample Folder](#sample-folder). See
[spec 003](specs/spec-003-folder-app-state-management.md).
