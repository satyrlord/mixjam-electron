import type { MixJamGeneratorPlan } from '../../../shared/backend-api'
import { isEffectSlot, type EffectSlot } from '../engine/effects'
import type { LaneState } from '../lib/arrangement'
import { createDefaultProjectState, type ChannelState } from './project-state'
import type { ProjectData } from './project-file'

function materializeEffect(plan: MixJamGeneratorPlan['channels'][number]['effects'][number]): EffectSlot {
  const effect = { id: plan.id, type: plan.type, bypassed: false, ...plan.values }
  if (!isEffectSlot(effect)) throw new Error(`Generator produced an invalid ${plan.type} effect.`)
  return effect
}

export function materializeGeneratedProject(plan: MixJamGeneratorPlan): ProjectData {
  const lanes: LaneState[] = plan.lanes.map((lane) => ({
    index: lane.index,
    name: lane.name,
    pan: lane.pan,
    muted: lane.muted,
    solo: lane.solo,
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
  const channels: ChannelState[] = plan.channels.map((channel) => ({
    channelIndex: channel.channelIndex,
    gain: channel.gain,
    pan: channel.pan,
    muted: channel.muted,
    solo: channel.solo,
    effects: channel.effects.map(materializeEffect)
  }))

  return {
    ...createDefaultProjectState({
      song: { bpm: plan.parameters.resolvedBpm },
      lanes,
      channels
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
