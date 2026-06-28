# Spec 011 — Project Save & Load

**Status:** ✅ VALIDATED
**Depends on:** spec-006 (Player Timeline & Panel Layout), spec-007 (Mixer)

## Objective

Implement project persistence: save the current arrangement (lanes, clips,
mixer state, BPM, routing) to a versioned file, and load it back to restore
the full session. Samples are referenced by relative path, never embedded.

## User Stories

- **US-001:** As a user, I can save my project to a .mixjam file so I can continue
  working on it later.
- **US-002:** As a user, I can open a saved .mixjam file and the Player restores
  all lanes, clips, mixer settings, BPM, and routing exactly as I left them.
- **US-003:** As a user, if a sample referenced in a .mixjam file file is missing,
  I see a clear warning but the rest of the project still loads.
- **US-004:** As a user, my .mixjam file files include a format version so future
  versions of the app can migrate old projects.

## Scope

### Project File Format

A project is a JSON file with a `.mixjam` extension, saved to the User Folder
(spec-003). Schema:

```json
{
  "formatVersion": 1,
  "appVersion": "v0.1.0",
  "createdAt": "2026-06-28T...",
  "modifiedAt": "2026-06-28T...",
  "bpm": 120,
  "lanes": [
    {
      "index": 0,
      "name": "Lane 1",
      "sampleRef": "Kicks/kick_808.wav",
      "nativeBPM": null,
      "muted": false,
      "solo": false,
      "channelId": "ch-1",
      "clips": [
        { "startTick": 0, "durationTicks": 32 }
      ]
    }
  ],
  "channels": [
    {
      "id": "ch-1",
      "name": "Channel 1",
      "gain": 0.8,
      "pan": 0,
      "width": 1,
      "muted": false,
      "solo": false,
      "fx": []
    }
  ]
}
```

- `sampleRef` is a path relative to the Sample Folder root. Never an absolute
  path, never embedded audio bytes.
- `formatVersion` is incremented when the schema changes in a breaking way.
- `appVersion` records which app version saved the file.

### Save Flow

- "Save" (Ctrl+S) writes to the current project file path.
- "Save As…" (Ctrl+Shift+S) opens a native file picker to choose a new
  location (defaults to User Folder).
- First save of a new project triggers "Save As…".
- Unsaved changes indicator: a dot/asterisk next to the project name in the
  transport strip.
- Save is atomic — write to a temp file, then rename over the target.

### Load Flow

- "Load MixJam" from the Home Screen or "Open" from the Player opens a native
  file picker filtered to `.mixjam`.
- On load:
  1. Parse JSON and validate `formatVersion`.
  2. Verify the Sample Folder contains all referenced samples.
  3. Restore lanes, clips, channel settings, BPM, routing.
  4. Missing samples show a warning badge on affected lanes.
- If the `formatVersion` is higher than supported, show: "This project was
  created with a newer version of MixJam. Please update the app."

### Format Migration

- When loading an older `formatVersion`, apply migration transforms to bring
  the data up to the current version.
- Migrations are ordered, cumulative, and idempotent.
- The loaded data is migrated in memory; the file on disk is not overwritten
  until the user saves.

## Acceptance Criteria (testable)

- [ ] **AC-001:** "Save As…" writes a valid `.mixjam` JSON file to the chosen location.
- [ ] **AC-002:** Saving, closing the app, reopening, and loading the project restores all lanes, clips, mixer settings, BPM, and routing.
- [ ] **AC-003:** The unsaved changes indicator appears after any modification and disappears after save.
- [ ] **AC-004:** Ctrl+S saves to the current path; Ctrl+Shift+S triggers "Save As…".
- [ ] **AC-005:** Loading a project with a missing sample file shows a warning badge on the affected lane(s) — other lanes load correctly.
- [ ] **AC-006:** Loading a project with a `formatVersion` higher than the app supports shows an error message and does not load.
- [ ] **AC-007:** `sampleRef` fields are relative paths, never absolute paths, never base64-encoded audio.
- [ ] **AC-008:** The project file survives a roundtrip: save → load → save produces an identical file (minus `modifiedAt` timestamp).

## Non-Goals

- No project auto-save or recovery from crashes.
- No cloud sync or multi-device projects.
- No project export as audio stems or multitrack.
- No project templates or "New from template".
- No embedded sample data — samples are always referenced by path.
- No compression or binary format (plain JSON only for v1).
- No project password protection or encryption.

## References

- [mixjam-webjam architectural-suggestion-notes §6](../_archived/mixjam-webjam/docs/architectural-suggestion-notes.md) — Versioned JSON schema, relative path references.
- [mixjam-webjam spec-004](../_archived/mixjam-webjam/specs/004-state-architecture/spec.md) — Project file schema, migration strategy.
