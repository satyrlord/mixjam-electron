// Measurement of a finished .mixjam arrangement, shared by the audit CLI and by
// the tests that assert generated output against the committed reference
// metrics. Everything here reads a parsed project document; nothing touches the
// filesystem, the renderer, or the audio engine, so a Node script and a jsdom
// test measure a project exactly the same way.

const TICKS_PER_BEAT = 8
const TICKS_PER_BAR = TICKS_PER_BEAT * 4

export interface MeasurablePlacement {
  sampleRef: string
  startTick: number
  durationTicks: number
  nativeBPM?: number | null
}

export interface MeasurableLane {
  name: string
  gain: number
  pan: number
  /** Shared identity supplied only when persisted stereo-pair evidence exists. */
  stereoPairId?: string | null
  sends?: readonly number[]
  placements: readonly MeasurablePlacement[]
}

export interface MeasurableFxBus {
  module: { type: string }
  returnLevel?: number
}

export interface MeasurableProject {
  song: { bpm: number }
  lanes: readonly MeasurableLane[]
  fxBuses?: readonly MeasurableFxBus[]
}

export interface LaneMetrics {
  name: string
  gain: number
  pan: number
  sends: readonly number[]
  placements: number
  distinctSamples: number
  /** Share of song bars in which the lane has audible material, 0..1. */
  occupancy: number
  /** Contiguous occupancy runs — how many times the lane enters the arrangement. */
  entries: number
  /** Placement counts bucketed by span, keyed by SPAN_BUCKETS labels. */
  spanHistogram: Readonly<Record<string, number>>
}

export interface MixJamMetrics {
  bpm: number
  bars: number
  populatedLanes: number
  placements: number
  distinctSamples: number
  distinctSamplesPerLaneMedian: number
  distinctSamplesPerLaneMax: number
  meanOccupancy: number
  lanesAbove90: number
  lanesBelow50Share: number
  meanEntries: number
  /** Active-lane count for every bar of the song. */
  densityCurve: readonly number[]
  densityMin: number
  densityPeak: number
  /**
   * The 90th-percentile bar density — the level the arrangement actually holds
   * at its busiest. The single-bar maximum is a spike (a riser, an impact and
   * every lane coinciding for one bar), so a plateau measured against it reads
   * as 1–3 bars even in arrangements that plainly have an 8-bar peak.
   */
  sustainedPeak: number
  densityMean: number
  longestQuietRun: number
  longestPeakRun: number
  sendLaneShare: number
  returnModules: readonly string[]
  distinctPanValues: number
  maxAbsPanNonPair: number
  maxAbsPanPair: number
  naturalRatePlacements: number
  subBeatPlacements: number
  endsOnEightBarGrid: boolean
  lanes: readonly LaneMetrics[]
}

// Span buckets are the vocabulary the reference projects actually use: sub-beat
// rolls, beat-length hits, and whole-bar loop lengths up to a 16-bar pad.
export const SPAN_BUCKETS = ['sub-beat', 'beat', '1bar', '2bar', '4bar', '8bar', '16bar+'] as const

function spanBucket(durationTicks: number): (typeof SPAN_BUCKETS)[number] {
  if (durationTicks < TICKS_PER_BEAT) return 'sub-beat'
  if (durationTicks < TICKS_PER_BAR) return 'beat'
  const bars = durationTicks / TICKS_PER_BAR
  if (bars <= 1) return '1bar'
  if (bars <= 2) return '2bar'
  if (bars <= 4) return '4bar'
  if (bars <= 8) return '8bar'
  return '16bar+'
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(quantile * (sorted.length - 1)))]!
}

function longestRun(values: readonly number[], accept: (value: number) => boolean): number {
  let longest = 0
  let run = 0
  for (const value of values) {
    run = accept(value) ? run + 1 : 0
    if (run > longest) longest = run
  }
  return longest
}

function occupiedBars(lane: MeasurableLane, bars: number): boolean[] {
  const occupied = Array.from({ length: bars }, () => false)
  for (const placement of lane.placements) {
    const first = Math.floor(placement.startTick / TICKS_PER_BAR)
    // A placement occupies every bar it sounds in, including the bar its tail
    // spills into; a one-tick spill past a bar line is rounded away so a loop
    // that ends exactly on the line does not claim the next bar.
    const last = Math.ceil((placement.startTick + placement.durationTicks) / TICKS_PER_BAR) - 1
    for (let bar = Math.max(0, first); bar <= Math.min(bars - 1, last); bar++) occupied[bar] = true
  }
  return occupied
}

function countEntries(occupied: readonly boolean[]): number {
  let entries = 0
  for (let index = 0; index < occupied.length; index++) {
    if (occupied[index] && !occupied[index - 1]) entries++
  }
  return entries
}

