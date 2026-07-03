# Spec 015 — Local Semantic Audio Search

**Spec Validation Status:** STUB — NOT VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-004 (Sample Library — browser, search, `rule_json` query
engine), web-first architecture (backend worker owns the database)

> Moved out of spec-013 (Sample Folder Builder) on 2026-07-03 and extended
> with the `similarTo` query predicate and zero-shot tag suggestions. This
> spec owns everything CLAP-model-dependent; deterministic key/BPM
> compatibility is [spec-014](spec-014-musical-compatibility.md), and the
> heuristic analyzer that owns primary categories is
> [spec-008](spec-008-sample-analysis.md).

## Objective

Find samples by how they sound, not by filename. An embedding model runs
entirely locally (WebGPU-accelerated, CPU-WASM fallback) so users can type
"warm analog bass", click "Find similar" on any sample, save a
similarity-based library, or accept suggested tags — with no audio or
embeddings ever leaving the machine. Competing sample managers (Splice,
Loopcloud) require cloud upload for audio similarity; running it in a stock
browser tab is the differentiator, and it is exactly what the accepted
Chromium-only, backend-worker architecture makes possible.

Because a library is a saved query, similarity is not just a search mode: a
`similarTo` predicate in `rule_json` makes "everything within distance X of
this reference" a living library that updates as new samples are indexed.

## User Stories

- **US-001:** As a user with an indexed Sample Folder, I can type a
  descriptive phrase (e.g. "dark ambient pad", "crisp hi-hat") into the
  sample browser search bar and get results ranked by how they sound,
  regardless of filename or folder.
- **US-002:** As a user, I can click "Find similar" on any sample in my
  library and see the most sonically similar samples, without typing a query.
- **US-003:** As a user, I can save a "sounds like this" filter as a library
  that automatically includes similar samples indexed later.
- **US-004:** As a user, I can review and accept suggested tags for my
  samples (e.g. "kick", "vocal", "lofi") produced by zero-shot
  classification, instead of tagging thousands of files by hand.
- **US-005:** As a user with a library indexed before this feature existed, I
  can trigger embedding computation from a visible affordance; until then,
  semantic features are disabled gracefully, not broken.
- **US-006:** As a user without WebGPU, everything still works via CPU
  inference — slower, but correct and non-blocking.

## Scope (high-level — to be validated)

### Embedding pipeline

- During indexing, compute a compact audio embedding vector per sample using
  a quantized CLAP-style (Contrastive Language-Audio Pretraining) model via
  ONNX Runtime Web, WebGPU execution provider preferred, CPU-WASM fallback.
- Store the embedding as a float32 blob on the `samples` row (`embedding
  BLOB` column, 512-dim float32, ~2 KB per sample). ~100 MB of OPFS for a
  50k-sample library; always rebuildable by rescan, so treated as cache (no
  migration burden).
- The model (~150 MB quantized ONNX) is lazy-loaded on first need, never
  bundled with the app binary. Delivery follows the same static-asset
  pattern as spec-016's separation model (`app://` in the shell, HTTPS fetch
  cached in OPFS in the browser).
- **Worker placement:** inference runs in a dedicated inference worker owned
  by the backend worker, which posts embedding results back for batched DB
  writes — DB access stays exclusively in the backend worker (hard rule),
  and model execution never serializes against Phase 2 metadata parsing and
  indexer transactions on one thread. Spec-016 shares this worker and the
  ONNX runtime instance.
- Embedding computation is a third indexing phase: after Phase 2 completes
  for a batch, samples with `scan_state = 1` and NULL embedding are queued.
  Progress is reported like scan progress; interruption resumes on next
  index (NULL embedding is the work queue).

### Semantic text search

- The sample browser search bar gains a mode toggle: "Keywords" (FTS5,
  existing behavior) and "Semantic". In semantic mode the query text is
  encoded through the CLAP text encoder; cosine similarity against stored
  embeddings ranks results.
- Ranking runs inside SQLite via a registered `cosine_similarity` scalar
  function (sqlite-wasm supports function registration; needs a spike) so
  windowed paging keeps working — the UI never receives a full result set,
  per the existing hard rule. JS-side scoring over candidate rows is the
  fallback design if registration proves unworkable.
- Hybrid keyword+semantic scoring is out of scope for v1 (mode toggle only).

### "Find similar"

- Context-menu and detail-panel action on any embedded sample: use its stored
  embedding as the query vector, rank by cosine similarity, exclude the
  source sample.

### `similarTo` query predicate (additive `rule_json` leaf, version stays 1)

```jsonc
{ "kind": "similarTo", "sampleId": 123, "maxDistance": 0.35 }
```

