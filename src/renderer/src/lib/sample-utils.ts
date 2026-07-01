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

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '?'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function tileWidth(seconds: number | null): number {
  if (!seconds || seconds <= 0) return 80
  const cappedSeconds = Math.min(seconds, 40)
  return Math.max(60, Math.round(cappedSeconds * 35))
}

export function nearestTick(clickX: number, containerWidth: number, totalTicks: number): number {
  // Guard against an unmeasured (zero/negative) container width, which would
  // make tickWidth 0 and yield Infinity/NaN ticks.
  if (!(containerWidth > 0) || !(totalTicks > 0)) return 0
  const tickWidth = containerWidth / totalTicks
  const tick = Math.round(clickX / tickWidth)
  if (!Number.isFinite(tick)) return 0
  return Math.min(Math.max(0, tick), totalTicks - 1)
}

export function meterFillPct(db: number): number {
  const floor = -60
  if (db <= floor) return 0
  if (db >= 0) return 100
  return ((db - floor) / -floor) * 100
}
