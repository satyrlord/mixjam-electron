import { pathSegments } from './sample-palette'
import type { SampleType } from './sample-types'

// Sample libraries file material by acoustic role: `Trance/Beats/…`,
// `House/Sphere/…`. That folder name is exact, free ground truth about what the
// file is *for*, and the planner had been ignoring it in favour of the
// audio-derived sample type alone.
//
// Two boundaries this module deliberately respects:
//   - A role is a **planner hint**, never a rewrite of the stored `sampleType`
//     (glossary §Sample type: a type never assigns or replaces a category), and
//     never a category.
//   - Segments are matched against this vocabulary at any depth rather than by
//     position, because libraries nest a subgenre level (`House/Classic/Keys`)
//     and "the second segment" is then the wrong answer.

const ROLE_TYPES: Readonly<Record<string, readonly SampleType[]>> = {
  bass: ['Bass'],
  beats: ['Loop', 'Percussion', 'Kick', 'Snare', 'Hi-hat'],
  drum: ['Kick', 'Snare', 'Hi-hat', 'Percussion'],
  drums: ['Kick', 'Snare', 'Hi-hat', 'Percussion'],
  percussion: ['Percussion', 'Hi-hat', 'Snare'],
  fx: ['FX'],
  guitar: ['Loop', 'Synth'],
  keys: ['Synth', 'Loop'],
  synth: ['Synth'],
  lead: ['Synth'],
  loop: ['Loop'],
  loops: ['Loop'],
  pad: ['Atmosphere', 'Synth'],
  singleshots: ['Percussion', 'Other'],
  sphere: ['Atmosphere'],
  atmosphere: ['Atmosphere'],
  vocal: ['Vocal'],
  vocals: ['Vocal'],
  voice: ['Vocal'],
  vox: ['Vocal'],
  xtra: ['Other', 'FX']
}

/** Every role segment the vocabulary recognises, for diagnostics and tests. */
export const SAMPLE_ROLE_SEGMENTS: readonly string[] = Object.keys(ROLE_TYPES).sort()

/**
 * The deepest recognised role segment of a sample's folder path, lower-cased —
 * deepest so `House/Classic/Keys` reads as `keys`, not as a subgenre name.
 * Returns null when no segment is in the vocabulary.
 */
export function folderRoleSegment(relpath: string): string | null {
  const segments = pathSegments(relpath).slice(0, -1)
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index]!.toLowerCase()
    if (segment in ROLE_TYPES) return segment
  }
  return null
}

/**
 * Sample types the sample's role folder suggests, best first. Empty when the
 * path carries no recognised role — the planner then falls back to the stored
 * `sampleType` alone, exactly as before.
 */
export function folderRoleTypes(relpath: string): readonly SampleType[] {
  const segment = folderRoleSegment(relpath)
  return segment === null ? [] : ROLE_TYPES[segment]!
}

/**
 * True when the stored sample type agrees with what the role folder says the
 * material is for. Used as a *tiebreak* in candidate ranking: a `Synth` filed
 * under `Bass` is still eligible for a synth lane, it just ranks below a `Synth`
 * filed under `Keys`.
 */
export function agreesWithFolderRole(relpath: string, sampleType: SampleType): boolean {
  const types = folderRoleTypes(relpath)
  return types.length === 0 || types.includes(sampleType)
}
