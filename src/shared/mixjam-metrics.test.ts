import { describe, expect, it } from 'vitest'
import { ENVELOPE_MEASURES, evaluateOccupancyEnvelope } from './generator-envelope'
import { loadReferenceBaseline, referenceRange } from './generator-reference-metrics'
import { SPAN_BUCKETS, computeMixJamMetrics, type MeasurableProject } from './mixjam-metrics'

const TICKS_PER_BAR = 32

function lane(
  name: string, bars: readonly (readonly [number, number])[],
  overrides: {
    gain?: number
    pan?: number
    stereoPairId?: string
    sends?: number[]
    ref?: string
  } = {}
): MeasurableProject['lanes'][number] {
  return {
    name,
    gain: overrides.gain ?? 0.5,
    pan: overrides.pan ?? 0,
    stereoPairId: overrides.stereoPairId,
    sends: overrides.sends ?? [0, 0],
    placements: bars.map(([startBar, lengthBars]) => ({
      sampleRef: overrides.ref ?? `${name}.wav`,
      startTick: startBar * TICKS_PER_BAR,
      durationTicks: lengthBars * TICKS_PER_BAR,
      nativeBPM: 140
    }))
  }
}

describe('computeMixJamMetrics', () => {
  it('measures occupancy as a share of song bars and entries as contiguous runs', () => {
    const project: MeasurableProject = {
      song: { bpm: 140 },
      lanes: [lane('A', [[0, 4], [8, 4]]), lane('B', [[0, 16]])]
    }
    const metrics = computeMixJamMetrics(project)
    expect(metrics.bars).toBe(16)
    // Lane A sounds in bars 0-3 and 8-11: half the song, entered twice.
    expect(metrics.lanes[0]).toMatchObject({ occupancy: 0.5, entries: 2 })
    expect(metrics.lanes[1]).toMatchObject({ occupancy: 1, entries: 1 })
    expect(metrics.meanOccupancy).toBeCloseTo(0.75)
    expect(metrics.lanesAbove90).toBe(1)
  })

  it('does not let a clip that ends on a bar line claim the next bar', () => {
    const metrics = computeMixJamMetrics({ song: { bpm: 140 }, lanes: [lane('A', [[0, 2]])] })
    expect(metrics.densityCurve).toEqual([1, 1])
  })

  it('reports the sustained peak rather than a one-bar spike', () => {
    // Eleven bars at one lane and a single bar where three coincide: the
    // single-bar maximum is 3, but the level the arrangement holds is 1.
    const project: MeasurableProject = {
      song: { bpm: 140 },
      lanes: [lane('A', [[0, 12]]), lane('B', [[5, 1]]), lane('C', [[5, 1]])]
    }
    const metrics = computeMixJamMetrics(project)
    expect(metrics.densityPeak).toBe(3)
    expect(metrics.sustainedPeak).toBe(1)
  })

  it('counts natural-rate and sub-beat placements, and buckets spans', () => {
    const project: MeasurableProject = {
      song: { bpm: 140 },
      lanes: [{
        name: 'Perc',
        gain: 0.4,
        pan: 0,
        sends: [0.1, 0],
        placements: [
          { sampleRef: 'a.wav', startTick: 0, durationTicks: 4, nativeBPM: null },
          { sampleRef: 'a.wav', startTick: 5, durationTicks: 4, nativeBPM: null },
          { sampleRef: 'b.wav', startTick: 32, durationTicks: 32, nativeBPM: 140 }
        ]
      }]
    }
    const metrics = computeMixJamMetrics(project)
    expect(metrics.naturalRatePlacements).toBe(2)
    expect(metrics.subBeatPlacements).toBe(1)
    expect(metrics.lanes[0]!.spanHistogram['sub-beat']).toBe(2)
    expect(metrics.lanes[0]!.spanHistogram['1bar']).toBe(1)
    expect(Object.keys(metrics.lanes[0]!.spanHistogram).sort()).toEqual([...SPAN_BUCKETS].sort())
  })

  it('does not infer a stereo pair from symmetric pan values', () => {
    const project: MeasurableProject = {
      song: { bpm: 140 },
      lanes: [
        lane('Pad L', [[0, 8]], { pan: -0.6 }),
        lane('Pad R', [[0, 8]], { pan: 0.6 }),
        lane('Hats', [[0, 8]], { pan: 0.2 })
      ]
    }
    const metrics = computeMixJamMetrics(project)
    expect(metrics.maxAbsPanPair).toBe(0)
    expect(metrics.maxAbsPanNonPair).toBeCloseTo(0.6)
  })

  it('separates a mirror pair only when the input carries shared pair evidence', () => {
    const project: MeasurableProject = {
      song: { bpm: 140 },
      lanes: [
        lane('Pad L', [[0, 8]], { pan: -0.6, stereoPairId: 'pad-take-1' }),
        lane('Pad R', [[0, 8]], { pan: 0.6, stereoPairId: 'pad-take-1' }),
        lane('Hats', [[0, 8]], { pan: 0.2 })
      ]
    }
    const metrics = computeMixJamMetrics(project)
    expect(metrics.maxAbsPanPair).toBeCloseTo(0.6)
    expect(metrics.maxAbsPanNonPair).toBeCloseTo(0.2)
  })

  it('ignores lanes with no placements', () => {
    const metrics = computeMixJamMetrics({
      song: { bpm: 140 },
      lanes: [lane('A', [[0, 8]]), lane('Empty', [])]
    })
    expect(metrics.populatedLanes).toBe(1)
    expect(metrics.lanes).toHaveLength(1)
  })

  it('measures an empty project without throwing', () => {
    const metrics = computeMixJamMetrics({ song: { bpm: 140 }, lanes: [] })
    expect(metrics).toMatchObject({ bars: 0, populatedLanes: 0, endsOnEightBarGrid: false })
  })

  it('records the configured return modules and the share of lanes sending into them', () => {
    const metrics = computeMixJamMetrics({
      song: { bpm: 140 },
      lanes: [lane('A', [[0, 8]], { sends: [0.2, 0] }), lane('B', [[0, 8]], { sends: [0, 0] })],
      fxBuses: [
        { module: { type: 'aetherform-reverb' } },
        { module: { type: 'echoform-delay' } },
        { module: { type: 'empty' } }
      ]
    })
    expect(metrics.returnModules).toEqual(['aetherform-reverb', 'echoform-delay'])
    expect(metrics.sendLaneShare).toBe(0.5)
  })
})

