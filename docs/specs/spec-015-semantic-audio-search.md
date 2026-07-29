# Spec 015 — Local Semantic Audio Search

**Spec Validation Status:** STUB — NOT VALIDATED

**Spec Implementation Status:** NOT IMPLEMENTED

**Depends on:** spec-004 (Sample Library browser, search, `rule_json` query
engine), Electron renderer architecture (backend worker owns the database)

This spec owns the `similarTo` query predicate, zero-shot tag suggestions, and
all CLAP-model-dependent behavior. Deterministic key/BPM compatibility is
[spec-014](spec-014-musical-compatibility.md). Organizational tags are
owned by [spec-004](spec-004-sample-library.md), while the heuristic analyzer
in [spec-008](spec-008-sample-analysis.md) owns acoustic sample type.

## Objective

Find samples by how they sound, not by filename.
An embedding model runs entirely on the local device.
It uses WebGPU acceleration with a CPU-WASM fallback.
Users can enter "warm analog bass" or select "Find similar" on a sample.
They can save a similarity-based library or accept suggested tags.

No audio or embeddings leave the device. The accepted Chromium-only,
backend-worker architecture keeps this processing local.

A library is a saved query, so similarity is not only a search mode.
A `similarTo` predicate in `rule_json` defines a maximum distance from a
reference. This predicate creates a living library that includes newly
indexed samples.

## User Stories

- **US-001:** As a user with an indexed Sample Folder, I enter a descriptive
  phrase in semantic search. Examples include "dark ambient pad" and "crisp hi-hat."
  Results rank by sound, regardless of filename or folder.
- **US-002:** As a user, I can select "Find similar" on any library sample.
  I see the most sonically similar samples without a text query.
- **US-003:** As a user, I save a "sounds like this" filter as a library.
  The library includes similar samples that the app indexes later.
- **US-004:** As a user, I can review and accept suggested tags for my
  samples (e.g. "kick", "vocal", "lofi") produced by zero-shot
  classification, instead of tagging thousands of files by hand.
- **US-005:** As a user with an older library, I can start embedding
  computation from a visible control. Until then, the app disables semantic
  features without errors.
- **US-006:** As a user without WebGPU, everything still works via CPU
  inference — slower, but correct and non-blocking.

## Scope (high-level, validation pending)

### Embedding pipeline

- During indexing, compute one compact audio embedding vector for each sample.
  Use a quantized CLAP-style (Contrastive Language-Audio Pretraining) model
  through ONNX Runtime Web. Prefer WebGPU and use CPU-WASM as the fallback.
- Store the embedding as a float32 blob on the `samples` row (`embedding
  BLOB` column, 512-dim float32, ~2 KB per sample). ~100 MB of OPFS for a
  50k-sample library. Always rebuildable by rescan, so treated as cache (no
  migration burden).
- The app loads the model (~150 MB quantized ONNX) on first need. The app binary
  does not include it. Delivery follows the same static-asset
  pattern as spec-016's separation model (`app://` in the shell, HTTPS fetch
  cached in renderer OPFS).
- **Worker placement:** inference runs in a dedicated inference worker that
  the backend worker owns. The inference worker returns embedding results for
  batched database writes. Only the backend worker accesses the database.
  Model execution does not share one thread with Phase 2 metadata parsing or
  indexer transactions. Spec-016 shares this worker and the
  ONNX runtime instance.
- Embedding computation is a separate future phase after the existing metadata
  and sample-analysis work. The team must validate its exact order before
  implementation. Samples with `scan_state = 1` and NULL embedding form its
  resumable work queue, and it reports its own progress.

### Semantic text search

- The sample browser search bar gains a mode toggle: "Keywords" (FTS5,
  existing behavior) and "Semantic". In semantic mode the query text is
  encoded through the CLAP text encoder. Cosine similarity against stored
  embeddings ranks results.
- Ranking runs inside SQLite through a registered `cosine_similarity` scalar
  function. Sqlite-wasm supports function registration, but this design needs
  a spike. Windowed paging continues to work. The UI never receives a full
  result set, per the existing hard rule. JS-side scoring over candidate rows is the
  fallback design if registration proves unworkable.
- Hybrid keyword+semantic scoring is out of scope for v1 (mode toggle only).

### "Find similar"

- The context menu and detail panel show this action for each embedded sample.
  Use its stored embedding as the query vector.
  Rank by cosine similarity and exclude the source sample.

### `similarTo` query predicate (additive `rule_json` leaf, version stays 1)

```jsonc
{ "kind": "similarTo", "sampleId": 123, "maxDistance": 0.35 }
```

- Compiles to a parameterized threshold condition with the same
  `cosine_similarity` function. The compiler finds the reference embedding
  and binds it as a parameter. The JSON does not store the embedding.
- A threshold (not top-N) keeps the leaf a pure `WHERE` predicate composable
  with every other leaf under AND/OR/NOT. Similarity *ordering* remains a
  browser sort mode, orthogonal to filtering.
- If the reference sample is missing or soft-deleted, the leaf matches nothing.
  The library shows the broken reference. The exact control needs validation.

### Zero-shot tag suggestions

