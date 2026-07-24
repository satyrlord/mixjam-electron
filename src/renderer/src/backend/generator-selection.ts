import type { MixJamGeneratorSectionPlan, SampleType } from '../../../shared/backend-api'
import { TICKS_PER_BAR } from '../engine/transport'
import { generatorCandidateMatchesLane } from './generator-candidate'
import type { GeneratorCandidate } from './generator-library'
import { groupMotifFamilies, logicalSampleKey, parseMotifKey } from './generator-motif'
import {
  FAMILY_ROLES,
  TONAL_TYPES,
  candidateFamily,
  compareCodeUnits,
  durationTicks,
  hashText,
  keyRank,
  maximumLegalSpan,
  type GeneratorLaneProfile,
  type GeneratorProfile,
  type PlanningCandidate,
  type Selection
} from './generator-planning-core'

// Tempo/key compatibility folded into one bucket so family ordering can insist
// on it before anything else. Within the same bucket a multi-part family beats
// a singleton: real generated projects anchored lanes on lone samples because
// a singleton with a marginally better fine-grained rank outranked a coherent
// five-part family.
function compatibilityRank(
  candidate: PlanningCandidate, type: SampleType, bpm: number, key: string | null,
  profile: GeneratorProfile
): number {
  const bpmRank = candidate.bpm === null ? 1 : Math.abs(candidate.bpm - bpm) <= profile.bpmTolerance ? 0 : 2
  const tonal = TONAL_TYPES.has(type)
  return bpmRank * 4 + (tonal ? keyRank(candidate.musicalKey, key) : 0)
}

function matchesRole(candidate: PlanningCandidate, lane: GeneratorLaneProfile, type: SampleType, bpm: number): boolean {
  return generatorCandidateMatchesLane(candidate, lane, type, bpm)
}

// Musical ranking criteria only — no deterministic tiebreak. Family ordering
// compares with this so a real quality difference decides, while ties fall to
// family size instead of an arbitrary per-file hash.
function candidateRankCore(
  left: PlanningCandidate, right: PlanningCandidate, lane: GeneratorLaneProfile,
  type: SampleType, bpm: number, key: string | null, profile: GeneratorProfile
): number {
  const tonal = TONAL_TYPES.has(type)
  const leftBpmRank = left.bpm === null ? 1 : Math.abs(left.bpm - bpm) <= profile.bpmTolerance ? 0 : 2
  const rightBpmRank = right.bpm === null ? 1 : Math.abs(right.bpm - bpm) <= profile.bpmTolerance ? 0 : 2
  if (leftBpmRank !== rightBpmRank) return leftBpmRank - rightBpmRank
  if (tonal) {
    const difference = keyRank(left.musicalKey, key) - keyRank(right.musicalKey, key)
    if (difference !== 0) return difference
  }
  if (lane.role === 'transition') {
    const leftKindRank = left.plannerKind === lane.transitionKind ? 0 : 1
    const rightKindRank = right.plannerKind === lane.transitionKind ? 0 : 1
    if (leftKindRank !== rightKindRank) return leftKindRank - rightKindRank
  }
  if (lane.preferLong) {
    const durationDifference = durationTicks(right, bpm) - durationTicks(left, bpm)
    if (durationDifference !== 0) return durationDifference
  }
  if (lane.role === 'motif') {
    // Prefer ready-made loops over one-shot fragments the arranger would have to
    // tile: a multi-bar rhythmic/tonal loop is a fuller, more musical source
    // than a short stab, so rank longer sources first (bucketed to whole bars so
    // small length differences do not churn the deterministic order).
    const bars = (candidate: PlanningCandidate): number =>
      Math.round(durationTicks(candidate, bpm) / TICKS_PER_BAR)
    const lengthDifference = bars(right) - bars(left)
    if (lengthDifference !== 0) return lengthDifference
    // Then prefer sources that loop cleanly. Bucket the continuous 0..1 metrics
    // so floating-point noise never perturbs the deterministic order; only an
    // audible-quality gap changes ranking.
    const bucket = (value: number | undefined): number => Math.round((value ?? 0) * 5)
    const continuity = bucket(right.boundaryContinuity) - bucket(left.boundaryContinuity)
    if (continuity !== 0) return continuity
    const confidence = bucket(right.loopConfidence) - bucket(left.loopConfidence)
    if (confidence !== 0) return confidence
  }
  // A lone right stereo half sounds like half an image; prefer the left/mono
  // twin whenever both rank equally otherwise.
  const leftIsRightHalf = parseMotifKey(left.filename).side === 'right' ? 1 : 0
  const rightIsRightHalf = parseMotifKey(right.filename).side === 'right' ? 1 : 0
  return leftIsRightHalf - rightIsRightHalf
}

