import { describe, expect, it } from 'vitest'
import { canonicalizePath } from './path-utils'

describe('canonicalizePath', () => {
  it('normalizes Windows-style paths consistently on every platform', () => {
    expect(canonicalizePath('C:/Users/Test/Documents/MixJam/alpha.mixjam')).toBe(
      'c:\\users\\test\\documents\\mixjam\\alpha.mixjam'
    )
  })
})