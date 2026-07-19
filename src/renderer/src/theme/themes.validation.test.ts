import { afterEach, describe, expect, it, vi } from 'vitest'

const ENTERPRISE_THEME_PATH = '../../../../public/themes/enterprise.json'

async function loadWithEnterpriseTheme(value: unknown) {
  vi.resetModules()
  vi.doMock(ENTERPRISE_THEME_PATH, () => ({ default: value }))
  return import('./themes')
}

describe('theme validation boundary', () => {
  afterEach(() => {
    vi.doUnmock(ENTERPRISE_THEME_PATH)
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('falls back when imported theme JSON is not an object', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const themes = await loadWithEnterpriseTheme(null)

    expect(themes.enterpriseTheme).toBe(themes.emeraldTheme)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('enterprise'))
  })

  it('falls back when imported theme identity fields are malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const themes = await loadWithEnterpriseTheme({ name: 42, key: 'enterprise' })

    expect(themes.enterpriseTheme).toBe(themes.emeraldTheme)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('enterprise'))
  })

  it('publishes parsed DOM sample-bubble border tokens for bordered themes', async () => {
    const themes = await import('./themes')
    const root = document.createElement('div')

    themes.selectTheme('beton', root)

    expect(root.style.getPropertyValue('--sample-bubble-border-width')).not.toBe('')
    expect(root.style.getPropertyValue('--sample-bubble-border-color')).not.toBe('')
  })

  it('publishes only UI-size-invariant Tracker geometry tokens', async () => {
    const themes = await import('./themes')
    const root = document.createElement('div')

    themes.applyTrackerGeometry(root)

    expect(root.style.getPropertyValue('--tracker-geometry-scale')).toBe('0.75')
    expect(root.style.getPropertyValue('--tracker-lane-head-width')).toBe('240px')
    expect(root.style.getPropertyValue('--tracker-ruler-height')).toBe('33px')
    expect(root.style.getPropertyValue('--tracker-beat-width')).toBe('32px')
    expect(root.style.getPropertyValue('--tracker-lane-height')).toBe('')
    expect(root.style.getPropertyValue('--tracker-lane-control-size')).toBe('')
    expect(root.style.getPropertyValue('--sample-bubble-height')).toBe('')
    // Geometry tokens are independent of theme; no color token should be set.
    expect(root.style.getPropertyValue('--accent')).toBe('')
  })
})
