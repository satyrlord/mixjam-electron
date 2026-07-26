import type { MixJamGeneratorPlan, MixJamGeneratorReturnPlan } from '../../../shared/backend-api'
import {
  AETHERFORM_REVERB_PRESET_NAMES,
  ECHOFORM_DELAY_PRESET_NAMES,
  applyAetherformReverbPreset,
  applyEchoformDelayPreset,
  createDefaultAetherformReverbReturnModule,
  createDefaultEchoformDelayReturnModule,
  type AetherformReverbPresetName,
  type EchoformDelayPresetName,
  type ReturnModule
} from '../engine/return-effects'
import {
  createDefaultFxBuses,
  createDefaultProjectState,
  type LaneSendLevels,
  type LaneState,
  type ProjectFxBuses
} from './project-state'
import type { ProjectData } from './project-file'

// Sends and return buses are part of what the profile authors: the reference
// projects put 71–100% of lanes into a reverb and a delay, and a dry generated
// project reads as a demo of samples rather than a mix. Module parameters stay
// owned by spec-010 and spec-013 — the profile names a shipped preset and the
// engine resolves it, so no template duplicates module state.
function moduleForReturn(bus: MixJamGeneratorReturnPlan, id: `fx-${1 | 2 | 3 | 4}`): ReturnModule {
  if (bus.module === 'aetherform-reverb') {
    if (!AETHERFORM_REVERB_PRESET_NAMES.includes(bus.preset as AetherformReverbPresetName)) {
      throw new Error(`Unknown Aetherform Reverb preset in generator profile: ${bus.preset}`)
    }
    return applyAetherformReverbPreset(
      createDefaultAetherformReverbReturnModule(id), bus.preset as AetherformReverbPresetName
    )
  }
  if (!ECHOFORM_DELAY_PRESET_NAMES.includes(bus.preset as EchoformDelayPresetName)) {
    throw new Error(`Unknown Echoform Delay preset in generator profile: ${bus.preset}`)
  }
  return applyEchoformDelayPreset(
    createDefaultEchoformDelayReturnModule(id), bus.preset as EchoformDelayPresetName
  )
}

function fxBusesForPlan(plan: MixJamGeneratorPlan): ProjectFxBuses {
  const buses = createDefaultFxBuses()
  const seenIndexes = new Set<number>()
  for (const bus of plan.returns) {
    if (!Number.isInteger(bus.index) || bus.index < 0 || bus.index >= buses.length) {
      throw new Error(`Generator return index must be an integer from 0 to ${buses.length - 1}: ${bus.index}`)
    }
    if (seenIndexes.has(bus.index)) {
      throw new Error(`Duplicate generator return index: ${bus.index}`)
    }
    seenIndexes.add(bus.index)
    const target = buses[bus.index]
    if (!target) throw new Error(`Generator return index is unavailable: ${bus.index}`)
    target.module = moduleForReturn(bus, target.id)
    target.returnLevel = bus.returnLevel
  }
  return buses
}

/** The plan's per-return send levels widened to the project's four slots. */
function laneSends(sends: readonly number[]): LaneSendLevels {
  const levels: LaneSendLevels = [0, 0, 0, 0]
  for (let index = 0; index < Math.min(sends.length, levels.length); index++) {
    levels[index] = sends[index]!
  }
  return levels
}

export function materializeGeneratedProject(plan: MixJamGeneratorPlan): ProjectData {
  const materialized: LaneState[] = plan.lanes.map((lane) => ({
    id: `lane-${lane.index + 1}`,
    index: lane.index,
    name: lane.name,
    pan: lane.pan,
    stereoPairId: lane.stereoPairId ?? null,
    muted: lane.muted,
    solo: lane.solo,
    gain: lane.gain,
    sends: laneSends(lane.sends),
    placements: lane.placements.map((placement) => ({
      id: placement.id,
      samplePath: placement.sampleRef,
      sampleName: placement.sampleName,
      startTick: placement.startTick,
      durationTicks: placement.durationTicks,
      durationSeconds: placement.durationSeconds,
      nativeBPM: placement.nativeBpm,
      slot: placement.slot
    }))
  }))
  const nonEmpty = materialized.filter((lane) => lane.placements.length > 0)
  const lanes = (nonEmpty.length > 0 ? nonEmpty : materialized.slice(0, 1)).map((lane, index) => ({ ...lane, index }))
  return {
    ...createDefaultProjectState({
      song: { bpm: plan.parameters.resolvedBpm },
      lanes,
      fxBuses: fxBusesForPlan(plan)
    }),
    generator: {
      generatorVersion: plan.generatorVersion,
      profileId: plan.profileId,
      profileVersion: plan.profileVersion,
      seed: plan.seed,
      parameters: { ...plan.parameters },
      corpusFingerprint: plan.corpusFingerprint,
      sampleFolderKey: plan.sampleFolderKey
    }
  }
}