function candidateRank(
  left: PlanningCandidate, right: PlanningCandidate, lane: GeneratorLaneProfile,
  type: SampleType, bpm: number, key: string | null, profile: GeneratorProfile,
  laneIndex: number, seed: string
): number {
  const core = candidateRankCore(left, right, lane, type, bpm, key, profile)
  if (core !== 0) return core
  const roleSeed = `${seed}:${profile.id}:${profile.version}:lane-${laneIndex}:${type}`
  const hashDifference = hashText(`${roleSeed}:${left.relpath}`) - hashText(`${roleSeed}:${right.relpath}`)
  return hashDifference || compareCodeUnits(left.relpath, right.relpath)
}

function orderedCandidates(
  candidates: readonly PlanningCandidate[], profile: GeneratorProfile, laneIndex: number,
  type: SampleType, bpm: number, key: string | null, seed: string
): PlanningCandidate[] {
  const lane = profile.lanes[laneIndex]!
  const tonal = TONAL_TYPES.has(type)
  const eligible = candidates
    .filter((candidate) => candidate.sampleType === type && matchesRole(candidate, lane, type, bpm))
    .filter((candidate) => !tonal || keyRank(candidate.musicalKey, key) < 3)
  const rank = (left: PlanningCandidate, right: PlanningCandidate): number =>
    candidateRank(left, right, lane, type, bpm, key, profile, laneIndex, seed)

  // Percussion one-shots and boundary transitions have no motif family; rank
  // them individually as before.
  if (!FAMILY_ROLES.has(lane.role)) return [...eligible].sort(rank)

  // Group by authored family and keep each family's numbered parts adjacent and
  // in order, so consecutive phrase cues walk one coherent motif (part 1 -> 2
  // -> 3) before ever crossing into a sibling family. Families lead in
  // best-member rank order, so the strongest, most-compatible motif anchors the
  // lane while smaller sibling families supply later variety.
  const families = groupMotifFamilies(eligible)
  const bestMember = new Map(families.map((group) => [
    group.family,
    [...group.members].sort(rank)[0]!
  ]))
  // Families compete first on tempo/key compatibility, then multi-part
  // families beat singletons outright, and only then does fine-grained quality
  // order them. Without the multi-part bucket, singleton families with a
  // slightly better core rank anchored most lanes and the family walk had
  // nothing to walk.
  families.sort((left, right) => {
    const leftBest = bestMember.get(left.family)!
    const rightBest = bestMember.get(right.family)!
    return compatibilityRank(leftBest, type, bpm, key, profile) -
      compatibilityRank(rightBest, type, bpm, key, profile) ||
      Number(right.partCount >= 2) - Number(left.partCount >= 2) ||
      candidateRankCore(leftBest, rightBest, lane, type, bpm, key, profile) ||
      right.partCount - left.partCount ||
      rank(leftBest, rightBest) ||
      compareCodeUnits(left.family, right.family)
  })
  return families.flatMap((group) => group.members)
}

