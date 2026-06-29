import emeraldThemeJson from '../../../../public/themes/emerald.json'

export const THEME_OPTIONS = [
  { name: 'Emerald', key: 'emerald' },
  { name: 'Flat Studio', key: 'studio' },
  { name: 'Neon Rave', key: 'rave' },
  { name: 'Warm Analog', key: 'analog' },
  { name: 'IDE', key: 'ide' },
  { name: 'Rust Industrial', key: 'rust' },
  { name: 'Screen Maximal', key: 'screen' },
  { name: 'Club PA', key: 'pa' }
] as const

export type ThemeKey = (typeof THEME_OPTIONS)[number]['key']

/**
 * A theme is a set of named design tokens. Every theme defines the same keys;
 * only the values differ. Tokens are consumed exclusively through CSS custom
 * properties — no UI element hardcodes a color (spec-002 AC-008).
 */
export interface ThemeColors {
  accent: string
  'accent-dark': string
  highlight: string
  'bg-base': string
  'bg-panel': string
  'bg-lane': string
  'bg-grid': string
  chrome: string
  border: string
  'header-border': string
  text: string
  'text-muted': string
  'pill-bg': string
  'pill-border': string
  playhead: string
  'clip-text': string
  'clip-select': string
  'clip-missing': string
}

export interface ThemeFonts {
  /** Header / chrome UI font. */
  chrome: string
  /** Body, labels, buttons font. */
  label: string
  /** Monospace font (ruler, timer, code). */
  mono: string
}

/**
 * Depth tokens hold the multi-stop gradient and shadow values that give chrome
 * regions their dimensionality in the design mockups. They are full CSS value
 * strings (gradients, box/text-shadow) so index.css references them purely
 * through `var(--token)` and never inlines a color literal (spec-002 AC-008).
 */
export interface ThemeDepth {
  'gradient-header': string
  'gradient-ruler': string
  'gradient-lane': string
  'shadow-clip-text': string
}

export interface Theme {
  name: string
  key: ThemeKey
  colors: ThemeColors
  fonts: ThemeFonts
  depth: ThemeDepth
  radius: string
}

/** Canonical, fully-implemented baseline theme (spec-002 US-001). */
export const emeraldTheme = emeraldThemeJson as Theme

const DEFAULT_THEME_KEY: ThemeKey = 'emerald'

const IMPLEMENTED_THEMES: Readonly<Partial<Record<ThemeKey, Theme>>> = {
  emerald: emeraldTheme
}

function fontStack(family: string, fallback: string): string {
  return `'${family}', ${fallback}`
}

function isThemeKey(value: string): value is ThemeKey {
  return THEME_OPTIONS.some((theme) => theme.key === value)
}

export function resolveTheme(themeKey: string): Theme {
  if (!isThemeKey(themeKey)) {
    return emeraldTheme
  }

  return IMPLEMENTED_THEMES[themeKey] ?? emeraldTheme
}

export function normalizeThemeKey(themeKey: string): ThemeKey {
  return resolveTheme(themeKey).key
}

/**
 * Apply a theme by writing its tokens as CSS custom properties on the root
 * element. The values mirror the synchronous bootstrap defaults in index.css,
 * so re-applying the active theme is visually a no-op (spec-002 AC-007/AC-009).
 */
function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [token, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${token}`, value)
  }
  for (const [token, value] of Object.entries(theme.depth)) {
    root.style.setProperty(`--${token}`, value)
  }
  root.style.setProperty('--radius', theme.radius)
  root.style.setProperty('--font-chrome', fontStack(theme.fonts.chrome, 'system-ui, sans-serif'))
  root.style.setProperty('--font-label', fontStack(theme.fonts.label, 'system-ui, sans-serif'))
  root.style.setProperty('--font-mono', fontStack(theme.fonts.mono, "'Consolas', monospace"))
}

export function selectTheme(themeKey: string, root: HTMLElement = document.documentElement): ThemeKey {
  const nextTheme = resolveTheme(themeKey)
  applyTheme(nextTheme, root)
  root.setAttribute('data-theme-key', nextTheme.key)
  return nextTheme.key
}

export function bootstrapTheme(root: HTMLElement = document.documentElement): Theme {
  selectTheme(DEFAULT_THEME_KEY, root)
  root.setAttribute('data-theme-ready', 'true')
  return emeraldTheme
}
