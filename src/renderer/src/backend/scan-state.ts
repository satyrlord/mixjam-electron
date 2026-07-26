// The integers are the persisted encoding (see docs/data-model.md); this module
// owns them and the SQL predicates that read the column, so queries share one
// meaning for live rows.

/** Persisted `samples.scan_state` codes. */
export const SCAN_STATE = {
  /** Row exists from the directory walk; metadata has not been read yet. */
  STUB: 0,
  /** Metadata was read successfully. The row is complete and usable. */
  METADATA_READY: 1,
  /** The file was absent on the last scan (soft delete). */
  MISSING: 2,
  /** The file exists but its metadata could not be parsed. */
  METADATA_UNAVAILABLE: 3
} as const

/**
 * Rows whose metadata is complete. Analysis, the generator, and evidence
 * listing all mean this when they say "usable sample".
 */
export const SCAN_STATE_READY_SQL = `scan_state = ${SCAN_STATE.METADATA_READY}`

/**
 * Rows not soft-deleted. Browsing and tag projection mean this when they say
 * "present sample" — it includes stubs and unparseable files, which still exist
 * on disk and still belong in the library.
 */
export const SCAN_STATE_PRESENT_SQL = `scan_state != ${SCAN_STATE.MISSING}`
