# Spec 013 — Sample Folder Builder (archive.org)

**Spec Validation Status:** STUB — NOT VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-003 (Folder & Session Management), spec-004 (Sample Library),
web-first architecture (landed 2026-07-03 — Sample Folder is a persisted
`FileSystemDirectoryHandle`)

## Objective

Let a user who has no samples build a real Sample Folder from inside MixJam by
searching archive.org's public-domain and Creative Commons audio collections
and downloading selected items directly into their Sample Folder. This is the
onboarding path for new users: MixJam has no demo mode, and without a Sample
Folder the tracker is inaccessible — this feature turns "I have no samples"
into a five-minute fix instead of a dead end.

Once samples are indexed, the same infrastructure powers **local semantic audio
search** — find samples by how they sound, not by filename. An embedding model
runs during indexing (WebGPU-accelerated, entirely local) so users can type
"warm analog bass" or click "find similar" on any sample and get
cosine-similarity-ranked results from their own library. No audio ever leaves
the machine.

## User Stories

- **US-001:** As a user with an empty Sample Folder, I can search archive.org
  audio from inside MixJam without leaving the app.
- **US-002:** As a user, I can preview a result before deciding to download it.
- **US-003:** As a user, I can download selected files into my Sample Folder
  and see them appear in the sample browser after a rescan.
- **US-004:** As a user, I can see the license of every item before I download
  it, so I know what I'm allowed to do with it.
- **US-005:** As a user, I see download progress and can cancel pending
  downloads.
- **US-006:** As a user with an indexed Sample Folder, I can type a
  descriptive phrase (e.g. "dark ambient pad", "crisp hi-hat") into the
  sample browser search bar and get results ranked by how they sound,
  regardless of filename or folder.
- **US-007:** As a user, I can click "Find similar" on any sample in my
  library and see the most sonically similar samples, without typing a query.

## Scope (high-level — to be validated)

### Discovery

- Search backed by the archive.org Advanced Search API (`mediatype:audio`),
  scoped to a curated set of collections known to hold usable material
  (e.g. `opensource_audio`, netlabels, 78rpm/Great 78 Project).
- Results show title, collection, duration where available, and license.

### Download

- Selected files are written into the Sample Folder via the granted
  `FileSystemDirectoryHandle` (`createWritable()`), under a dedicated
  top-level subfolder (e.g. `archive.org/<item>/…`) so the existing
  folder-to-category mapping (spec-004) files them automatically.
- A completed download batch triggers (or prompts for) a library rescan.
- License/attribution metadata is preserved (e.g. a sidecar `.json` or
  `ATTRIBUTION.txt` per item).

### Access gating and write permission (decided 2026-07-03)

- Entry point appears on the Home Screen when a Sample Folder is configured
  but empty (or from the sample browser at any time).
- The Sample Folder stays **read-only** in normal use (spec-003 picks it with
  mode `'read'`). Write access is an **upgrade on demand**: when the builder
  starts a download batch, it calls `requestPermission({ mode: 'readwrite' })`
  on the existing Sample Folder handle from the user gesture — one extra
  prompt in the browser host, auto-granted in the Electron shell. The upgrade
  is not persisted as the folder's default role; day-to-day scanning and
  playback continue to require only read access.
- The feature never writes anywhere other than the Sample Folder's
  `archive.org/` subtree.

### Local Semantic Audio Search

- During the existing Phase 2 indexing scan, compute a compact audio embedding
  vector for every sample using a quantized CLAP-style (Contrastive
  Language-Audio Pretraining) model running entirely locally via ONNX Runtime
  Web with WebGPU acceleration. Store the embedding as a float32 blob in the
  SQLite-WASM `samples` table (`embedding BLOB` column, 512-dim float32,
  approximate size 2 KB per sample).
- The embedding model (~150 MB quantized ONNX) is lazy-loaded in the backend
  Web Worker alongside `music-metadata`. It is only loaded when the indexer
  reaches Phase 2 (metadata extraction). Indexing without a GPU falls back to
  CPU WASM inference with acceptable throughput for modest libraries.
- **Semantic text search:** the sample browser search bar accepts natural
  language queries. The query text is encoded through the CLAP text encoder to
  produce a query embedding, then cosine similarity against all stored sample
  embeddings is computed in SQLite (a registered `cosine_similarity` scalar
  function). Results are returned ranked by similarity, combined with the
  existing FTS5 keyword search as a hybrid score or as a separate search mode
  toggle.
- **"Find similar" search:** on any sample, encode its audio embedding as the
  query vector and run the same cosine-similarity ranking, excluding the
  source sample.
- Embedding computation slots into the existing Phase 2 concurrency-4 pool
  (`PHASE2_CONCURRENCY` in `src/renderer/src/backend/indexer.ts`) — the ONNX
  inference runs in the same backend worker, interleaved with `music-metadata`
  parsing so the batch pipeline stays single-threaded per file with no
  coordination overhead.
