import type { GeneratorCandidate } from './generator-library'
import { compareCodeUnits } from './generator-determinism'
import { stripStructuredLabelSuffix } from './filename-evidence'

/**
 * Sample libraries are authored as numbered motif families: `babylon-1.wav`,
 * `babylon-2.wav`, ... `babylon-5.wav` are coherent parts of one idea, and
 * `above-clouds1l.wav` / `above-clouds1r.wav` can share a numbered family stem.
 * Treating unrelated families as interchangeable members of one
 * bag lets the arranger hop between unrelated families bar to bar, which is the
 * primary cause of "nonsensical" output. These helpers recover the authored
 * grouping from the filename so the engine can keep one coherent family on a
 * lane and walk its numbered parts in order.
 */

export type StereoSide = 'left' | 'right' | 'mono'

export interface MotifKey {
  /** Stable family stem shared by every numbered part, e.g. `babylon`. */
  family: string
  /** Authored part index within the family; `0` when the file is unnumbered. */
  part: number
  /** Syntactic side suffix used only while recovering the family stem. */
  side: StereoSide
}

export interface MotifFamily {
  family: string
  /** Members sorted by authored part order, then relative path. */
  members: GeneratorCandidate[]
  /** Distinct authored part count after collapsing stereo pairs. */
  partCount: number
}

const EXTENSION = /\.[a-z0-9]+$/i
// A trailing stereo-side marker: `-l`, `_r`, or a bare `l`/`r` glued to a digit
// (`above-clouds1l`). It never consumes an interior letter of a word.
const STEREO_SUFFIX = /(?<=\d)[lr]$|(?:[\s_.-])[lr]$/i
// A trailing numeric part index with an optional separator: `-3`, `_10`, `1`.
const PART_SUFFIX = /(?:[\s_.-]?)(\d+)$/
// The `_<bpm>_<key>_<pack>` label commercial packs append. It has to come off
// before the part index is read, or the pack ordinal (`SC1`, `SL3`) is mistaken
// for the part and every file in the library becomes its own one-member family
// — which silently disables family coherence for the whole corpus.
// `ROLE###_STYLE` — the part index sits in the middle once the label is gone
// (`KICK010_PROGR`). Only used when no trailing index was found.
const INFIX_PART = /^(.*?[a-z])(\d{2,3})([\s_.-].+)$/i

function stripExtension(filename: string): string {
  return filename.replace(EXTENSION, '')
}

/**
 * Parse a filename into its authored family stem, part index, and stereo side.
 * The order matters: the stereo side sits outside the part index in real
 * libraries (`babylon-3-l`, `above-clouds1r`), so strip the side first.
 */
export function parseMotifKey(filename: string): MotifKey {
  let stem = stripExtension(filename)
  let side: StereoSide = 'mono'

  // `FX001_TRNCE_140_X_SC4(L)` — packs spell the side in parentheses after the
  // label, so take that off before anything else.
  const parenthesized = /\(([lr])\)$/i.exec(stem)
  if (parenthesized) {
    side = parenthesized[1]!.toLowerCase() === 'l' ? 'left' : 'right'
    stem = stem.slice(0, stem.length - parenthesized[0].length)
  }
  stem = stripStructuredLabelSuffix(stem)

  if (side === 'mono') {
    const sideMatch = stem.match(STEREO_SUFFIX)
    if (sideMatch) {
      side = sideMatch[0].slice(-1).toLowerCase() === 'l' ? 'left' : 'right'
      stem = stem.slice(0, stem.length - sideMatch[0].length)
    }
  }

  let part = 0
  const partMatch = stem.match(PART_SUFFIX)
  if (partMatch) {
    part = Number.parseInt(partMatch[1]!, 10)
    stem = stem.slice(0, stem.length - partMatch[0].length)
  } else {
    const infix = stem.match(INFIX_PART)
    if (infix) {
      part = Number.parseInt(infix[2]!, 10)
      stem = `${infix[1]!}${infix[3]!}`
    }
  }

  const family = stem.replace(/[\s_.-]+$/, '').toLowerCase() || stripExtension(filename).toLowerCase()
  return { family, part, side }
}

/**
 * One physical recording, however it is spelled. Both stereo halves and any
 * duplicate spellings of the same family part in one directory collapse to this
 * single key, so stereo-twin pairing and logical-sample de-duplication cannot
 * drift apart.
 */
export function logicalSampleKey(candidate: GeneratorCandidate): string {
  const key = parseMotifKey(candidate.filename)
  const directory = candidate.relpath.slice(0, candidate.relpath.length - candidate.filename.length)
  // NUL separators so a directory or family that contains a space can never
  // collide with a different directory/family split.
  return `${directory}\u0000${key.family}\u0000${key.part}`
}

/**
 * Group a lane's compatible candidates into authored families, sorted by part
 * order. Families are returned largest-first so a coherent multi-part motif
 * outranks a lone one-off.
 */
export function groupMotifFamilies(candidates: readonly GeneratorCandidate[]): MotifFamily[] {
  const byFamily = new Map<string, GeneratorCandidate[]>()

  for (const candidate of candidates) {
    const key = parseMotifKey(candidate.filename)
    const bucket = byFamily.get(key.family) ?? []
    bucket.push(candidate)
    byFamily.set(key.family, bucket)
  }

  const families = [...byFamily.entries()].map(([family, members]) => {
    members.sort((left, right) => {
      const leftPart = parseMotifKey(left.filename).part
      const rightPart = parseMotifKey(right.filename).part
      return leftPart - rightPart || compareCodeUnits(left.relpath, right.relpath)
    })
    const parts = new Set(members.map((member) => parseMotifKey(member.filename).part))
    return { family, members, partCount: parts.size }
  })

  families.sort((left, right) =>
    right.partCount - left.partCount ||
    right.members.length - left.members.length ||
    compareCodeUnits(left.family, right.family)
  )
  return families
}
