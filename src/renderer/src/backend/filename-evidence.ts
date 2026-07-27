import { canonicalMusicalKey } from './musical-key'

const MIN_LABEL_BPM = 60
const MAX_LABEL_BPM = 200

/** The authored source-pack token in a filename, e.g. `SC1` or `SL12`. */
export const PACK_TOKEN_PATTERN = '(?:sc|sl)[0-9]+'

const STRUCTURED_LABEL_PATTERN =
  `([6-9][0-9]|1[0-9]{2}|200)_([a-g](?:#|b)?m?|x)_${PACK_TOKEN_PATTERN}`
const STRUCTURED_LABEL = new RegExp(`(?:^|_)${STRUCTURED_LABEL_PATTERN}(?=$|[_.(])`, 'i')
const STRUCTURED_LABEL_SUFFIX = new RegExp(`_${STRUCTURED_LABEL_PATTERN}$`, 'i')

export function stripStructuredLabelSuffix(value: string): string {
  return value.replace(STRUCTURED_LABEL_SUFFIX, '')
}

export function labeledPoolToken(value: string): string | null {
  const structured = STRUCTURED_LABEL.exec(value)
  if (!structured) return null
  return `${Number(structured[1])}/${structured[2]!.toUpperCase()}`
}

export function labeledSampleBpm(value: string): number | null {
  const structured = STRUCTURED_LABEL.exec(value)
  if (structured) return Number(structured[1])
  const match = /(?:^|[^a-z0-9])(?:bpm[\s_.-]*([0-9]{2,3})|([0-9]{2,3})[\s_.-]*bpm)(?=$|[^a-z0-9])/i.exec(value)
  const bpm = Number(match?.[1] ?? match?.[2])
  return Number.isFinite(bpm) && bpm >= MIN_LABEL_BPM && bpm <= MAX_LABEL_BPM ? bpm : null
}

export function labeledMusicalKey(value: string): string | null {
  const structured = STRUCTURED_LABEL.exec(value)
  if (structured && /m$/i.test(structured[2]!)) return canonicalMusicalKey(structured[2]!)
  const matches = value.matchAll(
    /(?:^|[^a-z])([a-g](?:#|b)?(?:m|min|minor|maj|major))(?=$|[^a-z])/gi
  )
  let key: string | null = null
  for (const match of matches) {
    const token = match[1]!
      .replace(/minor$/i, 'm')
      .replace(/min$/i, 'm')
      .replace(/major$/i, '')
      .replace(/maj$/i, '')
    key = canonicalMusicalKey(token) ?? key
  }
  return key
}
