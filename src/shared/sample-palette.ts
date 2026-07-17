// Sample palette slots. The colors are theme-scoped; only the category name
// to slot mapping is fixed so category appearance survives theme changes.
export const PALETTE_SLOT_COUNT = 8
export const SLOT_UNSORTED = 8

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

export const ROOT_CATEGORY_NAMES = ['Unsorted']

function hashCode(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function categorySlot(name: string): number {
  if (name === 'Unsorted') return SLOT_UNSORTED
  return WELL_KNOWN[name.toLowerCase()] ?? (hashCode(name) % PALETTE_SLOT_COUNT)
}
