# Spec 007 — Lane-Bound Mixer

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** IMPLEMENTED

**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline & Panel Layout)

**Related:** spec-010 (Return FX Modules), spec-011 (Project Save & Load)

## Objective

Provide one compact Mixer strip for every Tracker lane. Lanes and Mixer strips
are one project-owned system: adding or deleting a lane adds or deletes its
strip, and users cannot add, delete, reorder, or route Mixer strips separately.
The Mixer also hosts four fixed send/return buses and four fixed FX containers.

## User Stories

- **US-001:** I can control each lane's volume, pan, and four FX sends from one
  compact strip.
- **US-002:** I always see the same lane order in the Tracker and Mixer.
- **US-003:** I can add and delete lanes between the hard limits of 1 and 64.
- **US-004:** I can reach every lane strip and all four combined FX and Return
  containers with one horizontal scrollbar.
- **US-005:** I can set the common wet return level for each of the four FX
  buses without changing the Master tab's Master track.

## Lane and Mixer Ownership

### One lane, one strip

- A new project contains eight lanes and therefore eight Mixer strips.
- A project contains between 1 and 64 lanes, inclusive. The project file must
  store every Mixer value inside the corresponding lane record. It has no
  separate channel or Mixer-record array.
- A lane owns its stable identity, name, volume, pan, mute, solo, four send
  levels, and placements. Mixer strip state is not a second object that may
  drift from the lane.
- Mixer strips use lane order. They cannot be added, deleted, reordered, or
  routed independently.
- Mute and Solo controls appear only in the lane header. They are not repeated
  in the Mixer.
- Renaming a lane updates the Mixer label immediately because both surfaces
  display the same lane-owned name.

### Stable identity and visible order

Every lane has a project-owned stable ID that does not change when another lane
is inserted or deleted. Mixer positions are derived from current array order
and remain contiguous from 1 through N. The visible Mixer strip label is exactly
the lane-owned name; the name itself never adds a position, number, or channel
prefix. A separate derived position line beneath the name ("CH 01" through
"CH NN") displays the current strip position; it recompacts on deletion and is
never part of the lane name. Deleting an earlier lane therefore compacts strip
positions without changing a surviving lane's name, stable ID, or saved Mixer
values.

Adding a lane appends it after the final lane. It receives a new stable ID,
the next visible default name, no placements, volume 80%, centered pan, mute
off, solo off, and four sends at 0%.

### Add, delete, and undo

- Add is disabled at 64 lanes.
- Delete is disabled when the project has one lane.
- Deleting an empty lane takes effect immediately.
- Deleting a lane with placements opens a blocking confirmation dialog. The
  dialog identifies the lane and states the exact number of placements that
  will be deleted. Cancel leaves the project unchanged.
- Every lane add and deletion stops playback before changing the project. A
  confirmed deletion removes the lane, placements, lane-owned Mixer state,
  active voices, and future sends for that lane.
- Lane add and lane delete are single, unified arrangement-and-Mixer history
  entries. One Undo restores or removes the whole lane, including its stable
  ID, placements, volume, pan, mute, solo, and sends. Redo repeats the complete
  structural change.

## Mixer Layout

The Mixer uses one continuous horizontal row in this exact order:

```text
Lane strip 1 ... Lane strip N | FX + Return 1  FX + Return 2
                               FX + Return 3  FX + Return 4
```

- Lane strips never wrap. The four fixed FX slots are one 2x2 section at the
  end of the row. Each slot contains its matching Return controls and the
  section has no independent scrolling.
- The Mixer has one horizontal scrollbar for the complete row. The combined
  four-card section scrolls with lane strips.
- The horizontal scrollbar is always visible while the Mixer is active and is
  disabled when the full row fits.
- Horizontal trackpad movement and Shift+wheel scroll the row. Plain vertical
  wheel movement is not captured. Left/Right scroll the focused Mixer canvas.
- The Mixer row has no vertical scrollbar. Its content fits the active tab's
  UI-Size-derived Bottom Workspace minimum at supported 1920x1080 geometry.
  The shared active-panel defensive scrollport is reserved for later content
  growth beyond that documented minimum and is not active in normal Mixer
  operation.
- Keyboard focus scrolls a clipped control into view.
- Geometry uses the 30 px base control size. A lane strip is 76 px wide and
  each combined FX and Return container is 160 px wide. These widths scale
  consistently at UI Size 40 and 50. At a selected UI Size each width is fixed;
  strips do not grow merely to consume spare width.
- Lane-strip and combined FX and Return control rectangles do not collide with
  adjacent controls at UI Size 30, 40, and 50. Rotary artwork remains inside
  its owning control or strip at every size.
