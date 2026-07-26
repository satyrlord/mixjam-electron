import { describe, expect, it } from 'vitest'
import {
  cohortContextKey,
  cohortContextKeyForRelpath,
  contextKeyContainsRelpath,
  isCohortContextKey,
  packTokenOf,
  parseCohortContextKey
} from './context-key'

describe('pack tokens', () => {
  it.each([
    ['Kick_140_A_SC1.wav', 'SC1'],
    ['Loop_125_Am_SL12.wav', 'SL12'],
    ['pad_SC7(L).wav', 'SC7'],
    ['name_sc3_more.wav', 'sc3']
  ])('reads the token from %s', (filename, token) => {
    expect(packTokenOf(filename)).toBe(token)
  })

  it.each(['Kick.wav', 'SC1Kick.wav', 'kick_scx.wav', 'kick_1.wav'])(
    'states no token for %s',
    (filename) => {
      expect(packTokenOf(filename)).toBeNull()
    }
  )
})

describe('cohort keys', () => {
  it('round-trips through build and parse, normalizing token case', () => {
    const key = cohortContextKey('Drums', 'sc1')
    expect(key).toBe('@cohort/Drums/SC1')
    expect(isCohortContextKey(key)).toBe(true)
    expect(parseCohortContextKey(key)).toEqual({ topLevel: 'Drums', token: 'SC1' })
  })

  it('derives the key a sample belongs to', () => {
    expect(cohortContextKeyForRelpath('Drums/Kicks/kick_140_A_SC1.wav'))
      .toBe('@cohort/Drums/SC1')
    // A file at the root has no top-level directory to scope the cohort to.
    expect(cohortContextKeyForRelpath('kick_SC1.wav')).toBe('@cohort//SC1')
    expect(cohortContextKeyForRelpath('Drums/kick.wav')).toBeNull()
  })

  it('treats a directory prefix as a non-cohort key', () => {
    expect(isCohortContextKey('Drums/Kicks')).toBe(false)
    expect(parseCohortContextKey('Drums/Kicks')).toBeNull()
  })
})

describe('context key membership', () => {
  it('matches a cohort only inside its own top-level directory', () => {
    expect(contextKeyContainsRelpath('@cohort/Drums/SC1', 'Drums/Kicks/kick_SC1.wav')).toBe(true)
    expect(contextKeyContainsRelpath('@cohort/Drums/SC1', 'Bass/kick_SC1.wav')).toBe(false)
  })

  it('requires the token to be a delimited label segment', () => {
    expect(contextKeyContainsRelpath('@cohort/Drums/SC1', 'Drums/kick_SC1.wav')).toBe(true)
    expect(contextKeyContainsRelpath('@cohort/Drums/SC1', 'Drums/kick_SC12.wav')).toBe(false)
    expect(contextKeyContainsRelpath('@cohort/Drums/SC1', 'Drums/kickSC1.wav')).toBe(false)
  })

  it('matches a directory prefix by path segment, not by string prefix', () => {
    expect(contextKeyContainsRelpath('Drums', 'Drums/Kicks/kick.wav')).toBe(true)
    expect(contextKeyContainsRelpath('Drums', 'Drums')).toBe(true)
    expect(contextKeyContainsRelpath('Drums', 'DrumsExtra/kick.wav')).toBe(false)
    expect(contextKeyContainsRelpath('', 'anything/at/all.wav')).toBe(true)
  })

  it('never compiles a stored token into a pattern', () => {
    // A malformed key must not throw or match everything: the token is compared
    // literally, so regex metacharacters are inert.
    expect(contextKeyContainsRelpath('@cohort/Drums/.*', 'Drums/kick_SC1.wav')).toBe(false)
    expect(contextKeyContainsRelpath('@cohort/Drums/(', 'Drums/kick_SC1.wav')).toBe(false)
    expect(contextKeyContainsRelpath('@cohort', 'kick.wav')).toBe(false)
  })
})
