import baseline from './generator-reference-metrics.json'
import { ENVELOPE_MEASURES } from './generator-envelope'
import type { MixJamMetrics } from './mixjam-metrics'

// The normative baseline for the occupancy envelope: distilled metrics for the
// hand-authored reference projects. Per spec-021 the `.mixjam` originals stay
// out of version control, so this file must carry enough detail — per-lane gain,
// pan, sends, occupancy, entries, span histogram, plus the full density curve —
// that a new measure rarely needs the originals back.

export const REFERENCE_METRICS_PATH = 'src/shared/generator-reference-metrics.json'

export interface ReferenceBaseline {
  generatedFrom: readonly string[]
  projects: Readonly<Record<string, MixJamMetrics>>
}

export function loadReferenceBaseline(): ReferenceBaseline {
  return baseline as unknown as ReferenceBaseline
}

export interface ReferenceRange {
  min: number
  max: number
}

/**
 * The observed spread of one envelope measure across the reference library.
 * `--baseline` reports distance from this range rather than a pass/fail, so a
 * generated project can be read as "denser than any reference" instead of just
 * "out of target".
 */
export function referenceRange(baseline: ReferenceBaseline, measureId: string): ReferenceRange | null {
  const measure = ENVELOPE_MEASURES.find((candidate) => candidate.id === measureId)
  const projects = Object.values(baseline.projects)
  if (!measure || projects.length === 0) return null
  const values = projects.map((metrics) => measure.value(metrics))
  return { min: Math.min(...values), max: Math.max(...values) }
}
