import {
  MIXJAM_GENERATOR_VERSION,
  type MixJamGeneratorLanePlan,
  type MixJamGeneratorParameters,
  type MixJamGeneratorPhrasePlan,
  type MixJamGeneratorPlan,
  type MixJamGeneratorReturnPlan,
  type MixJamGeneratorSectionPlan
} from '../../../shared/backend-api'
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../engine/transport'
import { TONAL_SAMPLE_TYPES } from './analysis'
import { generatorCandidateDurationTicks } from './generator-candidate'
import { compareCodeUnits, hashText } from './generator-determinism'
import { parseMotifKey } from './generator-motif'
import { canonicalMusicalKey } from './musical-key'
import { validateMixJamGeneratorParameters } from './generator-parameters'
import {
  GENERATOR_PROFILES,
  MAX_TEMPLATE_PAN,
  type GeneratorArcProfile,
  type GeneratorBoundaryOp,
  type GeneratorLaneProfile,
  type GeneratorProfile,
  type GeneratorSectionProfile
} from '../../../shared/generator-templates'

import {
  FAMILY_RATIO_TARGETS,
  FAMILY_ROLES,
  applyKitCoherence,
  findTypeCandidates,
  selectDiverseCandidates,
  type PlanningCandidate,
  type Selection
} from './generator-selection'

const MIN_GENERATED_LANES = 8
const MAX_GENERATED_LANES = 32

