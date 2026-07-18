# Spec 019 — Audio Export

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine), spec-007 (Mixer)

## Objective

Export the full arrangement as a stereo audio file: WAV (uncompressed) and MP3
(compressed). The export renders the same 1:1 lane/mixer, four-send, four-return,
Delay, return-limiter, and unchanged Master graph used by live playback, at the
project BPM with spec-009 tempo-following resampling applied.

## User Stories

- **US-001:** As a user, I can export my project as a WAV file to share or
  use in other software.
- **US-002:** As a user, I can export my project as an MP3 file for smaller
  file size.
- **US-003:** As a user, I see export progress and can cancel a long-running
  export.
- **US-004:** As a user, the exported file sounds identical to what I hear
  during playback in the Player.

## Scope

### Export Flow

- Triggered from the Player UI (export button or menu item).
- User selects: format (WAV or MP3), bit depth (16-bit or 24-bit for WAV),
  MP3 bitrate (128, 192, 256, 320 kbps).
- User chooses output file location via native save dialog.
- Default filename: project name + format extension.
- Default location: User Folder (spec-003).

### Offline Rendering

- Uses an `OfflineAudioContext` to render the arrangement faster than
  real-time.
- The entire arrangement is rendered to a single stereo buffer through this
  graph for each lane:

  ```text
  placement voice -> lane input -> lane volume/pan/mute/solo
                   |-> dry bus ------------------------------|
                   |-> send 1 -> FX 1 module -> return 1 level -> limiter 1 -|
                   |-> send 2 -> FX 2 module -> return 2 level -> limiter 2 -|
                   |-> send 3 -> FX 3 module -> return 3 level -> limiter 3 -|-> unchanged Master -> stereo buffer
                   `-> send 4 -> FX 4 module -> return 4 level -> limiter 4 -|
  ```

- Each Mixer track is derived from the lane at the same visible position and
  retains that lane's stable identity. There is no
  separate lane-routing or insert-effect path.
- Rendering respects lane volume, pan, mute, and solo state, all four send
  levels, all four Empty or Delay configurations, return levels, the limiter
  on each return path, BPM, playback-rate ratios, and automatic clip-edge
  micro-fades. Export must reuse spec-005's sample-count rounding, proportional
  short-placement handling, and same-lane boundary classification so live and
  offline envelopes are sample-consistent.
- The four return limiters are part of their return paths before the Master sum.
  They are not a Master limiter. Export does not add a limiter, normalization,
  gain, or other processor to the Master path.
- The rendered buffer is then encoded to WAV or MP3.

### WAV Export

- Uncompressed PCM, 44100 Hz sample rate, stereo.
- 16-bit only.
- Standard RIFF/WAV header.
- No metadata tags in v1 (no artist, title, album fields).

### MP3 Export

- Encoded using a JavaScript/WASM MP3 encoder (e.g. lamejs).
- Constant bitrate (CBR), only 320 kbps.
- 44100 Hz, stereo, joint stereo encoding.

### Progress & Cancellation

- Export progress is reported: `{ percent: 0–100, phase: "rendering" | "encoding" }`.
- A cancel button stops the export and discards partial output.
- Export runs asynchronously — the UI is not blocked (though user interaction
  may be limited during export to prevent state changes).

### Export Scope

- The arrangement renders from tick 0 through the last placement end, then all
  Delay inputs close and the four Returns ring out. The renderer evaluates the
  rendered Return outputs and ends the ring-out at the earliest point where all
  four remain below -90 dBFS for the following 500 ms.
- Ring-out analysis may inspect at most 120 seconds after the last placement.
  If the Returns do not reach the threshold, export fails clearly instead of
  silently truncating an audible tail.
- A configurable silence tail, default 2 seconds, is appended after the
  detected FX ring-out. It does not replace or cap ring-out rendering.

## Acceptance Criteria (testable)

- [ ] **AC-001:** Exporting as WAV produces a valid WAV file playable in any audio player.
- [ ] **AC-002:** Exporting as MP3 produces a valid MP3 file playable in any audio player.
- [ ] **AC-003:** The exported audio matches playback: same timing, lane pan and
  volume, send levels, Delay output, return levels, return limiting, and Master
  output.
- [ ] **AC-004:** Changing a lane's mixer volume and re-exporting produces a correspondingly louder/quieter file.
- [ ] **AC-005:** Muting a lane and exporting excludes that lane from the output.
- [ ] **AC-006:** Export progress is reported and the UI remains responsive during export.
- [ ] **AC-007:** Cancelling an export mid-way produces no output file.
- [ ] **AC-008:** A 16-bit WAV export has valid 16-bit samples (no clipping above 0 dBFS unless intentional).
- [ ] **AC-009:** Export renders Delay ring-out until every Return satisfies the
  -90 dBFS for 500 ms rule, then appends the configured silence tail. A Return
  that does not decay within 120 seconds fails export instead of being cut.
- [ ] **AC-010:** Export applies the same placement-owned playback rates as live
  playback instead of exporting placed samples at native rate.
- [ ] **AC-011:** Each lane's dry path and four send paths are rendered, each
  send reaches only its matching Delay and return, and the four limited returns
  join the dry lanes at the unchanged Master.
- [ ] **AC-012:** Each return limiter is before the Master sum. Export adds no
  Master limiter or other export-only Master processing.

## Non-Goals

- No multitrack/stem export (only stereo mixdown).
- No real-time export (bouncing) — offline render only.
- No export queue or batch export.
- No ID3 tags or metadata embedding in MP3.
- No normalization or limiting on the Master bus during export. The four
  required return-path limiters are not Master processing.
- No export format other than WAV and MP3.
- No export directly to video or streaming platforms.
