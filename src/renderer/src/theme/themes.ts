import { bubbleTextColor } from '../lib/sample-utils'
import { refreshThemeTokens } from '../components/LaneClipCanvas'
import emeraldThemeJson from '../../../../public/themes/emerald.json'
import enterpriseThemeJson from '../../../../public/themes/enterprise.json'
import raveThemeJson from '../../../../public/themes/rave.json'
import analogThemeJson from '../../../../public/themes/analog.json'
import ideThemeJson from '../../../../public/themes/ide.json'
import rustThemeJson from '../../../../public/themes/rust.json'
import screenThemeJson from '../../../../public/themes/screen.json'
import paThemeJson from '../../../../public/themes/pa.json'

export const THEME_OPTIONS = [
  { name: 'Emerald', key: 'emerald' },
  { name: 'Enterprise', key: 'enterprise' },
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
  /** Meter zone: green (safe, -60 to -12 dB). */
  'meter-green': string
  /** Meter zone: yellow (warning, -12 to -3 dB). */
  'meter-yellow': string
  /** Meter zone: red (clipping, -3 to 0 dB). */
  'meter-red': string
  /**
   * Solid base color of an idle transport button. The visible surface is
   * depth.gradient-transport; this token exists so applyTheme can derive
   * --on-transport (glyph ink) from a single luminance — light metal buttons
   * (Analog) need dark glyphs, dark bakelite (Rust) needs light ones.
   */
  transport: string
  /** Solid base color of the active (playing) transport button; drives --on-transport-active. */
  'transport-active': string
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
  /** Full background value for idle transport buttons (may layer a gradient over a base color). */
  'gradient-transport': string
  /** Full background value for the active (playing) transport button — backlit lamp / LED / flat accent. */
  'gradient-transport-active': string
  /** box-shadow for idle transport buttons ("none" for flat themes). */
  'shadow-transport': string
  /** box-shadow for the active transport button (glow for lamp/LED themes). */
  'shadow-transport-active': string
}

export interface Theme {
  name: string
  key: ThemeKey
  colors: ThemeColors
  fonts: ThemeFonts
  depth: ThemeDepth
  radius: string
  /**
   * Transport button corner shape, independent of the global --radius.
   * Analog-era themes use "50%" (round hardware buttons); modern themes use
   * a rounded-rectangle value; terminal themes stay near-square.
   */
  'radius-transport': string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTheme(value: unknown): value is Theme {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string' || typeof value.key !== 'string') return false
  if (!isRecord(value.colors) || !isRecord(value.fonts) || !isRecord(value.depth)) return false
  if (typeof value.radius !== 'string') return false
  if (typeof value['radius-transport'] !== 'string') return false
  // Every color that applyTheme feeds to bubbleTextColor must be a string, or
  // theme application throws mid-way and leaves a half-applied theme. Keep this
  // list in sync with the --on-* derivations in applyTheme.
  const { colors } = value
  const required = ['accent', 'bg-base', 'text', 'highlight', 'meter-red', 'transport', 'transport-active']
  return required.every((key) => typeof colors[key] === 'string')
}

function validateTheme(json: unknown, label: string): Theme {
  if (isTheme(json)) return json
  console.warn(`Theme "${label}" failed validation — falling back to Emerald.`)
  return emeraldThemeJson as Theme
}

/** Canonical, fully-implemented baseline theme (spec-002 US-001). */
export const emeraldTheme = validateTheme(emeraldThemeJson, 'emerald')
export const enterpriseTheme = validateTheme(enterpriseThemeJson, 'enterprise')
const raveTheme = validateTheme(raveThemeJson, 'rave')
const analogTheme = validateTheme(analogThemeJson, 'analog')
const ideTheme = validateTheme(ideThemeJson, 'ide')
const rustTheme = validateTheme(rustThemeJson, 'rust')
const screenTheme = validateTheme(screenThemeJson, 'screen')
const paTheme = validateTheme(paThemeJson, 'pa')

const DEFAULT_THEME_KEY: ThemeKey = 'emerald'

const IMPLEMENTED_THEMES: Readonly<Record<ThemeKey, Theme>> = {
  emerald: emeraldTheme,
  enterprise: enterpriseTheme,
  rave: raveTheme,
  analog: analogTheme,
  ide: ideTheme,
  rust: rustTheme,
  screen: screenTheme,
  pa: paTheme
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

  return IMPLEMENTED_THEMES[themeKey]
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
  // Derived, not authored: the WCAG-correct ink for text/icons drawn directly
  // on a solid --accent/--highlight fill (buttons, active mute/solo, hovered
  // menu items). Reuses the same luminance-based picker as sample bubbles so
  // "text on a color swatch" resolves identically everywhere in the app.
  root.style.setProperty('--on-accent', bubbleTextColor(theme.colors.accent))
  root.style.setProperty('--on-highlight', bubbleTextColor(theme.colors.highlight))
  // Mute-active fills use --meter-red (the accent fill fails the 3:1 non-text
  // contrast minimum against --pill-bg in some themes; meter zone colors are
  // bright by design and pass in all of them — spec-007 AC-022).
  root.style.setProperty('--on-meter-red', bubbleTextColor(theme.colors['meter-red']))
  // Transport glyph ink derives from the button's solid base color, not the
  // gradient painted over it — light hardware buttons need dark glyphs.
  root.style.setProperty('--on-transport', bubbleTextColor(theme.colors.transport))
  root.style.setProperty('--on-transport-active', bubbleTextColor(theme.colors['transport-active']))
  root.style.setProperty('--radius', theme.radius)
  root.style.setProperty('--radius-transport', theme['radius-transport'])
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
  // Refresh the canvas theme-token cache now that tokens are applied.
  refreshThemeTokens()
  return emeraldTheme
}