export function findTypeCandidates(
  candidates: readonly PlanningCandidate[], profile: GeneratorProfile, laneIndex: number,
  bpm: number, key: string | null, seed: string
): Selection | null {
  const types = profile.lanes[laneIndex]!.types
  const ordered = types.flatMap((type) =>
    orderedCandidates(candidates, profile, laneIndex, type, bpm, key, seed)
  )
  return ordered.length > 0
    ? { requestedType: types[0]!, selectedType: ordered[0]!.sampleType, candidates: ordered }
    : null
}

// The numbered families in these libraries are authored kits: one family's bass
// part belongs with its lead and pad parts. Once the core tonal lanes have
// chosen their anchor families, sibling tonal lanes prefer parts of those same
// families, so the song is built from one or two kits instead of a collage of
// unrelated ones. Reordering keeps each lane's eligibility and rank otherwise.
export function applyKitCoherence(
  selections: readonly (Selection | null)[],
  profile: GeneratorProfile
): void {
  const kitFamilies = new Set<string>()
  for (const laneIndex of profile.coreLanes) {
    const selection = selections[laneIndex]
    if (!selection || !FAMILY_ROLES.has(profile.lanes[laneIndex]!.role)) continue
    const anchor = selection.candidates[0]
    if (anchor) kitFamilies.add(candidateFamily(anchor))
  }
  if (kitFamilies.size === 0) return
  for (let laneIndex = 0; laneIndex < selections.length; laneIndex++) {
    const selection = selections[laneIndex]
    const lane = profile.lanes[laneIndex]!
    if (!selection || !FAMILY_ROLES.has(lane.role) || profile.coreLanes.includes(laneIndex)) continue
    const kit = selection.candidates.filter((candidate) => kitFamilies.has(candidateFamily(candidate)))
    if (kit.length === 0) continue
    const rest = selection.candidates.filter((candidate) => !kitFamilies.has(candidateFamily(candidate)))
    selection.candidates = [...kit, ...rest]
  }
}

// Share of distinct logical samples that belong to a family with at least two
// distinct selected parts. This is the measurable form of "samples belong to
// families": one lone member of a ten-part family still sounds like a random
// pick, so membership requires a sibling in the song.
export function familyRatioOf(candidates: readonly PlanningCandidate[]): number {
  const byLogical = new Map<string, PlanningCandidate>()
  for (const candidate of candidates) {
    const key = logicalSampleKey(candidate)
    if (!byLogical.has(key)) byLogical.set(key, candidate)
  }
  if (byLogical.size === 0) return 1
  const partsByFamily = new Map<string, Set<number>>()
  for (const candidate of byLogical.values()) {
    const key = parseMotifKey(candidate.filename)
    const parts = partsByFamily.get(key.family) ?? new Set<number>()
    parts.add(key.part)
    partsByFamily.set(key.family, parts)
  }
  let members = 0
  for (const candidate of byLogical.values()) {
    if (partsByFamily.get(parseMotifKey(candidate.filename).family)!.size >= 2) members++
  }
  return members / byLogical.size
}

