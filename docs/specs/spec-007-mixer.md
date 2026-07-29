# Spec 007 — Lane-Bound Mixer

**Spec Validation Status:** VALIDATED

**Spec Implementation Status:** PARTIAL — see the unchecked acceptance criteria.

**Depends on:** spec-005 (Audio Playback Engine), spec-006 (Player Timeline & Panel Layout)

**Related:** spec-010 (Return FX Modules), spec-011 (Project Save & Load)

## Objective

Provide one compact Mixer strip for every Tracker lane.
Lanes and Mixer strips form one project-owned system.
Adding or deleting a lane adds or deletes its strip.
Users cannot add, delete, reorder, or route Mixer strips separately.
The Mixer also hosts four fixed send/return buses and four fixed FX containers.

## User Stories

- **US-001:** I can control each lane's volume, pan, and four FX sends from one
  compact strip.
- **US-002:** I always see the same lane order in the Tracker and Mixer.
- **US-003:** I can add and delete lanes between the hard limits of 1 and 64.
- **US-004:** I can reach every lane strip and all four combined FX and Return
  containers with one horizontal scrollbar.
- **US-005:** I can set the common wet return level for each FX bus.
  This action does not change the Master tab's Master track.

## Lane and Mixer Ownership

### One lane, one strip

- A new project contains eight lanes and therefore eight Mixer strips.
- A project contains between 1 and 64 lanes, inclusive. The project file must
  store every Mixer value inside the corresponding lane record. It has no
  separate channel or Mixer-record array.
- A lane owns its stable identity, name, volume, pan, mute, solo, four send
  levels, and placements. Mixer strip state is not a second object that may
  drift from the lane.
- Mixer strips use lane order. A user cannot add, delete, reorder, or route them independently.
- Mute and Solo controls appear only in the lane header. They are not repeated
  in the Mixer.
- Renaming a lane updates the Mixer header's accessible name and tooltip
  immediately. The name is not visibly duplicated in the Mixer.

### Stable identity and visible order

Every lane has a project-owned stable ID that does not change when another lane
is inserted or deleted. Current array order determines Mixer positions
and remain contiguous from 1 through N. A strip's compact selectable header
visibly shows only the zero-padded derived position ("01" through "NN"). Its
accessible name and tooltip retain the lane-owned name, but that name is not
visibly duplicated in the Mixer. Deleting an earlier lane compacts strip positions.
It does not change a surviving lane's name, stable ID, or saved Mixer values.

Adding a lane appends it after the final lane. The lane receives a new stable
ID and the next visible default name. It has no placements.
Its volume is 80%, pan is centered, and mute and solo are off.
Its four sends are at 0%.

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
  The Mixer does not capture plain vertical wheel movement. Left/Right scroll the focused Mixer canvas.
- The Mixer row has no vertical scrollbar. Its content fits the active tab's
  UI-Size-derived Bottom Workspace minimum at supported 1920x1080 geometry.
  The shared active-panel defensive scrollport supports later content growth beyond that minimum.
  It is not active in normal Mixer operation.
- Keyboard focus scrolls a clipped control into view.
- The active Bottom Workspace tab already names this surface. The Mixer has no redundant internal `Mixer` title band.
  Thus, its content-safe minimum excludes one title row at each UI Size.
- Geometry uses the 30 px base control size. A lane strip is 76 px wide and
  each combined FX and Return container is 160 px wide. These widths scale
  consistently at UI Size 40 and 50. At a selected UI Size each width is fixed.
  Strips do not grow merely to consume spare width.
- Lane-strip and combined FX and Return control rectangles do not collide with adjacent controls.
  Test this rule at UI Size 30, 40, and 50. Rotary artwork remains inside
  its owning control or strip at every size.
- Lane strips render inside a Channels panel and the four containers inside an
  FX bank panel. Each panel has a decorative header and a status LED.
  The headers show the channel count and "4 Sends", or "4 × FX Slots" and "Active". Both panels share
  the single scrolling row.
- Sends and Return Mix use the same project-owned SVG rotary visual as FX
  parameters. Compact sizing retains the complete range track, value arc,
  inset cap, default marker, and pointer. It does not replace any of them with
  a CSS-only dial. Pan uses the same shared bipolar rotary only in the lane
  header.

