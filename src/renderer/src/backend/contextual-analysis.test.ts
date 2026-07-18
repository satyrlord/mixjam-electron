// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoredAnalysisEvidence } from './analysis-persistence'
import { resolveContextualAnalysis } from './contextual-analysis'

function sample(
  id: number,
  relpath: string,
  overrides: Partial<StoredAnalysisEvidence> = {}
): StoredAnalysisEvidence {
  return {
    id,
    relpath,
    durationSeconds: 4,
    bpm: null,
    musicalKey: null,
    sampleType: 'Loop',
    ...overrides
  }
}

describe('contextual sample-folder analysis', () => {
  it('uses strict eJay tempo tokens and does not invent a mode from a bare pitch token', () => {
    const items = [
      sample(1, 'Alternative/Bass/ELECBASS001_ALTER_90_E_SC4.wav', {
        bpm: 112,
        musicalKey: 'C',
        sampleType: 'Bass'
      }),
      sample(2, 'Alternative/Bass/ELECBASS002_ALTER_90_E_SC4.wav', {
        bpm: 112,
        musicalKey: 'C',
        sampleType: 'Bass'
      }),
      sample(3, 'Alternative/Guitar/ELECGUIT001_ALTER_90_E_SC4(L).wav', {
        bpm: 112,
        musicalKey: 'C',
        sampleType: 'Synth'
      }),
      sample(4, 'Alternative/Guitar/ELECGUIT001_ALTER_90_E_SC4(R).wav', {
        bpm: 112,
        musicalKey: 'C',
        sampleType: 'Synth'
      })
    ]

    const result = resolveContextualAnalysis(items)

    expect(result.samples.every((entry) => entry.bpm === 90)).toBe(true)
    expect(result.samples.every((entry) => entry.musicalKey === 'C')).toBe(true)
    expect(result.groups.find((group) => group.relpathPrefix === '@cohort/Alternative/SC4'))
      .toMatchObject({ state: 'resolved', bpm: 90 })
  })

  it('lets non-tonal one-shots inherit key and tempo without giving them a vote', () => {
    const tonal = Array.from({ length: 4 }, (_, index) => sample(
      index + 1,
      `Pack/Loops/phrase-${index}.wav`,
      { bpm: 140, musicalKey: 'Am', sampleType: 'Loop', durationSeconds: 4 * 60 / 140 }
    ))
    const oneShots = Array.from({ length: 8 }, (_, index) => sample(
      index + 10,
      `Pack/Drums/hit-${index}.wav`,
      { bpm: 112, musicalKey: 'C', sampleType: 'Kick', durationSeconds: 0.25 }
    ))

    const result = resolveContextualAnalysis([...tonal, ...oneShots])
    const inherited = result.samples.filter((entry) => entry.sampleId >= 10)

    expect(inherited.every((entry) => entry.bpm === 140)).toBe(true)
    expect(inherited.every((entry) => entry.musicalKey === 'Am')).toBe(true)
  })

  it('keeps mixed product subtrees separate while resolving each nearest group', () => {
    const items = [
      ...Array.from({ length: 4 }, (_, index) => sample(
        index + 1,
        `Product/Slow/LOOP${index}_100_Am_SC1.wav`,
        { bpm: 100, musicalKey: 'Am' }
      )),
      ...Array.from({ length: 4 }, (_, index) => sample(
        index + 10,
        `Product/Fast/LOOP${index}_140_Dm_SL2.wav`,
        { bpm: 140, musicalKey: 'Dm' }
      ))
    ]

    const result = resolveContextualAnalysis(items)
    const root = result.groups.find((group) => group.relpathPrefix === '')

    expect(root?.state).toBe('mixed')
    expect(result.groups.find((group) => group.relpathPrefix === 'Product/Slow'))
      .toMatchObject({ state: 'resolved', bpm: 100, musicalKey: 'Am' })
    expect(result.groups.find((group) => group.relpathPrefix === 'Product/Fast'))
      .toMatchObject({ state: 'resolved', bpm: 140, musicalKey: 'Dm' })
  })

  it('keeps an explicit child tempo when its parent resolves to another tempo', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, index) => sample(
        index + 1,
        `Product/Main/MAIN${index}_100_Am_SC1.wav`,
        { bpm: 100, musicalKey: 'Am' }
      )),
      ...Array.from({ length: 4 }, (_, index) => sample(
        index + 20,
        `Product/Expansion/FAST${index}_140_Dm_SL2.wav`,
        { bpm: 140, musicalKey: 'Dm' }
      ))
    ]

    const result = resolveContextualAnalysis(items)
    const expansion = result.samples.filter((entry) => entry.sampleId >= 20)

    expect(expansion.every((entry) => entry.bpm === 140)).toBe(true)
    expect(expansion.every((entry) => entry.musicalKey === 'Dm')).toBe(true)
    expect(result.groups.find((group) => group.relpathPrefix === 'Product/Expansion'))
      .toMatchObject({ state: 'resolved', bpm: 140, musicalKey: 'Dm' })
  })

  it('collapses stereo and numbered variants before acoustic voting', () => {
    const items = [
      ...Array.from({ length: 4 }, (_, index) => sample(
        index + 1,
        `Pack/Bass/FAMILYA00${index + 1}_variant${index % 2 === 0 ? '(L)' : '(R)'}.wav`.replace(/variant\([LR]\)/, `variant${index % 2 === 0 ? '(L)' : '(R)'}`),
        { bpm: 100, durationSeconds: 4 * 60 / 100 }
      )),
      sample(10, 'Pack/Bass/FAMILYB001_variant.wav', {
        bpm: 140,
        durationSeconds: 4 * 60 / 140
      })
    ]

    const result = resolveContextualAnalysis(items)

    expect(result.groups.find((group) => group.relpathPrefix === 'Pack/Bass')?.bpm).toBeNull()
  })
})
