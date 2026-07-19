import {
  MIXJAM_GENERATOR_VERSION,
  type MixJamGeneratorParameters
} from '../../../shared/backend-api'
import { MIXJAM_GENERATOR_PROFILE_VERSIONS } from '../../../shared/generator-templates'
import type { ProjectGeneratorMetadata } from './project-file'

/**
 * Interprets persisted generator metadata at the project seam. Callers receive
 * planner parameters only when the saved generator and profile are still
 * exactly supported by this build.
 */
export function persistedGeneratorParameters(
  generator: ProjectGeneratorMetadata
): MixJamGeneratorParameters | null {
  if (!supportsExactGeneratorRegeneration(generator)) return null
  return {
    profileId: generator.profileId,
    bpmMode: generator.parameters.bpmMode,
    ...(generator.parameters.bpmMode === 'fixed'
      ? { bpm: generator.parameters.resolvedBpm }
      : {}),
    ...(generator.parameters.tempoClusterPrefix === undefined
      ? {}
      : { tempoClusterPrefix: generator.parameters.tempoClusterPrefix }),
    intensity: generator.parameters.intensity,
    durationSeconds: generator.parameters.durationSeconds,
    seed: generator.seed
  }
}

export function supportsExactGeneratorRegeneration(generator: ProjectGeneratorMetadata): boolean {
  return generator.generatorVersion === MIXJAM_GENERATOR_VERSION &&
    generator.profileVersion === MIXJAM_GENERATOR_PROFILE_VERSIONS[generator.profileId]
}
