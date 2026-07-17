import {
  MIXJAM_GENERATOR_VERSION,
  type MixJamGeneratorChannelPlan,
  type MixJamGeneratorEffectPlan,
  type MixJamGeneratorLanePlan,
  type MixJamGeneratorParameters,
  type MixJamGeneratorPhrasePlan,
  type MixJamGeneratorPlan,
  type MixJamGeneratorSectionPlan,
  type SampleType
} from '../../../shared/backend-api'
import { TICKS_PER_BAR } from '../engine/transport'
import type { AnalyzedGeneratorCandidate } from './generator-analysis'
import { generatorCandidateDurationTicks, generatorCandidateMatchesLane } from './generator-candidate'
import { detectedGeneratorBpm, type GeneratorCandidate } from './generator-library'
import { canonicalMusicalKey, parseMusicalKey } from './musical-key'
import { validateMixJamGeneratorParameters } from './generator-parameters'
import {
  GENERATOR_PROFILES,
  type GeneratorLaneProfile,
  type GeneratorProfile,
  type GeneratorSectionProfile
} from './generator-profiles'

const TONAL_TYPES = new Set<SampleType>(['Bass', 'Synth', 'Loop', 'Vocal', 'Atmosphere'])

type PlanningCandidate = GeneratorCandidate & Partial<Pick<AnalyzedGeneratorCandidate,
  'rms' | 'peak' | 'spectralCentroid' | 'transientDensity' | 'attackStrength' |
  'rhythmicRegularity' | 'loopConfidence' | 'boundaryContinuity' | 'energySlope' | 'plannerKind'>>

