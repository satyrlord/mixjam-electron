import { bubbleTextColor } from '../lib/sample-utils'
import {
  LANE_HEAD_WIDTH_PX,
  LANE_HEIGHT_PX,
  RULER_HEIGHT_PX,
  SAMPLE_BUBBLE_HEIGHT_PX,
  TRACKER_BEAT_WIDTH_PX,
  TRACKER_GEOMETRY_SCALE,
  TRACKER_LANE_CONTROL_SIZE_PX
} from '../lib/arrangement'
import { parseSampleBubbleBorder, refreshSampleBubbleThemeTokens } from './sample-bubble-style'
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
  'sample-bubble-text': string
  'sample-bubble-select': string
  'sample-bubble-missing': string
  'meter-green': string
  'meter-yellow': string
  'meter-red': string
  // Solid bases used to derive transport glyph contrast.
  transport: string
  'transport-active': string
}

export interface ThemeFonts {
  chrome: string
  label: string
  mono: string
}

export interface ThemeDepth {
  'gradient-header': string
  'gradient-ruler': string
  'gradient-lane': string
  'shadow-sample-bubble-text': string
  'gradient-transport': string
  'gradient-transport-active': string
  'shadow-transport': string
  'shadow-transport-active': string
  'shadow-pill': string
  'shadow-lane': string
  'shadow-playhead': string
  // Canvas-parsed: "<x>px <y>px <blur>px <color>" or "none".
  'shadow-sample-bubble': string
  // Canvas-parsed: "<width>px <color>" or "none".
  'border-sample-bubble': string
  // Canvas-parsed; stops must be space-free colors such as #RRGGBBAA.
  'gradient-sample-bubble': string
  'shadow-meter': string
}

export interface Theme {
  name: string
  key: ThemeKey
  colors: ThemeColors
  // Slots: Drums, Loop, Bass, Keys, Synth, Voice, Arp, Pad.
  palette: string[]
  'palette-unsorted': string
  fonts: ThemeFonts
  depth: ThemeDepth
  radius: string
  'radius-transport': string
  // Parsed as pixels by the lane canvas.
  'radius-sample-bubble': string
  'border-width': string
  'border-width-pill': string
  'border-width-header': string
  'sample-bubble-font-weight': string
  'sample-bubble-case': string
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
  if (typeof value['radius-sample-bubble'] !== 'string') return false
  const stringFields = [
    'border-width',
    'border-width-pill',
    'border-width-header',
    'sample-bubble-font-weight',
    'sample-bubble-case'
  ]
  if (!stringFields.every((key) => typeof value[key] === 'string')) return false
  // Palette colors feed the label-contrast calculation.
  if (!Array.isArray(value.palette) || value.palette.length !== 8) return false
  if (!value.palette.every((entry) => typeof entry === 'string' && SIX_HEX.test(entry))) return false
  if (typeof value['palette-unsorted'] !== 'string' || !SIX_HEX.test(value['palette-unsorted'])) return false
  // Keep this list in sync with the --on-* derivations in applyTheme.
  const { colors } = value
  const required = ['accent', 'bg-base', 'text', 'highlight', 'meter-red', 'transport', 'transport-active']
  if (!required.every((key) => typeof colors[key] === 'string')) return false
  // Hazard stripes need a six-digit color that mixTowardBlack can parse.
  return typeof colors['sample-bubble-missing'] === 'string' && SIX_HEX.test(colors['sample-bubble-missing'])
}

function validateTheme(json: unknown, label: string): Theme {
  if (isTheme(json)) return json
  console.warn(`Theme "${label}" failed validation — falling back to Emerald.`)
  return emeraldThemeJson as Theme
}

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

function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [token, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${token}`, value)
  }
  for (const [token, value] of Object.entries(theme.depth)) {
    root.style.setProperty(`--${token}`, value)
  }
  const slots = [...theme.palette, theme['palette-unsorted']]
  slots.forEach((slotColor, slot) => {
    const ink = bubbleTextColor(slotColor)
    root.style.setProperty(`--palette-${slot}`, slotColor)
    root.style.setProperty(`--palette-ink-${slot}`, ink)
    root.style.setProperty(
      `--palette-shadow-${slot}`,
      ink === '#FFFFFF' ? 'var(--shadow-sample-bubble-text)' : 'none'
    )
  })
  // DOM bubbles consume the canvas border format as separate properties.
  const clipBorder = parseSampleBubbleBorder(theme.depth['border-sample-bubble'])
  if (clipBorder) {
    root.style.setProperty('--sample-bubble-border-width', `${clipBorder.width}px`)
    root.style.setProperty('--sample-bubble-border-color', clipBorder.color)
  } else {
    root.style.removeProperty('--sample-bubble-border-width')
    root.style.removeProperty('--sample-bubble-border-color')
  }
  root.style.setProperty('--on-accent', bubbleTextColor(theme.colors.accent))
  root.style.setProperty('--on-highlight', bubbleTextColor(theme.colors.highlight))
  root.style.setProperty('--on-meter-red', bubbleTextColor(theme.colors['meter-red']))
  root.style.setProperty('--on-transport', bubbleTextColor(theme.colors.transport))
  root.style.setProperty('--on-transport-active', bubbleTextColor(theme.colors['transport-active']))
  root.style.setProperty('--radius', theme.radius)
  root.style.setProperty('--radius-transport', theme['radius-transport'])
  root.style.setProperty('--radius-sample-bubble', theme['radius-sample-bubble'])
  root.style.setProperty('--border-width', theme['border-width'])
  root.style.setProperty('--border-width-pill', theme['border-width-pill'])
  root.style.setProperty('--border-width-header', theme['border-width-header'])
  root.style.setProperty('--sample-bubble-font-weight', theme['sample-bubble-font-weight'])
  root.style.setProperty('--sample-bubble-case', theme['sample-bubble-case'])
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

/** Publish the shared compact Tracker geometry as CSS custom properties.
 *  These are arrangement constants (never theme-specific), so they live
 *  outside the theme bootstrap. Call once before the first paint so CSS
 *  `var()` fallbacks never render stale values. */
export function applyTrackerGeometry(root: HTMLElement = document.documentElement): void {
  // --tracker-geometry-scale is an exposure token for tests; no CSS rule
  // reads it. All layout properties below are its computed children.
  root.style.setProperty('--tracker-geometry-scale', String(TRACKER_GEOMETRY_SCALE))
  root.style.setProperty('--tracker-lane-height', `${LANE_HEIGHT_PX}px`)
  root.style.setProperty('--tracker-lane-head-width', `${LANE_HEAD_WIDTH_PX}px`)
  root.style.setProperty('--tracker-ruler-height', `${RULER_HEIGHT_PX}px`)
  root.style.setProperty('--tracker-lane-control-size', `${TRACKER_LANE_CONTROL_SIZE_PX}px`)
  root.style.setProperty('--tracker-beat-width', `${TRACKER_BEAT_WIDTH_PX}px`)
  root.style.setProperty('--sample-bubble-height', `${SAMPLE_BUBBLE_HEIGHT_PX}px`)
}

export function bootstrapTheme(root: HTMLElement = document.documentElement): Theme {
  applyTrackerGeometry(root)
  selectTheme(DEFAULT_THEME_KEY, root)
  root.setAttribute('data-theme-ready', 'true')
  refreshSampleBubbleThemeTokens()
  return emeraldTheme
}
