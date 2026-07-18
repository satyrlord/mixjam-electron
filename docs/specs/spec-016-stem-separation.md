# Spec 016 — On-Device Stem Separation

**Spec Validation Status:** STUB — NOT VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-005 (Audio Playback Engine), spec-009 (Time-Stretching),
spec-015 (Local Semantic Audio Search — shares the ONNX Runtime Web
infrastructure and inference worker)

## Objective

Let a user split any sample in their library into isolated stems (drums, bass,
vocals, other) entirely on-device, then use those stems as independent placements on
separate tracker lanes. No audio leaves the machine; no cloud service, no
subscription, no API key. Separated stems follow the same placement,
tempo-following, and mixing contracts as other samples.

## User Stories

- **US-001:** As a user, I can right-click any sample in the browser or on a
  lane and choose "Separate stems" to split it into up to four stems.
- **US-002:** As a user, I see a progress indicator during separation and can
  cancel the operation.
- **US-003:** As a user, the separated stems appear as new virtual samples in
  the browser (grouped under the parent) and can be dragged onto lanes like any
  other sample.
- **US-004:** As a user, stems I have already separated are cached — requesting
  separation again is instant.
- **US-005:** As a user, separated stems respect time-stretching (spec-009) —
  if a stem's parent has a known BPM, the stem inherits it and stretches to
  project BPM.
- **US-006:** As a user, I can "Separate and spread" — one action that
  separates the sample and places each stem on consecutive lanes aligned to the
  source placement's start tick.
- **US-007:** As a user, if my device lacks WebGPU, separation still works
  (slower, CPU-WASM fallback) and does not crash.

## Scope

### Model Selection

- Use a Hybrid Transformer Demucs (HTDemucs) derived model exported to ONNX.
  HTDemucs achieves state-of-the-art SDR on MUSDB18 and separates into four
  stems: drums, bass, vocals, other (melody/harmony).
- The ONNX model is quantized (INT8 or FP16) to reduce size. Target: under
  80 MB for the quantized checkpoint. The model is lazy-loaded on first use —
  it is never bundled with the app binary.
- Model delivery: ship the model as an Electron renderer asset under
  `public/models/`, served from the `app://` protocol. Inference is local and
  does not depend on a first-run network download.

### Inference Pipeline

- Runs in the **dedicated inference worker** via ONNX Runtime Web (shared
  with spec-015's embedding inference; see spec-015's worker-placement
  design). WebGPU execution provider is preferred; falls back to WASM (CPU)
  if WebGPU is unavailable.