interface Selection {
  requestedType: SampleType
  selectedType: SampleType
  candidates: PlanningCandidate[]
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

function stableId(prefix: string, source: string): string {
  return `${prefix}-${hashText(source).toString(16).padStart(8, '0')}`
}

function halfUp(value: number): number {
  return Math.floor(value + 0.5)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function allocateSections(profile: GeneratorProfile, targetBars: number): MixJamGeneratorSectionPlan[] {
  const allocations = profile.sections.map((section, index) => {
    const exact = targetBars * section.weight / 100
    return { section, index, bars: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  const remaining = targetBars - allocations.reduce((sum, allocation) => sum + allocation.bars, 0)
  const remainderOrder = [...allocations].sort((left, right) =>
    right.remainder - left.remainder || left.index - right.index
  )
  for (let index = 0; index < remaining; index++) remainderOrder[index % remainderOrder.length]!.bars++

  let startBar = 0
  return allocations.map(({ section, bars }) => {
    const result = { name: section.name, startBar, endBar: startBar + bars, activeLanes: [...section.activeLanes] }
    startBar += bars
    return result
  })
}

function dominantKey(candidates: readonly PlanningCandidate[]): string | null {
  const votes = new Map<string, number>()
  for (const candidate of candidates) {
    if (TONAL_TYPES.has(candidate.sampleType) && candidate.musicalKey) {
      const canonical = canonicalMusicalKey(candidate.musicalKey)
      if (canonical) votes.set(canonical, (votes.get(canonical) ?? 0) + 1)
    }
  }
  const ranked = [...votes].sort((left, right) => right[1] - left[1] || compareCodeUnits(left[0], right[0]))
  if (ranked.length === 0) return null
  return ranked[0]![0]
}

function keyRank(value: string | null, target: string | null): number {
  if (target === null) return 0
  if (value === null) return 2
  const source = parseMusicalKey(value)
  const destination = parseMusicalKey(target)
  if (!source || !destination) return 3
  if (source.root === destination.root && source.minor === destination.minor) return 0
  const relativeRoot = destination.minor ? (destination.root + 3) % 12 : (destination.root + 9) % 12
  return source.minor !== destination.minor && source.root === relativeRoot ? 1 : 3
}

function durationTicks(candidate: PlanningCandidate, bpm: number): number {
  return generatorCandidateDurationTicks(candidate, bpm)
}

function matchesRole(candidate: PlanningCandidate, lane: GeneratorLaneProfile, type: SampleType, bpm: number): boolean {
  return generatorCandidateMatchesLane(candidate, lane, type, bpm)
}

function orderedCandidates(
  candidates: readonly PlanningCandidate[], profile: GeneratorProfile, laneIndex: number,
  type: SampleType, bpm: number, key: string | null, seed: string
): PlanningCandidate[] {
  const lane = profile.lanes[laneIndex]!
  const tonal = TONAL_TYPES.has(type)
  return candidates
    .filter((candidate) => candidate.sampleType === type && matchesRole(candidate, lane, type, bpm))
    .filter((candidate) => !tonal || keyRank(candidate.musicalKey, key) < 3)
    .sort((left, right) => {
      const leftBpmRank = left.bpm === null ? 1 : Math.abs(left.bpm - bpm) <= profile.bpmTolerance ? 0 : 2
      const rightBpmRank = right.bpm === null ? 1 : Math.abs(right.bpm - bpm) <= profile.bpmTolerance ? 0 : 2
      if (leftBpmRank !== rightBpmRank) return leftBpmRank - rightBpmRank
      if (tonal) {
        const difference = keyRank(left.musicalKey, key) - keyRank(right.musicalKey, key)
        if (difference !== 0) return difference
      }
      const scoreDifference = (right.loopConfidence ?? 0) - (left.loopConfidence ?? 0)
      if (lane.role === 'motif' && scoreDifference !== 0) return scoreDifference
      const roleSeed = `${seed}:${profile.id}:${profile.version}:lane-${laneIndex}:${type}`
      const hashDifference = hashText(`${roleSeed}:${left.relpath}`) - hashText(`${roleSeed}:${right.relpath}`)
      return hashDifference || compareCodeUnits(left.relpath, right.relpath)
    })
}

function findTypeCandidates(
  candidates: readonly PlanningCandidate[], profile: GeneratorProfile, laneIndex: number,
  bpm: number, key: string | null, seed: string
): Selection | null {
  const types = profile.lanes[laneIndex]!.types
  for (const type of types) {
    const ordered = orderedCandidates(candidates, profile, laneIndex, type, bpm, key, seed)
    if (ordered.length > 0) return { requestedType: types[0]!, selectedType: type, candidates: ordered }
  }
  return null
}

function activeLanesForIntensity(
  activeLanes: readonly number[], coreLanes: ReadonlySet<number>,
  intensity: MixJamGeneratorParameters['intensity']
): number[] {
  if (intensity === 'high') return [...activeLanes]
  const core = activeLanes.filter((lane) => coreLanes.has(lane))
  const optional = activeLanes.filter((lane) => !coreLanes.has(lane)).sort((a, b) => a - b)
  const fraction = intensity === 'low' ? 0.4 : 0.7
  return [...new Set([...core, ...optional.slice(0, halfUp(optional.length * fraction))])].sort((a, b) => a - b)
}

function effectPlans(
  profile: GeneratorProfile, laneIndex: number, seed: string,
  intensity: MixJamGeneratorParameters['intensity']
): MixJamGeneratorEffectPlan[] {
  const wetMultiplier = intensity === 'low' ? 0.8 : intensity === 'high' ? 1.15 : 1
  return profile.lanes[laneIndex]!.effects.map((effect, ordinal) => ({
    ...effect,
    id: stableId('fx', `${seed}:${profile.id}:${profile.version}:lane-${laneIndex}:${ordinal}`),
    values: Object.fromEntries(Object.entries(effect.values).map(([key, value]) => [
      key,
      key === 'mix' && typeof value === 'number' ? Math.min(1, value * wetMultiplier) : value
    ]))
  }))
}

function phraseLanes(
  section: MixJamGeneratorSectionPlan, sectionProfile: GeneratorSectionProfile,
  phraseOrdinal: number, phraseCount: number, coreLanes: ReadonlySet<number>
): number[] {
  const core = section.activeLanes.filter((lane) => coreLanes.has(lane))
  const optional = section.activeLanes.filter((lane) => !coreLanes.has(lane))
  if (sectionProfile.phraseMode === 'build') {
    const totalCount = Math.max(core.length, Math.ceil(section.activeLanes.length * (phraseOrdinal + 1) / phraseCount))
    return [...core, ...optional.slice(0, Math.max(0, totalCount - core.length))].sort((a, b) => a - b)
  }
  if (sectionProfile.phraseMode === 'outro') {
    const totalCount = Math.max(core.length, Math.ceil(section.activeLanes.length * (phraseCount - phraseOrdinal) / phraseCount))
    return [...core, ...optional.slice(0, Math.max(0, totalCount - core.length))].sort((a, b) => a - b)
  }
  return [...section.activeLanes]
}

function createPhrases(
  sections: readonly MixJamGeneratorSectionPlan[], profile: GeneratorProfile, seed: string,
  intensity: MixJamGeneratorParameters['intensity']
): MixJamGeneratorPhrasePlan[] {
  const coreLanes = new Set(profile.coreLanes)
  const phrases = sections.flatMap((section, sectionIndex) => {
    const length = section.endBar - section.startBar
    if (length <= 0) return []
    const phraseCount = Math.ceil(length / 8)
    const phrases: MixJamGeneratorPhrasePlan[] = []
    for (let ordinal = 0, startBar = section.startBar; startBar < section.endBar; ordinal++, startBar += 8) {
      const sectionProfile = profile.sections[sectionIndex]!
      const seedBit = hashText(`${seed}:${profile.id}:section-${sectionIndex}:phrase-${ordinal}`) & 1
      const motif = intensity === 'low'
        ? sectionProfile.phraseMode === 'breakdown' && ordinal % 2 === 1 ? 'rest' : 'A'
        : sectionProfile.phraseMode === 'return'
        ? 'A'
        : sectionProfile.phraseMode === 'breakdown' && ordinal % 2 === 1
          ? 'rest'
          : ordinal === 0 || seedBit === 0 ? 'A' : 'B'
      phrases.push({
        sectionIndex,
        startBar,
        endBar: Math.min(section.endBar, startBar + 8),
        activeLanes: phraseLanes(section, sectionProfile, ordinal, phraseCount, coreLanes),
        motif
      })
    }
    return phrases
  })
  for (let index = 2; intensity !== 'low' && index < phrases.length; index++) {
    const current = phrases[index]!
    const previous = phrases[index - 1]!
    const earlier = phrases[index - 2]!
    if (current.motif !== 'rest' && current.motif === previous.motif && current.motif === earlier.motif) {
      const currentMode = profile.sections[current.sectionIndex]!.phraseMode
      if (currentMode === 'return') earlier.motif = current.motif === 'A' ? 'B' : 'A'
      else current.motif = current.motif === 'A' ? 'B' : 'A'
    }
  }
  return phrases
}

function placementEnd(placement: MixJamGeneratorLanePlan['placements'][number]): number {
  return placement.startTick + placement.durationTicks
}

function intervalIsFree(lane: MixJamGeneratorLanePlan, startTick: number, endTick: number): boolean {
  return lane.placements.every((placement) => placementEnd(placement) <= startTick || placement.startTick >= endTick)
}

function addPlacement(
  lane: MixJamGeneratorLanePlan, candidate: PlanningCandidate, startTick: number, span: number,
  ordinal: number, profile: GeneratorProfile, seed: string
): void {
  if (!intervalIsFree(lane, startTick, startTick + span)) return
  lane.placements.push({
    id: stableId('placement', `${seed}:${profile.id}:${profile.version}:lane-${lane.index}:${ordinal}`),
    sampleRef: candidate.relpath,
    sampleName: candidate.filename,
    startTick,
    durationTicks: span,
    durationSeconds: candidate.duration,
    nativeBpm: candidate.bpm,
    slot: candidate.paletteSlot
  })
}

function schedulePercussion(
  lane: MixJamGeneratorLanePlan, laneProfile: GeneratorLaneProfile, selection: Selection,
  phrase: MixJamGeneratorPhrasePlan, phraseOrdinal: number, bpm: number,
  profile: GeneratorProfile, seed: string, nextOrdinal: () => number
): void {
  const pattern = phraseOrdinal % 2 === 1 ? laneProfile.beatMutation ?? laneProfile.beatPattern! : laneProfile.beatPattern!
  const candidateIndex = phrase.motif === 'B' ? 1 : 0
  const candidate = selection.candidates[candidateIndex] ?? selection.candidates[0]!
  const span = durationTicks(candidate, bpm)
  for (let bar = phrase.startBar; bar < phrase.endBar; bar++) {
    for (const offset of pattern) {
      const startTick = bar * TICKS_PER_BAR + offset
      if (startTick + span <= (bar + 1) * TICKS_PER_BAR) {
        addPlacement(lane, candidate, startTick, span, nextOrdinal(), profile, seed)
      }
    }
  }
}

function schedulePhraseRole(
  lane: MixJamGeneratorLanePlan, laneProfile: GeneratorLaneProfile, selection: Selection,
  phrase: MixJamGeneratorPhrasePlan, phraseOrdinal: number, bpm: number,
  profile: GeneratorProfile, seed: string, nextOrdinal: () => number
): void {
  if (phrase.motif === 'rest') return
  if (laneProfile.role === 'vocal' && phraseOrdinal % 2 === 1) return
  if (laneProfile.role === 'atmosphere' && phraseOrdinal % 2 === 1) return
  const candidateIndex = phrase.motif === 'B' ? 1 : 0
  const candidate = selection.candidates[candidateIndex] ?? selection.candidates[0]!
  const span = durationTicks(candidate, bpm)
  const phraseStart = phrase.startBar * TICKS_PER_BAR
  const phraseEnd = phrase.endBar * TICKS_PER_BAR
  if (phraseStart + span <= phraseEnd) addPlacement(lane, candidate, phraseStart, span, nextOrdinal(), profile, seed)

  // A second cue after a deliberate rest gives long phrases a recognizable
  // call/response shape without continuously tiling the source.
  const response = laneProfile.role === 'vocal'
    ? selection.candidates[candidateIndex === 0 ? 1 : 0] ?? candidate
    : candidate
  const responseSpan = durationTicks(response, bpm)
  const secondStart = laneProfile.role === 'vocal'
    ? phraseEnd - responseSpan
    : (phrase.startBar + Math.max(2, Math.floor((phrase.endBar - phrase.startBar) / 2) + 1)) * TICKS_PER_BAR
  if ((laneProfile.role === 'motif' || laneProfile.role === 'vocal') &&
      secondStart >= phraseStart + span && secondStart + responseSpan <= phraseEnd) {
    addPlacement(lane, response, secondStart, responseSpan, nextOrdinal(), profile, seed)
  }
}

function schedulingSignature(
  laneProfile: GeneratorLaneProfile,
  selection: Selection,
  phrase: MixJamGeneratorPhrasePlan,
  phraseOrdinal: number
): string | null {
  if (phrase.motif === 'rest') return null
  if ((laneProfile.role === 'vocal' || laneProfile.role === 'atmosphere') && phraseOrdinal % 2 === 1) return null
  const candidateIndex = phrase.motif === 'B' ? 1 : 0
  const candidate = selection.candidates[candidateIndex] ?? selection.candidates[0]!
  if (laneProfile.role === 'percussion') {
    const pattern = phraseOrdinal % 2 === 1
      ? laneProfile.beatMutation ?? laneProfile.beatPattern!
      : laneProfile.beatPattern!
    return `${candidate.relpath}:${pattern.join(',')}`
  }
  const response = laneProfile.role === 'vocal'
    ? selection.candidates[candidateIndex === 0 ? 1 : 0] ?? candidate
    : candidate
  return `${candidate.relpath}:${response.relpath}:${phrase.endBar - phrase.startBar}`
}

function scheduleTransitions(
  sections: readonly MixJamGeneratorSectionPlan[], lanes: MixJamGeneratorLanePlan[],
  profile: GeneratorProfile, selections: readonly (Selection | null)[], bpm: number,
  seed: string, nextOrdinal: (laneIndex: number) => number
): void {
  for (let sectionIndex = 1; sectionIndex < sections.length; sectionIndex++) {
    const boundary = sections[sectionIndex]!.startBar * TICKS_PER_BAR
    for (const laneIndex of [14, 15]) {
      if (!sections[sectionIndex - 1]!.activeLanes.includes(laneIndex) && !sections[sectionIndex]!.activeLanes.includes(laneIndex)) continue
      const selection = selections[laneIndex]
      if (!selection) continue
      const laneProfile = profile.lanes[laneIndex]!
      const candidate = selection.candidates[0]!
      const span = durationTicks(candidate, bpm)
      const startTick = laneProfile.transitionKind === 'riser' ? boundary - span : boundary
      if (startTick >= 0 && startTick + span <= sections.at(-1)!.endBar * TICKS_PER_BAR) {
        addPlacement(lanes[laneIndex]!, candidate, startTick, span, nextOrdinal(laneIndex), profile, seed)
      }
    }
  }
}

function isExactEndAnchorOnGrid(
  lane: GeneratorLaneProfile,
  startTick: number,
  endTick: number
): boolean {
  if (lane.role === 'transition') {
    return lane.transitionKind === 'riser' && endTick % TICKS_PER_BAR === 0
  }
  if (lane.role === 'percussion') {
    const offset = startTick % TICKS_PER_BAR
    return [...new Set([...(lane.beatPattern ?? []), ...(lane.beatMutation ?? [])])].includes(offset)
  }
  return startTick % TICKS_PER_BAR === 0
}

function compensatedGain(baseGain: number, selected: readonly PlanningCandidate[], targetRms: number | null): number {
  const rmsValues = selected.flatMap((candidate) => candidate.rms && candidate.rms > 0 ? [candidate.rms] : [])
  if (targetRms === null || rmsValues.length === 0) return baseGain
  const laneRms = rmsValues.sort((a, b) => a - b)[Math.floor(rmsValues.length / 2)]!
  const compensationDb = clamp(20 * Math.log10(targetRms / laneRms), -6, 6)
  return clamp(baseGain * 10 ** (compensationDb / 20), 0, 1)
}

function validateArrangement(lanes: readonly MixJamGeneratorLanePlan[], targetTicks: number): void {
  let songEnd = 0
  for (const lane of lanes) {
    lane.placements.sort((left, right) => left.startTick - right.startTick || compareCodeUnits(left.id, right.id))
    for (let index = 0; index < lane.placements.length; index++) {
      const placement = lane.placements[index]!
      const endTick = placementEnd(placement)
      if (placement.startTick < 0 || placement.durationTicks < 1 || endTick > targetTicks) {
        throw new Error('The generator produced a placement outside the song boundary.')
      }
      if (index > 0 && placement.startTick < placementEnd(lane.placements[index - 1]!)) {
        throw new Error('The generator produced overlapping placements on one lane.')
      }
      songEnd = Math.max(songEnd, endTick)
    }
  }
  if (songEnd !== targetTicks) throw new Error('The generator could not place a non-overlapping sample at the song end.')
}

export function createMixJamGeneratorPlan(
  rootKey: string,
  corpusFingerprint: string,
  candidates: readonly PlanningCandidate[],
  parameters: MixJamGeneratorParameters,
  analysis = { attemptedFiles: candidates.length, analyzedFiles: candidates.length, uniqueReads: candidates.length },
  detectedBpm = detectedGeneratorBpm(candidates)
): MixJamGeneratorPlan {
  validateMixJamGeneratorParameters(parameters)
  const profile = GENERATOR_PROFILES[parameters.profileId]
  const bpm = parameters.bpmMode === 'follow-detected' ? detectedBpm : parameters.bpm!
  const targetBars = Math.max(1, halfUp(parameters.durationSeconds * bpm / 240))
  const targetTicks = targetBars * TICKS_PER_BAR
  const key = dominantKey(candidates)
  const sampleCount = parameters.intensity === 'low' ? 1 : 2
  const selections = profile.lanes.map((_, laneIndex) => {
    const selected = findTypeCandidates(candidates, profile, laneIndex, bpm, key, parameters.seed)
    return selected ? { ...selected, candidates: selected.candidates.slice(0, sampleCount) } : null
  })

  const coreLanes = new Set(profile.coreLanes)
  for (const laneIndex of coreLanes) {
    if (!selections[laneIndex]) {
      throw new Error(`The ${profile.id} profile requires a ${profile.lanes[laneIndex]!.types.join(' or ')} sample.`)
    }
  }
  const sections = allocateSections(profile, targetBars).map((section) => ({
    ...section,
    activeLanes: activeLanesForIntensity(section.activeLanes, coreLanes, parameters.intensity)
      .filter((laneIndex) => selections[laneIndex] !== null)
  }))
  const phrases = createPhrases(sections, profile, parameters.seed, parameters.intensity)
  const ordinals = Array.from({ length: 16 }, () => 0)
  const repetition = Array.from({ length: 16 }, () => ({ signature: '', run: 0 }))
  const nextOrdinal = (laneIndex: number): number => ordinals[laneIndex]++
  const lanes: MixJamGeneratorLanePlan[] = profile.lanes.map((lane, laneIndex) => ({
    index: laneIndex, name: lane.name, pan: lane.pan, muted: false, solo: false, placements: []
  }))

  for (let phraseOrdinal = 0; phraseOrdinal < phrases.length; phraseOrdinal++) {
    const phrase = phrases[phraseOrdinal]!
    const scheduledLanes = new Set<number>()
    for (const laneIndex of phrase.activeLanes) {
      const laneProfile = profile.lanes[laneIndex]!
      const selection = selections[laneIndex]
      if (!selection || laneProfile.role === 'transition') continue
      const signature = schedulingSignature(laneProfile, selection, phrase, phraseOrdinal)
      if (signature === null) {
        repetition[laneIndex] = { signature: '', run: 0 }
        continue
      }
      const previous = repetition[laneIndex]!
      if (!laneProfile.intentionalAnchor && previous.signature === signature && previous.run >= 2) {
        repetition[laneIndex] = { signature: '', run: 0 }
        continue
      }
      const placementCount = lanes[laneIndex]!.placements.length
      if (laneProfile.role === 'percussion') {
        schedulePercussion(lanes[laneIndex]!, laneProfile, selection, phrase, phraseOrdinal, bpm, profile, parameters.seed, () => nextOrdinal(laneIndex))
      } else {
        schedulePhraseRole(lanes[laneIndex]!, laneProfile, selection, phrase, phraseOrdinal, bpm, profile, parameters.seed, () => nextOrdinal(laneIndex))
      }
      if (lanes[laneIndex]!.placements.length > placementCount) {
        repetition[laneIndex] = {
          signature,
          run: previous.signature === signature ? previous.run + 1 : 1
        }
        scheduledLanes.add(laneIndex)
      } else {
        repetition[laneIndex] = { signature: '', run: 0 }
      }
    }
    for (let laneIndex = 0; laneIndex < repetition.length; laneIndex++) {
      if (!scheduledLanes.has(laneIndex) && !phrase.activeLanes.includes(laneIndex)) {
        repetition[laneIndex] = { signature: '', run: 0 }
      }
    }
  }
  scheduleTransitions(sections, lanes, profile, selections, bpm, parameters.seed, nextOrdinal)

  if (!lanes.some((lane) => lane.placements.some((placement) => placementEnd(placement) === targetTicks))) {
    const finalSection = sections.at(-1)!
    const anchor = finalSection.activeLanes.flatMap((laneIndex) => {
      const selection = selections[laneIndex]
      return selection ? selection.candidates.map((candidate) => ({ laneIndex, candidate })) : []
    }).map(({ laneIndex, candidate }) => ({
      laneIndex, candidate, span: durationTicks(candidate, bpm), startTick: targetTicks - durationTicks(candidate, bpm)
    })).find(({ laneIndex, startTick }) => startTick >= 0 &&
      isExactEndAnchorOnGrid(profile.lanes[laneIndex]!, startTick, targetTicks) &&
      intervalIsFree(lanes[laneIndex]!, startTick, targetTicks))
    if (!anchor) throw new Error('The generator could not place a non-overlapping sample at the song end.')
    addPlacement(lanes[anchor.laneIndex]!, anchor.candidate, anchor.startTick, anchor.span,
      nextOrdinal(anchor.laneIndex), profile, parameters.seed)
  }
  validateArrangement(lanes, targetTicks)

  const allSelected = selections.flatMap((selection) => selection?.candidates ?? [])
  const rmsValues = allSelected.flatMap((candidate) => candidate.rms && candidate.rms > 0 ? [candidate.rms] : []).sort((a, b) => a - b)
  const targetRms = rmsValues.length > 0 ? rmsValues[Math.floor(rmsValues.length / 2)]! : null
  const channels: MixJamGeneratorChannelPlan[] = profile.lanes.map((lane, laneIndex) => ({
    channelIndex: laneIndex,
    gain: compensatedGain(lane.gain, selections[laneIndex]?.candidates ?? [], targetRms),
    pan: lane.pan,
    muted: false,
    solo: false,
    effects: effectPlans(profile, laneIndex, parameters.seed, parameters.intensity)
  }))
  const selectionPlans = selections.flatMap((selection, laneIndex) => selection ? [{
    laneIndex,
    requestedType: selection.requestedType,
    selectedType: selection.selectedType,
    sampleRefs: selection.candidates.map((candidate) => candidate.relpath)
  }] : [])

  return {
    generatorVersion: MIXJAM_GENERATOR_VERSION,
    profileId: profile.id,
    profileVersion: profile.version,
    seed: parameters.seed,
    parameters: {
      bpmMode: parameters.bpmMode,
      resolvedBpm: bpm,
      intensity: parameters.intensity,
      durationSeconds: parameters.durationSeconds
    },
    corpusFingerprint,
    sampleFolderKey: rootKey,
    targetBars,
    targetTicks,
    quantizedDurationSeconds: targetBars * 240 / bpm,
    dominantKey: key,
    analysis,
    selections: selectionPlans,
    substitutions: selectionPlans.flatMap((selection) => selection.requestedType === selection.selectedType ? [] : [{
      laneIndex: selection.laneIndex,
      requestedType: selection.requestedType,
      selectedType: selection.selectedType
    }]),
    sections,
    phrases,
    lanes,
    channels
  }
}