- **Privacy:** no audio data or embeddings leave the user's machine. The model
  and inference run entirely inside the Web Worker. This is a product
  differentiator — competing sample managers (Splice, Loopcloud) require cloud
  upload for audio similarity search.
- **Storage cost:** 2 KB per sample for a 512-dim float32 embedding. A 50,000
  sample library uses approximately 100 MB of additional OPFS storage. The
  index is always rebuildable by rescan, so embedding storage is treated as
  cache (no migration burden).
- **Search UX:** the sample browser search bar gains a mode toggle —
  "Keywords" (FTS5, existing behavior) and "Semantic" (embedding search). The
  "Find similar" affordance appears in the sample context menu and the sample
  detail panel. Both are gated on embeddings being present in the database
  (graceful degradation for libraries indexed before this feature lands — a
  background re-index computes missing embeddings).

## Acceptance Criteria (draft)

- [ ] **AC-001:** Searching a known term returns archive.org audio results with license shown per item.
- [ ] **AC-002:** Downloading a result produces a real audio file inside the Sample Folder under the `archive.org/` subtree.
- [ ] **AC-003:** After download + rescan, the new samples appear in the browser with a category derived from their subfolder.
- [ ] **AC-004:** Cancelling an in-flight download leaves no partial file in the Sample Folder.
- [ ] **AC-005:** The feature is unreachable without a writable Sample Folder handle.
- [ ] **AC-006:** Semantic search returns cosine-similarity-ranked results for natural-language queries; results are deterministically ordered for the same query and DB state.
- [ ] **AC-007:** "Find similar" on a sample returns the top-N most similar samples excluding itself; the source sample ranks first (similarity 1.0) when the full library is inspected in a test assertion.
- [ ] **AC-008:** A library indexed before embedding support is available shows a "compute embeddings" prompt or re-index affordance;
semantic search is gracefully disabled (not broken) until embeddings exist.

## Non-Goals

- No sources other than archive.org (no Freesound, no YouTube ripping, no
  arbitrary URLs).
- No uploading or publishing back to archive.org.
- No in-app license filtering beyond displaying each item's license (v1 does
  not attempt legal interpretation).
- No automatic sample chopping/trimming of downloaded material — files land
  as-is; editing is out of scope.
- No bundled/curated starter pack shipped with the app (that would be demo
  mode by another name).

## Open Questions

- Preview before download: stream directly from archive.org (CORS permitting)
  or download-then-audition? Needs a CORS spike against real collection URLs.
- Curated collection list: which collections, and is the list hardcoded or
  remotely updatable?
- Format handling: many archive.org items are FLAC/OGG/78rpm MP3 — download
  as-is and rely on browser decode support, or transcode? (`AUDIO_EXTENSIONS`
  in `src/renderer/src/backend/indexer.ts` defines what the indexer accepts
  today.)
- Rate limiting / politeness: max concurrent downloads and item-size caps.
- CLAP model selection: which pretrained CLAP checkpoint, and what quantization
  level (INT8 vs FP16) balances embedding quality against model size and
  inference latency in WebGPU? Needs a spike comparing LAION-CLAP,
  MS-CLAP, and WavCaps-derived checkpoints on music/sample retrieval tasks.
- Embedding dimension trade-off: 512-dim vs 1024-dim — storage cost vs
  retrieval quality. Start with 512-dim and measure.
- ONNX Runtime Web + WebGPU fallback: what is the CPU-WASM throughput on a
  typical 2020 laptop without WebGPU? Does it still complete indexing within
  acceptable wall-clock time for a 10k sample library?
- Cosine similarity in SQLite: register a custom scalar function (sqlite-wasm
  supports C-callable function registration) vs compute in JS after fetching
  candidate rows. The SQLite-registered approach keeps the ranking inside the
  database and avoids shipping large result sets to JS, but needs a spike to
  confirm the registration API works in the WASM build.

## References

- archive.org Advanced Search API — <https://archive.org/advancedsearch.php>
- archive.org developer portal (metadata & download endpoints) — <https://archive.org/developers/>
- Web-first architecture — [docs/architecture.md](../architecture.md) (the original
  handoff lived in machine-local `tmp/`, not tracked in the repo)
- ONNX Runtime Web (WebGPU backend) — <https://onnxruntime.ai/docs/get-started/with-javascript/web.html>
- LAION-CLAP: Contrastive Language-Audio Pretraining — <https://github.com/LAION-AI/CLAP>
- MS-CLAP (Microsoft CLAP, strong music retrieval benchmark) — <https://github.com/microsoft/CLAP>
- sqlite-wasm custom function registration — <https://sqlite.org/wasm/doc/trunk/api-custom.md>
