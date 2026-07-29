# Spec 016 — On-Device Stem Separation

**Spec Validation Status:** STUB — NOT VALIDATED

**Spec Implementation Status:** NOT IMPLEMENTED

**Depends on:**

- spec-005 (Audio Playback Engine)
- spec-009 (Time-Stretching)
- spec-015 (Local Semantic Audio Search)

This dependency shares the ONNX Runtime Web infrastructure and inference worker.

## Objective

Let a user split any library sample into isolated stems on the local device.
The stems contain drums, bass, vocals, and other audio.
The user can place each stem independently on a tracker lane.
No audio leaves the machine. No cloud service, no
subscription, no API key. Separated stems follow the same placement,
tempo-following, and mixing contracts as other samples.

## User Stories

- **US-001:** As a user, I can choose "Separate stems" for a browser or lane
  sample. This action creates up to four stems.
- **US-002:** As a user, I see a progress indicator during separation and can
  cancel the operation.
- **US-003:** As a user, I see separated stems as virtual browser samples
  under their parent. I can drag each stem onto a lane.
- **US-004:** As a user, the cache keeps stems I have already separated. Requesting
  separation again is instant.
- **US-005:** As a user, separated stems follow spec-009 time-stretching.
  A stem inherits a known parent BPM and stretches to the project BPM.
- **US-006:** As a user, I can choose "Separate and spread."
  This action separates the sample. It places each stem on consecutive lanes
  at the source placement start tick.
- **US-007:** As a user, if my device lacks WebGPU, separation still works
  (slower, CPU-WASM fallback) and does not crash.

## Scope

### Model Selection

- Use a Hybrid Transformer Demucs (HTDemucs) derived model exported to ONNX.
  HTDemucs achieves state-of-the-art SDR on MUSDB18 and separates into four
  stems: drums, bass, vocals, other (melody/harmony).
- Use INT8 or FP16 quantization to reduce the ONNX model size. Target: under
  80 MB for the quantized checkpoint. The worker loads the model on first use —
  it is never bundled with the app binary.
- Model delivery: ship the model as an Electron renderer asset under
  `public/models/`, served from the `app://` protocol. Inference is local and
  does not depend on a first-run network download.

### Inference Pipeline

- Runs in the **dedicated inference worker** via ONNX Runtime Web (shared
  with spec-015's embedding inference. See spec-015's worker-placement
  design). Prefer the WebGPU execution provider. Fall back to WASM (CPU)
  if WebGPU is unavailable.
- Input: raw PCM float32 samples from an AudioBuffer.
  Use mono-mixed or stereo audio at the model rate, typically 44.1 kHz.
- The model uses approximately 7.8-second chunks with 0.25-second overlap.
  This Demucs default bounds peak memory. Chunks are
  processed sequentially. The worker crossfade-stitches the results.
- Output: four float32 waveforms (drums, bass, vocals, other), each the same
  length as the input.
- Progress reporting: the worker posts `{ type: 'stem-progress', percent }`
  messages per chunk so the UI can render a determinate progress bar.

### Storage and Caching

- The cache stores separated stems as WAV blobs in OPFS under a dedicated
  directory, such as `stems/<parent_sample_id>/drums.wav`. The app can rebuild
  this derived data through separation.
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

- Configuration limits the total cache size to 2 GB by default. LRU eviction
  removes the oldest separations when the cache reaches this limit.
- If the parent sample's `mtime` changes, the app invalidates cached stems.
  This change shows that the source material changed.

### Virtual Samples

