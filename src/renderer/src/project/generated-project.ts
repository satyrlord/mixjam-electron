import type { MixJamGeneratorPlan } from '../../../shared/backend-api'
import type { LaneState } from '../lib/arrangement'
import { createDefaultProjectState } from './project-state'
import type { ProjectData } from './project-file'

export function materializeGeneratedProject(plan: MixJamGeneratorPlan): ProjectData {
  const materialized: LaneState[] = plan.lanes.map((lane) => ({
    id: `lane-${lane.index + 1}`,
    index: lane.index,
    name: lane.name,
    pan: lane.pan,
    muted: lane.muted,
    solo: lane.solo,
    gain: lane.gain,
    sends: [0, 0, 0, 0],
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
      lanes
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
