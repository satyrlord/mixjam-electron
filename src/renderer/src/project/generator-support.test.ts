import { describe, expect, it } from 'vitest'
import type { ProjectGeneratorMetadata } from './project-file'
import {
  persistedGeneratorParameters,
  supportsExactGeneratorRegeneration
} from './generator-support'

const METADATA: ProjectGeneratorMetadata = {
  generatorVersion: 1,
  profileId: 'techno',
  profileVersion: 2,
  seed: 'stable-seed',
  parameters: {
    bpmMode: 'fixed',
    resolvedBpm: 140,
    intensity: 'medium',
    durationSeconds: 180
  },
  corpusFingerprint: 'corpus',
  sampleFolderKey: 'samples'
}

describe('persisted generator interpretation', () => {
  it.each([
    ['fixed BPM without an analysis group', METADATA, {
      profileId: 'techno', bpmMode: 'fixed', bpm: 140,
      intensity: 'medium', durationSeconds: 180, seed: 'stable-seed'
    }],
    ['detected BPM with an analysis group', {
      ...METADATA,
      parameters: {
        ...METADATA.parameters,
        bpmMode: 'follow-detected' as const,
        tempoClusterPrefix: '@cohort/Drums/kick'
      }
    }, {
      profileId: 'techno', bpmMode: 'follow-detected',
      tempoClusterPrefix: '@cohort/Drums/kick',
      intensity: 'medium', durationSeconds: 180, seed: 'stable-seed'
    }]
  ] as const)('maps %s into planner parameters', (_name, metadata, expected) => {
    expect(persistedGeneratorParameters(metadata)).toEqual(expected)
  })

  it.each([
    ['generator version', { ...METADATA, generatorVersion: 2 }],
    ['profile version', { ...METADATA, profileVersion: 1 }],
    ['unknown profile', { ...METADATA, profileId: 'unknown' as ProjectGeneratorMetadata['profileId'] }]
  ])('rejects unsupported %s', (_name, metadata) => {
    expect(supportsExactGeneratorRegeneration(metadata)).toBe(false)
    expect(persistedGeneratorParameters(metadata)).toBeNull()
  })
})