describe('the occupancy envelope', () => {
  it('reports every measure with a target and a measured value', () => {
    const report = evaluateOccupancyEnvelope(
      computeMixJamMetrics({ song: { bpm: 140 }, lanes: [lane('A', [[0, 8]])] })
    )
    expect(report.total).toBe(ENVELOPE_MEASURES.length)
    expect(report.measures.map((measure) => measure.id)).toEqual(ENVELOPE_MEASURES.map((m) => m.id))
    expect(report.measures.every((measure) => measure.target.length > 0)).toBe(true)
    // A one-lane stub fails most of the envelope; the point is that it reports
    // rather than throws (spec-021 §Envelope).
    expect(report.passed).toBeLessThan(report.total)
  })

  it('reports both the empty-project edge case and accepted reference measures', () => {
    const empty = evaluateOccupancyEnvelope(
      computeMixJamMetrics({ song: { bpm: 140 }, lanes: [] })
    )
    expect(empty.measures.find((measure) => measure.id === 'densityMinimum')).toMatchObject({
      measured: '0 of 0',
      pass: true
    })

    const referenceReports = Object.values(loadReferenceBaseline().projects)
      .map((metrics) => evaluateOccupancyEnvelope(metrics))
    expect(referenceReports.every((report) => report.total === ENVELOPE_MEASURES.length)).toBe(true)
    expect(referenceReports.some((report) => report.passed > 0)).toBe(true)
  })
})

describe('the committed reference baseline', () => {
  const baseline = loadReferenceBaseline()

  it('carries the hand-authored reference projects with per-lane detail', () => {
    expect(baseline.generatedFrom.length).toBeGreaterThanOrEqual(6)
    for (const [name, metrics] of Object.entries(baseline.projects)) {
      expect(name.startsWith('Agent-Manual-')).toBe(true)
      expect(metrics.lanes.length).toBe(metrics.populatedLanes)
      expect(metrics.densityCurve).toHaveLength(metrics.bars)
      for (const row of metrics.lanes) {
        expect(Object.keys(row.spanHistogram).sort()).toEqual([...SPAN_BUCKETS].sort())
        expect(row.sends.length).toBeGreaterThan(0)
      }
    }
  })

  it('spans a usable range for every envelope measure', () => {
    for (const measure of ENVELOPE_MEASURES) {
      const range = referenceRange(baseline, measure.id)
      expect(range).not.toBeNull()
      expect(range!.min).toBeLessThanOrEqual(range!.max)
    }
    expect(referenceRange(baseline, 'not-a-measure')).toBeNull()
  })

  it('holds the measured shape the generator is calibrated against', () => {
    // These are the §1.1 numbers the audit harness re-derives. A change here is
    // a change to the normative baseline, not a test that drifted.
    const trance = baseline.projects['Agent-Manual-Trance-140-003']!
    expect(trance).toMatchObject({ bars: 136, populatedLanes: 15, placements: 515, distinctSamples: 26 })
    const melodic = baseline.projects['Agent-Manual-MelodicTechno-140-001']!
    expect(melodic).toMatchObject({ bars: 152, populatedLanes: 16, placements: 933, distinctSamples: 30 })

    // Across the library: never a wall of sound, always a return pair.
    for (const metrics of Object.values(baseline.projects)) {
      expect(metrics.meanOccupancy).toBeLessThan(0.55)
      expect(metrics.lanesBelow50Share).toBeGreaterThanOrEqual(0.3)
      expect(metrics.returnModules).toHaveLength(2)
    }
  })
})
