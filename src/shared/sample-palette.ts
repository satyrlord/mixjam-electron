// Sample palette slots. The colors are theme-scoped; only the source-group name
// to slot mapping is fixed so appearance survives theme changes. This module
// also owns the relpath -> name derivations, so every layer that colors or tags
// a sample by its folder path agrees on the name it derives.
export const PALETTE_SLOT_COUNT = 8
export const SLOT_UNSORTED = 8

/** Name used when a sample sits directly at the scan root, with no parent
 *  directory to derive a name from. */
export const UNSORTED_NAME = 'Unsorted'

/** Splits any path into its non-empty segments. Backslashes are normalized so
 *  Windows-authored relpaths derive the same names as POSIX ones. */
export function pathSegments(path: string): string[] {
  return path.replaceAll('\\', '/').split('/').filter(Boolean)
}

/** Segments of a *file* relpath excluding its filename. */
function directorySegments(relpath: string): string[] {
  return pathSegments(relpath).slice(0, -1)
}

/** The sample's top-level folder name — its palette identity. `Unsorted` when
 *  the sample sits at the scan root. */
export function sourceGroupFromRelpath(relpath: string): string {
  return directorySegments(relpath)[0] ?? UNSORTED_NAME
}

/** Every directory segment of the path, deduplicated, as flat folder-tag names.
 *  A sample at the scan root derives the single `Unsorted` name. */
export function folderTagNamesFromRelpath(relpath: string): string[] {
  const segments = directorySegments(relpath)
  return segments.length > 0 ? [...new Set(segments)] : [UNSORTED_NAME]
}

const WELL_KNOWN: Record<string, number> = {
  drums: 0,
  percussion: 0,
  loop: 1,
  bass: 2,
  keys: 3,
  guitar: 3,
  chords: 3,
  piano: 3,
  synth: 4,
  lead: 4,
  voice: 5,
  vocal: 5,
  fx: 5,
  vox: 5,
  arp: 6,
  pad: 7,
  atmosphere: 7,
  xtra: 7,
  texture: 7
}

function hashCode(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function sourceGroupSlot(name: string): number {
  if (name === UNSORTED_NAME) return SLOT_UNSORTED
  return WELL_KNOWN[name.toLowerCase()] ?? (hashCode(name) % PALETTE_SLOT_COUNT)
}
