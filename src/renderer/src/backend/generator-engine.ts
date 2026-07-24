import {
  MIXJAM_GENERATOR_VERSION,
  type MixJamGeneratorLanePlan,
  type MixJamGeneratorParameters,
  type MixJamGeneratorPhrasePlan,
  type MixJamGeneratorPlan,
  type MixJamGeneratorSectionPlan
} from '../../../shared/backend-api'
import { TICKS_PER_BAR } from '../engine/transport'
import type { GeneratorCandidate } from './generator-library'
import { parseMotifKey, stereoTwinMap } from './generator-motif'
import { canonicalMusicalKey } from './musical-key'
import { validateMixJamGeneratorParameters } from './generator-parameters'
import {
  GENERATOR_PROFILES,
  type GeneratorLaneProfile,
  type GeneratorProfile,
  type GeneratorSectionProfile
} from './generator-profiles'

import {
  DENSE_BAR_SHARE,
  DENSE_LANE_SHARE,
  FAMILY_RATIO_TARGETS,
  FAMILY_ROLES,
  MAX_GENERATED_LANES,
  MIN_GENERATED_LANES,
  TONAL_TYPES,
  addPlacement,
  candidateForPhrase,
  clamp,
  compareCodeUnits,
  durationTicks,
  halfUp,
  hashText,
  intervalIsFree,
  maximumLegalSpan,
  placementEnd,
  quantizeUpToBeat,
  type PlanningCandidate,
  type Selection
} from './generator-planning-core'
import { designateStereoPairLanes, applyStereoPairs, validateStereoImage } from './generator-stereo'
import { laneDenseBarCount, ensureLaneDensity } from './generator-density'
import {
  applyKitCoherence,
  familyRatioOf,
  findTypeCandidates,
  selectDiverseCandidates
} from './generator-selection'


