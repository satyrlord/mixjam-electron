import type {
  MixJamGeneratorLanePlan,
  MixJamGeneratorPhrasePlan,
  MixJamGeneratorSectionPlan
} from '../../../shared/backend-api'
import { BEATS_PER_BAR, TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import {
  DENSE_BAR_SHARE,
  addPlacement,
  candidateForPhrase,
  durationTicks,
  intervalIsFree,
  placementEnd,
  type GeneratorLaneProfile,
  type GeneratorProfile,
  type Selection
} from './generator-planning-core'

// A bar counts as populated when the lane sounds on most of its rhythmic
// grid. Percussion is measured against its authored pattern (a sparse clap
// playing its full one-hit groove IS populated); every other role is measured
// as beat coverage — three of the four beats, the nearest achievable share to
// 80% on a four-beat grid. Tick occupancy would be the wrong metric: a 0.2s
// kick can never occupy 80% of a bar's ticks no matter how present it sounds.
function barPopulation(
  lane: MixJamGeneratorLanePlan, laneProfile: GeneratorLaneProfile, targetBars: number
): boolean[] {
  const populated = new Array<boolean>(targetBars).fill(false)
  if (laneProfile.role === 'percussion') {
    // The scheduler drops authored hits that would overlap the previous hit's
    // ring-out or run past the bar, so a five-offset pattern may only ever
    // land two hits with an 8-tick one-shot. The threshold therefore counts
    // hits the pattern can REALIZE at this lane's typical span, not the
    // offsets the template wrote down.
    const spans = lane.placements.map((placement) => placement.durationTicks).sort((a, b) => a - b)
    const typicalSpan = spans.length > 0 ? spans[Math.floor(spans.length / 2)]! : TICKS_PER_BEAT
    const realizable = (offsets: readonly number[]): number => {
      let count = 0
      let nextFree = 0
      for (const offset of [...offsets].sort((a, b) => a - b)) {
        if (offset >= nextFree && offset + typicalSpan <= TICKS_PER_BAR) {
          count++
          nextFree = offset + typicalSpan
        }
      }
      return Math.max(1, count)
    }
    const patternHits = realizable(laneProfile.beatPattern ?? [0])
    const mutationHits = laneProfile.beatMutation ? realizable(laneProfile.beatMutation) : patternHits
    const threshold = Math.max(1, Math.ceil(0.6 * Math.min(patternHits, mutationHits)))
    const counts = new Array<number>(targetBars).fill(0)
    for (const placement of lane.placements) {
      const bar = Math.floor(placement.startTick / TICKS_PER_BAR)
      if (bar >= 0 && bar < targetBars) counts[bar]!++
    }
    for (let bar = 0; bar < targetBars; bar++) populated[bar] = counts[bar]! >= threshold
    return populated
  }
  const beatCovered = new Array<boolean>(targetBars * BEATS_PER_BAR).fill(false)
  for (const placement of lane.placements) {
    const startBeat = Math.max(0, Math.floor(placement.startTick / TICKS_PER_BEAT))
    const endBeat = Math.min(beatCovered.length, Math.ceil(placementEnd(placement) / TICKS_PER_BEAT))
    for (let beat = startBeat; beat < endBeat; beat++) beatCovered[beat] = true
  }
  for (let bar = 0; bar < targetBars; bar++) {
    let covered = 0
    for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
      if (beatCovered[bar * BEATS_PER_BAR + beat]) covered++
    }
    populated[bar] = covered >= BEATS_PER_BAR - 1
  }
  return populated
}

export function laneDenseBarCount(
  lane: MixJamGeneratorLanePlan, laneProfile: GeneratorLaneProfile, targetBars: number
): number {
  return barPopulation(lane, laneProfile, targetBars).filter(Boolean).length
}

