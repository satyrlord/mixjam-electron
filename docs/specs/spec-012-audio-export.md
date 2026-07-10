# Spec 012 — Audio Export

**Spec Validation Status:** VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine), spec-007 (Mixer)

## Objective

Export the full arrangement as a stereo audio file: WAV (uncompressed) and MP3
(compressed). The export renders all lanes through the mixer, including effects,
at the project BPM with time-stretching applied.

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
- The entire arrangement (all lanes, mixer channels, effects, time-stretching)
  is rendered to a single stereo buffer.
- Rendering respects: lane routing, channel gain/pan, mute/solo states, BPM,
  time-stretch ratios, and all active effects.
- The rendered buffer is then encoded to WAV or MP3.

### WAV Export

- Uncompressed PCM, 44100 Hz sample rate.
- 16-bit or 24-bit depth, user-selectable.
- Standard RIFF/WAV header.
- No metadata tags in v1 (no artist, title, album fields).

### MP3 Export

- Encoded using a JavaScript/WASM MP3 encoder (e.g. lamejs).
- Constant bitrate (CBR), user-selectable: 128, 192, 256, 320 kbps.
- 44100 Hz, stereo, joint stereo encoding.

### Progress & Cancellation

- Export progress is reported: `{ percent: 0–100, phase: "rendering" | "encoding" }`.
- A cancel button stops the export and discards partial output.
- Export runs asynchronously — the UI is not blocked (though user interaction
  may be limited during export to prevent state changes).

### Export Scope

- Exports from tick 0 to the last clip end tick across all lanes (no silent
  tail trimming by default).
- Option to add a configurable silence tail (default 2 seconds).

## Acceptance Criteria (testable)

- [ ] **AC-001:** Exporting as WAV produces a valid WAV file playable in any audio player.
- [ ] **AC-002:** Exporting as MP3 produces a valid MP3 file playable in any audio player.
- [ ] **AC-003:** The exported audio matches playback: same timing, same effects, same panning.
- [ ] **AC-004:** Changing a channel's gain and re-exporting produces a correspondingly louder/quieter file.
- [ ] **AC-005:** Muting a lane and exporting excludes that lane from the output.
- [ ] **AC-006:** Export progress is reported and the UI remains responsive during export.
- [ ] **AC-007:** Cancelling an export mid-way produces no output file.
- [ ] **AC-008:** A 16-bit WAV export has valid 16-bit samples (no clipping above 0 dBFS unless intentional).
- [ ] **AC-009:** The export duration equals the arrangement duration (last clip end − first clip start) plus the silence tail.
- [ ] **AC-010:** Export with time-stretching active produces stretched audio in the output (not native-rate).

## Non-Goals

- No multitrack/stem export (only stereo mixdown).
- No real-time export (bouncing) — offline render only.
- No export queue or batch export.
- No ID3 tags or metadata embedding in MP3.
- No normalization or limiting on the master bus during export.
- No export format other than WAV and MP3.
- No export directly to video or streaming platforms.
