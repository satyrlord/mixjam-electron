import type { MixJamGeneratorParameters, SampleType } from '../../../shared/backend-api'
import { analyzeDecodedAudio, decodeWav, type DecodedPcm } from './analysis'
import { resolveFileHandle } from './folder-access'
import { generatorCandidateMatchesLane } from './generator-candidate'
import { detectedGeneratorBpm, type GeneratorCandidate } from './generator-library'
import { GENERATOR_PROFILES } from './generator-profiles'

export const MAX_GENERATOR_ATTEMPTS = 96
export const MAX_GENERATOR_ANALYSES = 64

export type GeneratorPlannerKind =
  | 'one-shot'
  | 'rhythmic-loop'
  | 'tonal-loop'
  | 'vocal'
  | 'atmosphere'
  | 'riser'
  | 'impact'
  | 'texture'

export interface AnalyzedGeneratorCandidate extends GeneratorCandidate {
  rms: number
  peak: number
  spectralCentroid: number
  transientDensity: number
  attackStrength: number
  rhythmicRegularity: number
  loopConfidence: number
  boundaryContinuity: number
  energySlope: number
  plannerKind: GeneratorPlannerKind
}

export interface GeneratorAnalysisProgress {
  phase: 'shortlisting' | 'analyzing'
  completed: number
  total: number
}

