import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { mountApp } from '../bootstrapApp'
import Header from '../components/Header'
import {
  THEME_OPTIONS,
  bootstrapTheme,
  emeraldTheme,
  normalizeThemeKey,
  resolveTheme,
  selectTheme,
  enterpriseTheme
} from './themes'

const REPO_ROOT = process.cwd()
const INDEX_CSS_PATH = resolve(REPO_ROOT, 'src/renderer/src/index.css')
const EMERALD_JSON_PATH = resolve(REPO_ROOT, 'public/themes/emerald.json')
const PUBLIC_FONTS_PATH = resolve(REPO_ROOT, 'src/renderer/public/fonts')

const EXPECTED_THEME_NAMES = [
  'Emerald',
  'Enterprise',
  'Neon Rave',
  'Warm Analog',
  'IDE',
  'Rust Industrial',
  'Club PA',
  'Beton Brut',
  'Mono',
  'Cosmic',
  'Neon',
  'Vintage',
  'Rack',
  'Soft',
  'Riso',
  'Arcade'
]

const SIX_DIGIT_HEX = /^#[0-9A-Fa-f]{6}$/

function assertSixDigitHex(value: string): void {
  if (!SIX_DIGIT_HEX.test(value)) {
    throw new Error(`Invalid theme color "${value}": expected #RRGGBB`)
  }
}

function relativeLuminance(hex: string): number {
  assertSixDigitHex(hex)
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function cssDeclarations(css: string, selector: string): Map<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 's'))?.[1]
  if (body === undefined) throw new Error(`Missing CSS rule for ${selector}`)
  return new Map(body.split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':')
    if (separator < 0) return []
    return [[declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()]]
  }))
}

const EXPECTED_EMERALD_COLORS = {
  accent: '#00674F',
  'accent-dark': '#004434',
  highlight: '#8FBCB2',
  'bg-base': '#081715',
  'bg-panel': '#051411',
  'bg-lane': '#091613',
  'bg-grid': '#020C0A',
  chrome: '#0F2722',
  border: '#1A4D3E',
  'header-border': '#1D5C4A',
  text: '#E8F0EC',
  'text-muted': '#B8D0C8',
  'pill-bg': '#0C2D32',
  'pill-border': '#2D6B5E',
  playhead: '#E74C3C',
  'sample-bubble-text': '#FFFFFF',
  'sample-bubble-select': '#FDE047',
  'sample-bubble-missing': '#FB8A7E',
  'meter-green': '#34D399',
  'meter-yellow': '#FBBF24',
  'meter-red': '#F87171',
  transport: '#0C2D32',
  'transport-active': '#00674F'
} as const

const EXPECTED_EMERALD_DEPTH = {
  'gradient-header': 'linear-gradient(90deg, #07291F, #0A362A)',
  'gradient-ruler': 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(0,0,0,0.22))',
  'gradient-lane': 'linear-gradient(180deg, rgba(143,188,178,0.07), rgba(2,18,14,0.28) 86%)',
  'shadow-sample-bubble-text': '1.5px 1.5px 2px rgba(0,0,0,0.55)',
  'gradient-transport': 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.16)), #0C2D32',
  'gradient-transport-active': 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.12)), #00674F',
  'shadow-transport': '0 1px 2px rgba(0,0,0,0.35)',
  'shadow-transport-active': '0 1px 3px rgba(0,0,0,0.4)',
  'shadow-pill': 'none',
  'shadow-lane': 'none',
  'shadow-playhead': 'none',
  'shadow-sample-bubble': 'none',
  'border-sample-bubble': 'none',
  'gradient-sample-bubble': 'none',
  'shadow-meter': 'none'
} as const

// Emerald's expected palette; other themes author their own families
// (spec-002 Sample Palette).
const EXPECTED_EMERALD_PALETTE = [
  '#982A00', '#830000', '#AB4700', '#BF6601',
  '#D48915', '#E6AD33', '#BFAD00', '#7DA500'
]

function readUtf8(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8')
}

function countKeyOccurrences(jsonText: string, key: string): number {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = jsonText.match(new RegExp(`"${escaped}"\\s*:`, 'g'))
  return matches?.length ?? 0
}

