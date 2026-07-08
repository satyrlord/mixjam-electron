import { describe, expect, it } from 'vitest'
import {
  PALETTE_SLOT_COUNT,
  ROOT_CATEGORY_NAMES,
  SLOT_UNSORTED,
  bubbleStyle,
  categorySlot,
  formatDuration,
  meterFillPct,
  nearestTick
} from './sample-utils'

describe('ROOT_CATEGORY_NAMES', () => {
  it('contains only Unsorted', () => {
    expect(ROOT_CATEGORY_NAMES).toEqual(['Unsorted'])
  })
})

describe('categorySlot', () => {
  it('returns the unsorted slot for Unsorted', () => {
    expect(categorySlot('Unsorted')).toBe(SLOT_UNSORTED)
  })

  it.each([
    ['drums', 0],
    ['percussion', 0],
    ['loop', 1],
    ['bass', 2],
    ['keys', 3],
    ['guitar', 3],
    ['chords', 3],
    ['piano', 3],
    ['synth', 4],
    ['lead', 4],
    ['voice', 5],
    ['vocal', 5],
    ['fx', 5],
    ['vox', 5],
    ['arp', 6],
    ['pad', 7],
    ['atmosphere', 7],
    ['xtra', 7],
    ['texture', 7]
  ])('maps well-known category "%s" to slot %i', (name, expected) => {
    expect(categorySlot(name)).toBe(expected)
  })

  it('is case-insensitive for well-known categories', () => {
    expect(categorySlot('DRUMS')).toBe(0)
    expect(categorySlot('Bass')).toBe(2)
  })

  it('returns a deterministic slot for unknown categories via hash', () => {
    const s1 = categorySlot('Funky')
    const s2 = categorySlot('Funky')
    expect(s1).toBe(s2)
    expect(s1).toBeGreaterThanOrEqual(0)
    expect(s1).toBeLessThan(PALETTE_SLOT_COUNT)
  })

  it('maps different unknown names to potentially different palette slots', () => {
    const slots = new Set([
      categorySlot('Funky'),
      categorySlot('Groovy'),
      categorySlot('Weird'),
      categorySlot('Bizarre'),
      categorySlot('Cosmic'),
      categorySlot('Quantum'),
      categorySlot('Mystic'),
      categorySlot('Dreamy')
    ])
    // At least two different slots across 8 distinct unknown names
    // (probabilistically near-certain with 8 palette slots).
    expect(slots.size).toBeGreaterThan(1)
  })
})

describe('bubbleStyle', () => {
  it('references the slot custom properties so bubbles restyle on theme switch', () => {
    expect(bubbleStyle(3)).toEqual({
      backgroundColor: 'var(--palette-3)',
      '--bubble-self': 'var(--palette-3)',
      color: 'var(--palette-ink-3)',
      textShadow: 'var(--palette-shadow-3)'
    })
  })

  it('addresses the unsorted slot like any other', () => {
    expect(bubbleStyle(SLOT_UNSORTED).backgroundColor).toBe('var(--palette-8)')
  })
})

describe('formatDuration', () => {
  it('returns ? for null', () => {
    expect(formatDuration(null)).toBe('?')
  })

  it('formats sub-minute durations with one decimal and s suffix', () => {
    expect(formatDuration(0)).toBe('0.0s')
    expect(formatDuration(30)).toBe('30.0s')
    expect(formatDuration(59.9)).toBe('59.9s')
  })

  it('formats minute+ durations as M:SS', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(125)).toBe('2:05')
    expect(formatDuration(3661)).toBe('61:01')
  })
})

describe('nearestTick', () => {
  it('clamps a snapped drop near the right edge onto the last on-grid slot', () => {
    // clickX at the far right edge maps to tick 255; snapping to a beat (8)
    // would round up to 256 (past the grid) without the clamp.
    expect(nearestTick(1000, 1000, 256, 8)).toBe(248)
  })

  it('returns 0 when container width is zero or negative', () => {
    expect(nearestTick(50, 0, 10)).toBe(0)
    expect(nearestTick(50, -10, 10)).toBe(0)
  })

  it('returns 0 when total ticks is zero or negative', () => {
    expect(nearestTick(50, 200, 0)).toBe(0)
    expect(nearestTick(50, 200, -5)).toBe(0)
  })

  it('computes the correct tick for normal input', () => {
    // tickWidth = 200 / 10 = 20; 50 / 20 = 2.5 → Math.round(2.5) = 3
    expect(nearestTick(50, 200, 10)).toBe(3)
    // 0 / 20 = 0
    expect(nearestTick(0, 200, 10)).toBe(0)
  })

  it('clamps to totalTicks - 1 for positions beyond the right edge', () => {
    expect(nearestTick(200, 200, 10)).toBe(9)
    expect(nearestTick(500, 200, 10)).toBe(9)
  })

  it('clamps to 0 for negative click positions', () => {
    expect(nearestTick(-50, 200, 10)).toBe(0)
  })
})

describe('meterFillPct', () => {
  it('returns 0 for dB at or below -60', () => {
    expect(meterFillPct(-60)).toBe(0)
    expect(meterFillPct(-70)).toBe(0)
  })

  it('returns 100 for dB at or above 0', () => {
    expect(meterFillPct(0)).toBe(100)
    expect(meterFillPct(10)).toBe(100)
  })

  it('returns a linear percentage between -60 and 0', () => {
    expect(meterFillPct(-30)).toBe(50)
    expect(meterFillPct(-15)).toBe(75)
  })
})