- Stems surface in the UI as **virtual samples** — they appear in the Sample
  Browser grouped under their parent (e.g. "Loop.wav > Drums", "Loop.wav >
  Bass"). They are not physical files in the Sample Folder. The backend reads
  them from the OPFS cache through `readStemBytes(sampleId, stemType)`.
- Virtual samples carry the parent's metadata (duration, sample rate, BPM) and
  inherit tags.
- Users can place, stretch, and apply effects to virtual samples like physical
  samples. The audio engine reads them through the same
  `loadSampleBytes` path, extended to resolve stem references.

### Integration with Existing Systems

- **Sample Browser:** a "Stems" sub-row or expandable group appears beneath any
  sample that has cached stems. A "Separate" button appears in the sample
  context menu and detail panel.
- **Tracker:** "Separate and spread" is a context menu action on any clip.
  It separates the source sample if the cache has no stems.
  It places four stems on lanes N, N+1, N+2, and N+3.
  Each stem starts at the source placement start tick.
- **Tempo following (spec-009):** stems inherit their parent's `nativeBPM` for
  first-placement span estimation. The audio engine resamples them like physical samples.
- **Semantic search (spec-015):** a background pass computes a stem embedding
  after separation. Thus, "find similar" works on each stem.
- **Audio engine (spec-005):** no changes to the engine's voice/channel model —
  stems are just samples loaded from a different path.

### Performance Targets

- Separation of a 3-minute stereo WAV at 44.1 kHz:
  - WebGPU (discrete GPU): under 30 seconds.
  - WASM CPU fallback (2020 laptop, 4-core): under 3 minutes.
- Peak additional memory during inference: under 1 GB.
- These are targets, not guarantees. A spike must validate them with real
  hardware before committing to UX promises.

## Acceptance Criteria (draft)

- [ ] **AC-001:** "Separate stems" on a sample produces four stem files in OPFS
  cache. Each stem's duration matches the source within 1ms tolerance.
- [ ] **AC-002:** The worker reports progress during separation. Cancellation stops
  inference and produces no partial cache entry.
- [ ] **AC-003:** Stems appear as virtual samples in the browser, grouped under
  the parent. Clicking one plays only that stem.
- [ ] **AC-004:** Dragging a stem onto a lane creates a clip placement that plays the
  isolated stem audio.
- [ ] **AC-005:** "Separate and spread" places four placements on consecutive lanes
  aligned to the source placement's start tick. Playing back produces the original
  mix (within acceptable reconstruction error).
- [ ] **AC-006:** Re-requesting separation of an already-cached sample returns
  instantly from cache without re-running inference.
- [ ] **AC-007:** If WebGPU is unavailable, separation completes via WASM
  fallback — slower but correct. No crash, no blank output.
- [ ] **AC-008:** Cache eviction removes the oldest stems when total cache size
  exceeds the configured cap.
- [ ] **AC-009:** If the indexer records a new parent `mtime`, the app invalidates
  the cached stems.
- [ ] **AC-010:** Stems inherit the parent's nativeBPM and stretch correctly
  when project BPM differs.

## Non-Goals

- No real-time separation during playback. Separation is offline/precomputed.
  Playback of the resulting stems still uses spec-009's real-time
  tempo-following resampling.
- No user-selectable stem count or custom model upload (four fixed stems in v1).
- No fine-grained stem editing (trim, fade) beyond what the Tracker already
  provides for any clip placement.
- No resynthesis or remix automation.
  Stems are independent placements that use existing channel gain, pan, and FX.
- No stem quality comparison across multiple models in this spec.
  Use one model. Replace it later if measurements improve.
- No model training or fine-tuning.
- The app does not separate stems into more than four categories.
  It does not split the "other" stem into "piano" and "guitar".

## Open Questions

- **Model size vs quality:** Compare HTDemucs base (~80 MB INT8) with a smaller
  distilled variant (~30 MB). Check the audible quality difference on typical
  sample-pack material. Loops and one-shots are simple. Full mixes are harder.
  This question needs a listening spike.
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
- **Integration with spec-015 embeddings:** should the pipeline compute stem embeddings
  eagerly (immediately after separation) or lazily (next background re-index)?
  Eager gives immediate "find similar" on stems. Lazy avoids blocking the user.
- **Memory pressure on low-end devices:** Inference can use 1 GB peak memory.
  This use can overload a 4 GB RAM device when a browser uses 1-2 GB.
  Can a smaller chunk size trade throughput for memory?

## References

- Hybrid Transformer Demucs (HTDemucs) — <https://github.com/facebookresearch/demucs>
- ONNX Runtime Web (WebGPU + WASM backends) — <https://onnxruntime.ai/docs/get-started/with-javascript/web.html>
- MUSDB18 benchmark (standard evaluation for source separation) — <https://sigsep.github.io/datasets/musdb.html>
- Overlap-add reconstruction — standard DSP technique for stitching
  chunk-processed audio without discontinuities.
- spec-009 (Time-Stretching) — offline rendering prior art.
  Spec-009 AC-008 prohibits a precomputed buffer longer than its audible
  content. This spec uses a separate chunked offline design.
- spec-015 (Local Semantic Audio Search) — ONNX Runtime Web infrastructure
  and embedding pipeline this spec shares.
