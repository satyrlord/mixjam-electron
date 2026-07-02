import { clamp } from './playerShell'

// 8-colour palette from the Emerald theme design project (§8 Color Palette System).
// Well-known category names get a fixed slot; unknown names get a deterministic
// slot via hash so every category keeps its colour across scans.
const PALETTE = [
  '#982A00', // 0: Drums, Percussion
  '#830000', // 1: Loop
  '#AB4700', // 2: Bass
  '#BF6601', // 3: Keys, Guitar, Chords, Piano
  '#D48915', // 4: Synth, Lead
  '#E6AD33', // 5: Voice, Vocal, FX, Vox
  '#BFAD00', // 6: Arp
  '#7DA500', // 7: Pad, Atmosphere, Xtra, Texture
] as const

const WELL_KNOWN: Record<string, number> = {
  drums: 0,
  percussion: 0,
  loop: 1,
  bass: 2,
  keys: 3,
  guitar: 3,
  chords: 3,
  piano: 3,
  synth: 4,
  lead: 4,
  voice: 5,
  vocal: 5,
  fx: 5,
  vox: 5,
  arp: 6,
  pad: 7,
  atmosphere: 7,
  xtra: 7,
  texture: 7,
}

const UNSORTED_COLOR = '#555E6A'

export const ROOT_CATEGORY_NAMES = ['Unsorted']

function hashCode(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function categoryColor(name: string): string {
  if (name === 'Unsorted') return UNSORTED_COLOR
  const idx = WELL_KNOWN[name.toLowerCase()] ?? (hashCode(name) % PALETTE.length)
  return PALETTE[idx]
}

// Ink colors for text rendered on top of a palette color. Part of the same
// sanctioned bubble palette system as PALETTE: the light slots (Synth, Voice,
// Arp, Pad) leave white text below the 4.5:1 WCAG minimum, so text on them
// switches to dark ink. Bubbles stay theme-invariant either way.
const BUBBLE_INK_LIGHT = '#FFFFFF'
const BUBBLE_INK_DARK = '#141309'

function channelLuminance(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/**
 * Pick the higher-contrast ink (white or near-black) for text drawn on the
 * given hex background color, using WCAG relative luminance.
 */
export function bubbleTextColor(background: string): string {
  const hex = background.startsWith('#') ? background.slice(1) : background
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return BUBBLE_INK_LIGHT
  const luminance =
    0.2126 * channelLuminance(parseInt(hex.slice(0, 2), 16)) +
    0.7152 * channelLuminance(parseInt(hex.slice(2, 4), 16)) +
    0.0722 * channelLuminance(parseInt(hex.slice(4, 6), 16))
  const contrastVsWhite = 1.05 / (luminance + 0.05)
  const contrastVsDark = (luminance + 0.05) / 0.058
  return contrastVsWhite >= contrastVsDark ? BUBBLE_INK_LIGHT : BUBBLE_INK_DARK
}

/** Inline style for a sample bubble painted in a palette color: background,
 *  border, and the matching ink. Dark ink drops the theme text-shadow, which
 *  only reads correctly under light text. Assignable to React.CSSProperties. */
export function bubbleStyle(color: string): {
  background: string
  borderColor: string
  color: string
  textShadow?: string
} {
  const ink = bubbleTextColor(color)
  return {
    background: color,
    borderColor: color,
    color: ink,
    ...(ink !== BUBBLE_INK_LIGHT ? { textShadow: 'none' } : {})
  }
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '?'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Convert a pixel position to the nearest tick, optionally snapping to a grid.
 * @param snapResolution - Grid resolution in ticks (e.g. 8 = snap to beat, 1 = per-tick freeform).
 *   Defaults to 1 (per-tick, no grid snap) for backward compatibility.
 */
export function nearestTick(
  clickX: number,
  containerWidth: number,
  totalTicks: number,
  snapResolution: number = 1
): number {
  // Guard against an unmeasured (zero/negative) container width, which would
  // make tickWidth 0 and yield Infinity/NaN ticks.
  if (!(containerWidth > 0) || !(totalTicks > 0)) return 0
  const tickWidth = containerWidth / totalTicks
  const tick = Math.round(clickX / tickWidth)
  if (!Number.isFinite(tick)) return 0
  const clamped = clamp(tick, 0, totalTicks - 1)
  if (snapResolution <= 1) return clamped
  const snapped = Math.round(clamped / snapResolution) * snapResolution
  // Snapping rounds up, so a drop near the right edge can overshoot the grid
  // (e.g. tick 255 at snap 8 -> 256). Clamp to the last on-grid slot.
  const lastSlot = Math.floor((totalTicks - 1) / snapResolution) * snapResolution
  return Math.min(snapped, lastSlot)
}

export function meterFillPct(db: number): number {
  const floor = -60
  if (db <= floor) return 0
  if (db >= 0) return 100
  return ((db - floor) / -floor) * 100
}
