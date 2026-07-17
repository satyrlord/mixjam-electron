const SHARP_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const ROOT_INDEX: Readonly<Record<string, number>> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11
}

export interface ParsedMusicalKey {
  root: number
  minor: boolean
}

export function parseMusicalKey(value: string): ParsedMusicalKey | null {
  const match = /^([A-G](?:#|b)?)(m?)$/.exec(value)
  if (!match) return null
  const root = ROOT_INDEX[match[1]!]
  return root === undefined ? null : { root, minor: match[2] === 'm' }
}

export function canonicalMusicalKey(value: string): string | null {
  const parsed = parseMusicalKey(value)
  return parsed ? `${SHARP_ROOTS[parsed.root]}${parsed.minor ? 'm' : ''}` : null
}