- Compiles to a parameterized threshold condition using the same
  `cosine_similarity` function, with the reference embedding bound as a
  parameter (looked up at compile time, not stored in the JSON).
- A threshold (not top-N) keeps the leaf a pure `WHERE` predicate composable
  with every other leaf under AND/OR/NOT; similarity *ordering* remains a
  browser sort mode, orthogonal to filtering.
- If the reference sample is missing or soft-deleted, the leaf matches
  nothing and the library UI surfaces the broken reference (exact affordance
  to be validated).

### Zero-shot tag suggestions

- A curated label set (e.g. kick, snare, hi-hat, bass, pad, vocal, fx, loop)
  is encoded once through the CLAP text encoder; each sample's embedding is
  scored against it and labels above a confidence threshold become *pending
  tag suggestions*.
- Suggestions surface in the manage panel (and sample detail) for one-click
  accept/reject; accepted suggestions become ordinary rows in `tags` /
  `sample_tags`. Nothing is auto-assigned without confirmation in v1.
- This spec never writes `samples.category_id` — the primary category
  belongs to spec-008's heuristic classifier and the folder-derived mapping.
  Spec-008's "no ML classification" non-goal stands for categories;
  suggestions here are tags only.

### Degradation and gating

- All semantic affordances are gated on embeddings existing; libraries
  indexed before this feature show a "compute embeddings" affordance that
  runs the backfill phase.
- Without WebGPU, CPU-WASM inference is used; indexing remains interruptible
  and the UI stays responsive (the inference worker is not the DB worker).

## Acceptance Criteria (draft)

- [ ] **AC-001:** Semantic search returns cosine-similarity-ranked results
  for natural-language queries; results are deterministically ordered for the
  same query and DB state.
- [ ] **AC-002:** "Find similar" on a sample returns the top-N most similar
  samples excluding itself; the source sample ranks first (similarity 1.0)
  when the full library is inspected in a test assertion.
- [ ] **AC-003:** A library saved with a `similarTo` leaf includes a newly
  indexed similar sample after its embedding is computed, with no edit to the
  library.
- [ ] **AC-004:** A `similarTo` leaf composes with other leaves (e.g. AND
  with `ext` and `bpm`) in one compiled parameterized query.
- [ ] **AC-005:** A library indexed before embedding support shows a
  "compute embeddings" affordance; semantic search is gracefully disabled
  (not broken) until embeddings exist.
- [ ] **AC-006:** Tag suggestions appear for a sample whose content matches a
  curated label; accepting one creates a normal tag assignment; rejecting one
  removes the suggestion without side effects.
- [ ] **AC-007:** No tag or category is ever written without explicit user
  acceptance; `samples.category_id` is never touched by this feature.
- [ ] **AC-008:** With WebGPU unavailable, embedding computation completes
  via CPU-WASM and the UI remains responsive throughout (no long tasks on
  the backend worker attributable to inference).
- [ ] **AC-009:** Deleting the reference sample of a `similarTo` library
  yields an empty result plus a visible broken-reference indication, not an
  error state.

## Non-Goals

- No cloud inference, telemetry, or upload of any audio-derived data.
- No automatic primary-category assignment (spec-008 owns categories).
- No hybrid FTS+semantic scoring in v1 (separate modes only).
- No duplicate detection / near-duplicate clustering (a future use of the
  same embeddings).
- No user-supplied custom models or label sets in v1.
- No stem embeddings — spec-016 specifies when and how stems are embedded
  using this pipeline.

## Open Questions

- CLAP model selection: which pretrained checkpoint, and what quantization
  level (INT8 vs FP16) balances embedding quality against model size and
  inference latency in WebGPU? Needs a spike comparing LAION-CLAP, MS-CLAP,
  and WavCaps-derived checkpoints on music/sample retrieval tasks.
- Embedding dimension trade-off: 512-dim vs 1024-dim — storage cost vs
  retrieval quality. Start with 512-dim and measure.
- ONNX Runtime Web + WebGPU fallback: what is the CPU-WASM throughput on a
  typical 2020 laptop without WebGPU? Does it still complete indexing within
  acceptable wall-clock time for a 10k sample library?
- Cosine similarity in SQLite: confirm scalar-function registration works in
  the sqlite-wasm build and measure per-row cost at 100k rows; decide the
  JS-side fallback shape if not.
- Long samples: CLAP encoders take fixed-length windows (~10 s) — embed the
  head, an average over windows, or multiple embeddings per sample? Affects
  loops vs one-shots differently.
- Decode path for embedding input: reuse WAV parsing in the inference worker
  vs WebCodecs for compressed formats (`AUDIO_EXTENSIONS` includes mp3, flac,
  ogg, aiff) — the audio engine's decode path lives on the main thread and
  cannot be used here.
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