function halfUp(value: number): number {
  return Math.floor(value + 0.5)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function quantizeUpToBeat(tick: number): number {
  return Math.ceil(tick / TICKS_PER_BEAT) * TICKS_PER_BEAT
}

const durationTicks = generatorCandidateDurationTicks

function placementEnd(placement: MixJamGeneratorLanePlan['placements'][number]): number {
  return placement.startTick + placement.durationTicks
}

function intervalIsFree(
  lane: MixJamGeneratorLanePlan,
  startTick: number,
  endTick: number
): boolean {
  return lane.placements.every(
    (placement) => placementEnd(placement) <= startTick || placement.startTick >= endTick
  )
}

interface SpanRegistry {
  bySample: Map<string, number>
  songEndTick: number
}

function createSpanRegistry(songEndTick: number): SpanRegistry {
  return { bySample: new Map(), songEndTick }
}

function registeredSpan(
  spans: SpanRegistry,
  candidate: PlanningCandidate,
  span: number
): number {
  return spans.bySample.get(candidate.relpath) ?? span
}

function stableId(prefix: string, source: string): string {
  return `${prefix}-${hashText(source).toString(16).padStart(8, '0')}`
}

function addPlacement(
  lane: MixJamGeneratorLanePlan,
  candidate: PlanningCandidate,
  startTick: number,
  span: number,
  ordinal: number,
  profile: GeneratorProfile,
  seed: string,
  spans: SpanRegistry
): boolean {
  const resolved = registeredSpan(spans, candidate, span)
  if (resolved < 1 || startTick < 0 || startTick + resolved > spans.songEndTick) return false
  if (!intervalIsFree(lane, startTick, startTick + resolved)) return false
  spans.bySample.set(candidate.relpath, resolved)
  lane.placements.push({
    id: stableId('placement', `${seed}:${profile.id}:${profile.version}:lane-${lane.index}:${ordinal}`),
    sampleRef: candidate.relpath,
    sampleName: candidate.filename,
    startTick,
    durationTicks: resolved,
    durationSeconds: candidate.duration,
    nativeBpm: candidate.bpm,
    slot: candidate.paletteSlot
  })
  return true
}

function laneFamilies(selection: Selection): PlanningCandidate[][] {
  const byFamily = new Map<string, PlanningCandidate[]>()
  for (const candidate of selection.candidates) {
    const family = parseMotifKey(candidate.filename).family
    const members = byFamily.get(family)
    if (members) members.push(candidate)
    else byFamily.set(family, [candidate])
  }
  return [...byFamily.values()]
}

function candidateForCue(
  selection: Selection,
  variant: number,
  cue: number
): PlanningCandidate {
  const families = laneFamilies(selection)
  if (families.length === 0) return selection.candidates[0]!
  const family = families[variant % families.length]!
  const offset = Math.floor(variant / families.length)
  return family[(offset + cue) % family.length]!
}

function fittingCandidateForCue(
  selection: Selection,
  variant: number,
  cue: number,
  available: number,
  bpm: number,
  spans: SpanRegistry
): { candidate: PlanningCandidate; span: number } | null {
  for (let step = 0; step < selection.candidates.length; step++) {
    const candidate = candidateForCue(selection, variant, cue + step)
    const span = registeredSpan(spans, candidate, durationTicks(candidate, bpm))
    if (span <= available) return { candidate, span }
  }
  return null
}

// Sections are allocated in whole 8-bar phrases, never bars: a 23-bar section
// ends in a 7- or 1-bar tail phrase that whole-bar loops cannot fill, which
// left lanes a bar or two short on every odd section. targetBars is always a
// multiple of 8. Low-weight sections may receive zero phrases in short songs
// and simply vanish from the arrangement.
function allocateSections(arc: GeneratorArcProfile, targetBars: number): MixJamGeneratorSectionPlan[] {
  const targetPhrases = Math.max(1, Math.round(targetBars / 8))
  const allocations = arc.sections.map((section, index) => {
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

// The seed picks one of the profile's authored arcs. Exact regeneration
// reproduces the arc because seed plus profile version selects it.
function selectArc(profile: GeneratorProfile, seed: string): GeneratorArcProfile {
  return profile.arcs[hashText(`${seed}:${profile.id}:${profile.version}:arc`) % profile.arcs.length]!
}

function dominantValue(values: readonly string[]): string | null {
  const votes = new Map<string, number>()
  for (const value of values) votes.set(value, (votes.get(value) ?? 0) + 1)
  const ranked = [...votes].sort((left, right) => right[1] - left[1] || compareCodeUnits(left[0], right[0]))
  return ranked[0]?.[0] ?? null
}

interface TonalContext {
  key: string | null
  poolToken: string | null
}

// The pool token every *stretched* pitched placement must share. Natural-rate
// material (`bpm === null`, true pitch) is exempt and may come from any pool,
// which is the technique the AmbientHouse reference uses to combine
// 160-native drums with 90-native pads.
function dominantTonalContext(
  candidates: readonly PlanningCandidate[], profile: GeneratorProfile, bpm: number, seed: string
): TonalContext {
  const tokenVotes = candidates.flatMap((candidate) =>
    TONAL_SAMPLE_TYPES.has(candidate.sampleType) && candidate.bpm !== null && candidate.poolToken !== null
      ? [candidate.poolToken]
      : []
  )
  const keyVotes = candidates.flatMap((candidate) =>
    TONAL_SAMPLE_TYPES.has(candidate.sampleType) && candidate.musicalKey
      ? [canonicalMusicalKey(candidate.musicalKey) ?? []].flat()
      : []
  )
  const fallback = { key: dominantValue(keyVotes), poolToken: dominantValue(tokenVotes) }
  const tokens = [...new Set(tokenVotes)]
  if (tokens.length === 0) return fallback
  const keys = [...new Set(keyVotes)]
  const contexts = tokens.flatMap((poolToken) => (keys.length > 0 ? keys : [null]).flatMap((key) =>
    profile.coreLanes.every((laneIndex) =>
      findTypeCandidates(candidates, profile, laneIndex, bpm, key, poolToken, seed) !== null
    ) ? [{ key, poolToken }] : []
  ))
  if (contexts.length === 0) return fallback

  // Rank only viable key/pool contexts. Counting a raw key or pool first lets a
  // synth-heavy but incomplete context hide a smaller complete one, then reports
  // a misleading missing-core-role error instead of generating.
  return contexts.sort((left, right) => {
    const votes = (context: TonalContext): number => candidates.filter((candidate) =>
      TONAL_SAMPLE_TYPES.has(candidate.sampleType) && candidate.bpm !== null &&
      candidate.poolToken === context.poolToken &&
      (candidate.musicalKey ? canonicalMusicalKey(candidate.musicalKey) : null) === context.key
    ).length
    return votes(right) - votes(left) ||
      compareCodeUnits(left.poolToken!, right.poolToken!) ||
      compareCodeUnits(left.key ?? '', right.key ?? '')
  })[0]!
}

// Lanes a section gates out stay out. There is no coverage pass that drags an
// absent lane back in, because "every lane must appear" is exactly the rule
// that produced the wall of sound.
function phraseLanes(
  section: MixJamGeneratorSectionPlan, sectionProfile: GeneratorSectionProfile,
  sectionIndex: number, phraseOrdinal: number, phraseCount: number, coreLanes: ReadonlySet<number>
): number[] {
  const core = section.activeLanes.filter((lane) => coreLanes.has(lane))
  const optional = section.activeLanes.filter((lane) => !coreLanes.has(lane))
  const ramp = (share: number, rotation = 0): number[] => {
    const totalCount = Math.max(core.length, Math.ceil(section.activeLanes.length * share))
    // Rotating which optional lanes are shed spreads the gaps across the
    // arrangement instead of always sacrificing the same highest-index lanes.
    const ordered = optional.map((_, index) =>
      optional[(index + rotation) % Math.max(1, optional.length)]!
    )
    return [...core, ...ordered.slice(0, Math.max(0, totalCount - core.length))].sort((a, b) => a - b)
  }
  if (sectionProfile.phraseMode === 'build') return ramp((phraseOrdinal + 1) / phraseCount)
  if (sectionProfile.phraseMode === 'outro') return ramp((phraseCount - phraseOrdinal) / phraseCount)
  // Subtraction into the boundary: the last phrase of a long steady section
  // sheds its outer layers. Every reference project sets up a section change
  // this way, and it is why their lanes re-enter three to seven times instead
  // of running unbroken from first bar to last.
  if (phraseCount >= 2 && phraseOrdinal === phraseCount - 1) return ramp(0.7, sectionIndex)
  return [...section.activeLanes]
}

function createPhrases(
  sections: readonly MixJamGeneratorSectionPlan[], arc: GeneratorArcProfile, profile: GeneratorProfile
): MixJamGeneratorPhrasePlan[] {
  const coreLanes = new Set(profile.coreLanes)
  return sections.flatMap((section, sectionIndex) => {
    const length = section.endBar - section.startBar
    if (length <= 0) return []
    const phraseCount = Math.ceil(length / 8)
    const phrases: MixJamGeneratorPhrasePlan[] = []
    for (let ordinal = 0, startBar = section.startBar; startBar < section.endBar; ordinal++, startBar += 8) {
      phrases.push({
        sectionIndex,
        startBar,
        endBar: Math.min(section.endBar, startBar + 8),
        activeLanes: phraseLanes(section, arc.sections[sectionIndex]!, sectionIndex, ordinal, phraseCount, coreLanes)
      })
    }
    return phrases
  })
}

// ---------------------------------------------------------------------------
// Boundary ops
// ---------------------------------------------------------------------------

interface ResolvedOps {
  /** Lane -> section indexes at which the lane changes to a sibling variant. */
  swaps: ReadonlyMap<number, readonly number[]>
  /** Lane -> section indexes whose boundary gets an accelerating roll. */
  rolls: ReadonlyMap<number, ReadonlyMap<number, number>>
  /** Lane -> section indexes whose material is placed to *end* at the boundary. */
  tails: ReadonlyMap<number, ReadonlySet<number>>
  /** Lane -> section indexes the lane is explicitly silent across. */
  rests: ReadonlyMap<number, ReadonlySet<number>>
}

function resolveOps(arc: GeneratorArcProfile): ResolvedOps {
  const sectionIndexOf = new Map(arc.sections.map((section, index) => [section.name, index]))
  const swaps = new Map<number, number[]>()
  const rolls = new Map<number, Map<number, number>>()
  const tails = new Map<number, Set<number>>()
  const rests = new Map<number, Set<number>>()
  const at = (op: GeneratorBoundaryOp): number => sectionIndexOf.get(op.at!)!
  for (const op of arc.ops) {
    if (op.op === 'swap') {
      swaps.set(op.lane, [...(swaps.get(op.lane) ?? []), at(op)].sort((a, b) => a - b))
    } else if (op.op === 'roll') {
      const lane = rolls.get(op.lane) ?? new Map<number, number>()
      lane.set(at(op), op.bars!)
      rolls.set(op.lane, lane)
    } else if (op.op === 'tail') {
      tails.set(op.lane, new Set([...(tails.get(op.lane) ?? []), at(op)]))
    } else {
      const from = sectionIndexOf.get(op.from!)!
      const to = sectionIndexOf.get(op.to!)!
      const spanned = rests.get(op.lane) ?? new Set<number>()
      for (let index = Math.min(from, to); index <= Math.max(from, to); index++) spanned.add(index)
      rests.set(op.lane, spanned)
    }
  }
  return { swaps, rolls, tails, rests }
}

/** How many `swap` boundaries this lane has passed by the given section. */
function variantAt(ops: ResolvedOps, laneIndex: number, sectionIndex: number): number {
  return (ops.swaps.get(laneIndex) ?? []).filter((boundary) => boundary <= sectionIndex).length
}

function isResting(ops: ResolvedOps, laneIndex: number, sectionIndex: number): boolean {
  return ops.rests.get(laneIndex)?.has(sectionIndex) ?? false
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function schedulePercussion(
  lane: MixJamGeneratorLanePlan, laneProfile: GeneratorLaneProfile, selection: Selection,
  phrase: MixJamGeneratorPhrasePlan, variant: number, bpm: number,
  profile: GeneratorProfile, seed: string, intensity: MixJamGeneratorParameters['intensity'],
  cutFinalBar: boolean, nextOrdinal: () => number, spans: SpanRegistry
): void {
  // Silence before the change: the last bar before a section boundary drops the
  // drums entirely. It is the most common setup gesture in the reference
  // library, and it is what keeps a four-on-the-floor kick under the
  // never-above-90%-occupancy line without ever muting it for a whole section.
  const lastBar = cutFinalBar ? phrase.endBar - 1 : phrase.endBar
  for (let bar = phrase.startBar; bar < lastBar; bar++) {
    // Fills are where intensity lives now that variety is the arc's job: none at
    // low, the last bar at medium, the last two at high.
    const fillBars = intensity === 'low' ? 0 : intensity === 'medium' ? 1 : 2
    const isFill = bar >= lastBar - fillBars && lastBar - phrase.startBar > fillBars
    const pattern = [...(isFill ? laneProfile.beatMutation ?? laneProfile.beatPattern! : laneProfile.beatPattern!)]
      .sort((left, right) => left - right)
    const candidate = candidateForCue(selection, variant, phrase.sectionIndex)
    // A lane is monophonic: the next hit cuts the one before it. Trimming the
    // span to the pattern stride is what the hardware does, and without it a
    // kick whose tail rings for two beats silently loses every offbeat hit to
    // the overlap check — a four-on-the-floor pattern became beats 1 and 3.
    //
    // The trim uses the pattern's *tightest* stride, not each hit's own, because
    // one sample carries one span for the whole project (spec-011 AC-016); a
    // per-hit trim wrote a different `durationTicks` at every offset and the
    // loader rejected the result.
    const strides = pattern.map((offset, index) =>
      (pattern[index + 1] ?? TICKS_PER_BAR + pattern[0]!) - offset)
    const span = Math.min(durationTicks(candidate, bpm), ...strides)
    if (span < 1) continue
    for (const offset of pattern) {
      // A hit past the song end is dropped by `addPlacement`, never shortened —
      // shortening it would be a second span for this sample.
      addPlacement(lane, candidate, bar * TICKS_PER_BAR + offset, span, nextOrdinal(), profile, seed, spans)
    }
  }
}

function schedulePhraseRole(
  lane: MixJamGeneratorLanePlan, laneProfile: GeneratorLaneProfile, selection: Selection,
  phrase: MixJamGeneratorPhrasePlan, phraseOrdinal: number, variant: number, bpm: number,
  sectionEndBar: number, profile: GeneratorProfile, seed: string, nextOrdinal: () => number,
  spans: SpanRegistry
): void {
  // Vocals stay event-like on alternating phrases; atmosphere pads sustain
  // continuously — skipping their odd phrases left half the song padless.
  if (laneProfile.role === 'vocal' && phraseOrdinal % 2 === 1) return
  const phraseStart = phrase.startBar * TICKS_PER_BAR
  const phraseEnd = phrase.endBar * TICKS_PER_BAR
  if (laneProfile.role === 'motif') {
    let startTick = phraseStart
    let cue = 0
    while (startTick < phraseEnd) {
      const next = fittingCandidateForCue(selection, variant, cue, phraseEnd - startTick, bpm, spans)
      if (!next) break
      addPlacement(lane, next.candidate, startTick, next.span, nextOrdinal(), profile, seed, spans)
      // Advance to the next whole-beat boundary at or after the sample end so a
      // short motif fragment lands on the rhythmic grid as distinct notes
      // instead of a machine-gun tile at its raw length. Whole-bar loops end on
      // a beat already, so they still butt-join with no gap.
      startTick = quantizeUpToBeat(startTick + next.span)
      cue++
    }
    return
  }

  const candidate = candidateForCue(selection, variant, 0)
  const span = durationTicks(candidate, bpm)
  const roleEnd = laneProfile.role === 'atmosphere' ? sectionEndBar * TICKS_PER_BAR : phraseEnd
  if (phraseStart + span <= roleEnd) {
    addPlacement(lane, candidate, phraseStart, span, nextOrdinal(), profile, seed, spans)
  }

  // A second cue after a deliberate rest gives long phrases a recognizable
  // call/response shape without continuously tiling the source.
  if (laneProfile.role !== 'vocal') return
  const response = candidateForCue(selection, variant, 1)
  const responseSpan = durationTicks(response, bpm)
  const secondStart = phraseEnd - responseSpan
  if (secondStart >= phraseStart + span && secondStart + responseSpan <= phraseEnd) {
    addPlacement(lane, response, secondStart, responseSpan, nextOrdinal(), profile, seed, spans)
  }
}

// §1.5.3 — end-aligned risers and boundary impacts.
function scheduleTransitions(
  sections: readonly MixJamGeneratorSectionPlan[], lanes: MixJamGeneratorLanePlan[],
  profile: GeneratorProfile, selections: readonly (Selection | null)[], bpm: number,
  seed: string, ops: ResolvedOps, nextOrdinal: (laneIndex: number) => number, spans: SpanRegistry
): void {
  const songEnd = sections.at(-1)!.endBar * TICKS_PER_BAR
  for (let sectionIndex = 1; sectionIndex < sections.length; sectionIndex++) {
    const boundary = sections[sectionIndex]!.startBar * TICKS_PER_BAR
    for (let laneIndex = 0; laneIndex < profile.lanes.length; laneIndex++) {
      const laneProfile = profile.lanes[laneIndex]!
      if (laneProfile.role !== 'transition') continue
      if (isResting(ops, laneIndex, sectionIndex)) continue
      if (!sections[sectionIndex - 1]!.activeLanes.includes(laneIndex) &&
          !sections[sectionIndex]!.activeLanes.includes(laneIndex)) continue
      const selection = selections[laneIndex]
      if (!selection) continue
      const variant = variantAt(ops, laneIndex, sectionIndex)
      // Three sources is what the reference FX lanes carry; rotating the whole
      // eligible pool gave a transition lane a different sample every section.
      const pool = selection.candidates.slice(0, 3)
      const ordered = pool.map((_, index) => pool[(index + sectionIndex + variant) % pool.length]!)
      const placement = ordered.map((candidate) => {
        // A riser is placed backwards from the boundary, so it needs the span
        // this sample already carries — see the registry note in the planner.
        const span = registeredSpan(spans, candidate, durationTicks(candidate, bpm))
        const startTick = laneProfile.transitionKind === 'riser' ? boundary - span : boundary
        return { candidate, span, startTick }
      }).find(({ startTick, span }) => startTick >= 0 && startTick + span <= songEnd &&
        intervalIsFree(lanes[laneIndex]!, startTick, startTick + span))
      if (placement) {
        addPlacement(lanes[laneIndex]!, placement.candidate, placement.startTick, placement.span,
          nextOrdinal(laneIndex), profile, seed, spans)
      }
    }
  }
}

// §1.5.2 — an accelerating one-shot ramp into a boundary: 4 hits in the first
// bar, 8 in the next, 16 in the last, exploiting monophonic lane retrigger.
// Placed after the lane's normal material so the roll wins the contested bars.
function scheduleRolls(
  sections: readonly MixJamGeneratorSectionPlan[], lanes: MixJamGeneratorLanePlan[],
  profile: GeneratorProfile, selections: readonly (Selection | null)[], bpm: number,
  seed: string, ops: ResolvedOps, nextOrdinal: (laneIndex: number) => number, spans: SpanRegistry
): void {
  for (const [laneIndex, boundaries] of ops.rolls) {
    const selection = selections[laneIndex]
    if (!selection) continue
    for (const [sectionIndex, bars] of boundaries) {
      const boundary = sections[sectionIndex]?.startBar
      if (boundary === undefined || boundary - bars < 0) continue
      const candidate = candidateForCue(selection, variantAt(ops, laneIndex, sectionIndex), 0)
      // The roll accelerates, so its stride shrinks bar to bar — but one sample
      // carries one span (spec-011 AC-016), so every hit is trimmed to the
      // tightest subdivision the roll reaches. Hit placement is unchanged; only
      // the ring-out of the earlier, slower bars is shorter.
      const tightestStride = TICKS_PER_BAR / (4 * 2 ** Math.min(bars - 1, 2))
      const span = Math.min(durationTicks(candidate, bpm), tightestStride)
      for (let step = 0; step < bars; step++) {
        const bar = boundary - bars + step
        // 4 hits, then 8, then 16 — one subdivision faster per bar.
        const hits = 4 * 2 ** Math.min(step, 2)
        const stride = TICKS_PER_BAR / hits
        for (let hit = 0; hit < hits; hit++) {
          const startTick = bar * TICKS_PER_BAR + Math.round(hit * stride)
          // A roll overwrites the lane's steady pattern for these bars.
          lanes[laneIndex]!.placements = lanes[laneIndex]!.placements.filter((placement) =>
            placementEnd(placement) <= startTick || placement.startTick >= startTick + span
          )
          addPlacement(lanes[laneIndex]!, candidate, startTick, span, nextOrdinal(laneIndex), profile, seed, spans)
        }
      }
    }
  }
}

interface TailPlacement {
  candidate: PlanningCandidate
  span: number
  startTick: number
}

function tailPlacementForBoundary(
  sections: readonly MixJamGeneratorSectionPlan[], selection: Selection, laneIndex: number,
  sectionIndex: number, bpm: number, ops: ResolvedOps, spans: SpanRegistry
): TailPlacement | null {
  const boundary = sections[sectionIndex]?.startBar
  if (boundary === undefined) return null
  const candidate = candidateForCue(selection, variantAt(ops, laneIndex, sectionIndex), 0)
  const span = registeredSpan(spans, candidate, durationTicks(candidate, bpm))
  const startTick = boundary * TICKS_PER_BAR - span
  return startTick >= 0 && startTick % TICKS_PER_BEAT === 0 ? { candidate, span, startTick } : null
}

// §1.5.4 — tail-clearance: place the lane's material so it *ends* on the named
// boundary rather than starting there, which is how a 9-bar pad lands exactly
// on bar 80. The engine does the arithmetic so the template author does not.
function scheduleTails(
  sections: readonly MixJamGeneratorSectionPlan[], lanes: MixJamGeneratorLanePlan[],
  profile: GeneratorProfile, selections: readonly (Selection | null)[], bpm: number,
  seed: string, ops: ResolvedOps, nextOrdinal: (laneIndex: number) => number, spans: SpanRegistry
): void {
  for (const [laneIndex, boundaries] of ops.tails) {
    const selection = selections[laneIndex]
    if (!selection) continue
    for (const sectionIndex of [...boundaries].sort((a, b) => a - b)) {
      const tail = tailPlacementForBoundary(sections, selection, laneIndex, sectionIndex, bpm, ops, spans)
      if (!tail || !intervalIsFree(lanes[laneIndex]!, tail.startTick, tail.startTick + tail.span)) continue
      addPlacement(lanes[laneIndex]!, tail.candidate, tail.startTick, tail.span, nextOrdinal(laneIndex), profile, seed, spans)
    }
  }
}

// ---------------------------------------------------------------------------
// Validation — structural invariants only
// ---------------------------------------------------------------------------

function isExactEndAnchorOnGrid(lane: GeneratorLaneProfile, startTick: number): boolean {
  if (lane.role === 'transition') return lane.transitionKind === 'riser'
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
  // Lane *position* in the image is mix data the profile declares, bounded by
  // spec-021 §Pan and capped by the template parser. Nothing infers it from a
  // filename, so no lane may sit past the mix-position cap.
  for (const lane of lanes) {
    if (Math.abs(lane.pan) > MAX_TEMPLATE_PAN + 1e-9) {
      throw new Error('The generator produced a lane panned past the mix-position cap.')
    }
  }
  // spec-011 AC-016: every placement of one sample carries the same span, so a
  // violation here means the project would be rejected by its own loader. It is
  // checked in the planner because a load-time failure names a file, not the
  // scheduler that wrote the second span.
  const spanBySample = new Map<string, number>()
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
      const knownSpan = spanBySample.get(placement.sampleRef)
      if (knownSpan !== undefined && knownSpan !== placement.durationTicks) {
        throw new Error(
          `The generator gave ${placement.sampleRef} conflicting spans ` +
          `(${knownSpan} and ${placement.durationTicks} ticks); one sample carries one span.`
        )
      }
      spanBySample.set(placement.sampleRef, placement.durationTicks)
      songEnd = Math.max(songEnd, endTick)
    }
  }
  if (songEnd !== targetTicks) throw new Error('The generator could not place a non-overlapping sample at the song end.')
}

// ---------------------------------------------------------------------------

export function createMixJamGeneratorPlan(
  rootKey: string,
  corpusFingerprint: string,
  candidates: readonly PlanningCandidate[],
  parameters: MixJamGeneratorParameters,
  analysis = { attemptedFiles: candidates.length, analyzedFiles: candidates.length, uniqueReads: candidates.length },
  detectedBpm = parameters.bpm,
  profiles: Readonly<Record<string, GeneratorProfile>> = GENERATOR_PROFILES
): MixJamGeneratorPlan {
  validateMixJamGeneratorParameters(parameters, Object.keys(profiles))
  const profile = profiles[parameters.profileId]!
  const bpm = parameters.bpmMode === 'follow-detected' ? detectedBpm : parameters.bpm
  if (bpm === undefined) throw new Error('No canonical analyzer tempo was supplied for generation.')
  // Whole 8-bar phrases only: dance music is phrased in eights, and a trailing
  // partial phrase reads as a mistake.
  const targetBars = Math.max(8, 8 * halfUp(parameters.durationSeconds * bpm / 1920))
  const targetTicks = targetBars * TICKS_PER_BAR
  const { key, poolToken } = dominantTonalContext(candidates, profile, bpm, parameters.seed)
  // Distinct sources per lane. The reference library sits at a median of 1–2 and
  // a mean near 2.3, so intensity moves this by one, not by three: variety comes
  // from the arc and the boundary ops, not from piling sources onto a lane.
  const sampleCount = parameters.intensity === 'high' ? 3 : 2
  const familyTarget = FAMILY_RATIO_TARGETS[parameters.intensity]
  const arc = selectArc(profile, parameters.seed)
  const ops = resolveOps(arc)

  const eligibleSelections = profile.lanes.map((_, laneIndex) =>
    findTypeCandidates(candidates, profile, laneIndex, bpm, key, poolToken, parameters.seed)
  )
  for (const laneIndex of profile.coreLanes) {
    if (!eligibleSelections[laneIndex]) {
      throw new Error(`The ${profile.id} profile requires a ${profile.lanes[laneIndex]!.types.join(' or ')} sample.`)
    }
  }
  // Support lanes without compatible material stay unfilled and are pruned
  // before save; the populated-lane floor decides whether the remaining
  // arrangement is still viable.
  applyKitCoherence(eligibleSelections, profile)
  const allocatedSections = allocateSections(arc, targetBars)
  const { selected: selections } = selectDiverseCandidates(
    eligibleSelections, sampleCount, allocatedSections, arc, profile, bpm, familyTarget
  )
  const sections = allocatedSections.map((section, sectionIndex) => ({
    ...section,
    activeLanes: section.activeLanes.filter((laneIndex) =>
      selections[laneIndex] !== null && !isResting(ops, laneIndex, sectionIndex)
    )
  }))
  const phrases = createPhrases(sections, arc, profile)
  const ordinals = Array.from({ length: profile.lanes.length }, () => 0)
  const nextOrdinal = (laneIndex: number): number => ordinals[laneIndex]++
  const lanes: MixJamGeneratorLanePlan[] = profile.lanes.map((lane, laneIndex) => ({
    index: laneIndex,
    name: lane.name,
    gain: lane.gain,
    pan: lane.pan,
    stereoPairId: null,
    muted: false,
    solo: false,
    sends: [...lane.sends],
    placements: []
  }))

  // One musical span per sample for the whole project (spec-011 AC-016). The
  // first scheduler to place a sample fixes its span and every later site reuses
  // it. Shared across all lanes, because the rule is per `sampleRef`, not lane.
  const spans = createSpanRegistry(targetTicks)

  for (let phraseOrdinal = 0; phraseOrdinal < phrases.length; phraseOrdinal++) {
    const phrase = phrases[phraseOrdinal]!
    for (const laneIndex of phrase.activeLanes) {
      const laneProfile = profile.lanes[laneIndex]!
      const selection = selections[laneIndex]
      if (!selection || laneProfile.role === 'transition') continue
      const variant = variantAt(ops, laneIndex, phrase.sectionIndex)
      if (laneProfile.role === 'percussion') {
        schedulePercussion(
          lanes[laneIndex]!, laneProfile, selection, phrase, variant, bpm,
          profile, parameters.seed, parameters.intensity,
          phrase.endBar === sections[phrase.sectionIndex]!.endBar && phrase.sectionIndex < sections.length - 1,
          () => nextOrdinal(laneIndex), spans
        )
      } else {
        // Only the named boundary section is replaced by its tail op. Other
        // sections on the same lane retain their ordinary phrase material.
        const sectionStart = sections[phrase.sectionIndex]!.startBar
        const tail = phrase.startBar === sectionStart && ops.tails.get(laneIndex)?.has(phrase.sectionIndex)
          ? tailPlacementForBoundary(sections, selection, laneIndex, phrase.sectionIndex, bpm, ops, spans)
          : null
        if (tail && intervalIsFree(lanes[laneIndex]!, tail.startTick, tail.startTick + tail.span)) continue
        schedulePhraseRole(
          lanes[laneIndex]!, laneProfile, selection, phrase, phraseOrdinal, variant, bpm,
          sections[phrase.sectionIndex]!.endBar, profile, parameters.seed, () => nextOrdinal(laneIndex),
          spans
        )
      }
    }
  }
  scheduleTails(sections, lanes, profile, selections, bpm, parameters.seed, ops, nextOrdinal, spans)
  scheduleTransitions(sections, lanes, profile, selections, bpm, parameters.seed, ops, nextOrdinal, spans)
  scheduleRolls(sections, lanes, profile, selections, bpm, parameters.seed, ops, nextOrdinal, spans)

  if (!lanes.some((lane) => lane.placements.some((placement) => placementEnd(placement) === targetTicks))) {
    const finalSection = sections.at(-1)!
    const anchor = finalSection.activeLanes.flatMap((laneIndex) => {
      const selection = selections[laneIndex]
      return selection ? selection.candidates.map((candidate) => ({ laneIndex, candidate })) : []
    }).map(({ laneIndex, candidate }) => ({
      laneIndex, candidate, span: registeredSpan(spans, candidate, durationTicks(candidate, bpm))
    })).map(({ laneIndex, candidate, span }) => ({
      // The anchor must end exactly on the song end, so it can only use the span
      // this sample already carries — giving it a fresh full-length span would
      // write a second `durationTicks` for the same sample.
      laneIndex, candidate, span, startTick: targetTicks - span
    })).find(({ laneIndex, startTick }) => startTick >= 0 &&
      isExactEndAnchorOnGrid(profile.lanes[laneIndex]!, startTick) &&
      intervalIsFree(lanes[laneIndex]!, startTick, targetTicks))
    if (!anchor) throw new Error('The generator could not place a non-overlapping sample at the song end.')
    addPlacement(lanes[anchor.laneIndex]!, anchor.candidate, anchor.startTick, anchor.span,
      nextOrdinal(anchor.laneIndex), profile, parameters.seed, spans)
  }
  validateArrangement(lanes, targetTicks)

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
    if (!FAMILY_ROLES.has(laneProfile.role)) continue
    // Compensation may move a lane by ±6 dB but never past the reference gain
    // hierarchy: a quiet textural loop must not climb over the kick.
    const ceiling = Math.min(1, laneProfile.gain * 1.3)
    lanes[laneIndex]!.gain = Math.min(
      compensatedGain(laneProfile.gain, selections[laneIndex]?.candidates ?? [], targetRms), ceiling
    )
  }
  const selectionPlans = selections.flatMap((selection, laneIndex) => selection ? [{
    laneIndex,
    requestedType: selection.requestedType,
    selectedType: selection.candidates[0]!.sampleType,
    sampleRefs: selection.candidates.map((candidate) => candidate.relpath)
  }] : [])
  const returns: MixJamGeneratorReturnPlan[] = profile.returns.map((bus, index) => ({
    index,
    module: bus.module,
    preset: bus.preset,
    returnLevel: bus.returnLevel
  }))

  return {
    generatorVersion: MIXJAM_GENERATOR_VERSION,
    profileId: profile.id,
    profileVersion: profile.version,
    arcName: arc.name,
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
    poolToken,
    analysis,
    selections: selectionPlans,
    substitutions: selections.flatMap((selection, laneIndex) => selection
      ? [...new Set(selection.candidates.map((candidate) => candidate.sampleType))]
        .filter((selectedType) => selectedType !== selection.requestedType)
        .map((selectedType) => ({ laneIndex, requestedType: selection.requestedType, selectedType }))
      : []),
    sections,
    phrases,
    returns,
    lanes
  }
}
