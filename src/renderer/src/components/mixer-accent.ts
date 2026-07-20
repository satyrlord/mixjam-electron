import type { CSSProperties } from 'react'

/* Precomputed per-slot styles keep stable object identities across the
   Mixer's per-frame meter re-renders. */
const SLOT_ACCENT_STYLES: readonly CSSProperties[] = [1, 2, 3, 4].map(
  (slot) => ({ '--fx-slot-accent': `var(--fx-accent-${slot}, var(--accent))` }) as CSSProperties
)

/** Per-slot Mixer FX/send accent (--fx-accent-1..4, theme accent fallback). */
export function slotAccentStyle(slot: number): CSSProperties {
  return SLOT_ACCENT_STYLES[slot - 1] ?? SLOT_ACCENT_STYLES[0]
}
