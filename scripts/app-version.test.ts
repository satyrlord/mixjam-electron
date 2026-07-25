import { describe, expect, it } from 'vitest'
import { deriveAppVersion } from './app-version'

describe('deriveAppVersion', () => {
  it('uses the repository commit count', () => {
    const version = deriveAppVersion(process.cwd(), '9.9.9')

    expect(version).toMatch(/^0\.\d+$/)
    expect(version).not.toBe('9.9.9')
  })

  it('uses the package version when git metadata is unavailable', () => {
    expect(deriveAppVersion(__filename, '9.9.9')).toBe('9.9.9')
  })
})