export function selectDiverseCandidates(
  selections: readonly (Selection | null)[],
  sampleCount: number,
  sections: readonly MixJamGeneratorSectionPlan[],
  profile: GeneratorProfile,
  bpm: number,
  twins: ReadonlyMap<string, GeneratorCandidate>,
  familyTarget: number
): { selected: Array<Selection | null>; familyRatioShortfall: boolean } {
  const selected = selections.map((selection) => selection
    ? { ...selection, candidates: [] as PlanningCandidate[] }
    : null)
  const usedRefs = new Set<string>()
  // Selecting a sample claims its stereo twin too: the two halves of one
  // recording must never be picked as two independent samples on two lanes.
  const markUsed = (candidate: PlanningCandidate): void => {
    usedRefs.add(candidate.relpath)
    const twin = twins.get(candidate.relpath)
    if (twin) usedRefs.add(twin.relpath)
  }
  const pushCandidate = (destination: Selection, candidate: PlanningCandidate): boolean => {
    if (usedRefs.has(candidate.relpath)) return false
    if (destination.candidates.some((entry) => logicalSampleKey(entry) === logicalSampleKey(candidate))) return false
    destination.candidates.push(candidate)
    markUsed(candidate)
    return true
  }
  const allSelected = (): PlanningCandidate[] =>
    selected.flatMap((selection) => selection?.candidates ?? [])
  const selectedFamilyParts = (): Map<string, Set<number>> => {
    const parts = new Map<string, Set<number>>()
    for (const candidate of allSelected()) {
      const key = parseMotifKey(candidate.filename)
      const familyParts = parts.get(key.family) ?? new Set<number>()
      familyParts.add(key.part)
      parts.set(key.family, familyParts)
    }
    return parts
  }

  // Anchor-family fill: a lane's quota is filled with parts of ONE authored
  // family first, so phrase walking has real numbered siblings to alternate
  // between instead of one lone sample per family. Percussion lanes take the
  // first MULTI-PART family not already anchoring another percussion lane, so
  // the snare, hat, and percussion lanes neither rotate one kit sample nor
  // anchor on unnumbered one-offs when numbered kits exist.
  const percussionFamilies = new Set<string>()
  const anchorFamilies = new Map<number, string>()
  for (let laneIndex = 0; laneIndex < selections.length; laneIndex++) {
    const source = selections[laneIndex]
    const destination = selected[laneIndex]
    const lane = profile.lanes[laneIndex]!
    if (!source || !destination) continue
    const percussion = lane.role === 'percussion'
    if (!FAMILY_ROLES.has(lane.role) && !percussion) continue
    let anchor = source.candidates[0]
    if (percussion) {
      const partCounts = new Map<string, number>()
      for (const group of groupMotifFamilies(source.candidates)) {
        partCounts.set(group.family, group.partCount)
      }
      anchor = source.candidates.find((candidate) =>
        !percussionFamilies.has(candidateFamily(candidate)) &&
        (partCounts.get(parseMotifKey(candidate.filename).family) ?? 0) >= 2
      ) ?? source.candidates.find((candidate) =>
        !percussionFamilies.has(candidateFamily(candidate))
      ) ?? source.candidates[0]
    }
    if (!anchor) continue
    const anchorFamily = candidateFamily(anchor)
    if (percussion) percussionFamilies.add(anchorFamily)
    anchorFamilies.set(laneIndex, anchorFamily)
    for (const candidate of source.candidates) {
      if (destination.candidates.length >= sampleCount) break
      if (candidateFamily(candidate) !== anchorFamily) continue
      pushCandidate(destination, candidate)
    }
  }
  // B phrases draw contrast from the next family; give that pool a couple of
  // authored parts too, so contrast phrases walk a coherent sibling motif
  // instead of tiling one lone sample. Contrast fills run only after every
  // lane has claimed its anchor family, so one lane's contrast never steals
  // another lane's primary material.
  for (let laneIndex = 0; laneIndex < selections.length; laneIndex++) {
    const source = selections[laneIndex]
    const destination = selected[laneIndex]
    const lane = profile.lanes[laneIndex]!
    if (!source || !destination || !FAMILY_ROLES.has(lane.role)) continue
    const anchorFamily = anchorFamilies.get(laneIndex)
    if (anchorFamily === undefined) continue
    const contrast = source.candidates.find((candidate) =>
      candidateFamily(candidate) !== anchorFamily && !usedRefs.has(candidate.relpath)
    )
    if (!contrast) continue
    const contrastFamily = candidateFamily(contrast)
    let contrastCount = 0
    for (const candidate of source.candidates) {
      if (contrastCount >= 2) break
      if (candidateFamily(candidate) !== contrastFamily) continue
      if (pushCandidate(destination, candidate)) contrastCount++
    }
  }
  const categories = [...new Set(selections.flatMap((selection) =>
    selection?.candidates.map((candidate) => candidate.categoryName) ?? []
  ))]
  const categoryOptions = new Map(categories.map((category) => [
    category,
    selections.flatMap((selection, laneIndex) => selection
      ? selection.candidates.flatMap((candidate, candidateIndex) =>
        candidate.categoryName === category ? [{ laneIndex, candidate, candidateIndex }] : []
      )
      : [])
  ]))
  const poolFamilyParts = new Map<string, number>()
  for (const selection of selections) {
    if (!selection) continue
    for (const group of groupMotifFamilies(selection.candidates)) {
      poolFamilyParts.set(group.family, Math.max(poolFamilyParts.get(group.family) ?? 0, group.partCount))
    }
  }

  categories.sort((left, right) =>
    categoryOptions.get(left)!.length - categoryOptions.get(right)!.length || compareCodeUnits(left, right)
  )
  for (const category of categories) {
    // Category coverage prefers candidates that extend an already-selected
    // family, then candidates whose family has siblings in some pool, and only
    // then true one-offs: every forced coverage pick used to be a family
    // singleton, which alone capped the family ratio below its target.
    const familyParts = selectedFamilyParts()
    const familyGain = (candidate: PlanningCandidate): number => {
      const key = parseMotifKey(candidate.filename)
      const parts = familyParts.get(key.family)
      if (parts && !parts.has(key.part)) return 0
      if ((poolFamilyParts.get(key.family) ?? 0) >= 2) return 1
      return 2
    }
    const choice = categoryOptions.get(category)!
      .filter(({ laneIndex, candidate }) =>
        !selected[laneIndex]!.candidates.some((entry) => entry.relpath === candidate.relpath)
      )
      .sort((left, right) => {
        const leftUsed = Number(usedRefs.has(left.candidate.relpath))
        const rightUsed = Number(usedRefs.has(right.candidate.relpath))
        return leftUsed - rightUsed ||
          familyGain(left.candidate) - familyGain(right.candidate) ||
          selected[left.laneIndex]!.candidates.length - selected[right.laneIndex]!.candidates.length ||
          left.candidateIndex - right.candidateIndex ||
          left.laneIndex - right.laneIndex
      })[0]
    if (!choice) continue
    const destination = selected[choice.laneIndex]!
    if (!pushCandidate(destination, choice.candidate)) continue
    // When coverage had to open a brand-new family, immediately buddy it with
    // one sibling so the forced pick still counts toward the family ratio.
    const key = parseMotifKey(choice.candidate.filename)
    if (!familyParts.get(key.family) || !familyParts.get(key.family)!.has(key.part)) {
      const sibling = selections[choice.laneIndex]!.candidates.find((candidate) =>
        parseMotifKey(candidate.filename).family === key.family &&
        parseMotifKey(candidate.filename).part !== key.part &&
        !usedRefs.has(candidate.relpath)
      )
      if (sibling) pushCandidate(destination, sibling)
    }
  }

  const minimumPrimaryCount = Math.max(1, Math.ceil(sampleCount / 2))
  for (let laneIndex = 0; laneIndex < selections.length; laneIndex++) {
    const source = selections[laneIndex]
    const destination = selected[laneIndex]
    if (!source || !destination) continue
    for (const candidate of source.candidates) {
      const primaryCount = destination.candidates.filter((entry) =>
        entry.sampleType === source.requestedType
      ).length
      if (primaryCount >= minimumPrimaryCount || destination.candidates.length >= sampleCount) break
      if (candidate.sampleType !== source.requestedType) continue
      pushCandidate(destination, candidate)
    }
  }

  for (let laneIndex = 0; laneIndex < selections.length; laneIndex++) {
    const source = selections[laneIndex]
    const destination = selected[laneIndex]
    if (!source || !destination) continue
    for (const candidate of source.candidates) {
      if (destination.candidates.length >= sampleCount) break
      pushCandidate(destination, candidate)
    }
    // Last resort: reuse material already claimed elsewhere only when this
    // lane would otherwise have nothing at all. Cross-lane duplicates made
    // adjacent lanes near-copies of each other in real generated projects.
    if (destination.candidates.length === 0) {
      for (const candidate of source.candidates) {
        if (destination.candidates.length >= sampleCount) break
        if (destination.candidates.some((entry) => entry.relpath === candidate.relpath)) continue
        destination.candidates.push(candidate)
      }
    }
    destination.selectedType = destination.candidates[0]?.sampleType ?? source.selectedType
  }

  for (let laneIndex = 0; laneIndex < selections.length; laneIndex++) {
    const source = selections[laneIndex]
    const destination = selected[laneIndex]
    if (!source || !destination) continue
    const maximumSpan = maximumLegalSpan(laneIndex, sections, profile)
    if (destination.candidates.some((candidate) => durationTicks(candidate, bpm) <= maximumSpan)) continue
    const fallback = source.candidates
      .filter((candidate) => durationTicks(candidate, bpm) <= maximumSpan)
      .sort((left, right) => durationTicks(left, bpm) - durationTicks(right, bpm) ||
        compareCodeUnits(left.relpath, right.relpath))[0]
    if (fallback && !destination.candidates.some((candidate) => candidate.relpath === fallback.relpath)) {
      destination.candidates.push(fallback)
      markUsed(fallback)
    }
  }

  // Family-ratio repair: while the selection is short of its intensity target,
  // grow a selected singleton family with an unused sibling; once no sibling
  // exists anywhere, trim redundant singletons whose category is still covered
  // by another selection. A corpus without numbered families exhausts both
  // moves, and the shortfall flag excuses validation — the rule must not make
  // family-less libraries ungeneratable.
  for (let round = 0; round < 96 && familyRatioOf(allSelected()) < familyTarget; round++) {
    let repaired = false
    const familyParts = selectedFamilyParts()
    for (let laneIndex = 0; laneIndex < selected.length && !repaired; laneIndex++) {
      const source = selections[laneIndex]
      const destination = selected[laneIndex]
      if (!source || !destination) continue
      for (const candidate of destination.candidates) {
        const key = parseMotifKey(candidate.filename)
        if (familyParts.get(key.family)!.size >= 2) continue
        const sibling = source.candidates.find((entry) =>
          parseMotifKey(entry.filename).family === key.family &&
          parseMotifKey(entry.filename).part !== key.part &&
          !usedRefs.has(entry.relpath)
        )
        if (sibling && pushCandidate(destination, sibling)) {
          repaired = true
          break
        }
      }
    }
    if (repaired) continue
    const categoryCounts = new Map<string, number>()
    for (const candidate of allSelected()) {
      categoryCounts.set(candidate.categoryName, (categoryCounts.get(candidate.categoryName) ?? 0) + 1)
    }
    let trimmed = false
    for (let laneIndex = 0; laneIndex < selected.length && !trimmed; laneIndex++) {
      const destination = selected[laneIndex]
      if (!destination || destination.candidates.length < 2) continue
      const maximumSpan = maximumLegalSpan(laneIndex, sections, profile)
      for (let index = destination.candidates.length - 1; index >= 1; index--) {
        const candidate = destination.candidates[index]!
        const key = parseMotifKey(candidate.filename)
        if (familyParts.get(key.family)!.size >= 2) continue
        if ((categoryCounts.get(candidate.categoryName) ?? 0) < 2) continue
        const fitsAlone = durationTicks(candidate, bpm) <= maximumSpan &&
          !destination.candidates.some((entry, entryIndex) =>
            entryIndex !== index && durationTicks(entry, bpm) <= maximumSpan
          )
        if (fitsAlone) continue
        destination.candidates.splice(index, 1)
        trimmed = true
        break
      }
    }
    if (!trimmed) break
  }
  return { selected, familyRatioShortfall: familyRatioOf(allSelected()) < familyTarget }
}
