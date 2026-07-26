import { describe, expect, it } from 'vitest'
import {
  PALETTE_SLOT_COUNT,
  SLOT_UNSORTED,
  sourceGroupSlot,
  formatDuration,
  meterFillPct,
  nearestTick
} from './sample-utils'
import {
  folderTagNamesFromRelpath,
  sourceGroupFromRelpath
} from '../../../shared/sample-palette'

// One derivation shared by the renderer's palette colouring and the backend's
// folder-tag projection; they previously disagreed on backslash paths.
describe('sourceGroupFromRelpath', () => {
  it('uses the top-level directory name', () => {
    expect(sourceGroupFromRelpath('Drums/Kicks/kick.wav')).toBe('Drums')
  })

  it('returns Unsorted for a file at the scan root', () => {
    expect(sourceGroupFromRelpath('loose.wav')).toBe('Unsorted')
  })

  it('normalizes Windows separators', () => {
    expect(sourceGroupFromRelpath('Drums\\kick.wav')).toBe('Drums')
    expect(sourceGroupFromRelpath('Drums\\Kicks\\kick.wav')).toBe('Drums')
  })
})

describe('folderTagNamesFromRelpath', () => {
  it('returns every directory segment, excluding the filename', () => {
    expect(folderTagNamesFromRelpath('Hard Trance/Bass/kick.wav'))
      .toEqual(['Hard Trance', 'Bass'])
  })

  it('deduplicates repeated segment names', () => {
    expect(folderTagNamesFromRelpath('Bass/Bass/sub.wav')).toEqual(['Bass'])
  })

  it('returns Unsorted for a file at the scan root', () => {
    expect(folderTagNamesFromRelpath('loose.wav')).toEqual(['Unsorted'])
  })

  it('normalizes Windows separators', () => {
    expect(folderTagNamesFromRelpath('Drums\\Kicks\\kick.wav')).toEqual(['Drums', 'Kicks'])
  })
})

describe('sourceGroupSlot', () => {
  it('returns the unsorted slot for Unsorted', () => {
    expect(sourceGroupSlot('Unsorted')).toBe(SLOT_UNSORTED)
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
  ])('maps well-known source group "%s" to slot %i', (name, expected) => {
    expect(sourceGroupSlot(name)).toBe(expected)
  })

  it('is case-insensitive for well-known source groups', () => {
    expect(sourceGroupSlot('DRUMS')).toBe(0)
    expect(sourceGroupSlot('Bass')).toBe(2)
  })

  it('returns a deterministic slot for unknown source groups via hash', () => {
    const s1 = sourceGroupSlot('Funky')
    const s2 = sourceGroupSlot('Funky')
    expect(s1).toBe(s2)
    expect(s1).toBeGreaterThanOrEqual(0)
    expect(s1).toBeLessThan(PALETTE_SLOT_COUNT)
  })

  it('maps different unknown names to potentially different palette slots', () => {
    const slots = new Set([
      sourceGroupSlot('Funky'),
      sourceGroupSlot('Groovy'),
      sourceGroupSlot('Weird'),
      sourceGroupSlot('Bizarre'),
      sourceGroupSlot('Cosmic'),
      sourceGroupSlot('Quantum'),
      sourceGroupSlot('Mystic'),
      sourceGroupSlot('Dreamy')
    ])
    // At least two different slots across 8 distinct unknown names
    // (probabilistically near-certain with 8 palette slots).
    expect(slots.size).toBeGreaterThan(1)
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
