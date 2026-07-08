import { bubbleTextColor } from '../lib/sample-utils'
import { parseClipBorder, refreshThemeTokens } from '../components/LaneClipCanvas'
import emeraldThemeJson from '../../../../public/themes/emerald.json'
import enterpriseThemeJson from '../../../../public/themes/enterprise.json'
import raveThemeJson from '../../../../public/themes/rave.json'
import analogThemeJson from '../../../../public/themes/analog.json'
import ideThemeJson from '../../../../public/themes/ide.json'
import rustThemeJson from '../../../../public/themes/rust.json'
import paThemeJson from '../../../../public/themes/pa.json'
import betonThemeJson from '../../../../public/themes/beton.json'
import monoThemeJson from '../../../../public/themes/mono.json'
import cosmicThemeJson from '../../../../public/themes/cosmic.json'
import neonThemeJson from '../../../../public/themes/neon.json'
import vintageThemeJson from '../../../../public/themes/vintage.json'
import rackThemeJson from '../../../../public/themes/rack.json'
import softThemeJson from '../../../../public/themes/soft.json'
import risoThemeJson from '../../../../public/themes/riso.json'
import arcadeThemeJson from '../../../../public/themes/arcade.json'

// Saved keys of retired themes ('studio', 'screen') fall back to Emerald via
// normalizeThemeKey — resolveTheme returns emeraldTheme for unknown keys.
export const THEME_OPTIONS = [
  { name: 'Emerald', key: 'emerald' },
  { name: 'Enterprise', key: 'enterprise' },
  { name: 'Neon Rave', key: 'rave' },
  { name: 'Warm Analog', key: 'analog' },
  { name: 'IDE', key: 'ide' },
  { name: 'Rust Industrial', key: 'rust' },
  { name: 'Club PA', key: 'pa' },
  { name: 'Beton Brut', key: 'beton' },
  { name: 'Mono', key: 'mono' },
  { name: 'Cosmic', key: 'cosmic' },
  { name: 'Neon', key: 'neon' },
  { name: 'Vintage', key: 'vintage' },
  { name: 'Rack', key: 'rack' },
  { name: 'Soft', key: 'soft' },
  { name: 'Riso', key: 'riso' },
  { name: 'Arcade', key: 'arcade' }
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
  /**
   * box-shadow for pill-family chrome (theme selector, mute/solo, mixer strips,
   * M/S buttons). Carries the theme's construction language: neumorphic
   * extrusion, Win9x bevels (inset white/dark), arcade offset slabs, riso
   * overprint. "none" for flat themes.
   */
  'shadow-pill': string
  /** Inset box-shadow that sinks the lane clip area into a well ("none" = flat). */
  'shadow-lane': string
  /** box-shadow on the playhead line (neon/cosmic glow; "none" otherwise). */
  'shadow-playhead': string
  /**
   * Clip drop-shadow, drawn by the lane canvas. Strict format
   * "<x>px <y>px <blur>px <color>" or "none" — the canvas parses it, so it
   * cannot be an arbitrary multi-shadow list like the CSS-only tokens.
   */
  'shadow-clip': string
  /**
   * Clip outline, drawn by the lane canvas. Strict format "<width>px <color>"
   * or "none". Gives brutalist/arcade themes their hard ink border.
   */
  'border-clip': string
  /**
   * Gloss layer painted over every clip/bubble fill. Strict format
   * "linear-gradient(180deg, <top>, <bottom>)" or "none" — the canvas parses
   * the two stops, so each color must be a single token WITHOUT commas or
   * spaces: use hex, including #RRGGBBAA for translucency (rgba() would break
   * the parse). Valid CSS as-is: the DOM consumes it directly as a
   * background-image layer.
   */
  'gradient-clip': string
  /** box-shadow on meter fills (channel dB meter, loudness bar); LED glow themes. */
  'shadow-meter': string
}

