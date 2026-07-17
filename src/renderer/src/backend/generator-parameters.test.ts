import { describe, expect, it } from 'vitest'
import type { MixJamGeneratorParameters } from '../../../shared/backend-api'
import { validateMixJamGeneratorParameters } from './generator-parameters'

const valid: MixJamGeneratorParameters = {
  profileId: 'techno',
  bpmMode: 'fixed',
  bpm: 140,
  intensity: 'medium',
  durationSeconds: 180,
  seed: 'valid-seed'
}

describe('MixJam generator parameter validation', () => {
  it('rejects every unsupported intensity', () => {
    expect(() => validateMixJamGeneratorParameters({ ...valid, intensity: 'extreme' }))
      .toThrow('Intensity must be low, medium, or high.')
  })

  it('ignores a stale BPM value in follow-detected mode', () => {
    expect(() => validateMixJamGeneratorParameters({
      ...valid,
      bpmMode: 'follow-detected',
      bpm: 500
    })).not.toThrow()
  })

  it('accepts follow-detected mode without a BPM', () => {
    expect(() => validateMixJamGeneratorParameters({
      ...valid,
      bpmMode: 'follow-detected',
      bpm: undefined
    })).not.toThrow()
  })
})
