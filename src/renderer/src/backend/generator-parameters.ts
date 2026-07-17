import {
  MIXJAM_GENERATOR_BPM_MODES,
  MIXJAM_GENERATOR_INTENSITIES,
  MIXJAM_GENERATOR_PROFILE_IDS,
  SAFE_SEED,
  type MixJamGeneratorParameters
} from '../../../shared/backend-api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateMixJamGeneratorParameters(
  value: unknown
): asserts value is MixJamGeneratorParameters {
  if (!isRecord(value)) throw new Error('Generator parameters must be an object.')
  if (!MIXJAM_GENERATOR_PROFILE_IDS.includes(value.profileId as never)) {
    throw new Error(`Unknown generator profile: ${String(value.profileId)}`)
  }
  if (typeof value.seed !== 'string' || !SAFE_SEED.test(value.seed)) {
    throw new Error('The seed must be a 1-64 character safe token.')
  }
  if (!Number.isInteger(value.durationSeconds) || (value.durationSeconds as number) < 30 || (value.durationSeconds as number) > 600) {
    throw new Error('Duration must be an integer from 30 to 600 seconds.')
  }
  if (!MIXJAM_GENERATOR_BPM_MODES.includes(value.bpmMode as never)) {
    throw new Error('BPM mode must be fixed or follow-detected.')
  }
  if (!MIXJAM_GENERATOR_INTENSITIES.includes(value.intensity as never)) {
    throw new Error('Intensity must be low, medium, or high.')
  }
  if (value.bpmMode === 'fixed' &&
      (!Number.isInteger(value.bpm) || (value.bpm as number) < 60 || (value.bpm as number) > 180)) {
    throw new Error('Fixed BPM must be an integer from 60 to 180.')
  }
}
