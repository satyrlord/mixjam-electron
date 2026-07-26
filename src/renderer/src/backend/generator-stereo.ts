import type { MixJamGeneratorLanePlan } from '../../../shared/backend-api'
import type { GeneratorCandidate } from './generator-library'
import { MAX_PAIR_PAN, MAX_TEMPLATE_PAN } from './generator-profiles'
import {
  FAMILY_ROLES,
  MAX_GENERATED_LANES,
  STEREO_PAIR_LANE_SHARE,
  halfUp,
  stableId,
  type GeneratorProfile,
  type Selection
} from './generator-planning-core'

// Two separate ideas, deliberately kept apart (spec-021 §Pan):
//
//   - Stereo *side* — claiming that a file is the left or right half of one
//     recording — still requires persisted stereo-pair evidence. Only a lane
//     backed by real twins is ever mirrored.
//   - Lane *position* — where an otherwise mono lane sits in the image — is mix
//     data the profile declares, capped at ±MAX_TEMPLATE_PAN by the template
//     parser. Nothing infers it from a filename.
//
// When the analyzer supplies enough evidence, the target is roughly one paired
// lane in five. Pair lanes are designated BEFORE selection so their whole pool
// can be restricted to left halves of complete pairs: everything that ever
// lands on the lane must have a twin for the mirror lane. Sustained tonal roles
// benefit most from width, so atmosphere leads the preference, then vocal, then
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
      twins.has(candidate.relpath) && candidate.stereoSide === 'left'
    )
    // Two complete pairs give the lane something to walk; requiring a multi-part
    // paired family left most corpora with no pair lanes at all under the
    // bounded analysis budget.
    if (paired.length < 2) continue
    selection.candidates = paired
    pairLanes.add(laneIndex)
  }
  return pairLanes
}

// Materialize each designated pair lane as two mirrored lanes at ±pairPan: the
// source lane keeps its left-half files and a mirror lane plays the right twins
// with identical timing, gain, and sends. Runs after gain compensation so both
// halves share the final gain. A lane whose placements somehow lack a twin is
// left at its declared position rather than half-mirrored.
export function applyStereoPairs(
  lanes: MixJamGeneratorLanePlan[], pairLanes: ReadonlySet<number>,
  twins: ReadonlyMap<string, GeneratorCandidate>, profile: GeneratorProfile, seed: string
): Set<number> {
  const spread = Math.min(profile.pairPan, MAX_PAIR_PAN)
  const mirrored = new Set<number>()
  for (const laneIndex of [...pairLanes].sort((left, right) => left - right)) {
    const lane = lanes[laneIndex]
    if (!lane || lane.placements.length === 0) continue
    if (!lane.placements.every((placement) => twins.has(placement.sampleRef))) continue
    const stereoPairId = stableId(
      'stereo-pair', `${seed}:${profile.id}:${profile.version}:lane-${laneIndex}`
    )
    lane.pan = -spread
    lane.stereoPairId = stereoPairId
    mirrored.add(laneIndex)
    const baseName = lane.name
    lane.name = `${baseName} L`
    lanes.push({
      index: lanes.length,
      name: `${baseName} R`,
      gain: lane.gain,
      pan: spread,
      stereoPairId,
      muted: false,
      solo: false,
      sends: [...lane.sends],
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
  return mirrored
}

export function validateStereoImage(
  lanes: readonly MixJamGeneratorLanePlan[], profile: GeneratorProfile,
  mirrored: ReadonlySet<number>
): void {
  const spread = Math.min(profile.pairPan, MAX_PAIR_PAN)
  const profileLaneCount = profile.lanes.length
  const mirrors = lanes.slice(profileLaneCount)
  const sourceIndexes = [...mirrored].sort((left, right) => left - right)
  if (mirrors.length !== mirrored.size) {
    throw new Error('The generator produced unmatched stereo pair lanes.')
  }
  for (const [mirrorIndex, mirror] of mirrors.entries()) {
    if (mirror.pan !== spread) throw new Error('The generator produced a mirror lane that is not at the pair position.')
    const source = lanes[sourceIndexes[mirrorIndex]!]
    if (!source?.stereoPairId || mirror.stereoPairId !== source.stereoPairId) {
      throw new Error('The generator produced stereo pair lanes without shared evidence.')
    }
  }
  for (const [laneIndex, lane] of lanes.slice(0, profileLaneCount).entries()) {
    if (mirrored.has(laneIndex)) {
      if (lane.pan !== -spread) throw new Error('The generator produced unmatched stereo pair lanes.')
      continue
    }
    if (lane.stereoPairId) throw new Error('The generator attached stereo pair evidence to an unpaired lane.')
    if (Math.abs(lane.pan) > MAX_TEMPLATE_PAN + 1e-9) {
      throw new Error('The generator produced a non-pair lane panned past the mix-position cap.')
    }
  }
  const populated = lanes.filter((lane) => lane.placements.length > 0)
  if (populated.length > MAX_GENERATED_LANES) {
    throw new Error(`The generator filled ${populated.length} lanes; at most ${MAX_GENERATED_LANES} are allowed.`)
  }
}
