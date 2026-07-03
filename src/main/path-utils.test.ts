import { describe, expect, it } from 'vitest'
import { canonicalizePath } from './path-utils'

describe('canonicalizePath', () => {
  it('normalizes Windows-style paths consistently on every platform', () => {
    expect(canonicalizePath('C:/Users/Test/Documents/MixJam/alpha.mixjam')).toBe(
      'c:\\users\\test\\documents\\mixjam\\alpha.mixjam'
    )
  })

  it('preserves POSIX path case while normalizing the absolute path', () => {
    // resolve() is platform-dependent for POSIX-style input (on win32 it
    // prefixes the cwd drive and flips separators), so assert the invariant —
    // segment case survives — rather than an exact platform-specific string.
    expect(canonicalizePath('/tmp/MixJam/Alpha.mixjam')).toMatch(
      /tmp[\\/]MixJam[\\/]Alpha\.mixjam$/
    )
  })
})