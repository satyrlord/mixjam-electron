export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Pan values accumulate floating-point residue from repeated 0.05 key steps
// (e.g. +3 then -3 lands on ~1.4e-17, not 0), so the right-click cycle compares
// against this tolerance instead of exact 0/±1.
const PAN_EPSILON = 1e-6

/** Right-click pan cycle (spec-007 AC-018): any freely-dragged position → C;
 *  C → 100% R; 100% R → 100% L; 100% L → C. Shared by ChannelStrip and
 *  LaneRow so the two pan controls can never drift out of sync. */
export function nextPanCycle(pan: number): number {
  if (Math.abs(pan) < PAN_EPSILON) return 1
  if (pan >= 1 - PAN_EPSILON) return -1
  return 0
}

export {
  PALETTE_SLOT_COUNT,
  ROOT_CATEGORY_NAMES,
  SLOT_UNSORTED,
  categorySlot
} from '../../../shared/sample-palette'

// Ink colors for text rendered on top of a palette-slot color. Light slots
// leave white text below the 4.5:1 WCAG minimum, so text on them switches to
// dark ink. The slot colors themselves are theme-scoped; the ink pair is the
// one fixed part of the system (applyTheme derives --palette-ink-N from it).
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

/** Inline style for a sample bubble painted from a theme palette slot. All
 *  values are var() references to the --palette-* custom properties published
 *  by applyTheme, so bubbles restyle live on theme switch without a React
 *  re-render. --bubble-self feeds the CSS border-color fallback chain: themes
 *  with a --sample-bubble-border-color token win over the self-colored border.
 *  Spread into a style prop with an `as React.CSSProperties` cast (custom
 *  property keys are not in the CSSProperties type). */
export function bubbleStyle(slot: number): Record<string, string> {
  return {
    backgroundColor: `var(--palette-${slot})`,
    '--bubble-self': `var(--palette-${slot})`,
    color: `var(--palette-ink-${slot})`,
    textShadow: `var(--palette-shadow-${slot})`
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
 *   Defaults to 1 (per-tick, no grid snap).
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