describe('Spec 002 - Theming & Skin System acceptance', () => {
  it('AC-001: startup bootstrap applies Emerald before app render entrypoint', () => {
    const css = readUtf8(INDEX_CSS_PATH)
    const rootElement = document.createElement('div')
    let renderObserved = false

    expect(css).toContain("html[data-theme-ready='true'] body")

    document.documentElement.removeAttribute('data-theme-ready')
    document.documentElement.style.cssText = ''

    mountApp(rootElement, () => ({
      render() {
        renderObserved = true
        expect(document.documentElement.getAttribute('data-theme-ready')).toBe('true')
        expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#00674F')
      }
    }))

    expect(renderObserved).toBe(true)
  })

  it('AC-002: Emerald theme uses the exact required token values', () => {
    expect(emeraldTheme.name).toBe('Emerald')
    expect(emeraldTheme.key).toBe('emerald')
    expect(emeraldTheme.colors).toEqual(EXPECTED_EMERALD_COLORS)
    expect(emeraldTheme.depth).toEqual(EXPECTED_EMERALD_DEPTH)
    expect(emeraldTheme.palette).toEqual(EXPECTED_EMERALD_PALETTE)
    expect(emeraldTheme['palette-unsorted']).toBe('#555E6A')
    expect(emeraldTheme.radius).toBe('0.22rem')
    expect(emeraldTheme['radius-transport']).toBe('8px')
    expect(emeraldTheme['radius-sample-bubble']).toBe('6px')
    expect(emeraldTheme['border-width']).toBe('1px')
    expect(emeraldTheme['border-width-pill']).toBe('1px')
    expect(emeraldTheme['border-width-header']).toBe('1px')
    expect(emeraldTheme['sample-bubble-font-weight']).toBe('400')
    expect(emeraldTheme['sample-bubble-case']).toBe('none')
  })

  it('AC-011: every theme authors a valid 8-slot palette plus unsorted', () => {
    const sixHex = /^#[0-9A-Fa-f]{6}$/
    for (const option of THEME_OPTIONS) {
      const theme = resolveTheme(option.key)
      expect(theme.key).toBe(option.key)
      expect(theme.palette).toHaveLength(8)
      for (const slotColor of theme.palette) {
        expect(slotColor).toMatch(sixHex)
      }
      expect(theme['palette-unsorted']).toMatch(sixHex)
    }
  })

  it('AC-011: applyTheme publishes per-slot color, ink, and shadow custom properties', () => {
    const root = document.createElement('html')
    selectTheme('emerald', root)
    for (let slot = 0; slot < 9; slot++) {
      expect(root.style.getPropertyValue(`--palette-${slot}`)).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(['#FFFFFF', '#141309']).toContain(root.style.getPropertyValue(`--palette-ink-${slot}`))
      expect(['var(--shadow-sample-bubble-text)', 'none']).toContain(
        root.style.getPropertyValue(`--palette-shadow-${slot}`)
      )
    }
    expect(root.style.getPropertyValue('--palette-0')).toBe('#982A00')
    expect(root.style.getPropertyValue('--palette-8')).toBe('#555E6A')

    // Switching themes swaps every slot in place — the tokens the DOM bubbles
    // and the canvas read are the same custom properties.
    selectTheme('cosmic', root)
    expect(root.style.getPropertyValue('--palette-0')).toBe('#3B82F6')
  })

  it('AC-003: bundled fonts are loaded from local files with no external font URL', () => {
    const css = readUtf8(INDEX_CSS_PATH)

    const expectedFontFiles = [
      'JosefinSans-Regular.ttf',
      'JosefinSans-Bold.ttf',
      'Ubuntu-Regular.ttf',
      'Ubuntu-Medium.ttf',
      'JetBrainsMono-Regular.ttf',
      'JetBrainsMono-Medium.ttf',
      'IBMPlexSans-Regular.woff2',
      'IBMPlexSans-Medium.woff2',
      'SpaceGrotesk-Regular.woff2',
      'SpaceGrotesk-Medium.woff2',
      'SpaceMono-Regular.woff2',
      'SpaceMono-Bold.woff2',
      'Orbitron-Regular.woff2',
      'Orbitron-Medium.woff2',
      'Exo2-Regular.woff2',
      'Exo2-Medium.woff2',
      'ChakraPetch-Regular.woff2',
      'ChakraPetch-Medium.woff2',
      'Arimo-Regular.woff2',
      'Arimo-Bold.woff2',
      'Cousine-Regular.woff2',
      'Cousine-Bold.woff2',
      'Barlow-Regular.woff2',
      'Barlow-Medium.woff2',
      'Nunito-Regular.woff2',
      'Nunito-SemiBold.woff2',
      'Archivo-Regular.woff2',
      'Archivo-SemiBold.woff2',
      'ArchivoBlack-Regular.woff2',
      'Silkscreen-Regular.woff2',
      'Silkscreen-Bold.woff2',
      'VT323-Regular.woff2',
      'SpaceGrotesk-Bold.woff2',
      'ChakraPetch-Bold.woff2'
    ]

    for (const fontFile of expectedFontFiles) {
      expect(existsSync(resolve(PUBLIC_FONTS_PATH, fontFile))).toBe(true)
      expect(css).toContain(`/fonts/${fontFile}`)
    }

    expect(css).not.toMatch(/https?:\/\//i)
    expect(css).not.toMatch(/fonts\.googleapis|gstatic/i)
  })

  it('AC-004: Player header theme selector lists all 16 theme names in order', () => {
    render(
      <Header
        view="player"
        timer="00:00.0"
        theme="emerald"
        onHome={() => {}}
        onThemeChange={() => {}}
      />
    )

    const optionNames = Array.from(screen.getAllByRole('option')).map((option) => option.textContent)
    expect(optionNames).toEqual(EXPECTED_THEME_NAMES)
    expect(THEME_OPTIONS.map((theme) => theme.name)).toEqual(EXPECTED_THEME_NAMES)
  })

  it('AC-005: default theme selector value is Emerald', () => {
    render(<App />)

    expect(screen.getByLabelText('Theme')).toHaveValue('emerald')
  })

  it('AC-006: selecting a theme applies it across the entire UI', () => {
    render(<App />)

    const select = screen.getByLabelText('Theme')
    expect(select).toHaveValue('emerald')

    fireEvent.change(select, { target: { value: 'enterprise' } })

    expect(select).toHaveValue('enterprise')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2F81F7')
  })

  it('AC-007: selecting Emerald when already active is a no-op', () => {
    render(<App />)

    const select = screen.getByLabelText('Theme')

    fireEvent.change(select, { target: { value: 'emerald' } })
    const beforeStyleSnapshot = document.documentElement.style.cssText

    fireEvent.change(select, { target: { value: 'emerald' } })

    expect(select).toHaveValue('emerald')
    expect(document.documentElement.style.cssText).toBe(beforeStyleSnapshot)
  })

  it('AC-008: theme tokens come from JSON source and renderer CSS has no hardcoded color literals', () => {
    const css = readUtf8(INDEX_CSS_PATH)

    const root = document.createElement('html')
    bootstrapTheme(root)

    expect(resolveTheme('enterprise')).toBe(enterpriseTheme)
    expect(resolveTheme('not-a-theme')).toBe(emeraldTheme)
    expect(normalizeThemeKey('enterprise')).toBe('enterprise')
    expect(selectTheme('not-a-theme', root)).toBe('emerald')
    expect(root.style.getPropertyValue('--accent')).toBe('#00674F')
    expect(root.getAttribute('data-theme-key')).toBe('emerald')

    expect(css).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
  })

  it('AC-009: switching Home <-> Player keeps Emerald active and avoids style churn', async () => {
    render(<App />)

    const select = screen.getByLabelText('Theme')
    const beforeStyleSnapshot = document.documentElement.style.cssText

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Return to Main Menu/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    })

    expect(select).toHaveValue('emerald')
    expect(document.documentElement.style.cssText).toBe(beforeStyleSnapshot)
  })

  it('AC-018: dropdown foreground and background tokens remain readable in every theme', () => {
    const css = readUtf8(INDEX_CSS_PATH)
    const optionDeclarations = cssDeclarations(css, 'select option')
    expect(optionDeclarations.get('color')).toBe('var(--text)')
    expect(optionDeclarations.get('background-color')).toBe('var(--chrome)')
    expect(css).not.toContain('var(--surface)')

    for (const option of THEME_OPTIONS) {
      const theme = resolveTheme(option.key)
      expect(contrastRatio(theme.colors.text, theme.colors.chrome), `${theme.name} dropdown popup`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('AC-018: contrast checks reject malformed theme colors with an actionable error', () => {
    expect(() => contrastRatio('#fff', '#000000')).toThrow('Invalid theme color "#fff": expected #RRGGBB')
    expect(() => contrastRatio('not-a-color', '#000000')).toThrow('Invalid theme color "not-a-color": expected #RRGGBB')
  })

  it('AC-019: Soft muted text remains readable on its normal text surfaces', () => {
    const soft = resolveTheme('soft')
    const mutedTextSurfaces = ['bg-base', 'bg-panel', 'bg-lane', 'chrome', 'pill-bg'] as const

    expect(soft.colors['text-muted']).toBe('#526078')
    for (const surface of mutedTextSurfaces) {
      expect(
        contrastRatio(soft.colors['text-muted'], soft.colors[surface]),
        `Soft muted text on ${surface}`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('AC-010: Emerald theme JSON is parseable and has no duplicate keys in the declared schema', () => {
    const rawJson = readUtf8(EMERALD_JSON_PATH)
    const parsed = JSON.parse(rawJson) as {
      name: string
      key: string
      colors: Record<string, string>
      fonts: Record<string, string>
      depth: Record<string, string>
      radius: string
    }

    expect(parsed).toEqual(emeraldTheme)

    expect(Object.keys(parsed)).toEqual([
      'name',
      'key',
      'colors',
      'palette',
      'palette-unsorted',
      'fonts',
      'depth',
      'radius',
      'radius-transport',
      'radius-sample-bubble',
      'border-width',
      'border-width-pill',
      'border-width-header',
      'sample-bubble-font-weight',
      'sample-bubble-case'
    ])
    expect(Object.keys(parsed.colors)).toEqual([
      'accent',
      'accent-dark',
      'highlight',
      'bg-base',
      'bg-panel',
      'bg-lane',
      'bg-grid',
      'chrome',
      'border',
      'header-border',
      'text',
      'text-muted',
      'pill-bg',
      'pill-border',
      'playhead',
      'sample-bubble-text',
      'sample-bubble-select',
      'sample-bubble-missing',
      'meter-green',
      'meter-yellow',
      'meter-red',
      'transport',
      'transport-active'
    ])
    expect(Object.keys(parsed.fonts)).toEqual(['chrome', 'label', 'mono'])
    expect(Object.keys(parsed.depth)).toEqual([
      'gradient-header',
      'gradient-ruler',
      'gradient-lane',
      'shadow-sample-bubble-text',
      'gradient-transport',
      'gradient-transport-active',
      'shadow-transport',
      'shadow-transport-active',
      'shadow-pill',
      'shadow-lane',
      'shadow-playhead',
      'shadow-sample-bubble',
      'border-sample-bubble',
      'gradient-sample-bubble',
      'shadow-meter'
    ])

    const expectedKeyCounts: Record<string, number> = {
      name: 1,
      key: 1,
      colors: 1,
      fonts: 1,
      depth: 1,
      radius: 1,
      'radius-transport': 1,
      accent: 1,
      'accent-dark': 1,
      highlight: 1,
      'bg-base': 1,
      'bg-panel': 1,
      'bg-lane': 1,
      'bg-grid': 1,
      chrome: 2,
      border: 1,
      'header-border': 1,
      text: 1,
      'text-muted': 1,
      'pill-bg': 1,
      'pill-border': 1,
      playhead: 1,
      label: 1,
      mono: 1,
      'gradient-header': 1,
      'gradient-ruler': 1,
      'gradient-lane': 1,
      'shadow-sample-bubble-text': 1,
      transport: 1,
      'transport-active': 1,
      'gradient-transport': 1,
      'gradient-transport-active': 1,
      'shadow-transport': 1,
      'shadow-transport-active': 1,
      'shadow-pill': 1,
      'shadow-lane': 1,
      'shadow-playhead': 1,
      'shadow-sample-bubble': 1,
      'border-sample-bubble': 1,
      'gradient-sample-bubble': 1,
      'shadow-meter': 1,
      'radius-sample-bubble': 1,
      palette: 1,
      'palette-unsorted': 1,
      'border-width': 1,
      'border-width-pill': 1,
      'border-width-header': 1,
      'sample-bubble-font-weight': 1,
      'sample-bubble-case': 1
    }

    for (const [key, count] of Object.entries(expectedKeyCounts)) {
      expect(countKeyOccurrences(rawJson, key)).toBe(count)
    }
  })
})
