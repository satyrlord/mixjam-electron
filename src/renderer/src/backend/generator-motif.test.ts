import { describe, expect, it } from 'vitest'
import type { GeneratorCandidate } from './generator-library'
import { groupMotifFamilies, parseMotifKey } from './generator-motif'

function candidate(filename: string): GeneratorCandidate {
  return {
    relpath: `Bass/${filename}`,
    filename,
    sizeBytes: 100,
    mtime: 1000,
    duration: 1,
    bpm: 128,
    musicalKey: 'Am',
    sampleType: 'Bass',
    categoryName: 'Bass',
    paletteSlot: 2,
    metadataRevision: 1,
    analysisRevision: 1
  }
}

describe('parseMotifKey', () => {
  it.each([
    ['babylon-5-l.wav', { family: 'babylon', part: 5, side: 'left' }],
    ['babylon-5-r.wav', { family: 'babylon', part: 5, side: 'right' }],
    ['above-clouds1l.wav', { family: 'above-clouds', part: 1, side: 'left' }],
    ['above-clouds2r.wav', { family: 'above-clouds', part: 2, side: 'right' }],
    ['aykan-rules-10-l.wav', { family: 'aykan-rules', part: 10, side: 'left' }],
    ['andromeda-3.wav', { family: 'andromeda', part: 3, side: 'mono' }],
    ['aussie-wind1l.wav', { family: 'aussie-wind', part: 1, side: 'left' }],
    ['single.wav', { family: 'single', part: 0, side: 'mono' }]
  ])('parses %s', (filename, expected) => {
    expect(parseMotifKey(filename)).toEqual(expected)
  })

  it('does not treat an interior l/r as a stereo suffix', () => {
    // "sunrise" must not lose its trailing letters, and "arctic-light" has no
    // digit before its l/r so it stays part of the word.
    expect(parseMotifKey('sunrise.wav').family).toBe('sunrise')
  })
})

describe('groupMotifFamilies', () => {
  it('groups numbered parts under one family in part order', () => {
    const families = groupMotifFamilies([
      candidate('babylon-2.wav'),
      candidate('babylon-1.wav'),
      candidate('babylon-3.wav'),
      candidate('lone.wav')
    ])
    const babylon = families.find((group) => group.family === 'babylon')!
    expect(babylon.partCount).toBe(3)
    expect(babylon.members.map((member) => member.filename)).toEqual([
      'babylon-1.wav',
      'babylon-2.wav',
      'babylon-3.wav'
    ])
    // Largest family leads.
    expect(families[0]!.family).toBe('babylon')
  })

  it('collapses stereo pairs so an l/r pair is one logical part', () => {
    const families = groupMotifFamilies([
      candidate('pad-1-l.wav'),
      candidate('pad-1-r.wav'),
      candidate('pad-2-l.wav'),
      candidate('pad-2-r.wav')
    ])
    const pad = families.find((group) => group.family === 'pad')!
    expect(pad.partCount).toBe(2)
    // The right twin of each pair is dropped from the selectable members.
    expect(pad.members).toHaveLength(2)
    expect(pad.members.every((member) => !member.filename.includes('-r'))).toBe(true)
  })
})
