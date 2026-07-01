import { describe, expect, it } from 'vitest'
import {
  ROOT_CATEGORY_NAMES,
  categoryColor,
  formatDuration,
  meterFillPct,
  nearestTick,
  tileWidth
} from './sample-utils'

describe('ROOT_CATEGORY_NAMES', () => {
  it('contains only Unsorted', () => {
    expect(ROOT_CATEGORY_NAMES).toEqual(['Unsorted'])
  })
})

describe('categoryColor', () => {
  it('returns the unsorted colour for Unsorted', () => {
    expect(categoryColor('Unsorted')).toBe('#555E6A')
  })

  it.each([
    ['drums', '#982A00'],
    ['percussion', '#982A00'],
    ['loop', '#830000'],
    ['bass', '#AB4700'],
    ['keys', '#BF6601'],
    ['guitar', '#BF6601'],
    ['chords', '#BF6601'],
    ['piano', '#BF6601'],
    ['synth', '#D48915'],
    ['lead', '#D48915'],
    ['voice', '#E6AD33'],
    ['vocal', '#E6AD33'],
    ['fx', '#E6AD33'],
    ['vox', '#E6AD33'],
    ['arp', '#BFAD00'],
    ['pad', '#7DA500'],
    ['atmosphere', '#7DA500'],
    ['xtra', '#7DA500'],
    ['texture', '#7DA500']
  ])('maps well-known category "%s" to %s', (name, expected) => {
    expect(categoryColor(name)).toBe(expected)
  })

  it('is case-insensitive for well-known categories', () => {
    expect(categoryColor('DRUMS')).toBe('#982A00')
    expect(categoryColor('Bass')).toBe('#AB4700')
  })

  it('returns a deterministic colour for unknown categories via hash', () => {
    const c1 = categoryColor('Funky')
    const c2 = categoryColor('Funky')
    expect(c1).toBe(c2)
    expect(c1).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('maps different unknown names to potentially different palette slots', () => {
    const colors = new Set([
      categoryColor('Funky'),
      categoryColor('Groovy'),
      categoryColor('Weird'),
      categoryColor('Bizarre'),
      categoryColor('Cosmic'),
      categoryColor('Quantum'),
      categoryColor('Mystic'),
      categoryColor('Dreamy')
    ])
    // At least two different colours across 8 distinct unknown names
    // (probabilistically near-certain with 8 palette slots).
    expect(colors.size).toBeGreaterThan(1)
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

describe('tileWidth', () => {
  it('returns 80 for null, zero, or negative durations', () => {
    expect(tileWidth(null)).toBe(80)
    expect(tileWidth(0)).toBe(80)
    expect(tileWidth(-5)).toBe(80)
  })

  it('returns at least 60 for very short durations', () => {
    expect(tileWidth(1)).toBe(60)
  })

  it('scales linearly with duration within the cap', () => {
    expect(tileWidth(2)).toBe(70)
  })

  it('caps duration at 40 seconds before scaling', () => {
    expect(tileWidth(40)).toBe(1400)
    expect(tileWidth(50)).toBe(1400)
    expect(tileWidth(999)).toBe(1400)
  })
})

describe('nearestTick', () => {
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