const PERCUSSIVE_TYPES = new Set<SampleType>(['Kick', 'Snare', 'Hi-hat', 'Percussion'])
const TONAL_TYPES = new Set<SampleType>(['Bass', 'Synth', 'Loop'])
const RISER_NAME = /(?:^|[\s_.-])(?:riser?|swish(?:es)?|sweep(?:er)?|whoosh(?:es)?|swoosh(?:es)?|uplift(?:er)?|reverse)(?:[lr])?(?:[\s_.-]|$)/i
const IMPACT_NAME = /(?:^|[\s_.-])(?:impact|hit|crash|slam(?:mer)?|boom(?:er)?|drop|downlift)(?:[lr])?(?:[\s_.-]|$)/i

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function hashText(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function cancellationError(): Error {
  return new Error('MixJam generator planning was cancelled.')
}

interface ShortlistedCandidate {
  candidate: GeneratorCandidate
  eligibleLaneIndexes: number[]
}

function shortlistCandidates(
  candidates: readonly GeneratorCandidate[],
  parameters: MixJamGeneratorParameters
): ShortlistedCandidate[] {
  const profile = GENERATOR_PROFILES[parameters.profileId]
  if (!profile) throw new Error(`Unknown generator profile: ${String(parameters.profileId)}`)
  const bpm = parameters.bpmMode === 'fixed' ? parameters.bpm! : detectedGeneratorBpm(candidates)
  const core = new Set(profile.coreLanes)
  const laneOrder = profile.lanes
    .map((_, laneIndex) => laneIndex)
    .sort((left, right) => Number(core.has(right)) - Number(core.has(left)) || left - right)
  const queues = laneOrder.map((laneIndex) => {
    const lane = profile.lanes[laneIndex]!
    return [...candidates]
      .filter((candidate) => lane.types.includes(candidate.sampleType) &&
        generatorCandidateMatchesLane(candidate, lane, candidate.sampleType, bpm))
      .sort((left, right) => {
        const leftType = lane.types.indexOf(left.sampleType)
        const rightType = lane.types.indexOf(right.sampleType)
        if (leftType !== rightType) return leftType - rightType
        const roleSeed = `${parameters.seed}:${profile.id}:${profile.version}:lane-${laneIndex}`
        const hashDifference = hashText(`${roleSeed}:${left.relpath}`) - hashText(`${roleSeed}:${right.relpath}`)
        return hashDifference || compareCodeUnits(left.relpath, right.relpath)
      })
  })
  const categoryNames = [...new Set(candidates.map((candidate) => candidate.categoryName))]
    .sort(compareCodeUnits)
  const categoryQueues = categoryNames.map((categoryName) => [...candidates]
    .filter((candidate) => candidate.categoryName === categoryName && profile.lanes.some((lane) =>
      lane.types.includes(candidate.sampleType) &&
      generatorCandidateMatchesLane(candidate, lane, candidate.sampleType, bpm)
    ))
    .sort((left, right) => {
      const roleSeed = `${parameters.seed}:${profile.id}:${profile.version}:category-${categoryName}`
      const hashDifference = hashText(`${roleSeed}:${left.relpath}`) - hashText(`${roleSeed}:${right.relpath}`)
      return hashDifference || compareCodeUnits(left.relpath, right.relpath)
    }))

  const result: ShortlistedCandidate[] = []
  const seen = new Set<string>()
  const allQueues = [...queues, ...categoryQueues]
  const positions = allQueues.map(() => 0)
  const addQueuePass = (queueIndexes: readonly number[]): boolean => {
    let advanced = false
    for (const queueIndex of queueIndexes) {
      if (result.length >= MAX_GENERATOR_ATTEMPTS) break
      const queue = allQueues[queueIndex]!
      while (positions[queueIndex]! < queue.length) {
        const candidate = queue[positions[queueIndex]!]!
        positions[queueIndex] = positions[queueIndex]! + 1
        if (seen.has(candidate.relpath)) continue
        seen.add(candidate.relpath)
        const eligibleLaneIndexes = profile.lanes.flatMap((lane, laneIndex) =>
          lane.types.includes(candidate.sampleType) &&
          generatorCandidateMatchesLane(candidate, lane, candidate.sampleType, bpm)
            ? [laneIndex]
            : []
        )
        result.push({ candidate, eligibleLaneIndexes })
        advanced = true
        break
      }
    }
    return advanced
  }
  const coreQueueIndexes = laneOrder.flatMap((laneIndex, queueIndex) => core.has(laneIndex) ? [queueIndex] : [])
  const laneQueueIndexes = queues.map((_, index) => index)
  const categoryQueueIndexes = categoryQueues.map((_, index) => queues.length + index)
  addQueuePass(coreQueueIndexes)
  addQueuePass(categoryQueueIndexes)
  while (result.length < MAX_GENERATOR_ATTEMPTS && addQueuePass(laneQueueIndexes)) {
    addQueuePass(categoryQueueIndexes)
  }
  return result
}

interface EnergyMetrics {
  transientDensity: number
  attackStrength: number
  rhythmicRegularity: number
  boundaryContinuity: number
  energySlope: number
}

function energyMetrics(decoded: DecodedPcm): EnergyMetrics {
  const { samples, sampleRate } = decoded
  if (samples.length === 0) {
    return {
      transientDensity: 0,
      attackStrength: 0,
      rhythmicRegularity: 0,
      boundaryContinuity: 1,
      energySlope: 0
    }
  }
  const frameSize = Math.max(1, Math.round(sampleRate * 0.02))
  const frameCount = Math.ceil(samples.length / frameSize)
  const energy = new Float64Array(frameCount)
  let maximumEnergy = 0
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSize
    const end = Math.min(samples.length, start + frameSize)
    let squares = 0
    for (let index = start; index < end; index++) squares += samples[index]! ** 2
    energy[frame] = Math.sqrt(squares / Math.max(1, end - start))
    maximumEnergy = Math.max(maximumEnergy, energy[frame]!)
  }

  const rises: number[] = []
  let maximumRise = 0
  const threshold = maximumEnergy * 0.12
  for (let frame = 1; frame < energy.length; frame++) {
    const rise = Math.max(0, energy[frame]! - energy[frame - 1]!)
    maximumRise = Math.max(maximumRise, rise)
    if (rise > threshold) rises.push(frame)
  }
  const intervals = rises.slice(1).map((frame, index) => frame - rises[index]!)
  const intervalMean = intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length)
  const intervalVariance = intervals.reduce(
    (sum, value) => sum + (value - intervalMean) ** 2,
    0
  ) / Math.max(1, intervals.length)
  const rhythmicRegularity = intervals.length < 2 || intervalMean === 0
    ? 0
    : clamp(1 - Math.sqrt(intervalVariance) / intervalMean)

  const edgeSize = Math.max(1, Math.min(samples.length, Math.round(sampleRate * 0.02)))
  let firstSquares = 0
  let lastSquares = 0
  for (let index = 0; index < edgeSize; index++) {
    firstSquares += samples[index]! ** 2
    lastSquares += samples[samples.length - edgeSize + index]! ** 2
  }
  const firstRms = Math.sqrt(firstSquares / edgeSize)
  const lastRms = Math.sqrt(lastSquares / edgeSize)
  const levelDifference = Math.abs(firstRms - lastRms) / Math.max(firstRms, lastRms, 1e-9)
  const endpointDifference = Math.abs(samples[0]! - samples[samples.length - 1]!) / 2

  return {
    transientDensity: clamp(rises.length / Math.max(1, frameCount)),
    attackStrength: clamp(maximumRise / Math.max(maximumEnergy, 1e-9)),
    rhythmicRegularity,
    boundaryContinuity: clamp(1 - (levelDifference + endpointDifference) / 2),
    energySlope: clamp(
      (lastRms - firstRms) / Math.max(firstRms, lastRms, 1e-9),
      -1,
      1
    )
  }
}

function plannerKind(
  candidate: GeneratorCandidate,
  durationSeconds: number,
  metrics: EnergyMetrics
): GeneratorPlannerKind {
  if (PERCUSSIVE_TYPES.has(candidate.sampleType) && durationSeconds <= 2.5) return 'one-shot'
  if (candidate.sampleType === 'Vocal') return 'vocal'
  if (candidate.sampleType === 'Atmosphere') return 'atmosphere'
  if ((candidate.sampleType === 'FX' || candidate.sampleType === 'Other') && RISER_NAME.test(candidate.filename)) {
    return 'riser'
  }
  if ((candidate.sampleType === 'FX' || candidate.sampleType === 'Other') && IMPACT_NAME.test(candidate.filename)) {
    return 'impact'
  }
  if ((candidate.sampleType === 'FX' || candidate.sampleType === 'Other') && metrics.energySlope > 0.35) return 'riser'
  if ((candidate.sampleType === 'FX' || candidate.sampleType === 'Other') && metrics.attackStrength > 0.45) return 'impact'
  if (candidate.sampleType === 'Loop' && (metrics.rhythmicRegularity > 0.45 || metrics.transientDensity > 0.04)) {
    return 'rhythmic-loop'
  }
  if (TONAL_TYPES.has(candidate.sampleType)) return 'tonal-loop'
  return 'texture'
}