- The CLAP text encoder encodes a curated label set once. Examples include kick,
  snare, hi-hat, bass, pad, vocal, fx, and loop. Each sample's embedding is
  scored against it and labels above a confidence threshold become *pending
  tag suggestions*.
- Suggestions surface in the manage panel (and sample detail) for one-click
  accept/reject. Accepted suggestions become ordinary rows in `tags` /
  `sample_tags`. The app never assigns a suggestion without confirmation in v1.
- This spec never writes folder-derived tag provenance. Spec-004 owns the flat
  folder-derived and user-managed tag model. Spec-008's heuristic classifier writes `sample_type`, not tags.
  Suggestions here remain tags only.

### Degradation and gating

- Existing embeddings gate all semantic affordances. Libraries
  indexed before this feature show a "compute embeddings" affordance that
  runs the backfill phase.
- Without WebGPU, the inference worker uses CPU-WASM. Indexing remains interruptible
  and the UI stays responsive (the inference worker is not the DB worker).

## Acceptance Criteria (draft)

- [ ] **AC-001:** Semantic search returns cosine-similarity-ranked results
  for natural-language queries. The engine orders results deterministically for
  the same query and DB state.
- [ ] **AC-002:** "Find similar" on a sample returns the top-N most similar
  samples excluding itself. The source sample ranks first (similarity 1.0)
  when a test inspects the full library.
- [ ] **AC-003:** Save a library with a `similarTo` leaf.
  After embedding computation, it includes a newly indexed similar sample.
  The library needs no edit.
- [ ] **AC-004:** A `similarTo` leaf composes with other leaves (e.g. AND
  with `ext` and `bpm`) in one compiled parameterized query.
- [ ] **AC-005:** A library indexed before embedding support shows a
  "compute embeddings" affordance. The app disables semantic search without
  errors until embeddings exist.
- [ ] **AC-006:** Tag suggestions appear for a sample whose content matches a
  curated label. Accepting one creates a normal tag assignment. Rejecting one
  removes the suggestion without side effects.
- [ ] **AC-007:** The app writes no suggested tag without explicit user
  acceptance. This feature never changes folder-derived assignments.
- [ ] **AC-008:** Without WebGPU, CPU-WASM completes embedding computation.
  The UI stays responsive. Inference causes no long backend-worker task.
- [ ] **AC-009:** Delete the reference sample of a `similarTo` library.
  It shows an empty result and a broken-reference indication, not an error.

## Non-Goals

- No cloud inference, telemetry, or upload of any audio-derived data.
- No automatic folder-tag assignment (spec-004 owns folder-derived tags).
- No hybrid FTS+semantic scoring in v1 (separate modes only).
- No duplicate detection / near-duplicate clustering (a future use of the
  same embeddings).
- No user-supplied custom models or label sets in v1.
- No stem embeddings — spec-016 specifies when and how the app embeds stems
  using this pipeline.

## Open Questions

- Select the CLAP checkpoint and INT8 or FP16 quantization level.
  Balance embedding quality, model size, and WebGPU latency.
  A spike must compare LAION-CLAP, MS-CLAP,
  and WavCaps-derived checkpoints on music/sample retrieval tasks.
- Embedding dimension trade-off: 512-dim vs 1024-dim — storage cost vs
  retrieval quality. Start with 512-dim and measure.
- ONNX Runtime Web + WebGPU fallback: what is the CPU-WASM throughput on a
  typical 2020 laptop without WebGPU? Does it still complete indexing within
  acceptable wall-clock time for a 10k sample library?
- Cosine similarity in SQLite: confirm scalar-function registration works in
  the sqlite-wasm build and measure per-row cost at 100k rows. Decide the
  JS-side fallback shape if not.
- Long samples: select head-only, window-average, or multiple embeddings.
  CLAP encoders use fixed windows of approximately 10 seconds. The choice affects
  loops vs one-shots differently.
- Decode path for embedding input: compare inference-worker WAV parsing with
  WebCodecs for compressed formats. `AUDIO_EXTENSIONS` includes mp3, flac,
  ogg, and aiff. The audio engine decode path uses the main thread, so this
  feature cannot use it.
- `maxDistance` UX: raw cosine distance is meaningless to users — expose a
  labeled scale (tight/loose) mapped to calibrated thresholds?
- Suggestion threshold and label-set curation: fixed defaults or
  per-library tuning after a precision pass on `tmp/test-samples`?

## References

- ONNX Runtime Web (WebGPU backend) — <https://onnxruntime.ai/docs/get-started/with-javascript/web.html>
- LAION-CLAP: Contrastive Language-Audio Pretraining — <https://github.com/LAION-AI/CLAP>
- MS-CLAP (Microsoft CLAP, strong music retrieval benchmark) — <https://github.com/microsoft/CLAP>
- sqlite-wasm custom function registration — <https://sqlite.org/wasm/doc/trunk/api-custom.md>
- `rule_json` format and versioning — [docs/query-schema.md](../query-schema.md)
- Indexing phases — [docs/indexing.md](../indexing.md)
- Shared ONNX infrastructure consumer — [spec-016](spec-016-stem-separation.md)
