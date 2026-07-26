// Analysis provenance, named once.
//
// Every analysis-owned field on `samples` is stored beside a `*_source` column.
// A value written by the user is `'manual'` and is authoritative: no analyzer
// pass may overwrite it. That rule used to be spelled out longhand at every
// call site, so a new query could silently disagree with the others and quietly
// destroy a user's edit. These builders are the single statement of it.
//
// See docs/data-model.md "analysis provenance is stored per field".

/** Analysis-owned fields that carry a provenance column. */
export const PROVENANCE_FIELDS = ['bpm', 'musical_key', 'sample_type'] as const

export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number]

/** How a stored value got there. */
export type AnalysisSource = 'analysis' | 'manual'

function sourceColumn(field: ProvenanceField): string {
  return `${field}_source`
}

/**
 * True for rows where analysis still owns `field` — i.e. the user has not
 * pinned it. Use this to decide whether a row may be rewritten.
 */
export function analysisOwnsFieldSql(field: ProvenanceField): string {
  return `COALESCE(${sourceColumn(field)}, '') != 'manual'`
}

/**
 * True for rows where at least one analysis-owned field is still unpinned, so
 * the row is worth re-analyzing. A row whose every field is manual is done.
 */
export function analysisOwnsAnyFieldSql(
  fields: readonly ProvenanceField[] = PROVENANCE_FIELDS
): string {
  return fields.map(analysisOwnsFieldSql).join(' OR ')
}

/**
 * `SET` fragment that writes `field` and its source column only when analysis
 * still owns them, leaving a manual value untouched. Expects two bound
 * parameters, both the incoming value: the first is stored, the second decides
 * whether the source becomes `'analysis'` or `NULL`.
 */
export function assignAnalyzedFieldSql(field: ProvenanceField): string {
  const owns = analysisOwnsFieldSql(field)
  return `${field} = CASE WHEN ${owns} THEN ? ELSE ${field} END,
       ${sourceColumn(field)} = CASE WHEN ${owns}
         THEN CASE WHEN ? IS NULL THEN NULL ELSE 'analysis' END
         ELSE ${sourceColumn(field)} END`
}

/**
 * True when writing `value` to `field` would actually change the row — an
 * analysis-owned field whose stored value differs. Used to skip no-op writes.
 * Expects one bound parameter: the incoming value.
 */
export function analyzedFieldChangesSql(field: ProvenanceField): string {
  return `(${analysisOwnsFieldSql(field)} AND NOT (${field} IS ?))`
}

/**
 * `SET` fragment that clears `field` and its source column unless the user
 * pinned the value. Used when a file's metadata becomes unreadable: the
 * derived analysis is no longer trustworthy, but a manual value still stands.
 * Takes no bound parameters.
 */
export function clearAnalyzedFieldSql(field: ProvenanceField): string {
  const owns = analysisOwnsFieldSql(field)
  return `${field} = CASE WHEN ${owns} THEN NULL ELSE ${field} END,
       ${sourceColumn(field)} = CASE WHEN ${owns} THEN NULL ELSE ${sourceColumn(field)} END`
}