- Input: raw PCM float32 samples from an AudioBuffer (mono-mixed or stereo,
  resampled to the model's expected rate — typically 44.1 kHz).
- The model processes audio in overlapping chunks (segment length ~7.8s with
  ~0.25s overlap, matching Demucs default) to bound peak memory. Chunks are
  processed sequentially; results are crossfade-stitched.
- Output: four float32 waveforms (drums, bass, vocals, other), each the same
  length as the input.
- Progress reporting: the worker posts `{ type: 'stem-progress', percent }`
  messages per chunk so the UI can render a determinate progress bar.

### Storage and Caching

- Separated stems are stored as WAV blobs in OPFS under a dedicated cache
  directory (e.g. `stems/<parent_sample_id>/drums.wav`). They are derived data,
  not source files — always rebuildable by re-separation.
- A `stem_cache` table in SQLite tracks cached separations:

```sql
CREATE TABLE stem_cache (
  id          INTEGER PRIMARY KEY,
  sample_id   INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  stem_type   TEXT NOT NULL,    -- 'drums' | 'bass' | 'vocals' | 'other'
  opfs_path   TEXT NOT NULL,    -- path within OPFS cache
  size_bytes  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL, -- epoch ms
  UNIQUE (sample_id, stem_type)
);
```

- Total cache size is bounded (configurable, default 2 GB). LRU eviction
  removes the oldest separations when the cap is hit.
- If the parent sample's `mtime` changes (file re-indexed), cached stems are
  invalidated (the source material changed).

### Virtual Samples

- Stems surface in the UI as **virtual samples** — they appear in the Sample
  Browser grouped under their parent (e.g. "Loop.wav > Drums", "Loop.wav >
  Bass"). They are not physical files in the Sample Folder; they are read from
  OPFS cache via a `readStemBytes(sampleId, stemType)` backend call.
- Virtual samples carry the parent's metadata (duration, sample rate, BPM) and
  inherit category/tags.
- Virtual samples can be placed on lanes, time-stretched, and effected exactly
  like physical samples. The audio engine reads them through the same
  `loadSampleBytes` path, extended to resolve stem references.

### Integration with Existing Systems

- **Sample Browser:** a "Stems" sub-row or expandable group appears beneath any
  sample that has cached stems. A "Separate" button appears in the sample
  context menu and detail panel.
- **Tracker:** "Separate and spread" is a context menu action on any clip placement.
  It separates the source sample (if not cached) and places four placements on
  lanes N, N+1, N+2, N+3 starting at the source placement's start tick.
- **Tempo following (spec-009):** stems inherit their parent's `nativeBPM` for
  first-placement span estimation and are resampled like physical samples.
- **Semantic search (spec-015):** stems get their own embeddings computed during
  a background pass after separation, so "find similar" works on individual
  stems.
- **Audio engine (spec-005):** no changes to the engine's voice/channel model —
  stems are just samples loaded from a different path.

### Performance Targets

- Separation of a 3-minute stereo WAV at 44.1 kHz:
  - WebGPU (discrete GPU): under 30 seconds.
  - WASM CPU fallback (2020 laptop, 4-core): under 3 minutes.
- Peak additional memory during inference: under 1 GB.
- These are targets, not guarantees — a spike is needed to validate on real
  hardware before committing to UX promises.

## Acceptance Criteria (draft)

- [ ] **AC-001:** "Separate stems" on a sample produces four stem files in OPFS
  cache; each stem's duration matches the source within 1ms tolerance.
- [ ] **AC-002:** Progress is reported during separation; cancellation stops
  inference and produces no partial cache entry.
- [ ] **AC-003:** Stems appear as virtual samples in the browser, grouped under
  the parent. Clicking one plays only that stem.
- [ ] **AC-004:** Dragging a stem onto a lane creates a clip placement that plays the
  isolated stem audio.
- [ ] **AC-005:** "Separate and spread" places four placements on consecutive lanes
  aligned to the source placement's start tick; playing back produces the original
  mix (within acceptable reconstruction error).
- [ ] **AC-006:** Re-requesting separation of an already-cached sample returns
  instantly from cache without re-running inference.
- [ ] **AC-007:** If WebGPU is unavailable, separation completes via WASM
  fallback — slower but correct. No crash, no blank output.
- [ ] **AC-008:** Cache eviction removes the oldest stems when total cache size
  exceeds the configured cap.
- [ ] **AC-009:** If the parent sample is re-indexed with a new mtime, cached
  stems are invalidated.
- [ ] **AC-010:** Stems inherit the parent's nativeBPM and stretch correctly
  when project BPM differs.

## Non-Goals

- No real-time separation during playback; separation is offline/precomputed.
  Playback of the resulting stems still uses spec-009's real-time
  tempo-following resampling.
- No user-selectable stem count or custom model upload (four fixed stems in v1).
- No fine-grained stem editing (trim, fade) beyond what the Tracker already
  provides for any clip placement.
- No re-synthesis or remix automation ("make the drums louder in this mix") —
  stems are independent placements, mixed via the existing channel gain/pan/FX.
- No stem separation quality comparison across multiple models in this spec —
  use one, swap later if measured SDR or inference speed improves.
- No model training or fine-tuning.
- No separation of stems into more than four categories (e.g. no "piano" vs
  "guitar" sub-separation of the "other" stem).

## Open Questions

- **Model size vs quality:** HTDemucs base (~80 MB INT8) vs a smaller
  distilled variant (~30 MB) — is the quality difference audible on typical
  sample-pack material (loops, one-shots are trivial; full mixes are the hard
  case)? Needs a listening spike.
- **Chunk stitching artifacts:** overlap-add crossfade handles most cases, but
  do transient-heavy drum stems show audible clicks at chunk boundaries? May
  need onset-aligned chunk boundaries.
- **OPFS quota:** 2 GB of stem cache may approach Electron's persistent
  storage quota. Measure it on supported operating systems and show a
  user-facing warning when quota is near.
- **Model package impact:** bundling the model increases the installer by about
  80 MB. Validate that cost before this stub becomes an implemented contract.
- **Stereo vs mono inference:** HTDemucs supports stereo input natively. Should
  the pipeline always run in stereo (higher quality, 2x compute), or offer a
  "fast mono" mode?
- **Integration with spec-015 embeddings:** should stem embeddings be computed
  eagerly (immediately after separation) or lazily (next background re-index)?
  Eager gives immediate "find similar" on stems; lazy avoids blocking the user.
- **Memory pressure on low-end devices:** 1 GB peak memory during inference may
  be too much for a 4 GB RAM machine with a browser already consuming 1-2 GB.
  Can chunk size be reduced further to trade throughput for memory?

## References

- Hybrid Transformer Demucs (HTDemucs) — <https://github.com/facebookresearch/demucs>
- ONNX Runtime Web (WebGPU + WASM backends) — <https://onnxruntime.ai/docs/get-started/with-javascript/web.html>
- MUSDB18 benchmark (standard evaluation for source separation) — <https://sigsep.github.io/datasets/musdb.html>
- Overlap-add reconstruction — standard DSP technique for stitching
  chunk-processed audio without discontinuities.
- spec-009 (Time-Stretching) — pre-computed buffer design this spec mirrors.
- spec-015 (Local Semantic Audio Search) — ONNX Runtime Web infrastructure
  and embedding pipeline this spec shares.
