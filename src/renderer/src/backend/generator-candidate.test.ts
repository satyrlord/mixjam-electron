import { describe, expect, it } from 'vitest'
import type { SampleType } from '../../../shared/backend-api'
import { TICKS_PER_BAR } from '../engine/transport'
import { generatorCandidateDurationTicks } from './generator-candidate'
import type { GeneratorCandidate } from './generator-library'

function candidate(overrides: Partial<GeneratorCandidate> & { sampleType: SampleType }): GeneratorCandidate {
  return {
    relpath: 'x.wav', filename: 'x.wav', sizeBytes: 1, mtime: 1,
    duration: 1, bpm: null, musicalKey: null, categoryName: 'x', paletteSlot: 0,
    metadataRevision: 1, analysisRevision: 1, ...overrides
  }
}

// A 2-bar loop at 140 BPM lasts 8 beats = 3.4286 s.
const TWO_BAR_140 = 8 * 60 / 140

describe('generatorCandidateDurationTicks', () => {
  it('snaps a near-grid loop at its own detected tempo', () => {
    // Detected 138 for a true 140 2-bar loop: raw span is a hair under 2 bars.
    const c = candidate({ sampleType: 'Loop', duration: TWO_BAR_140, bpm: 138 })
    expect(generatorCandidateDurationTicks(c, 128)).toBe(2 * TICKS_PER_BAR)
  })

  it('recovers a mis-tempo loop by snapping to the project BPM when duration fits', () => {
    // Detector badly wrong (160) but the file is a clean 2-bar loop at the
    // project tempo of 140 -> should resolve to exactly 2 bars.
    const c = candidate({ sampleType: 'Loop', duration: TWO_BAR_140, bpm: 160 })
    expect(generatorCandidateDurationTicks(c, 140)).toBe(2 * TICKS_PER_BAR)
  })

  it('does not snap when neither the detected nor project tempo makes a whole bar', () => {
    // Genuinely odd length (2.6 bars at 140), project BPM 128 also off-grid.
    const c = candidate({ sampleType: 'Loop', duration: 2.6 * 4 * 60 / 140, bpm: 140 })
    const span = generatorCandidateDurationTicks(c, 128)
    expect([1, 2, 4, 8].map((b) => b * TICKS_PER_BAR)).not.toContain(span)
  })

  it('leaves non-loop/synth types on their raw span', () => {
    // A bass one-shot must not be snapped to a bar.
    const c = candidate({ sampleType: 'Bass', duration: 0.2, bpm: 140 })
    expect(generatorCandidateDurationTicks(c, 140)).toBe(Math.max(1, Math.round(0.2 * 140 * 8 / 60)))
  })

  it('does not spuriously snap loops at a wrong project tempo', () => {
    // A true 140 2-bar loop generated at 174 BPM: 174 does not make the duration
    // a whole bar, and the detected-BPM path here is also absent -> raw span.
    const c = candidate({ sampleType: 'Loop', duration: TWO_BAR_140, bpm: null })
    const span = generatorCandidateDurationTicks(c, 174)
    expect([1, 2, 4, 8].map((b) => b * TICKS_PER_BAR)).not.toContain(span)
  })
})
