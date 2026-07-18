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
  it.each([
    [null, 'Generator parameters must be an object.'],
    [[], 'Generator parameters must be an object.'],
    [{ ...valid, profileId: 'unknown' }, 'Unknown generator profile: unknown'],
    [{ ...valid, seed: '' }, 'The seed must be a 1-64 character safe token.'],
    [{ ...valid, seed: 'unsafe seed' }, 'The seed must be a 1-64 character safe token.'],
    [{ ...valid, durationSeconds: 29 }, 'Duration must be an integer from 30 to 600 seconds.'],
    [{ ...valid, durationSeconds: 600.5 }, 'Duration must be an integer from 30 to 600 seconds.'],
    [{ ...valid, durationSeconds: 601 }, 'Duration must be an integer from 30 to 600 seconds.'],
    [{ ...valid, bpmMode: 'automatic' }, 'BPM mode must be fixed or follow-detected.'],
    [{ ...valid, bpm: 59 }, 'Fixed BPM must be an integer from 60 to 180.'],
    [{ ...valid, bpm: 120.5 }, 'Fixed BPM must be an integer from 60 to 180.'],
    [{ ...valid, bpm: 181 }, 'Fixed BPM must be an integer from 60 to 180.']
  ])('rejects invalid input %#', (input, message) => {
    expect(() => validateMixJamGeneratorParameters(input)).toThrow(message as string)
  })

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