### Lane strip

Each lane strip contains, from top to bottom:

1. A compact selectable header that visibly shows only the zero-padded derived
   channel number ("01"). The lane-owned name remains its tooltip and
   accessible text.
2. Four rotary sends have labels 1 through 4.
  Each uses its matching FX slot accent, so color maps sends to FX slots 1:1.
3. A vertical volume fader with a unity mark and drag value.
  One post-fader lane RMS meter with peak hold sits beside it.
  The meter uses a segmented LED-style column.
  Its recessed rectangular rail, accent fill, and low-profile hardware handle define each numeric linear slider in MixJam.
4. A read-only dB readout of the fader position.

There is no EQ or Pan section. Pan, Mute, and Solo remain in the lane header
and are intentionally absent here.

### Send controls

- Every lane has exactly four sends, one for each fixed return bus.
- Each send ranges from 0% to 100%, defaults to 0%, and resets to 0%.
- Sends are post-fader and post-pan. The sent signal therefore includes the
  lane's current volume and stereo pan.
- With no soloed lane, Lane Mute stops new dry output and new input to all four
  sends. Existing return tails continue to ring.
- When any lane is soloed, only soloed lanes produce dry output or new sends.
  Solo overrides Mute. Existing return tails from lanes that become gated
  continue to ring.
- A send has no route to another send or to any return except its matching bus.
  Feedback and crossfeed between return buses are forbidden.

## Integrated Return Controls

There are exactly four global return buses. Each FX container exposes the level
and limiter controls for its matching return bus. There is no separate Return
section. The container also shows the current module display name. Its picker
and editor are registry-driven. The current modules are Echoform Delay and
Aetherform Reverb.

The Return level presents as the container's Mix rotary —
the same shared Mix parameter the editor exposes. Power state presents as a
slot-accent LED toggle in the container header. A dedicated Edit control opens
the selected module's editor.

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
- One `AnalyserNode` per lane uses `fftSize` 256.
  A single animation-frame loop reads visible Mixer telemetry and computes `20 * log10(rms)`.
  It clamps the display to [-60, 0] dBFS and maintains the existing decaying peak hold.
- Meter sampling runs only while the Mixer tab is visible. Hiding the Mixer
  cancels visual telemetry without changing audio, state, or return tails.
- Returns and FX containers have no meters in this spec.
- Standards-based LUFS and true-peak metering stays only on the Master panel.
  The Master Bus Strip pinned output meter now shows it (spec-012).

## Persistence

Spec-011 owns the physical format. The saved project must preserve:

- lane order and stable lane IDs,
- each lane's name, placements, volume, pan, mute, solo, and four send levels,
- four return levels, and
- the four FX and limiter records defined by spec-010.

Project format version 7 is a breaking format. The parser rejects older projects.
There is no migration or channel/insert-FX interpretation for earlier formats.
Project parsing rejects zero lanes, more than 64 lanes, duplicate lane IDs, or
missing or malformed lane-owned Mixer data.

## Design Decisions

| Decision | Reason |
| --- | --- |
| Lane state owns Mixer values | Tracker and Mixer cannot drift or require routing reconciliation. |
| Stable IDs, derived positions | Deletion can compact order without changing lane identity or duplicating its name in the Mixer. |
| Add appends | Structural editing stays predictable and does not require insertion UI. |
| One structural undo entry | Undo restores lane content and its sound settings together. |
| Four post-fader, post-pan sends | A send follows the audible lane balance and stereo position. |
| Four fixed global returns | The compact Mixer remains understandable and has no routing editor. |
| Return controls live in their matching FX containers | Bus identity stays visible while removing a redundant standalone column. |
| Numeric Mixer headers and lane-header Pan | Removes duplicated labels and controls while preserving lane context where it is edited. |
| No internal Mixer title band | The active Bottom Workspace tab already names the surface, freeing one title row at every UI Size. |
| One scrolling row | Every strip and fixed bus remains reachable without pinning or wrapping. |
| No EQ section | The governing reference board (REV 07) has no EQ. The design adds no decorative EQ. |
| Master path is unchanged | The overhaul ends at the existing Master input boundary. |

