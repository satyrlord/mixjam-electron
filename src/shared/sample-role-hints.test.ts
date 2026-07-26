import { describe, expect, it } from 'vitest'
import {
  SAMPLE_ROLE_SEGMENTS,
  agreesWithFolderRole,
  folderRoleSegment,
  folderRoleTypes
} from './sample-role-hints'

describe('folderRoleSegment', () => {
  it('recovers the acoustic role from a genre-first corpus', () => {
    expect(folderRoleSegment('Trance/Beats/TRANCE_BEATS006_140_X_SL1.wav')).toBe('beats')
    expect(folderRoleSegment('House/Sphere/SPHERE004_DISCO_125_A_SC1.wav')).toBe('sphere')
  })

  it('matches at any depth, so a nested subgenre level does not shadow the role', () => {
    // "The second segment" is the wrong answer for a library that nests a
    // subgenre: House/Classic/Keys is a keys folder, not a Classic folder.
    expect(folderRoleSegment('House/Classic/Keys/PIANO016_HOUSE_125_A_SC1.wav')).toBe('keys')
  })

  it('returns null for a path with no recognised role', () => {
    expect(folderRoleSegment('Bundle/Assorted/thing.wav')).toBeNull()
    expect(folderRoleSegment('loose.wav')).toBeNull()
  })

  it('never reads the filename as a role', () => {
    expect(folderRoleSegment('Assorted/bass.wav')).toBeNull()
  })

  it('publishes the vocabulary it matches against', () => {
    expect(SAMPLE_ROLE_SEGMENTS).toContain('sphere')
    expect(SAMPLE_ROLE_SEGMENTS).toContain('singleshots')
    expect([...SAMPLE_ROLE_SEGMENTS]).toEqual([...SAMPLE_ROLE_SEGMENTS].sort())
    for (const segment of SAMPLE_ROLE_SEGMENTS) {
      expect(folderRoleTypes(`Genre/${segment}/file.wav`).length).toBeGreaterThan(0)
    }
  })
})

describe('agreesWithFolderRole', () => {
  it('accepts material whose stored type matches its role folder', () => {
    expect(agreesWithFolderRole('Trance/Bass/SNTHBASS001_TRNCE_140_A_SC4.wav', 'Bass')).toBe(true)
    expect(agreesWithFolderRole('Trance/Sphere/SPHERE001.wav', 'Atmosphere')).toBe(true)
  })

  it('is a hint, not a filter: an unrecognised role agrees with everything', () => {
    expect(agreesWithFolderRole('Assorted/thing.wav', 'Vocal')).toBe(true)
  })

  it('disagrees when the stored type is not what the folder is for', () => {
    expect(agreesWithFolderRole('Trance/Bass/SNTHBASS001.wav', 'Vocal')).toBe(false)
  })
})
