import { MIXJAM_GENERATOR_VERSION } from '../../../shared/backend-api'
import { MIXJAM_GENERATOR_PROFILE_VERSIONS } from '../../../shared/generator-templates'
import type { ProjectGeneratorMetadata } from './project-file'

export function supportsExactGeneratorRegeneration(generator: ProjectGeneratorMetadata): boolean {
  return generator.generatorVersion === MIXJAM_GENERATOR_VERSION &&
    generator.profileVersion === MIXJAM_GENERATOR_PROFILE_VERSIONS[generator.profileId]
}
