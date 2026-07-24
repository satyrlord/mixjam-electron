import type { MixJamGeneratorLanePlan } from '../../../shared/backend-api'
import type { GeneratorCandidate } from './generator-library'
import { parseMotifKey } from './generator-motif'
import {
  FAMILY_ROLES,
  MAX_GENERATED_LANES,
  STEREO_PAIR_LANE_SHARE,
  halfUp,
  stableId,
  type GeneratorProfile,
  type Selection
} from './generator-planning-core'

// Roughly one populated lane in five plays as a hard-panned L/R pair; every
// other lane stays perfectly centered, so pan is a three-way decision. Pair
// lanes are designated BEFORE selection so their whole pool can be restricted
// to left halves of complete stereo pairs: everything that ever lands on the
// lane must have a twin for the mirror lane. Sustained tonal roles benefit
// most from width, so atmosphere leads the preference, then vocal, then
// non-bass motif lanes; support lanes come before core lanes so the song's
// backbone stays centered.
export function designateStereoPairLanes(
  selections: readonly (Selection | null)[],
  profile: GeneratorProfile,
  twins: ReadonlyMap<string, GeneratorCandidate>
): Set<number> {
  const populatedEstimate = selections.filter((selection) => selection !== null).length
  // One mirror lane is added per designated lane, so pairing n of the base lanes
  // yields 2n paired lanes out of base + n. Solving 2n / (base + n) =
  // STEREO_PAIR_LANE_SHARE gives this target (n = base / 9 at the 20% share).
  const target = halfUp(
    populatedEstimate * STEREO_PAIR_LANE_SHARE / (2 - STEREO_PAIR_LANE_SHARE)
  )
  const pairLanes = new Set<number>()
  if (target === 0) return pairLanes
  const rolePriority: Record<string, number> = { atmosphere: 0, vocal: 1, motif: 2 }
  const order = selections.flatMap((selection, laneIndex) => {
    const lane = profile.lanes[laneIndex]!
    if (!selection || !FAMILY_ROLES.has(lane.role) || lane.types[0] === 'Bass') return []
    return [{ laneIndex, priority: rolePriority[lane.role] ?? 3, core: profile.coreLanes.includes(laneIndex) }]
  }).sort((left, right) =>
    left.priority - right.priority || Number(left.core) - Number(right.core) || left.laneIndex - right.laneIndex
  )
  for (const { laneIndex } of order) {
    if (pairLanes.size >= target) break
    const selection = selections[laneIndex]!
    const paired = selection.candidates.filter((candidate) =>
      twins.has(candidate.relpath) && parseMotifKey(candidate.filename).side === 'left'
    )
    // Two complete pairs give the lane something to walk; a multi-part paired
    // family is preferred by the pool's own family ordering when present, but
    // requiring one here left most corpora with no pair lanes at all under the
    // bounded analysis budget.
    if (paired.length < 2) continue
    selection.candidates = paired
    pairLanes.add(laneIndex)
  }
  return pairLanes
}

// Materialize each designated pair lane as two hard-panned lanes: the source
// lane keeps its left-half files at pan -1 and a mirror lane plays the right
// twins at pan +1 with identical timing. Runs after gain compensation so both
// halves share the final gain. A lane whose placements somehow lack a twin is
// left centered rather than half-mirrored.
export function applyStereoPairs(
  lanes: MixJamGeneratorLanePlan[], pairLanes: ReadonlySet<number>,
  twins: ReadonlyMap<string, GeneratorCandidate>, profile: GeneratorProfile, seed: string
): void {
  for (const laneIndex of [...pairLanes].sort((left, right) => left - right)) {
    const lane = lanes[laneIndex]
    if (!lane || lane.placements.length === 0) continue
    if (!lane.placements.every((placement) => twins.has(placement.sampleRef))) continue
    lane.pan = -1
    const baseName = lane.name
    lane.name = `${baseName} L`
    lanes.push({
      index: lanes.length,
      name: `${baseName} R`,
      gain: lane.gain,
      pan: 1,
      muted: false,
      solo: false,
      placements: lane.placements.map((placement, placementIndex) => {
        const twin = twins.get(placement.sampleRef)!
        return {
          id: stableId('placement', `${seed}:${profile.id}:${profile.version}:lane-${laneIndex}:mirror-${placementIndex}`),
          sampleRef: twin.relpath,
          sampleName: twin.filename,
          startTick: placement.startTick,
          durationTicks: placement.durationTicks,
          durationSeconds: twin.duration,
          nativeBpm: twin.bpm,
          slot: twin.paletteSlot
        }
      })
    })
  }
}

export function validateStereoImage(lanes: readonly MixJamGeneratorLanePlan[], profileLaneCount: number): void {
  for (const lane of lanes) {
    if (lane.pan !== 0 && lane.pan !== -1 && lane.pan !== 1) {
      throw new Error('The generator produced a lane with variable panning.')
    }
  }
  const mirrors = lanes.slice(profileLaneCount)
  for (const mirror of mirrors) {
    if (mirror.pan !== 1) throw new Error('The generator produced a mirror lane that is not hard-panned right.')
  }
  const leftLanes = lanes.slice(0, profileLaneCount).filter((lane) => lane.pan === -1)
  if (leftLanes.length !== mirrors.length) {
    throw new Error('The generator produced unmatched stereo pair lanes.')
  }
  const populated = lanes.filter((lane) => lane.placements.length > 0)
  if (populated.length > MAX_GENERATED_LANES) {
    throw new Error(`The generator filled ${populated.length} lanes; at most ${MAX_GENERATED_LANES} are allowed.`)
  }
}