export function computeMixJamMetrics(project: MeasurableProject): MixJamMetrics {
  const populated = project.lanes.filter((lane) => lane.placements.length > 0)
  const songEndTick = Math.max(0, ...project.lanes.flatMap((lane) =>
    lane.placements.map((placement) => placement.startTick + placement.durationTicks)
  ))
  const bars = Math.ceil(songEndTick / TICKS_PER_BAR)

  const lanes: LaneMetrics[] = populated.map((lane) => {
    const occupied = occupiedBars(lane, bars)
    const histogram: Record<string, number> = Object.fromEntries(SPAN_BUCKETS.map((bucket) => [bucket, 0]))
    for (const placement of lane.placements) histogram[spanBucket(placement.durationTicks)]!++
    return {
      name: lane.name,
      gain: lane.gain,
      pan: lane.pan,
      sends: [...(lane.sends ?? [])],
      placements: lane.placements.length,
      distinctSamples: new Set(lane.placements.map((placement) => placement.sampleRef)).size,
      occupancy: bars === 0 ? 0 : occupied.filter(Boolean).length / bars,
      entries: countEntries(occupied),
      spanHistogram: histogram
    }
  })

  const occupancyByLane = populated.map((lane) => occupiedBars(lane, bars))
  const densityCurve = Array.from({ length: bars }, (_, bar) =>
    occupancyByLane.reduce((sum, occupied) => sum + (occupied[bar] ? 1 : 0), 0)
  )
  const densityPeak = Math.max(0, ...densityCurve)
  const sustainedPeak = percentile(densityCurve, 0.9)

  const panValues = populated.map((lane) => lane.pan)
  const lanesByPairId = new Map<string, MeasurableLane[]>()
  for (const lane of populated) {
    if (!lane.stereoPairId) continue
    const pair = lanesByPairId.get(lane.stereoPairId) ?? []
    pair.push(lane)
    lanesByPairId.set(lane.stereoPairId, pair)
  }
  const pairLanes = new Set<MeasurableLane>()
  for (const pair of lanesByPairId.values()) {
    if (pair.length !== 2) continue
    const [left, right] = pair
    if (left!.pan !== 0 && right!.pan !== 0 && Math.abs(left!.pan + right!.pan) < 1e-6) {
      pairLanes.add(left!)
      pairLanes.add(right!)
    }
  }
  const absPans = (lanes: readonly MeasurableLane[]): number =>
    Math.max(0, ...lanes.map((lane) => Math.abs(lane.pan)))

  const allPlacements = populated.flatMap((lane) => lane.placements)

  return {
    bpm: project.song.bpm,
    bars,
    populatedLanes: populated.length,
    placements: allPlacements.length,
    distinctSamples: new Set(allPlacements.map((placement) => placement.sampleRef)).size,
    distinctSamplesPerLaneMedian: median(lanes.map((lane) => lane.distinctSamples)),
    distinctSamplesPerLaneMax: Math.max(0, ...lanes.map((lane) => lane.distinctSamples)),
    meanOccupancy: lanes.length === 0 ? 0 : lanes.reduce((sum, lane) => sum + lane.occupancy, 0) / lanes.length,
    lanesAbove90: lanes.filter((lane) => lane.occupancy > 0.9).length,
    lanesBelow50Share: lanes.length === 0 ? 0 : lanes.filter((lane) => lane.occupancy < 0.5).length / lanes.length,
    meanEntries: lanes.length === 0 ? 0 : lanes.reduce((sum, lane) => sum + lane.entries, 0) / lanes.length,
    densityCurve,
    densityMin: densityCurve.length === 0 ? 0 : Math.min(...densityCurve),
    densityPeak,
    sustainedPeak,
    densityMean: densityCurve.length === 0
      ? 0
      : densityCurve.reduce((sum, count) => sum + count, 0) / densityCurve.length,
    longestQuietRun: longestRun(densityCurve, (count) => count <= 0.45 * sustainedPeak),
    longestPeakRun: longestRun(densityCurve, (count) => count >= 0.8 * sustainedPeak),
    sendLaneShare: lanes.length === 0
      ? 0
      : lanes.filter((lane) => lane.sends.some((send) => send > 0)).length / lanes.length,
    returnModules: (project.fxBuses ?? [])
      .filter((bus) => bus.module.type !== 'empty')
      .map((bus) => bus.module.type),
    distinctPanValues: new Set(panValues).size,
    maxAbsPanNonPair: absPans(populated.filter((lane) => !pairLanes.has(lane))),
    maxAbsPanPair: absPans(populated.filter((lane) => pairLanes.has(lane))),
    naturalRatePlacements: allPlacements.filter((placement) =>
      placement.nativeBPM === null || placement.nativeBPM === undefined
    ).length,
    subBeatPlacements: allPlacements.filter((placement) => placement.startTick % TICKS_PER_BEAT !== 0).length,
    endsOnEightBarGrid: songEndTick > 0 && songEndTick % (8 * TICKS_PER_BAR) === 0,
    lanes
  }
}