export interface Theme {
  name: string
  key: ThemeKey
  colors: ThemeColors
  /**
   * Theme-scoped sample palette: 8 slot colors (0 Drums, 1 Loop, 2 Bass,
   * 3 Keys, 4 Synth, 5 Voice, 6 Arp, 7 Pad). Every clip and sample bubble is
   * painted from these slots; entries must be 6-digit hex so the per-slot ink
   * can be derived via bubbleTextColor (spec-002 "Sample Palette").
   */
  palette: string[]
  /** Slot 8: the Unsorted category's bubble color (6-digit hex). */
  'palette-unsorted': string
  fonts: ThemeFonts
  depth: ThemeDepth
  radius: string
  /**
   * Transport button corner shape, independent of the global --radius.
   * Analog-era themes use "50%" (round hardware buttons); modern themes use
   * a rounded-rectangle value; terminal themes stay near-square.
   */
  'radius-transport': string
  /**
   * Corner radius for clips and sample bubbles, in px (the lane canvas parses
   * it as a number). "6px" preserves the historical hardcoded bubble radius;
   * print/terminal themes use "0px" for hard-edged slabs.
   */
  'radius-clip': string
  /** Structural hairline width — everything drawn with --border. */
  'border-width': string
  /** Control border width — everything drawn with --pill-border. */
  'border-width-pill': string
  /** Header bottom-rule width (Beton Brut's 3px poster rule). */
  'border-width-header': string
  /** Clip/bubble label weight ("400" | "600" | "700"); canvas-parsed. */
  'clip-font-weight': string
  /** Clip/bubble label case ("none" | "uppercase"); canvas uppercases the string. */
  'clip-case': string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SIX_HEX = /^#[0-9a-fA-F]{6}$/

function isTheme(value: unknown): value is Theme {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string' || typeof value.key !== 'string') return false
  if (!isRecord(value.colors) || !isRecord(value.fonts) || !isRecord(value.depth)) return false
  if (typeof value.radius !== 'string') return false
  if (typeof value['radius-transport'] !== 'string') return false
  if (typeof value['radius-clip'] !== 'string') return false
  const stringFields = [
    'border-width',
    'border-width-pill',
    'border-width-header',
    'clip-font-weight',
    'clip-case'
  ]
  if (!stringFields.every((key) => typeof value[key] === 'string')) return false
  // The sample palette feeds bubbleTextColor per slot, so every entry must be
  // parseable 6-digit hex — a bad entry would silently fall back to light ink
  // and can break the WCAG guarantee on light slots (spec-002 Sample Palette).
  if (!Array.isArray(value.palette) || value.palette.length !== 8) return false
  if (!value.palette.every((entry) => typeof entry === 'string' && SIX_HEX.test(entry))) return false
  if (typeof value['palette-unsorted'] !== 'string' || !SIX_HEX.test(value['palette-unsorted'])) return false
  // Every color that applyTheme feeds to bubbleTextColor must be a string, or
  // theme application throws mid-way and leaves a half-applied theme. Keep this
  // list in sync with the --on-* derivations in applyTheme.
  const { colors } = value
  const required = ['accent', 'bg-base', 'text', 'highlight', 'meter-red', 'transport', 'transport-active']
  if (!required.every((key) => typeof colors[key] === 'string')) return false
  // clip-missing feeds mixTowardBlack (LaneClipCanvas.tsx) to darken the AC-013
  // hazard-stripe color — a non-6-hex value makes mixTowardBlack a no-op, so the
  // stripe color equals the fill color and missing clips render invisibly.
  return typeof colors['clip-missing'] === 'string' && SIX_HEX.test(colors['clip-missing'])
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
const paTheme = validateTheme(paThemeJson, 'pa')
const betonTheme = validateTheme(betonThemeJson, 'beton')
const monoTheme = validateTheme(monoThemeJson, 'mono')
const cosmicTheme = validateTheme(cosmicThemeJson, 'cosmic')
const neonTheme = validateTheme(neonThemeJson, 'neon')
const vintageTheme = validateTheme(vintageThemeJson, 'vintage')
const rackTheme = validateTheme(rackThemeJson, 'rack')
const softTheme = validateTheme(softThemeJson, 'soft')
const risoTheme = validateTheme(risoThemeJson, 'riso')
const arcadeTheme = validateTheme(arcadeThemeJson, 'arcade')

const DEFAULT_THEME_KEY: ThemeKey = 'emerald'

const IMPLEMENTED_THEMES: Readonly<Record<ThemeKey, Theme>> = {
  emerald: emeraldTheme,
  enterprise: enterpriseTheme,
  rave: raveTheme,
  analog: analogTheme,
  ide: ideTheme,
  rust: rustTheme,
  pa: paTheme,
  beton: betonTheme,
  mono: monoTheme,
  cosmic: cosmicTheme,
  neon: neonTheme,
  vintage: vintageTheme,
  rack: rackTheme,
  soft: softTheme,
  riso: risoTheme,
  arcade: arcadeTheme
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
  // Sample palette: slot color, derived ink, and derived label shadow per
  // slot (8 = Unsorted). DOM bubbles consume these vars directly, so a theme
  // switch restyles every tile without a React re-render; the lane canvas
  // reads the same vars into its token cache (spec-002 Sample Palette).
  const slots = [...theme.palette, theme['palette-unsorted']]
  slots.forEach((slotColor, slot) => {
    const ink = bubbleTextColor(slotColor)
    root.style.setProperty(`--palette-${slot}`, slotColor)
    root.style.setProperty(`--palette-ink-${slot}`, ink)
    // A dark text-shadow only reads correctly under light ink (mirrors
    // bubbleStyle's dark-ink shadow drop).
    root.style.setProperty(
      `--palette-shadow-${slot}`,
      ink === '#FFFFFF' ? 'var(--shadow-clip-text)' : 'none'
    )
  })
  // DOM bubbles cannot parse the canvas-format border-clip token, so split it
  // into consumable width/color vars here — via the SAME parser the canvas
  // uses (parseClipBorder), so a malformed token is rejected identically on
  // both sides instead of two regexes silently disagreeing. When the theme
  // has no clip border, remove them: the CSS fallbacks (1px, self-color)
  // take over.
  const clipBorder = parseClipBorder(theme.depth['border-clip'])
  if (clipBorder) {
    root.style.setProperty('--clip-border-width', `${clipBorder.width}px`)
    root.style.setProperty('--clip-border-color', clipBorder.color)
  } else {
    root.style.removeProperty('--clip-border-width')
    root.style.removeProperty('--clip-border-color')
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
  root.style.setProperty('--radius-clip', theme['radius-clip'])
  root.style.setProperty('--border-width', theme['border-width'])
  root.style.setProperty('--border-width-pill', theme['border-width-pill'])
  root.style.setProperty('--border-width-header', theme['border-width-header'])
  root.style.setProperty('--clip-font-weight', theme['clip-font-weight'])
  root.style.setProperty('--clip-case', theme['clip-case'])
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