// Close scheduling gaps until the lane is populated for DENSE_BAR_SHARE of the
// song. The pass only fills bars inside phrases where the lane is active and
// not resting: authored quiet time (breakdown rests, ramp-in phrases, sections
// that exclude the lane) is the song's deliberate ~20% and is never filled.
// Returns the lanes that stayed short of the target even after every legal
// slot was tried — the validator excuses exactly these, so a sparse corpus or
// an arc-y support lane cannot make generation impossible.
export function ensureLaneDensity(
  lanes: MixJamGeneratorLanePlan[], phrases: readonly MixJamGeneratorPhrasePlan[],
  sections: readonly MixJamGeneratorSectionPlan[], profile: GeneratorProfile,
  selections: readonly (Selection | null)[], bpm: number, targetBars: number,
  seed: string, nextOrdinal: (laneIndex: number) => number
): Set<number> {
  const shortfall = new Set<number>()
  const requiredBars = Math.ceil(DENSE_BAR_SHARE * targetBars - 1e-9)
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
    const lane = lanes[laneIndex]!
    const laneProfile = profile.lanes[laneIndex]!
    const selection = selections[laneIndex]
    if (!selection || laneProfile.role === 'transition' || lane.placements.length === 0) continue
    let populated = barPopulation(lane, laneProfile, targetBars)
    let populatedCount = populated.filter(Boolean).length
    for (let phraseOrdinal = 0; phraseOrdinal < phrases.length && populatedCount < requiredBars; phraseOrdinal++) {
      const phrase = phrases[phraseOrdinal]!
      if (!phrase.activeLanes.includes(laneIndex) || phrase.motif === 'rest') continue
      if (laneProfile.role === 'vocal' && phraseOrdinal % 2 === 1) continue
      const roleEnd = laneProfile.role === 'atmosphere'
        ? sections[phrase.sectionIndex]!.endBar * TICKS_PER_BAR
        : phrase.endBar * TICKS_PER_BAR
      for (let bar = phrase.startBar; bar < phrase.endBar && populatedCount < requiredBars; bar++) {
        if (populated[bar]) continue
        const offsets = laneProfile.role === 'percussion'
          ? (phrase.motif === 'B'
            ? laneProfile.beatMutation ?? laneProfile.beatPattern!
            : laneProfile.beatPattern!)
          : [0, TICKS_PER_BEAT, 2 * TICKS_PER_BEAT, 3 * TICKS_PER_BEAT]
        // Walk the phrase's own pool first (anchor family on A, contrast on
        // B), then fall back to the lane's full selection: an anchor family of
        // 2- and 4-bar loops can never fill an odd tail bar that a shorter
        // sibling fits.
        const walked = laneProfile.role === 'percussion'
          ? [candidateForPhrase(selection, phrase, phraseOrdinal, laneIndex, bar - phrase.startBar)]
          : selection.candidates.map((_, cue) =>
            candidateForPhrase(selection, phrase, phraseOrdinal, laneIndex, bar - phrase.startBar + cue))
        const tried = new Set<string>()
        const candidates = [...walked, ...selection.candidates].filter((candidate) => {
          if (tried.has(candidate.relpath)) return false
          tried.add(candidate.relpath)
          return true
        })
        let added = false
        for (const offset of offsets) {
          for (const candidate of candidates) {
            const span = durationTicks(candidate, bpm)
            // Whole-bar phrases stay on the bar grid; only sub-bar material
            // may fill mid-bar beats.
            if (span % TICKS_PER_BAR === 0 && offset !== 0) continue
            const startTick = bar * TICKS_PER_BAR + offset
            const limit = laneProfile.role === 'percussion' ? (bar + 1) * TICKS_PER_BAR : roleEnd
            if (startTick + span > limit || !intervalIsFree(lane, startTick, startTick + span)) continue
            addPlacement(lane, candidate, startTick, span, nextOrdinal(laneIndex), profile, seed)
            added = true
            break
          }
        }
        if (added) {
          populated = barPopulation(lane, laneProfile, targetBars)
          populatedCount = populated.filter(Boolean).length
        }
      }
    }
    if (populatedCount < requiredBars) shortfall.add(laneIndex)
  }
  return shortfall
}