function enrichCandidate(
  candidate: GeneratorCandidate,
  decoded: DecodedPcm,
  parameters: MixJamGeneratorParameters
): AnalyzedGeneratorCandidate {
  const analysis = analyzeDecodedAudio(decoded)
  const metrics = energyMetrics(decoded)
  let peak = 0
  for (const sample of decoded.samples) peak = Math.max(peak, Math.abs(sample))
  const bpm = analysis.bpm ?? candidate.bpm ?? (parameters.bpmMode === 'fixed' ? parameters.bpm : null)
  const bars = bpm && bpm > 0 ? analysis.durationSeconds * bpm / 240 : 0
  const nearestWholeBar = Math.max(1, Math.round(bars))
  const durationConfidence = bars > 0 ? clamp(1 - Math.abs(bars - nearestWholeBar) / 0.125) : 0
  const loopConfidence = clamp(
    durationConfidence * 0.5 + metrics.boundaryContinuity * 0.3 + metrics.rhythmicRegularity * 0.2
  )
  return {
    ...candidate,
    rms: clamp(analysis.features.rms),
    peak: clamp(peak),
    spectralCentroid: clamp(analysis.features.spectralCentroid, 0, decoded.sampleRate / 2),
    transientDensity: metrics.transientDensity,
    attackStrength: metrics.attackStrength,
    rhythmicRegularity: metrics.rhythmicRegularity,
    loopConfidence,
    boundaryContinuity: metrics.boundaryContinuity,
    energySlope: metrics.energySlope,
    plannerKind: plannerKind(candidate, analysis.durationSeconds, metrics)
  }
}

export async function analyzeGeneratorCandidates(
  rootHandle: FileSystemDirectoryHandle,
  candidates: readonly GeneratorCandidate[],
  parameters: MixJamGeneratorParameters,
  emit: (progress: GeneratorAnalysisProgress) => void,
  isCurrent: () => boolean
): Promise<AnalyzedGeneratorCandidate[]> {
  if (!isCurrent()) throw cancellationError()
  const shortlist = shortlistCandidates(candidates, parameters)
  emit({ phase: 'shortlisting', completed: shortlist.length, total: shortlist.length })
  emit({ phase: 'analyzing', completed: 0, total: shortlist.length })

  const profile = GENERATOR_PROFILES[parameters.profileId]
  const bpm = parameters.bpmMode === 'fixed' ? parameters.bpm! : detectedGeneratorBpm(candidates)
  const analyzed: AnalyzedGeneratorCandidate[] = []
  const missingLanes = new Set(shortlist.flatMap((entry) => entry.eligibleLaneIndexes))
  const missingCategories = new Set(shortlist.map((entry) => entry.candidate.categoryName))
  let attempts = 0
  for (const { candidate, eligibleLaneIndexes } of shortlist) {
    if (attempts >= MAX_GENERATOR_ATTEMPTS || analyzed.length >= MAX_GENERATOR_ANALYSES) break
    if (!isCurrent()) throw cancellationError()
    attempts++
    try {
      const handle = await resolveFileHandle(rootHandle, candidate.relpath)
      if (!isCurrent()) throw cancellationError()
      if (handle !== null) {
        const file = await handle.getFile()
        const decoded = decodeWav(await file.arrayBuffer())
        if (!isCurrent()) throw cancellationError()
        if (decoded !== null) {
          const enriched = enrichCandidate(candidate, decoded, parameters)
          const compatibleLaneIndexes = eligibleLaneIndexes.filter((laneIndex) => {
            const lane = profile.lanes[laneIndex]!
            return generatorCandidateMatchesLane(enriched, lane, enriched.sampleType, bpm)
          })
          const newlyFilledLanes = compatibleLaneIndexes.filter((laneIndex) => missingLanes.has(laneIndex))
          const fillsCategory = missingCategories.has(enriched.categoryName)
          const reservedCapacity = Math.min(
            MAX_GENERATOR_ANALYSES,
            missingLanes.size + missingCategories.size
          )
          if (compatibleLaneIndexes.length > 0 &&
              (newlyFilledLanes.length > 0 || fillsCategory ||
                analyzed.length < MAX_GENERATOR_ANALYSES - reservedCapacity)) {
            analyzed.push(enriched)
            for (const laneIndex of newlyFilledLanes) missingLanes.delete(laneIndex)
            if (fillsCategory) missingCategories.delete(enriched.categoryName)
          }
        }
      }
    } catch (error) {
      if (!isCurrent()) throw cancellationError()
      if (error instanceof Error && error.message === cancellationError().message) throw error
    }
    emit({ phase: 'analyzing', completed: attempts, total: shortlist.length })
  }
  return analyzed
}
