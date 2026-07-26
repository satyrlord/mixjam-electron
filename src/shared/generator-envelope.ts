import type { MixJamMetrics } from './mixjam-metrics'

// The occupancy envelope: the machine-checkable shape of an arrangement that
// measures like the hand-authored reference library. Per spec-021 this is a
// *report*, never a throw — `createMixJamGeneratorPlan` hard-fails only on
// structural invariants. Enforcing an aesthetic target inside planning is what
// grew the repair passes that manufacture a wall of sound.

export interface EnvelopeMeasure {
  id: string
  label: string
  /** Human-readable target, shown verbatim in the audit report. */
  target: string
  /** The measured value, formatted for the report. */
  format: (metrics: MixJamMetrics) => string
  /** The measured value as a number, for baseline distance reporting. */
  value: (metrics: MixJamMetrics) => number
  accept: (metrics: MixJamMetrics) => boolean
}

const percent = (value: number): string => `${Math.round(value * 100)}%`

export const ENVELOPE_MEASURES: readonly EnvelopeMeasure[] = [
  {
    id: 'populatedLanes',
    label: 'Populated lanes',
    target: '12–18',
    format: (metrics) => String(metrics.populatedLanes),
    value: (metrics) => metrics.populatedLanes,
    accept: (metrics) => metrics.populatedLanes >= 12 && metrics.populatedLanes <= 18
  },
  {
    id: 'bars',
    label: 'Bars',
    target: 'multiple of 8, 96–160',
    format: (metrics) => String(metrics.bars),
    value: (metrics) => metrics.bars,
    accept: (metrics) => metrics.bars % 8 === 0 && metrics.bars >= 96 && metrics.bars <= 160
  },
  {
    id: 'distinctSamples',
    label: 'Distinct samples',
    target: '24–40',
    format: (metrics) => String(metrics.distinctSamples),
    value: (metrics) => metrics.distinctSamples,
    accept: (metrics) => metrics.distinctSamples >= 24 && metrics.distinctSamples <= 40
  },
  {
    id: 'distinctPerLane',
    label: 'Distinct samples / lane',
    target: 'max ≤ 6, median 1–3',
    format: (metrics) => `median ${metrics.distinctSamplesPerLaneMedian}, max ${metrics.distinctSamplesPerLaneMax}`,
    value: (metrics) => metrics.distinctSamplesPerLaneMedian,
    accept: (metrics) => metrics.distinctSamplesPerLaneMax <= 6 &&
      metrics.distinctSamplesPerLaneMedian >= 1 && metrics.distinctSamplesPerLaneMedian <= 3
  },
  {
    id: 'meanOccupancy',
    label: 'Mean lane occupancy',
    target: '30–55%',
    format: (metrics) => percent(metrics.meanOccupancy),
    value: (metrics) => metrics.meanOccupancy,
    accept: (metrics) => metrics.meanOccupancy >= 0.3 && metrics.meanOccupancy <= 0.55
  },
  {
    id: 'lanesAbove90',
    label: 'Lanes above 90% occupancy',
    target: '0',
    format: (metrics) => String(metrics.lanesAbove90),
    value: (metrics) => metrics.lanesAbove90,
    accept: (metrics) => metrics.lanesAbove90 === 0
  },
  {
    id: 'lanesBelow50',
    label: 'Lanes below 50% occupancy',
    target: '≥ 30% of lanes',
    format: (metrics) => percent(metrics.lanesBelow50Share),
    value: (metrics) => metrics.lanesBelow50Share,
    accept: (metrics) => metrics.lanesBelow50Share >= 0.3
  },
  {
    id: 'meanEntries',
    label: 'Entries per lane (mean)',
    target: '3–8',
    format: (metrics) => metrics.meanEntries.toFixed(1),
    value: (metrics) => metrics.meanEntries,
    accept: (metrics) => metrics.meanEntries >= 3 && metrics.meanEntries <= 8
  },
  {
    id: 'densityMinimum',
    label: 'Density curve minimum',
    target: '≤ 20% of peak',
    format: (metrics) => `${metrics.densityMin} of ${metrics.densityPeak}`,
    value: (metrics) => metrics.densityPeak === 0 ? 0 : metrics.densityMin / metrics.densityPeak,
    accept: (metrics) => metrics.densityMin <= 0.2 * metrics.densityPeak
  },
  {
    id: 'quietStretch',
    label: 'Quiet stretch at ≤ 45% of sustained peak',
    target: '≥ 8 bars',
    format: (metrics) => `${metrics.longestQuietRun} bars`,
    value: (metrics) => metrics.longestQuietRun,
    accept: (metrics) => metrics.longestQuietRun >= 8
  },
  {
    // Measured against the sustained (90th-percentile) peak, and 6 bars rather
    // than 8: every reference project drops a lane for the last bar or two of
    // its fullest phrase, which is a fill, not a missing plateau.
    id: 'peakStretch',
    label: 'Peak stretch at ≥ 80% of sustained peak',
    target: '≥ 6 bars',
    format: (metrics) => `${metrics.longestPeakRun} bars`,
    value: (metrics) => metrics.longestPeakRun,
    accept: (metrics) => metrics.longestPeakRun >= 6
  },
  {
    id: 'sendLanes',
    label: 'Lanes with a non-zero send',
    target: '≥ 70%',
    format: (metrics) => percent(metrics.sendLaneShare),
    value: (metrics) => metrics.sendLaneShare,
    accept: (metrics) => metrics.sendLaneShare >= 0.7
  },
  {
    id: 'returnModules',
    label: 'Configured return modules',
    target: 'exactly 2 (reverb + delay)',
    format: (metrics) => metrics.returnModules.join(' + ') || 'none',
    value: (metrics) => metrics.returnModules.length,
    accept: (metrics) => metrics.returnModules.length === 2 &&
      metrics.returnModules.includes('aetherform-reverb') &&
      metrics.returnModules.includes('echoform-delay')
  },
  {
    id: 'distinctPans',
    label: 'Distinct pan values',
    target: '≥ 6',
    format: (metrics) => String(metrics.distinctPanValues),
    value: (metrics) => metrics.distinctPanValues,
    accept: (metrics) => metrics.distinctPanValues >= 6
  },
  {
    id: 'panCaps',
    label: 'Max abs pan',
    target: '≤ 0.35 non-pair, ≤ 0.65 pair',
    format: (metrics) => `${metrics.maxAbsPanNonPair.toFixed(2)} / ${metrics.maxAbsPanPair.toFixed(2)}`,
    value: (metrics) => Math.max(metrics.maxAbsPanNonPair, metrics.maxAbsPanPair),
    accept: (metrics) => metrics.maxAbsPanNonPair <= 0.35 + 1e-9 && metrics.maxAbsPanPair <= 0.65 + 1e-9
  },
  {
    id: 'songEnd',
    label: 'Song ends on the 8-bar grid',
    target: 'required',
    format: (metrics) => metrics.endsOnEightBarGrid ? 'yes' : 'no',
    value: (metrics) => metrics.endsOnEightBarGrid ? 1 : 0,
    accept: (metrics) => metrics.endsOnEightBarGrid
  }
]

export interface EnvelopeMeasureReport {
  id: string
  label: string
  target: string
  measured: string
  pass: boolean
}

export interface EnvelopeReport {
  measures: readonly EnvelopeMeasureReport[]
  passed: number
  total: number
}

export function evaluateOccupancyEnvelope(metrics: MixJamMetrics): EnvelopeReport {
  const measures = ENVELOPE_MEASURES.map((measure) => ({
    id: measure.id,
    label: measure.label,
    target: measure.target,
    measured: measure.format(metrics),
    pass: measure.accept(metrics)
  }))
  return { measures, passed: measures.filter((measure) => measure.pass).length, total: measures.length }
}