- Lane strips render inside a Channels panel and the four containers inside an
  FX bank panel. Each panel has a decorative header (channel count and "4
  Sends"; "4 × FX Slots" and "Active") with a status LED. Both panels share
  the single scrolling row.
- Sends, Returns, and Pan use the same project-owned SVG rotary visual as FX
  parameters. Compact sizing does not replace the range track, value arc,
  inset cap, default marker, or pointer with a separate CSS-only dial.

### Lane strip

Each lane strip contains, from top to bottom:

1. The exact lane-owned name, with no derived prefix inside the name.
2. The derived channel position line ("CH 01").
3. Four rotary sends labelled 1 through 4, each tinted with its matching FX
  slot accent so sends map to FX slots 1:1 by color.
4. The lane pan control.
5. A vertical volume fader with a unity mark and drag value, beside one
  post-fader lane RMS meter with peak hold rendered as a segmented LED-style
  column. Its recessed rectangular rail, accent fill, and low-profile hardware
  handle are the canonical visual for every numeric linear slider in MixJam.
6. A read-only dB readout of the fader position.

There is no EQ section. Mute and Solo remain in the lane header and are
intentionally absent here.

### Send controls

- Every lane has exactly four sends, one for each fixed return bus.
- Each send ranges from 0% to 100%, defaults to 0%, and resets to 0%.
- Sends are post-fader and post-pan. The sent signal therefore includes the
  lane's current volume and stereo pan.
- With no soloed lane, Lane Mute stops new dry output and new input to all four
  sends. Existing return tails continue to ring.
- When any lane is soloed, only soloed lanes produce dry output or new sends;
  Solo overrides Mute. Existing return tails from lanes that become gated
  continue to ring.
- A send has no route to another send or to any return except its matching bus.
  Feedback and crossfeed between return buses are forbidden.

## Integrated Return Controls

There are exactly four global return buses. Each FX container exposes the level
and limiter controls for its matching return bus. There is no separate Return
section. The container also shows the current module display name, Empty or
Delay. The Return level presents as the container's Mix rotary; power state
presents as a slot-accent LED toggle in the container header; a dedicated Edit
control opens the module editor.

- Each return is wet-only. Dry audio remains on the lane's normal path.
- Return level ranges from 0% to 100%, defaults to 100%, and resets to 100%.
- A return has no pan, mute, solo, meter, send, or crossfeed control.
- All return outputs sum into the existing Master path immediately before the
  unchanged Master-panel processing.
- Return level 0% silences that return's output but does not change its FX
  module, limiter setting, or send values.
- Spec-010 owns each return's module, power behavior, limiter, and internal
  audio graph.
- Each combined FX and Return container has one small square limiter toggle.
  The exact tooltip is:

  ```text
  Limiter
  Caps this FX Return at −1 dBFS using stereo-linked peak limiting. Enabled by default. Click to bypass. This does not limit the Master output.
  ```

## Audio Routing

For each audible lane, the dry and send taps are:

```text
voice -> lane volume -> lane pan -> dry Master path
                              +-> send 1 -> return bus 1
                              +-> send 2 -> return bus 2
                              +-> send 3 -> return bus 3
                              +-> send 4 -> return bus 4
```

Mute and solo gating occurs before both the dry path and send taps. Return
outputs rejoin the unchanged Master path as defined in spec-010. There is no
lane-to-channel routing table, master bypass for missing channels, or orphan
lane state.

## Metering

- Each lane strip has one lightweight RMS dBFS meter read after lane volume and
  pan. It shows the signal that feeds the dry path and the four send taps.
- One `AnalyserNode` per lane uses `fftSize` 256. A single animation-frame loop
  reads visible Mixer telemetry, computes `20 * log10(rms)`, clamps display to
  [-60, 0] dBFS, and maintains the existing decaying peak hold.
- Meter sampling runs only while the Mixer tab is visible. Hiding the Mixer
  cancels visual telemetry without changing audio, state, or return tails.
- Returns and FX containers have no meters in this spec.
- Standards-based LUFS and true-peak metering remains exclusively on the
  Master panel, now shown by the Master Bus Strip's pinned output meter
  (spec-012).

## Persistence

Spec-011 owns the physical format. The saved project must preserve:

- lane order and stable lane IDs;
- each lane's name, placements, volume, pan, mute, solo, and four send levels;
- four return levels; and
- the four FX and limiter records defined by spec-010.

Project format version 4 is a breaking format. Version-3 projects are rejected;
there is no version-3 migration or legacy channel/insert-FX interpretation.
Project parsing rejects zero lanes, more than 64 lanes, duplicate lane IDs, or
missing or malformed lane-owned Mixer data.

## Design Decisions

| Decision | Reason |
| --- | --- |
| Lane state owns Mixer values | Tracker and Mixer cannot drift or require routing reconciliation. |
| Stable IDs, derived positions | Deletion can compact order without changing lane identity or its visible name. |
| Add appends | Structural editing stays predictable and does not require insertion UI. |
| One structural undo entry | Lane content and its sound settings are restored together. |
| Four post-fader, post-pan sends | A send follows the audible lane balance and stereo position. |
| Four fixed global returns | The compact Mixer remains understandable and has no routing editor. |
| Return controls live in their matching FX containers | Bus identity stays visible while removing a redundant standalone column. |
| One scrolling row | Every strip and fixed bus remains reachable without pinning or wrapping. |
| No EQ section | The governing reference board (REV 07) has no EQ; nothing decorative is invented. |
| Master path is unchanged | The overhaul ends at the existing Master input boundary. |

Implementation ownership follows the same model. `LaneState` is the only
mutable source for lane volume, pan, mute, solo, and sends. The project command
history owns lanes and the four Return buses in one atomic edit snapshot.
`useMixer` derives audio-graph snapshots and meter indices from that project
state and owns only live visual telemetry. It does not store project data or a
parallel channel array.
Complete snapshot reconciliation also removes every graph channel absent from
the new lane list, including channels above a shortened list's new length, so a
removed solo cannot keep the remaining lanes gated.

## Acceptance Criteria

- [ ] **AC-001:** A new project shows eight lanes and eight matching Mixer
  strips with stable IDs, contiguous positions, and labels exactly equal to
  their lane-owned names.
- [ ] **AC-002:** Adding appends one lane and strip with the documented
  defaults; Add is disabled at 64.
- [ ] **AC-003:** Empty-lane deletion is immediate, non-empty deletion requires
  a blocking placement-count confirmation, playback stops on confirmed
  deletion, and Delete is disabled at one lane.
- [ ] **AC-004:** One Undo or Redo restores the complete lane structure,
  placements, and Mixer state after add or delete.
- [ ] **AC-005:** Deleting a middle lane compacts Mixer positions while every
  surviving lane retains its exact name, stable ID, and saved sound values.
- [ ] **AC-006:** Mixer strips cannot be independently added, deleted,
  reordered, or routed, and no Mixer Mute or Solo controls are rendered.
- [ ] **AC-007:** At UI Size 30 each compact strip is 76 px wide and exposes
  the name, derived channel number, four sends, pan, volume beside its lane
  meter, and the dB readout in the documented order. UI Size 40 and 50 scale
  the full strip consistently.
- [ ] **AC-008:** Sends range from 0% to 100%, default and reset to 0%, and use
  the post-volume, post-pan signal.
- [ ] **AC-009:** Mute and solo stop new dry and send input according to the
  documented gating rules while existing return tails ring out.
- [ ] **AC-010:** The row order is all lane strips, then the 2x2 combined FX and
  Return containers 1 through 4, using base widths 76/160 px and one continuous
  horizontal scrollbar with no wrap, pinning, or vertical scroll at supported
  1920x1080 geometry and the active UI Size minimum.
- [ ] **AC-011:** Each wet-only return ranges from 0% to 100%, defaults and
  resets to 100%, and has no pan, Mute, Solo, meter, send, or crossfeed.
- [ ] **AC-012:** All four returns sum before the unchanged Master path.
- [ ] **AC-013:** Lane meters are RMS dBFS with peak hold, Mixer visibility
  gates only their shared telemetry loop, and master loudness metering stays
  exclusive to the Master panel (the spec-012 strip output meter).
- [ ] **AC-014:** Format-version-4 roundtrip preserves all lane-bound Mixer,
  return, FX, and limiter state; invalid lane counts and malformed lane-owned
  Mixer values are rejected; version 3 is rejected without migration.
- [ ] **AC-015:** Lane-strip and combined FX and Return buttons, sliders, and
  rotary hit rectangles do not collide with adjacent controls at UI Size 30,
  40, and 50. The lane fader uses the shared linear-slider structure and each
  rotary SVG remains inside its owning slider.
- [ ] **AC-016:** Sends, Returns, Pan, and FX parameters render the shared SVG
  rotary structure; Pan uses a bipolar center arc and other Mixer dials use a
  unipolar minimum-to-value arc.

## Non-Goals

- No user-defined routing, multi-lane channels, channel removal, channel
  reordering, groups, or links.
- No functional channel EQ, filter, stereo-width, automation, or presets.
- No return pan, mute, solo, metering, sends, crossfeed, or feedback routing.
- No change to Master bus behavior beyond what spec-012 defines for the
  Master Bus Strip.
- No compatibility path for project format version 3.
