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
- **US-004:** I can reach every lane strip, the Return section, and all four FX
  containers with one horizontal scrollbar.
- **US-005:** I can set the common wet return level for each of the four FX
  buses without changing the Song tab's Master track.

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

### Stable identity and visible numbering

Every lane has a project-owned stable ID that does not change when another lane
is inserted or deleted. Visible lane numbers and Mixer positions are derived
from current array order and remain contiguous from 1 through N. Deleting lane
3 therefore makes the former lane 4 visible as lane 3 without changing its
stable ID or its saved Mixer values.

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
Lane strip 1 ... Lane strip N | Return | FX 1  FX 2
                                             FX 3  FX 4
```

- Lane strips and Return never wrap. The four fixed FX slots are one 2x2
  section at the end of the row and have no independent scrolling.
- The Mixer has one horizontal scrollbar for the complete row. The Return and
  FX sections scroll with lane strips.
- The horizontal scrollbar is always visible while the Mixer is active and is
  disabled when the full row fits.
- Horizontal trackpad movement and Shift+wheel scroll the row. Plain vertical
  wheel movement is not captured. Left/Right scroll the focused Mixer canvas.
- The Mixer row has no vertical scrollbar. Its content fits the available
  Bottom Workspace height at the supported minimum size.
- Keyboard focus scrolls a clipped control into view.
- Geometry uses the 32 px base control size. A lane strip is 76 px wide, the
  Return section is 120 px wide, and each FX container is 160 px wide. These
  widths scale consistently at UI Size 44 and 56. At a selected UI Size each
  width is fixed; strips do not grow merely to consume spare width.

### Lane strip

Each lane strip contains, from top to bottom:

1. The derived lane number and lane name.
2. Four rotary sends labelled 1 through 4.
3. A visible two-band EQ area matching the compact Mixer grammar. EQ is
  decorative and disabled: its controls cannot receive focus or input, expose
  a disabled state to assistive technology, own no saved values, and do not
  create audio nodes. Hovering the area shows "EQ controls are not available".
4. The lane pan control.
5. A vertical volume fader with a unity mark and drag value.
6. One post-fader lane RMS meter with peak hold.

Mute and Solo remain in the lane header and are intentionally absent here.

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

## Return Section

There are exactly four global return buses. The Return section exposes one
level control for each bus, labelled 1 through 4. Each row also shows the
current module display name, Empty or Delay, beside its limiter toggle.

- Each return is wet-only. Dry audio remains on the lane's normal path.
- Return level ranges from 0% to 100%, defaults to 100%, and resets to 100%.
- A return has no pan, mute, solo, meter, send, or crossfeed control.
- All return outputs sum into the existing Master path immediately before the
  unchanged Song-tab Master processing.
- Return level 0% silences that return's output but does not change its FX
  module, limiter setting, or send values.
- Spec-010 owns each return's module, power behavior, limiter, and internal
  audio graph.
- Each return has one small square limiter toggle in its label area. The exact
  tooltip is:

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
  unchanged Song-tab Output Level meter.

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
| Stable IDs, derived numbers | Deletion can compact visible order without changing lane identity. |
| Add appends | Structural editing stays predictable and does not require insertion UI. |
| One structural undo entry | Lane content and its sound settings are restored together. |
| Four post-fader, post-pan sends | A send follows the audible lane balance and stereo position. |
| Four fixed global returns | The compact Mixer remains understandable and has no routing editor. |
| One scrolling row | Every strip and fixed bus remains reachable without pinning or wrapping. |
| EQ is decorative and disabled | The reference hierarchy is retained without inventing unsupported DSP. |
| Song Master is unchanged | The overhaul ends at the existing Master input boundary. |

## Acceptance Criteria

- [ ] **AC-001:** A new project shows eight lanes and eight matching Mixer
  strips with stable IDs and contiguous visible numbers.
- [ ] **AC-002:** Adding appends one lane and strip with the documented
  defaults; Add is disabled at 64.
- [ ] **AC-003:** Empty-lane deletion is immediate, non-empty deletion requires
  a blocking placement-count confirmation, playback stops on confirmed
  deletion, and Delete is disabled at one lane.
- [ ] **AC-004:** One Undo or Redo restores the complete lane structure,
  placements, and Mixer state after add or delete.
- [ ] **AC-005:** Deleting a middle lane compacts visible numbering while every
  surviving lane retains its stable ID and saved sound values.
- [ ] **AC-006:** Mixer strips cannot be independently added, deleted,
  reordered, or routed, and no Mixer Mute or Solo controls are rendered.
- [ ] **AC-007:** At UI Size 32 each compact strip is 76 px wide and exposes
  four sends, disabled decorative EQ, pan, volume, and one lane meter in the
  documented order. UI Size 44 and 56 scale the full strip consistently.
- [ ] **AC-008:** Sends range from 0% to 100%, default and reset to 0%, and use
  the post-volume, post-pan signal.
- [ ] **AC-009:** Mute and solo stop new dry and send input according to the
  documented gating rules while existing return tails ring out.
- [ ] **AC-010:** The row order is all lane strips, Return, then the 2x2 FX 1 through FX
  4, using base widths 76/120/160 px and one continuous horizontal scrollbar
  with no wrap, pinning, or vertical scroll.
- [ ] **AC-011:** Each wet-only return ranges from 0% to 100%, defaults and
  resets to 100%, and has no pan, Mute, Solo, meter, send, or crossfeed.
- [ ] **AC-012:** All four returns sum before the unchanged Song Master path.
- [ ] **AC-013:** Lane meters are RMS dBFS with peak hold, Mixer visibility
  gates only their shared telemetry loop, and the Song Output Level contract
  is unchanged.
- [ ] **AC-014:** Format-version-4 roundtrip preserves all lane-bound Mixer,
  return, FX, and limiter state; invalid lane counts and malformed lane-owned
  Mixer values are rejected; version 3 is rejected without migration.

## Non-Goals

- No user-defined routing, multi-lane channels, channel removal, channel
  reordering, groups, or links.
- No functional channel EQ, filter, stereo-width, automation, or presets.
- No return pan, mute, solo, metering, sends, crossfeed, or feedback routing.
- No change to the Song tab's Master track or Output Level meter.
- No compatibility path for project format version 3.