// Sections are allocated in whole 8-bar phrases, never bars: a 23-bar section
// ends in a 7- or 1-bar tail phrase that whole-bar loops cannot fill, which
// left lanes a bar or two short of the density target on every odd section.
// targetBars is always a multiple of 8. Low-weight sections may receive zero
// phrases in short songs and simply vanish from the arrangement.
function allocateSections(profile: GeneratorProfile, targetBars: number): MixJamGeneratorSectionPlan[] {
  const targetPhrases = Math.max(1, Math.round(targetBars / 8))
  const allocations = profile.sections.map((section, index) => {
    const exact = targetPhrases * section.weight / 100
    return { section, index, phrases: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  const remaining = targetPhrases - allocations.reduce((sum, allocation) => sum + allocation.phrases, 0)
  const remainderOrder = [...allocations].sort((left, right) =>
    right.remainder - left.remainder || left.index - right.index
  )
  for (let index = 0; index < remaining; index++) remainderOrder[index % remainderOrder.length]!.phrases++

  let startBar = 0
  return allocations.map(({ section, phrases }) => {
    const bars = phrases * 8
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

function ensureSectionLaneCoverage(
  sections: MixJamGeneratorSectionPlan[], profile: GeneratorProfile,
  selections: readonly (Selection | null)[]
): void {
  for (let laneIndex = 0; laneIndex < profile.lanes.length; laneIndex++) {
    if (!selections[laneIndex] || sections.some((section) => section.activeLanes.includes(laneIndex))) continue
    const candidates = sections.flatMap((section, sectionIndex) =>
      profile.sections[sectionIndex]!.activeLanes.includes(laneIndex)
        ? [{ section, sectionIndex }]
        : []
    ).sort((left, right) => left.sectionIndex - right.sectionIndex)
    const target = candidates[0]?.section
    if (target) target.activeLanes = [...target.activeLanes, laneIndex].sort((a, b) => a - b)
  }
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
  sections: readonly MixJamGeneratorSectionPlan[], profile: GeneratorProfile, seed: string
): MixJamGeneratorPhrasePlan[] {
  const coreLanes = new Set(profile.coreLanes)
  const phrases = sections.flatMap((section, sectionIndex) => {
    const length = section.endBar - section.startBar
    if (length <= 0) return []
    const phraseCount = Math.ceil(length / 8)
    const phrases: MixJamGeneratorPhrasePlan[] = []
    for (let ordinal = 0, startBar = section.startBar; startBar < section.endBar; ordinal++, startBar += 8) {
      const sectionProfile = profile.sections[sectionIndex]!
      // Pareto phrase grammar at every intensity: the anchor motif owns ~80%
      // of phrases and the contrast motif ~20% (one seeded pick in five).
      // Return sections always restate the anchor; breakdowns keep their
      // alternating rest cadence as the song's deliberate quiet time.
      const seedPick = hashText(`${seed}:${profile.id}:section-${sectionIndex}:phrase-${ordinal}`) % 5
      const motif = sectionProfile.phraseMode === 'return'
        ? 'A'
        : sectionProfile.phraseMode === 'breakdown' && ordinal % 2 === 1
          ? 'rest'
          : (sectionIndex === 0 && ordinal === 0) || seedPick !== 0 ? 'A' : 'B'
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
  // B is a contrast against the anchor motif, never a second theme: two B
  // phrases must not chain, so the anchor family always dominates the song's
  // occupied time regardless of arc shape or seed.
  let previousMotif: MixJamGeneratorPhrasePlan['motif'] | null = null
  for (const phrase of phrases) {
    if (phrase.motif === 'B' && previousMotif === 'B') phrase.motif = 'A'
    if (phrase.motif !== 'rest') previousMotif = phrase.motif
  }
  return phrases
}

function ensurePhraseLaneCoverage(
  phrases: MixJamGeneratorPhrasePlan[], sections: MixJamGeneratorSectionPlan[],
  profile: GeneratorProfile, selections: readonly (Selection | null)[]
): void {
  for (let laneIndex = 0; laneIndex < profile.lanes.length; laneIndex++) {
    const lane = profile.lanes[laneIndex]!
    if (!selections[laneIndex] || lane.role === 'transition') continue
    const scheduled = phrases.some((phrase, phraseIndex) =>
      phrase.activeLanes.includes(laneIndex) && phrase.motif !== 'rest' &&
      (lane.role !== 'vocal' || phraseIndex % 2 === 0)
    )
    if (scheduled) continue
    const candidates = phrases.flatMap((phrase, phraseIndex) => {
      const allowed = profile.sections[phrase.sectionIndex]!.activeLanes.includes(laneIndex)
      const sparseRoleTurn = lane.role === 'vocal' && phraseIndex % 2 === 1
      return allowed && phrase.motif !== 'rest' && !sparseRoleTurn
        ? [{ phrase, phraseIndex }]
        : []
    }).sort((left, right) => left.phraseIndex - right.phraseIndex)
    const target = candidates[0]
    if (!target) continue
    target.phrase.activeLanes = [...target.phrase.activeLanes, laneIndex].sort((a, b) => a - b)
    const section = sections[target.phrase.sectionIndex]!
    if (!section.activeLanes.includes(laneIndex)) {
      section.activeLanes = [...section.activeLanes, laneIndex].sort((a, b) => a - b)
    }
  }
}

function schedulePercussion(
  lane: MixJamGeneratorLanePlan, laneProfile: GeneratorLaneProfile, selection: Selection,
  phrase: MixJamGeneratorPhrasePlan, phraseOrdinal: number, bpm: number,
  profile: GeneratorProfile, seed: string, intensity: MixJamGeneratorParameters['intensity'],
  nextOrdinal: () => number
): void {
  for (let bar = phrase.startBar; bar < phrase.endBar; bar++) {
    const isFill = intensity === 'high' &&
      bar === phrase.endBar - 1 && phrase.endBar - phrase.startBar > 1
    const useMutation = isFill || (phrase.motif === 'B' && (bar - phrase.startBar) % 2 === 1)
    const pattern = useMutation
      ? laneProfile.beatMutation ?? laneProfile.beatPattern!
      : laneProfile.beatPattern!
    const candidate = candidateForPhrase(selection, phrase, phraseOrdinal, lane.index, bar - phrase.startBar)
    const span = durationTicks(candidate, bpm)
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
  sectionEndBar: number, profile: GeneratorProfile, seed: string, nextOrdinal: () => number
): void {
  if (phrase.motif === 'rest') return
  // Vocals stay event-like on alternating phrases; atmosphere pads sustain
  // continuously — skipping their odd phrases left half the song padless.
  if (laneProfile.role === 'vocal' && phraseOrdinal % 2 === 1) return
  const phraseStart = phrase.startBar * TICKS_PER_BAR
  const phraseEnd = phrase.endBar * TICKS_PER_BAR
  if (laneProfile.role === 'motif') {
    let startTick = phraseStart
    let cue = 0
    while (startTick < phraseEnd) {
      const candidate = candidateForPhrase(selection, phrase, phraseOrdinal, lane.index, cue)
      const span = durationTicks(candidate, bpm)
      if (startTick + span > phraseEnd) break
      addPlacement(lane, candidate, startTick, span, nextOrdinal(), profile, seed)
      // Advance to the next whole-beat boundary at or after the sample end so a
      // short motif fragment (e.g. a sub-beat bass one-shot) lands on the
      // rhythmic grid as distinct notes instead of a machine-gun tile at its
      // raw length. Whole-bar loops end on a beat already, so they still
      // butt-join with no gap.
      startTick = quantizeUpToBeat(startTick + span)
      cue++
    }
    return
  }

  const candidate = candidateForPhrase(selection, phrase, phraseOrdinal, lane.index)
  const span = durationTicks(candidate, bpm)
  const roleEnd = laneProfile.role === 'atmosphere' ? sectionEndBar * TICKS_PER_BAR : phraseEnd
  if (phraseStart + span <= roleEnd) {
    addPlacement(lane, candidate, phraseStart, span, nextOrdinal(), profile, seed)
  }

  // A second cue after a deliberate rest gives long phrases a recognizable
  // call/response shape without continuously tiling the source.
  if (laneProfile.role !== 'vocal') return
  const response = candidateForPhrase(selection, phrase, phraseOrdinal, lane.index, 1)
  const responseSpan = durationTicks(response, bpm)
  const secondStart = phraseEnd - responseSpan
  if (secondStart >= phraseStart + span && secondStart + responseSpan <= phraseEnd) {
    addPlacement(lane, response, secondStart, responseSpan, nextOrdinal(), profile, seed)
  }
}

function schedulingSignature(
  laneProfile: GeneratorLaneProfile,
  selection: Selection,
  phrase: MixJamGeneratorPhrasePlan,
  phraseOrdinal: number,
  laneIndex: number
): string | null {
  if (phrase.motif === 'rest') return null
  if (laneProfile.role === 'vocal' && phraseOrdinal % 2 === 1) return null
  const candidate = candidateForPhrase(selection, phrase, phraseOrdinal, laneIndex)
  if (laneProfile.role === 'percussion') {
    const pattern = phraseOrdinal % 2 === 1
      ? laneProfile.beatMutation ?? laneProfile.beatPattern!
      : laneProfile.beatPattern!
    return `${candidate.relpath}:${pattern.join(',')}`
  }
  const response = laneProfile.role === 'vocal'
    ? candidateForPhrase(selection, phrase, phraseOrdinal, laneIndex, 1)
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
      const ordered = selection.candidates.map((_, index) =>
        selection.candidates[(index + sectionIndex) % selection.candidates.length]!
      )
      const placement = ordered.map((candidate) => {
        const span = durationTicks(candidate, bpm)
        const startTick = laneProfile.transitionKind === 'riser' ? boundary - span : boundary
        return { candidate, span, startTick }
      }).find(({ startTick, span }) => startTick >= 0 &&
        startTick + span <= sections.at(-1)!.endBar * TICKS_PER_BAR &&
        intervalIsFree(lanes[laneIndex]!, startTick, startTick + span))
      if (placement) {
        addPlacement(lanes[laneIndex]!, placement.candidate, placement.startTick, placement.span,
          nextOrdinal(laneIndex), profile, seed)
      }
    }
  }
}

function addCoveragePlacement(
  laneIndex: number, candidate: PlanningCandidate,
  lanes: MixJamGeneratorLanePlan[], phrases: MixJamGeneratorPhrasePlan[],
  sections: MixJamGeneratorSectionPlan[], profile: GeneratorProfile,
  bpm: number, seed: string, nextOrdinal: (laneIndex: number) => number
): boolean {
  const lane = lanes[laneIndex]!
  const laneProfile = profile.lanes[laneIndex]!
  const span = durationTicks(candidate, bpm)
  if (laneProfile.role === 'transition') {
    for (let sectionIndex = 1; sectionIndex < sections.length; sectionIndex++) {
      const boundary = sections[sectionIndex]!.startBar * TICKS_PER_BAR
      const startTick = laneProfile.transitionKind === 'riser' ? boundary - span : boundary
      if (startTick >= 0 && startTick + span <= sections.at(-1)!.endBar * TICKS_PER_BAR &&
          intervalIsFree(lane, startTick, startTick + span)) {
        addPlacement(lane, candidate, startTick, span, nextOrdinal(laneIndex), profile, seed)
        return true
      }
    }
    return false
  }

  for (let phraseIndex = 0; phraseIndex < phrases.length; phraseIndex++) {
    const phrase = phrases[phraseIndex]!
    if (!phrase.activeLanes.includes(laneIndex) || phrase.motif === 'rest') continue
    if (laneProfile.role === 'vocal' && phraseIndex % 2 === 1) continue
    const phraseStart = phrase.startBar * TICKS_PER_BAR
    const phraseEnd = phrase.endBar * TICKS_PER_BAR
    const roleEnd = laneProfile.role === 'atmosphere'
      ? sections[phrase.sectionIndex]!.endBar * TICKS_PER_BAR
      : phraseEnd
    const offsets = laneProfile.role === 'percussion'
      ? [...new Set([...(laneProfile.beatPattern ?? []), ...(laneProfile.beatMutation ?? [])])]
      : [0]
    for (let barTick = phraseStart; barTick < phraseEnd; barTick += TICKS_PER_BAR) {
      for (const offset of offsets) {
        const startTick = barTick + offset
        if (startTick + span <= roleEnd && intervalIsFree(lane, startTick, startTick + span)) {
          addPlacement(lane, candidate, startTick, span, nextOrdinal(laneIndex), profile, seed)
          return true
        }
      }
    }
  }

  // Intensity filtering can leave a lane active only in sections that are too
  // short for its selected source. Fall back to another profile-approved
  // section and make that decision visible in the section and phrase plans.
  for (const phrase of phrases) {
    if (!profile.sections[phrase.sectionIndex]!.activeLanes.includes(laneIndex) || phrase.motif === 'rest') continue
    const phraseStart = phrase.startBar * TICKS_PER_BAR
    const phraseEnd = phrase.endBar * TICKS_PER_BAR
    const roleEnd = laneProfile.role === 'atmosphere'
      ? sections[phrase.sectionIndex]!.endBar * TICKS_PER_BAR
      : phraseEnd
    const offsets = laneProfile.role === 'percussion'
      ? [...new Set([...(laneProfile.beatPattern ?? []), ...(laneProfile.beatMutation ?? [])])]
      : [0]
    for (let barTick = phraseStart; barTick < phraseEnd; barTick += TICKS_PER_BAR) {
      for (const offset of offsets) {
        const startTick = barTick + offset
        if (startTick + span > roleEnd || !intervalIsFree(lane, startTick, startTick + span)) continue
        addPlacement(lane, candidate, startTick, span, nextOrdinal(laneIndex), profile, seed)
        if (!phrase.activeLanes.includes(laneIndex)) {
          phrase.activeLanes = [...phrase.activeLanes, laneIndex].sort((left, right) => left - right)
        }
        const section = sections[phrase.sectionIndex]!
        if (!section.activeLanes.includes(laneIndex)) {
          section.activeLanes = [...section.activeLanes, laneIndex].sort((left, right) => left - right)
        }
        return true
      }
    }
  }
  return false
}

function ensureArrangementCoverage(
  lanes: MixJamGeneratorLanePlan[], phrases: MixJamGeneratorPhrasePlan[],
  sections: MixJamGeneratorSectionPlan[], profile: GeneratorProfile,
  selections: readonly (Selection | null)[], bpm: number, seed: string,
  nextOrdinal: (laneIndex: number) => number
): Set<string> {
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
    if (lanes[laneIndex]!.placements.length > 0) continue
    selections[laneIndex]?.candidates.some((candidate) =>
      addCoveragePlacement(laneIndex, candidate, lanes, phrases, sections, profile, bpm, seed, nextOrdinal)
    )
  }

  const candidateByRef = new Map(selections.flatMap((selection) =>
    selection?.candidates.map((candidate) => [candidate.relpath, candidate] as const) ?? []
  ))
  const usedCategories = new Set(lanes.flatMap((lane) => lane.placements.map((placement) =>
    candidateByRef.get(placement.sampleRef)?.categoryName
  )).filter((category): category is string => category !== undefined))
  const categories = [...new Set(selections.flatMap((selection) =>
    selection?.candidates.map((candidate) => candidate.categoryName) ?? []
  ))].sort(compareCodeUnits)
  // Categories whose every candidate was tried against every legal slot and
  // still found no free window. The validator excuses exactly these: a category
  // without a legal placement window is not a coverage failure.
  const unplaceable = new Set<string>()
  for (const category of categories) {
    if (usedCategories.has(category)) continue
    const options = selections.flatMap((selection, laneIndex) => selection
      ? selection.candidates.flatMap((candidate) =>
        candidate.categoryName === category ? [{ laneIndex, candidate }] : []
      )
      : [])
    const placed = options.some(({ laneIndex, candidate }) =>
      addCoveragePlacement(laneIndex, candidate, lanes, phrases, sections, profile, bpm, seed, nextOrdinal)
    )
    if (placed) usedCategories.add(category)
    else unplaceable.add(category)
  }
  return unplaceable
}

// Selected family siblings do not all reach the timeline on their own: the
// anchor pool owns A phrases and everything else waits for the ~20% of B
// phrases, so a coverage singleton can be placed while its selected sibling
// never is. This pass places unplaced siblings of placed singletons into free
// legal slots until the placed material meets the intensity's family target.
// Returns true when the target stays out of reach after exhausting the moves.
function ensureFamilyRatioPlacements(
  lanes: MixJamGeneratorLanePlan[], phrases: MixJamGeneratorPhrasePlan[],
  sections: MixJamGeneratorSectionPlan[], profile: GeneratorProfile,
  selections: readonly (Selection | null)[],
  eligibleSelections: readonly (Selection | null)[], bpm: number, seed: string,
  familyTarget: number, nextOrdinal: (laneIndex: number) => number
): boolean {
  const candidateByRef = new Map([...selections, ...eligibleSelections].flatMap((selection) =>
    selection?.candidates.map((candidate) => [candidate.relpath, candidate] as const) ?? []
  ))
  const placedCandidates = (): PlanningCandidate[] => {
    const refs = new Set(lanes.flatMap((lane) => lane.placements.map((placement) => placement.sampleRef)))
    return [...refs].flatMap((ref) => {
      const candidate = candidateByRef.get(ref)
      return candidate ? [candidate] : []
    })
  }
  for (let round = 0; round < 64; round++) {
    const placed = placedCandidates()
    if (familyRatioOf(placed) >= familyTarget - 1e-9) return false
    const placedParts = new Map<string, Set<number>>()
    for (const candidate of placed) {
      const key = parseMotifKey(candidate.filename)
      const parts = placedParts.get(key.family) ?? new Set<number>()
      parts.add(key.part)
      placedParts.set(key.family, parts)
    }
    const placedRefs = new Set(placed.map((candidate) => candidate.relpath))
    // Placing a candidate must turn a placed singleton into a family (or add
    // a new part to one) — placing fresh singletons only sinks the ratio.
    const repairs = (candidate: PlanningCandidate): boolean => {
      if (placedRefs.has(candidate.relpath)) return false
      const key = parseMotifKey(candidate.filename)
      const parts = placedParts.get(key.family)
      return parts !== undefined && !parts.has(key.part)
    }
    let repaired = false
    // Selected-but-unplaced siblings first; then siblings that selection never
    // took but the lane's eligible pool still holds. An eligible sibling that
    // gets placed joins the lane's selection so the plan's selection record
    // stays a superset of what is on the timeline.
    for (let laneIndex = 0; laneIndex < lanes.length && !repaired; laneIndex++) {
      const selection = selections[laneIndex]
      if (!selection || profile.lanes[laneIndex]!.role === 'transition') continue
      for (const candidate of selection.candidates) {
        if (!repairs(candidate)) continue
        if (addCoveragePlacement(laneIndex, candidate, lanes, phrases, sections, profile, bpm, seed, nextOrdinal)) {
          repaired = true
          break
        }
      }
    }
    const selectedRefs = new Set(selections.flatMap((selection) =>
      selection?.candidates.map((candidate) => candidate.relpath) ?? []
    ))
    for (let laneIndex = 0; laneIndex < lanes.length && !repaired; laneIndex++) {
      const selection = selections[laneIndex]
      const eligible = eligibleSelections[laneIndex]
      if (!selection || !eligible || profile.lanes[laneIndex]!.role === 'transition') continue
      for (const candidate of eligible.candidates) {
        if (!repairs(candidate)) continue
        if (selectedRefs.has(candidate.relpath)) continue
        if (addCoveragePlacement(laneIndex, candidate, lanes, phrases, sections, profile, bpm, seed, nextOrdinal)) {
          selection.candidates.push(candidate)
          repaired = true
          break
        }
      }
    }
    if (!repaired) return true
  }
  return familyRatioOf(placedCandidates()) < familyTarget - 1e-9
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

function validateArrangement(
  lanes: readonly MixJamGeneratorLanePlan[], targetTicks: number,
  candidates: readonly PlanningCandidate[], bpm: number,
  eligibleSelections: readonly (Selection | null)[],
  sections: readonly MixJamGeneratorSectionPlan[], profile: GeneratorProfile,
  unplaceableCategories: ReadonlySet<string>,
  familyTarget: number, familyRatioShortfall: boolean,
  densityShortfallLanes: ReadonlySet<number>
): void {
  let songEnd = 0
  const populated = lanes.filter((lane) => lane.placements.length > 0)
  if (populated.length < MIN_GENERATED_LANES) {
    throw new Error(
      `The generator filled only ${populated.length} lanes; at least ${MIN_GENERATED_LANES} are required.`
    )
  }
  if (populated.length > MAX_GENERATED_LANES) {
    throw new Error(
      `The generator filled ${populated.length} lanes; at most ${MAX_GENERATED_LANES} are allowed.`
    )
  }
  for (const lane of lanes) {
    if (lane.placements.length === 0) {
      // A support lane with no compatible material stays empty and is pruned by
      // the renderer; a lane that had a selection but no placement is a bug.
      if (eligibleSelections[lane.index] === null) continue
      throw new Error(`The generator could not place material on the ${lane.name} lane.`)
    }
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

  const candidateByRef = new Map(candidates.map((candidate) => [candidate.relpath, candidate]))
  const placedCandidates = lanes.flatMap((lane) => lane.placements.map((placement) =>
    candidateByRef.get(placement.sampleRef)!
  ))
  const eligibleCategories = new Set(eligibleSelections.flatMap((selection, laneIndex) =>
    selection?.candidates.flatMap((candidate) =>
      durationTicks(candidate, bpm) <= maximumLegalSpan(laneIndex, sections, profile)
        ? [candidate.categoryName]
        : []
    ) ?? []
  ))
  const usedCategories = new Set(placedCandidates.map((candidate) => candidate.categoryName))
  const missingCategories = [...eligibleCategories].filter((category) =>
    !usedCategories.has(category) && !unplaceableCategories.has(category)
  ).sort(compareCodeUnits)
  if (missingCategories.length > 0) {
    throw new Error(`The generator could not place these eligible categories: ${missingCategories.join(', ')}.`)
  }

  const longThreshold = 4 * TICKS_PER_BAR
  const hasEligibleLongSample = eligibleSelections.some((selection, laneIndex) =>
    selection?.candidates.some((candidate) => {
      const span = durationTicks(candidate, bpm)
      return span > longThreshold && span <= maximumLegalSpan(laneIndex, sections, profile)
    })
  )
  if (hasEligibleLongSample && !placedCandidates.some((candidate) =>
    durationTicks(candidate, bpm) > longThreshold
  )) {
    throw new Error('The generator could not place available long-form material.')
  }

  // Family membership of the material actually placed. The shortfall flag is
  // set only when selection exhausted every sibling-add and singleton-trim
  // move — a corpus without numbered families must stay generatable.
  if (!familyRatioShortfall && familyRatioOf(placedCandidates) < familyTarget - 1e-9) {
    throw new Error(
      `The generator placed too many family-less samples for ${Math.round(familyTarget * 100)}% family coherence.`
    )
  }

  // The Pareto density rule: 80% of populated non-transition lanes must be
  // populated for 80% of the song's bars (bar population is role-aware, see
  // barPopulation). Lanes in the density shortfall set exhausted every legal
  // fill slot and are excused — the rule binds where filling was possible.
  const targetBars = targetTicks / TICKS_PER_BAR
  const densityEligible = lanes.filter((lane) =>
    lane.placements.length > 0 && profile.lanes[lane.index]!.role !== 'transition' &&
    !densityShortfallLanes.has(lane.index)
  )
  const requiredDenseBars = Math.ceil(DENSE_BAR_SHARE * targetBars - 1e-9)
  const denseCount = densityEligible.filter((lane) =>
    laneDenseBarCount(lane, profile.lanes[lane.index]!, targetBars) >= requiredDenseBars
  ).length
  if (denseCount < Math.ceil(DENSE_LANE_SHARE * densityEligible.length - 1e-9)) {
    throw new Error(
      `Only ${denseCount} of ${densityEligible.length} fillable lanes are dense enough; ` +
      `at least ${Math.round(DENSE_LANE_SHARE * 100)}% must be populated for ` +
      `${Math.round(DENSE_BAR_SHARE * 100)}% of the song.`
    )
  }
}

export function createMixJamGeneratorPlan(
  rootKey: string,
  corpusFingerprint: string,
  candidates: readonly PlanningCandidate[],
  parameters: MixJamGeneratorParameters,
  analysis = { attemptedFiles: candidates.length, analyzedFiles: candidates.length, uniqueReads: candidates.length },
  detectedBpm = parameters.bpm,
  profiles: Readonly<Record<string, GeneratorProfile>> = GENERATOR_PROFILES,
  // The full library listing, used only to resolve stereo twins: a twin needs
  // no audio analysis to mirror its analyzed half, so pair lanes never spend
  // the bounded analysis budget on right halves.
  libraryCandidates: readonly GeneratorCandidate[] = candidates
): MixJamGeneratorPlan {
  validateMixJamGeneratorParameters(parameters, Object.keys(profiles))
  const profile = profiles[parameters.profileId]!
  const bpm = parameters.bpmMode === 'follow-detected' ? detectedBpm : parameters.bpm
  if (bpm === undefined) throw new Error('No canonical analyzer tempo was supplied for generation.')
  // Whole 8-bar phrases only: dance music is phrased in eights, and a trailing
  // partial phrase (the old 105-bar arrangements) reads as a mistake.
  const targetBars = Math.max(8, 8 * halfUp(parameters.durationSeconds * bpm / 1920))
  const targetTicks = targetBars * TICKS_PER_BAR
  const key = dominantKey(candidates)
  const sampleCount = parameters.intensity === 'low' ? 3 : parameters.intensity === 'medium' ? 4 : 5
  const familyTarget = FAMILY_RATIO_TARGETS[parameters.intensity]
  const twins = stereoTwinMap(libraryCandidates)
  const eligibleSelections = profile.lanes.map((_, laneIndex) => {
    const selected = findTypeCandidates(candidates, profile, laneIndex, bpm, key, parameters.seed)
    return selected
  })

  const coreLanes = new Set(profile.coreLanes)
  for (const laneIndex of coreLanes) {
    if (!eligibleSelections[laneIndex]) {
      throw new Error(`The ${profile.id} profile requires a ${profile.lanes[laneIndex]!.types.join(' or ')} sample.`)
    }
  }
  // Support lanes without compatible material stay unfilled and are pruned
  // before save; the populated-lane floor below decides whether the remaining
  // arrangement is still viable.
  applyKitCoherence(eligibleSelections, profile)
  const pairLanes = designateStereoPairLanes(eligibleSelections, profile, twins)
  const allocatedSections = allocateSections(profile, targetBars)
  const { selected: selections, familyRatioShortfall } = selectDiverseCandidates(
    eligibleSelections, sampleCount, allocatedSections, profile, bpm, twins, familyTarget
  )
  const sections = allocatedSections.map((section) => ({
    ...section,
    activeLanes: section.activeLanes.filter((laneIndex) => selections[laneIndex] !== null)
  }))
  ensureSectionLaneCoverage(sections, profile, selections)
  const phrases = createPhrases(sections, profile, parameters.seed)
  ensurePhraseLaneCoverage(phrases, sections, profile, selections)
  const ordinals = Array.from({ length: profile.lanes.length }, () => 0)
  const repetition = Array.from({ length: profile.lanes.length }, () => ({ signature: '', run: 0 }))
  const nextOrdinal = (laneIndex: number): number => ordinals[laneIndex]++
  const lanes: MixJamGeneratorLanePlan[] = profile.lanes.map((lane, laneIndex) => ({
    index: laneIndex, name: lane.name, gain: lane.gain, pan: lane.pan, muted: false, solo: false, placements: []
  }))

  for (let phraseOrdinal = 0; phraseOrdinal < phrases.length; phraseOrdinal++) {
    const phrase = phrases[phraseOrdinal]!
    const scheduledLanes = new Set<number>()
    for (const laneIndex of phrase.activeLanes) {
      const laneProfile = profile.lanes[laneIndex]!
      const selection = selections[laneIndex]
      if (!selection || laneProfile.role === 'transition') continue
      const signature = schedulingSignature(laneProfile, selection, phrase, phraseOrdinal, laneIndex)
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
        schedulePercussion(
          lanes[laneIndex]!, laneProfile, selection, phrase, phraseOrdinal, bpm,
          profile, parameters.seed, parameters.intensity, () => nextOrdinal(laneIndex)
        )
      } else {
        schedulePhraseRole(
          lanes[laneIndex]!, laneProfile, selection, phrase, phraseOrdinal, bpm,
          sections[phrase.sectionIndex]!.endBar, profile, parameters.seed, () => nextOrdinal(laneIndex)
        )
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
  const unplaceableCategories = ensureArrangementCoverage(
    lanes, phrases, sections, profile, selections, bpm, parameters.seed, nextOrdinal
  )
  const densityShortfallLanes = ensureLaneDensity(
    lanes, phrases, sections, profile, selections, bpm, targetBars, parameters.seed, nextOrdinal
  )
  const familyPlacementShortfall = ensureFamilyRatioPlacements(
    lanes, phrases, sections, profile, selections, eligibleSelections, bpm, parameters.seed,
    familyTarget, nextOrdinal
  )

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
  validateArrangement(
    lanes, targetTicks, candidates, bpm, eligibleSelections, sections, profile, unplaceableCategories,
    familyTarget, familyRatioShortfall || familyPlacementShortfall, densityShortfallLanes
  )

  // RMS compensation applies only to sustained tonal roles, compared against
  // other tonal material. A drum one-shot's RMS is transient-shaped and not
  // comparable to a loop's, so compensating percussion against a global median
  // inverted the template's mix hierarchy (hi-hats above the kick).
  const tonalSelected = selections.flatMap((selection, laneIndex) =>
    selection && FAMILY_ROLES.has(profile.lanes[laneIndex]!.role) ? selection.candidates : []
  )
  const rmsValues = tonalSelected.flatMap((candidate) => candidate.rms && candidate.rms > 0 ? [candidate.rms] : []).sort((a, b) => a - b)
  const targetRms = rmsValues.length > 0 ? rmsValues[Math.floor(rmsValues.length / 2)]! : null
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
    const laneProfile = profile.lanes[laneIndex]!
    // Support lanes never out-shout the core: +6 dB of RMS compensation on a
    // quiet source pushed textural loops above the kick in real projects.
    const ceiling = profile.coreLanes.includes(laneIndex) ? 1 : 0.6
    lanes[laneIndex]!.gain = FAMILY_ROLES.has(laneProfile.role)
      ? Math.min(compensatedGain(laneProfile.gain, selections[laneIndex]?.candidates ?? [], targetRms), ceiling)
      : laneProfile.gain
  }
  applyStereoPairs(lanes, pairLanes, twins, profile, parameters.seed)
  validateStereoImage(lanes, profile.lanes.length)
  const selectionPlans = selections.flatMap((selection, laneIndex) => selection ? [{
    laneIndex,
    requestedType: selection.requestedType,
    selectedType: selection.candidates[0]!.sampleType,
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
      ...(parameters.tempoClusterPrefix !== undefined
        ? { tempoClusterPrefix: parameters.tempoClusterPrefix }
        : {}),
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
    substitutions: selections.flatMap((selection, laneIndex) => selection
      ? [...new Set(selection.candidates.map((candidate) => candidate.sampleType))]
        .filter((selectedType) => selectedType !== selection.requestedType)
        .map((selectedType) => ({ laneIndex, requestedType: selection.requestedType, selectedType }))
      : []),
    sections,
    phrases,
    lanes
  }
}
