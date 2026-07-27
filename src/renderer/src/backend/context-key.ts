// A contextual group is addressed either by a directory prefix (`Drums/Kicks`)
// or by a virtual source cohort that spans directories (`@cohort/Drums/SC1`).
// This module owns both construction and parsing of the cohort grammar.
//
// The pack-token grammar (`SC1`, `SL12`) is the same one the motif parser reads
// from filenames; getting it wrong does not throw, it silently mis-groups the
// corpus. It is stated here and imported, never re-typed.

import { PACK_TOKEN_PATTERN } from './filename-evidence'

const COHORT_PREFIX = '@cohort/'

const PACK_TOKEN_IN_NAME = new RegExp(`(?:^|_)(${PACK_TOKEN_PATTERN})(?=$|[_.(])`, 'i')

/** A parsed `@cohort/<topLevel>/<token>` key. */
export interface CohortContextKey {
  /** The top-level directory the cohort is scoped to; `''` at the root. */
  topLevel: string
  /** The uppercased pack token, e.g. `SC1`. */
  token: string
}

/** Builds the canonical cohort key. The token is normalized to upper case. */
export function cohortContextKey(topLevel: string, token: string): string {
  return `${COHORT_PREFIX}${topLevel}/${token.toUpperCase()}`
}

/** True when `contextKey` addresses a virtual cohort rather than a directory. */
export function isCohortContextKey(contextKey: string): boolean {
  return contextKey.startsWith(COHORT_PREFIX)
}

/** Parses a cohort key, or returns null when `contextKey` is a directory prefix. */
export function parseCohortContextKey(contextKey: string): CohortContextKey | null {
  if (!isCohortContextKey(contextKey)) return null
  const [, topLevel = '', token = ''] = contextKey.split('/')
  return { topLevel, token }
}

/** The pack token stated by a file's own name, or null when it states none. */
export function packTokenOf(filename: string): string | null {
  return PACK_TOKEN_IN_NAME.exec(filename)?.[1] ?? null
}

/**
 * The cohort key a sample belongs to, or null when its filename states no pack
 * token. This is the producing half of the grammar that
 * {@link contextKeyContainsRelpath} consumes.
 */
export function cohortContextKeyForRelpath(relpath: string): string | null {
  const segments = relpath.split('/').filter(Boolean)
  const token = packTokenOf(segments.at(-1) ?? '')
  if (!token) return null
  return cohortContextKey(segments.length > 1 ? segments[0]! : '', token)
}

/**
 * True when `filename` carries `token` as a delimited label segment. The token
 * is matched literally, never compiled into a pattern, so a key that arrived
 * from storage cannot inject regex syntax.
 */
function filenameStatesToken(filename: string, token: string): boolean {
  if (token === '') return false
  const haystack = filename.toLowerCase()
  const needle = token.toLowerCase()
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) return false
    const before = at === 0 ? '' : haystack[at - 1]!
    const after = haystack[at + needle.length] ?? ''
    if ((at === 0 || before === '_') && (after === '' || after === '_' || after === '.' || after === '(')) {
      return true
    }
    from = at + 1
  }
}

/**
 * True when `contextKey` — a directory prefix or a cohort key — contains
 * `relpath`. The single membership test for both key shapes.
 */
export function contextKeyContainsRelpath(contextKey: string, relpath: string): boolean {
  const cohort = parseCohortContextKey(contextKey)
  if (cohort) {
    const segments = relpath.split('/').filter(Boolean)
    if ((segments.length > 1 ? segments[0]! : '') !== cohort.topLevel) return false
    return filenameStatesToken(segments.at(-1) ?? '', cohort.token)
  }
  return contextKey === '' || relpath === contextKey || relpath.startsWith(`${contextKey}/`)
}