Implementation ownership follows the same model. `LaneState` is the only
mutable source for lane volume, pan, mute, solo, and sends. The project command
history owns lanes and the four Return buses in one atomic edit snapshot.
`useMixer` derives audio-graph snapshots and meter indices from that project
state and owns only live visual telemetry. It does not store project data or a
parallel channel array.

Telemetry frames use a subscription store
(`value-store.ts`), not React state. Each channel meter subscribes to its own
derived view. A frame renders only meter elements with changed values.
It never renders the App tree.

Complete snapshot reconciliation removes every graph channel absent from the
new lane list. This includes channels above a shortened list length.
Thus, a removed solo cannot keep the remaining lanes gated.

## Acceptance Criteria

- [ ] **AC-001:** A new project shows eight lanes and eight matching Mixer
  strips with stable IDs and contiguous positions. Each strip visibly shows
  only its zero-padded derived number. Its lane-owned name remains available as
  tooltip and accessible text.
- [ ] **AC-002:** Adding appends one lane and strip with the documented
  defaults. Add is disabled at 64.
- [ ] **AC-003:** Empty-lane deletion is immediate. Non-empty deletion requires a blocking placement-count confirmation.
  Confirmed deletion stops playback. Delete is disabled at one lane.
- [ ] **AC-004:** One Undo or Redo restores the complete lane structure,
  placements, and Mixer state after add or delete.
- [ ] **AC-005:** Deleting a middle lane compacts Mixer positions.
  Each surviving lane retains its exact name, stable ID, and saved sound values.
- [ ] **AC-006:** A user cannot add, delete, reorder, or route Mixer strips independently.
  The Mixer renders no Mute or Solo controls.
- [ ] **AC-007:** At UI Size 30, each compact strip is 76 px wide.
  Its selectable header shows only the zero-padded derived number.
  The documented order contains four sends, volume beside its lane meter,
  and the dB readout.
  Only the lane header controls Pan. UI Size 40 and 50 scale the full
  strip consistently.
- [ ] **AC-008:** Sends range from 0% to 100%, default and reset to 0%, and use
  the post-volume, post-pan signal.
- [ ] **AC-009:** Mute and solo stop new dry and send input under the documented gating rules.
  Existing return tails ring out.
- [ ] **AC-010:** All lane strips come before the 2x2 combined FX and Return
  containers 1 through 4. Base widths are 76/160 px.
  One continuous horizontal scrollbar has no wrap, pinning, or vertical scroll.
  This layout applies at 1920x1080 and the active UI Size minimum.
  The minimum excludes the
  removed internal Mixer title row.
- [ ] **AC-011:** Each wet-only return ranges from 0% to 100% and defaults and resets to 100%.
  It has no pan, Mute, Solo, meter, send, or crossfeed.
- [ ] **AC-012:** All four returns sum before the unchanged Master path.
- [ ] **AC-013:** Lane meters show RMS dBFS with peak hold.
  Mixer visibility gates only their shared telemetry loop.
  Master loudness metering stays in the Master panel.
  Spec-012 owns the strip output meter.
- [ ] **AC-014:** Format-version-7 roundtrip preserves all lane-bound Mixer,
  return, FX, and limiter state. Invalid lane counts and malformed lane-owned
  The parser rejects invalid Mixer values. It rejects older formats without migration.
- [ ] **AC-015:** Interactive rectangles do not collide at UI Size 30, 40, or
  50. This rule covers lane-strip and combined FX and Return controls.
  The lane fader uses the shared linear-slider structure and each
  rotary SVG remains inside its owning slider.
- [ ] **AC-016:** Mixer Sends, Return Mix, and FX parameters render the shared SVG rotary structure.
  It includes a range track, value arc, inset cap, default marker, and pointer.
  Lane-header Pan uses that shared bipolar center arc.
  Mixer dials use a unipolar minimum-to-value arc.

## Non-Goals

- No user-defined routing, multi-lane channels, channel removal, channel
  reordering, groups, or links.
- No functional channel EQ, filter, stereo-width, automation, or presets.
- No return pan, mute, solo, metering, sends, crossfeed, or feedback routing.
- No change to Master bus behavior beyond what spec-012 defines for the
  Master Bus Strip.
- No compatibility path for older project formats.
